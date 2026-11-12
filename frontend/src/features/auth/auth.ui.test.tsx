import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { App } from '../../app/App';
afterEach(() => { vi.unstubAllGlobals(); });
const user = { id: 'demo', displayName: 'Demo Borrower', role: 'BORROWER' };
const session = { data: { user, csrfToken: 'csrf-test' } };
const reply = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });

const start = () => {
  const originalFetch = globalThis.fetch;

  vi.stubGlobal('fetch', (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    if (String(input) === '/api/v1/assets') {
      return Promise.resolve(
        reply({ data: { items: [] } })
      );
    }

    return originalFetch(input, init);
  });

  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
};


describe('TEST-F01-09: auth UI states', () => {
  it('does not show protected content before identity bootstrap', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    start(); expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    resolve(reply(session)); expect(await screen.findByRole('heading', { name: 'Welcome, Demo Borrower' })).toBeInTheDocument();
  });
  it('submits credentials to the real API interface and shows pending state once', async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(reply({}, 401)).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetcher); start();
    await screen.findByRole('heading', { name: 'Sign in' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'borrower@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/v1/auth/login');
    resolve(reply(session)); expect(await screen.findByRole('heading', { name: 'Welcome, Demo Borrower' })).toBeInTheDocument();
  });
  it('shows invalid credential feedback without claiming success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({}, 401)).mockResolvedValueOnce(reply({ error: { message: 'Email or password is incorrect.' } }, 401)));
    start(); await screen.findByRole('heading', { name: 'Sign in' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'borrower@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect');
    expect(screen.queryByText('Welcome, Demo Borrower')).not.toBeInTheDocument();
  });
  it('keeps a clear retry state if logout cannot be confirmed', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(session)).mockRejectedValueOnce(new TypeError('network'));
    vi.stubGlobal('fetch', fetcher); start();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Logout was not confirmed');
    expect(screen.getByRole('heading', { name: 'Welcome, Demo Borrower' })).toBeInTheDocument();
    expect(fetcher.mock.calls[1]?.[1].headers['X-CSRF-Token']).toBe('csrf-test');
  });
  it('successful logout clears authenticated content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(session)).mockResolvedValueOnce(reply(null, 204)));
    start(); fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
  it('can retry a failed identity bootstrap without showing a login as a success', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(reply({}, 401));
    vi.stubGlobal('fetch', fetcher); start();
    expect(await screen.findByRole('heading', { name: 'Service unavailable' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument());
  });
});
