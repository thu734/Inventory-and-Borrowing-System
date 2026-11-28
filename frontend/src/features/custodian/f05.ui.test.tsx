import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../app/App';
import { CustodianWorkspace } from './CustodianWorkspace';
import { ApiError } from '../../lib/api-client';

const mocks = vi.hoisted(() => ({ request: vi.fn(), retry: vi.fn(), logout: vi.fn() }));
vi.mock('../../lib/api-client', async original => ({
  ...await original<typeof import('../../lib/api-client')>(), request: mocks.request
}));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({
  session: { user: { id: 'custodian', displayName: 'F05 Custodian', role: 'CUSTODIAN' }, csrfToken: 'f05-ui-csrf' },
  loading: false, retry: mocks.retry, logout: mocks.logout
}) }));
const loanId = '51f81203-9156-4be0-8488-e72fdc734301';
const asset = { id: '41f81203-9156-4be0-8488-e72fdc734301', assetCode: 'F05-LAP-001',
  modelName: 'Synthetic Laptop', category: 'Computers', serviceability: 'SERVICEABLE', available: false };
const loan = { id: loanId, borrowRequestId: '31f81203-9156-4be0-8488-e72fdc734301',
  borrower: { id: 'borrower', displayName: 'F05 Borrower' }, asset, checkedOutAt: '2026-11-27T10:00:00.000Z' };
const path = `/custodian/loans/${loanId}/return`;
let returned = false;
const projection = { ...loan, asset: { ...asset, available: true }, returnedAt: '2026-11-28T10:00:00.000Z',
  returnedBy: { id: 'custodian', displayName: 'F05 Custodian' } };
async function respond(route: string) {
  if (route.startsWith('/custodian/borrow-requests')) return { items: [] };
  if (route === '/custodian/loans') return { items: returned ? [] : [loan] };
  if (route === '/assets') return { items: [{ ...asset, available: returned }] };
  if (route === path) { returned = true; return projection; }
  throw new Error(`Unexpected test API route ${route}`);
}
async function confirmReturn() {
  fireEvent.click(await screen.findByRole('button', { name: /^Return$/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Confirm return$/i }));
}
beforeEach(() => { returned = false; mocks.request.mockReset(); mocks.retry.mockReset(); mocks.request.mockImplementation(respond); });
describe('F-05 return UI contract (component evidence only)', () => {
  it('TEST-F05-12: confirmation identifies the Loan and sends no mutation until confirmed', async () => {
    render(<CustodianWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: /^Return$/i }));
    expect(screen.getByRole('button', { name: /^Confirm return$/i })).toBeEnabled();
    expect(screen.getByText(new RegExp(`Confirm return.*${asset.assetCode}`, 'i'))).toBeVisible();
    expect(screen.getAllByText(/F05 Borrower/).length).toBeGreaterThan(0);
    expect(mocks.request.mock.calls.filter(([route]) => route === path)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.queryByRole('button', { name: /^Confirm return$/i })).not.toBeInTheDocument();
  });
  it('TEST-F05-12: successful return refreshes active Loans using the existing CSRF request convention', async () => {
    render(<CustodianWorkspace />); await confirmReturn();
    expect(await screen.findByText(/return successful|returned successfully/i)).toBeVisible();
    expect(await screen.findByText('No active Loans.')).toBeVisible();
    expect(mocks.request).toHaveBeenCalledWith(path, { body: {}, csrf: 'f05-ui-csrf' });
  });
  it('TEST-F05-12: duplicate clicks produce one request, disabled pending action and no premature success', async () => {
    let complete!: (result: typeof projection) => void;
    mocks.request.mockImplementation((route: string) => route === path ? new Promise(resolve => { complete = resolve; }) : respond(route));
    render(<CustodianWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: /^Return$/i }));
    const confirm = screen.getByRole('button', { name: /^Confirm return$/i });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(mocks.request.mock.calls.filter(([route]) => route === path)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /returning|confirm return/i })).toBeDisabled();
    expect(screen.queryByText(/return successful|returned successfully/i)).not.toBeInTheDocument();
    returned = true; complete(projection);
    expect(await screen.findByText('No active Loans.')).toBeVisible();
  });
  it.each([409, 503, 0])('TEST-F05-13: status %s preserves confirmed state and exposes recovery without automatic retry', async status => {
    mocks.request.mockImplementation((route: string) => route === path
      ? Promise.reject(new ApiError(status, 'Synthetic return failure')) : respond(route));
    render(<CustodianWorkspace />); await confirmReturn();
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic return failure');
    expect(screen.queryByText(/return successful|returned successfully/i)).not.toBeInTheDocument();
    expect(screen.getByText(`Loan ID: ${loanId}`)).toBeVisible();
    expect(mocks.request.mock.calls.filter(([route]) => route === path)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Refresh records' })).toBeEnabled();
    if (status !== 409) expect(screen.getByRole('button', { name: /^Return$/i })).toBeDisabled();
    mocks.request.mockImplementation(respond);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh records' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Return$/i })).toBeEnabled());
  });
  it('TEST-F05-10/12: already-mounted catalog displays committed return availability without manual refresh', async () => {
    render(<App />);
    expect(await screen.findByText('Unavailable')).toBeVisible();
    await confirmReturn();
    expect(await screen.findByText('Available')).toBeVisible();
    expect(await screen.findByText('No active Loans.')).toBeVisible();
    expect(mocks.request.mock.calls.filter(([route]) => route === '/assets').length).toBeGreaterThanOrEqual(2);
  });
  it('TEST-F05-13 CONTROL: loading and empty active-Loan states have no return action', async () => {
    mocks.request.mockImplementation(() => new Promise(() => {}));
    const view = render(<CustodianWorkspace />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Custodian records');
    expect(screen.queryByRole('button', { name: /^Return$/i })).not.toBeInTheDocument();
    view.unmount(); mocks.request.mockImplementation(async () => ({ items: [] }));
    render(<CustodianWorkspace />);
    expect(await screen.findByText('No active Loans.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Return$/i })).not.toBeInTheDocument();
  });
});
