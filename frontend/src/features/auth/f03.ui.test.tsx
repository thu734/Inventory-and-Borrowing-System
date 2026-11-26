import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { App } from '../../app/App';
import userEvent from '@testing-library/user-event';
afterEach(() => { vi.unstubAllGlobals(); window.location.hash = ''; });
const unit = { id: '31f81203-9156-4be0-8488-e72fdc734301', assetCode: 'F03-UNIT', modelName: 'Lab board', category: 'Embedded' };
const record = { id: '51f81203-9156-4be0-8488-e72fdc734301', status: 'PENDING', createdAt: '2026-11-07T00:00:00Z', asset: unit };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 || status === 201 ? {data} : {error:{message:data}}),{status});

function start(
  responses: (() => Promise<Response>)[],
  role = 'BORROWER'
) {
  const fetcher = vi.fn().mockResolvedValueOnce(
    reply({
      user: {
        id: 'a',
        displayName: 'Demo Borrower',
        role
      },
      csrfToken: 'csrf'
    })
  );

  responses.forEach(fn => {
    fetcher.mockImplementationOnce(fn);
  });

  vi.stubGlobal('fetch', (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    if (String(input) === '/api/v1/assets') {
      return Promise.resolve(reply({ items: [] }));
    }

    return fetcher(input, init);
  });

  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );

  return fetcher;
}

describe('F-03 Borrower UI',()=>{
  it('confirms cancellation, prevents duplicate submission and refreshes the request history', async () => {
    let resolve!: (r: Response) => void;
    const cancelled = { ...record, status: 'CANCELLED', cancelledAt: '2026-11-25T10:00:00Z' };
    const fetcher = start([async () => reply({items:[record]}), () => new Promise(done => { resolve = done; }), async () => reply({items:[cancelled]})]);
    fireEvent.click(await screen.findByRole('button', {name:'My Requests'}));
    fireEvent.click(await screen.findByRole('button', {name:'Cancel request'}));
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', {name:'Confirm cancellation'}));
    expect(screen.getByRole('button', {name:'Cancelling…'})).toBeDisabled();
    expect(fetcher.mock.calls[2][0]).toBe(`/api/v1/me/borrow-requests/${record.id}/cancel`);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({});
    resolve(reply(cancelled));
    expect(await screen.findByText('CANCELLED')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Cancel request'})).not.toBeInTheDocument();
  });
  it('shows cancellation errors and offers refresh', async () => {
    start([async () => reply({items:[record]}), async () => reply('Request is no longer pending.', 409)]);
    fireEvent.click(await screen.findByRole('button', {name:'My Requests'}));
    fireEvent.click(await screen.findByRole('button', {name:'Cancel request'}));
    fireEvent.click(screen.getByRole('button', {name:'Confirm cancellation'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer pending');
    expect(screen.getByRole('button', {name:'Refresh requests'})).toBeInTheDocument();
  });
  it('UI-01 own requests has loading and empty states',async()=>{
    let resolve!:(r:Response)=>void;
    start([()=>new Promise(done=>{resolve=done;})]);
    fireEvent.click(await screen.findByRole('button',{name:'My Requests'}));
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('Loading');
    resolve(reply({items:[]}));expect(await screen.findByText('No requests yet.')).toBeInTheDocument();
  });
  it('UI-01 request list opens saved detail and shows status',async()=>{
    start([async()=>reply({items:[record]}),async()=>reply(record)]);
    fireEvent.click(await screen.findByRole('button',{name:'My Requests'}));
    fireEvent.click(await screen.findByRole('button',{name:/F03-UNIT/}));
    expect(await screen.findByRole('heading',{name:'Request detail'})).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });
  it('UI-01 selected Asset submits only assetId once with CSRF and shows saved result',async()=>{
    window.location.hash=`request?assetId=${unit.id}&assetCode=F03-UNIT`;
    let resolve!:(r:Response)=>void;const fetcher=start([()=>new Promise(done=>{resolve=done;})]);
    fireEvent.click(await screen.findByRole('button',{name:'Submit request'}));
    expect(screen.getByRole('button',{name:'Submitting…'})).toBeDisabled();
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({assetId:unit.id});
    expect(fetcher.mock.calls[1][1].headers['X-CSRF-Token']).toBe('csrf');
    resolve(reply(record,201));expect(await screen.findByText(/Request saved/)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('UI-02 uncertain mutation does not retry automatically',async()=>{
    window.location.hash=`request?assetId=${unit.id}`;const fetcher=start([async()=>{throw new TypeError('network');}]);
    fireEvent.click(await screen.findByRole('button',{name:'Submit request'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check My Requests');expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button',{name:'Submit request'})).toBeDisabled();
  });
  it.each([403,409,500])('UI-02 safe failure %s is visible',async status=>{
    window.location.hash=`request?assetId=${unit.id}`;start([async()=>reply(status===403?'You do not have permission.':'Request cannot be saved.',status)]);
    fireEvent.click(await screen.findByRole('button',{name:'Submit request'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(status===403?'permission':'cannot be saved');
  });
  it('UI-03 active Loans list opens checkout detail',async()=>{
    const saved={id:record.id,borrowRequestId:unit.id,checkedOutAt:record.createdAt,asset:unit};
    start([async()=>reply({items:[saved]}),async()=>reply(saved)]);
    fireEvent.click(await screen.findByRole('button',{name:'My Active Loans'}));
    fireEvent.click(await screen.findByRole('button',{name:/F03-UNIT/}));
    expect(await screen.findByRole('heading',{name:'Active Loan detail'})).toBeInTheDocument();
    expect(screen.getByText(/Checked out/)).toBeInTheDocument();
  });
  it('Custodian has no Borrower controls',async()=>{
    start([],'CUSTODIAN');await screen.findByRole('button',{name:'Sign out'});
    expect(screen.queryByRole('button',{name:'My Requests'})).not.toBeInTheDocument();
  });
  it('UI-02 invalid Asset selection is not submitted',async()=>{
    window.location.hash='request?assetId=invalid';const fetcher=start([]);
    expect(await screen.findByRole('alert')).toHaveTextContent('valid Asset');
    expect(screen.queryByRole('button',{name:'Submit request'})).not.toBeInTheDocument();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('UI-02 server validation is displayed without retry',async()=>{
    window.location.hash=`request?assetId=${unit.id}`;const fetcher=start([async()=>reply('Select a valid asset.',400)]);
    fireEvent.click(await screen.findByRole('button',{name:'Submit request'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid asset');expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('UI-02 stale session triggers auth bootstrap and clears protected content',async()=>{
    start([async()=>reply('Please sign in.',401),async()=>reply('Please sign in.',401)]);
    fireEvent.click(await screen.findByRole('button',{name:'My Requests'}));
    expect(await screen.findByRole('heading',{name:'Sign in'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'My Requests'})).not.toBeInTheDocument();
  });
  it('UI-03 refresh/remount reads persisted list again',async()=>{
    window.location.hash='requests';const fetcher=start([async()=>reply({items:[record]})]);
    expect(await screen.findByRole('button',{name:/F03-UNIT/})).toBeInTheDocument();
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/me/borrow-requests');
  });
  it('UI-02 failed list GET can be retried explicitly',async()=>{
    start([async()=>reply('Unable to load records.',500),async()=>reply({items:[]})]);
    fireEvent.click(await screen.findByRole('button',{name:'My Active Loans'}));
    fireEvent.click(await screen.findByRole('button',{name:'Try again'}));
    expect(await screen.findByText('No active Loans.')).toBeInTheDocument();
  });
});


// Cancellation responses are selected by path, so unrelated catalog/auth reads
// do not affect these interaction assertions.
function cancellationApp(initial = record, cancel = async () => reply({ ...record, status: 'CANCELLED', cancelledAt: '2026-11-25T10:00:00Z' })) {
  let current = initial;
  const mutation = vi.fn(cancel);
  const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/auth/me')) return reply({ user: { id: 'a', displayName: 'Owner', role: 'BORROWER' }, csrfToken: 'csrf' });
    if (path.endsWith('/assets')) return reply({ items: [] });
    if (path.endsWith('/cancel')) {
      const response = await mutation();
      if (response.ok) current = (await response.clone().json()).data;
      return response;
    }
    if (path.endsWith('/me/borrow-requests')) return reply({ items: [current] });
    if (path.endsWith('/me/loans')) return reply({ items: [] });
    if (path.endsWith(`/me/borrow-requests/${record.id}`)) return reply(current);
    throw new Error(`Unexpected test path: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const mount = () => render(<AuthProvider><App /></AuthProvider>);
  window.location.hash = '#requests';
  const rendered = mount();
  return { ...rendered, mutation, fetcher, mount, setRecord: (value: typeof record) => { current = value; } };
}

describe('cancellation accessibility and recovery', () => {
  it.each(['list', 'detail'])('opens a named confirmation and restores focus after Keep request in %s', async view => {
    const user = userEvent.setup();
    const { mutation } = cancellationApp();
    if (view === 'detail') {
      await user.click(await screen.findByRole('button', { name: /F03-UNIT/ }));
      await screen.findByRole('heading', { name: 'Request detail' });
    }
    const trigger = await screen.findByRole('button', { name: 'Cancel request' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const group = screen.getByRole('group', { name: 'Cancel request for F03-UNIT?' });
    expect(within(group).getByRole('heading')).toHaveFocus();
    expect(group).toHaveTextContent('history');
    await user.tab();
    expect(within(group).getByRole('button', { name: 'Keep request' })).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.queryByRole('group', { name: 'Cancel request for F03-UNIT?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toHaveFocus();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(mutation).not.toHaveBeenCalled();
  });

  it('announces progress and completion, prevents repeated submission, and reloads cancelled history', async () => {
    const user = userEvent.setup();
    let resolve!: (response: Response) => void;
    const app = cancellationApp(record, () => new Promise<Response>(done => { resolve = done; }));
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }));
    const confirm = screen.getByRole('button', { name: 'Confirm cancellation' });
    await user.click(confirm);
    const status = screen.getByRole('status', { name: 'Cancellation update' });
    expect(status).toHaveTextContent('Cancelling request for F03-UNIT');
    expect(status).toHaveFocus();
    expect(status).not.toHaveTextContent('has been cancelled');
    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
    await user.dblClick(screen.getByRole('button', { name: 'Cancelling…' }));
    await user.keyboard('{Enter} ');
    expect(app.mutation).toHaveBeenCalledTimes(1);
    const mutationCall = app.fetcher.mock.calls.find(([path]) => String(path).endsWith('/cancel'));
    expect(mutationCall?.[0]).toBe(`/api/v1/me/borrow-requests/${record.id}/cancel`);
    expect(JSON.parse(mutationCall?.[1]?.body as string)).toEqual({});
    expect(mutationCall?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf' });
    await act(async () => resolve(reply({ ...record, status: 'CANCELLED', cancelledAt: '2026-11-25T10:00:00Z' })));
    await waitFor(() => expect(status).toHaveTextContent('has been cancelled'));
    expect(status).toHaveFocus();
    expect(await screen.findByText('CANCELLED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
    expect(screen.getByText(/Cancelled:/).querySelector('time')).toHaveAttribute('dateTime', '2026-11-25T10:00:00Z');
    app.unmount();
    app.mount();
    expect(await screen.findByText('CANCELLED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });

  it('cancels from detail and focuses the completion message after navigating to history', async () => {
    const user = userEvent.setup();
    cancellationApp();
    await user.click(await screen.findByRole('button', { name: /F03-UNIT/ }));
    await screen.findByRole('heading', { name: 'Request detail' });
    await user.click(screen.getByRole('button', { name: 'Cancel request' }));
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await screen.findByRole('heading', { name: 'My Requests' });
    const status = screen.getByRole('status', { name: 'Cancellation update' });
    expect(status).toHaveTextContent('has been cancelled');
    expect(status).toHaveFocus();
    expect(await screen.findByText('CANCELLED')).toBeInTheDocument();
  });

  it('does not steal focus or change views when a cancellation completes after navigation', async () => {
    const user = userEvent.setup();
    let resolve!: (response: Response) => void;
    cancellationApp(record, () => new Promise<Response>(done => { resolve = done; }));
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }));
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    const loans = screen.getByRole('button', { name: 'My Active Loans' });
    await user.click(loans);
    await screen.findByRole('heading', { name: 'My Active Loans' });
    await act(async () => resolve(reply({ ...record, status: 'CANCELLED', cancelledAt: '2026-11-25T10:00:00Z' })));
    expect(window.location.hash).toBe('#loans');
    expect(loans).toHaveFocus();
    expect(screen.getByRole('status', { name: 'Cancellation update' })).toBeEmptyDOMElement();
  });

  it('restores focus to the detail heading after refreshing a cancellation conflict', async () => {
    const user = userEvent.setup();
    const app = cancellationApp(record, async () => reply('Request is no longer pending.', 409));
    await user.click(await screen.findByRole('button', { name: /F03-UNIT/ }));
    await screen.findByRole('heading', { name: 'Request detail' });
    await user.click(screen.getByRole('button', { name: 'Cancel request' }));
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    expect(await screen.findByRole('button', { name: 'Refresh requests' })).toHaveFocus();
    app.setRecord({ ...record, status: 'FULFILLED' });
    await user.click(screen.getByRole('button', { name: 'Refresh requests' }));
    expect(await screen.findByText('FULFILLED')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Request detail' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });

  it.each(['CANCELLED', 'FULFILLED'])('does not expose cancellation for loaded %s records in list or detail', async status => {
    const user = userEvent.setup();
    cancellationApp({ ...record, status });
    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /F03-UNIT/ }));
    await screen.findByRole('heading', { name: 'Request detail' });
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });

  it.each([403, 404, 409, 500, 0])('keeps failures recoverable with focused refresh (%s)', async status => {
    const user = userEvent.setup();
    const app = cancellationApp(record, async () => {
      if (status === 0) throw new TypeError('Offline');
      return reply(status === 409 ? 'Request is no longer pending.' : 'Cancellation could not be completed.', status);
    });
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }));
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 0 ? 'Cannot reach' : status === 409 ? 'no longer pending' : 'could not be completed');
    const refresh = screen.getByRole('button', { name: 'Refresh requests' });
    expect(refresh).toHaveFocus();
    expect(screen.getByRole('status', { name: 'Cancellation update' })).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Confirm cancellation' })).not.toBeInTheDocument();
    app.setRecord({ ...record, status: status === 409 ? 'FULFILLED' : 'PENDING' });
    await user.click(refresh);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My Requests' })).toHaveFocus());
    expect(await screen.findByText(status === 409 ? 'FULFILLED' : 'PENDING')).toBeInTheDocument();
    expect(app.mutation).toHaveBeenCalledTimes(1);
  });
});
