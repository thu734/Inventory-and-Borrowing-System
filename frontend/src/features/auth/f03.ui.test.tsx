import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { App } from '../../app/App';
afterEach(() => { vi.unstubAllGlobals(); window.location.hash = ''; });
const unit = { id: '31f81203-9156-4be0-8488-e72fdc734301', assetCode: 'F03-UNIT', modelName: 'Lab board', category: 'Embedded' };
const record = { id: '51f81203-9156-4be0-8488-e72fdc734301', status: 'PENDING', createdAt: '2026-11-07T00:00:00Z', asset: unit };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 || status === 201 ? {data} : {error:{message:data}}),{status});
function start(responses: (() => Promise<Response>)[], role='BORROWER') {
  const fetcher=vi.fn().mockResolvedValueOnce(reply({ user:{id:'a',displayName:'Demo Borrower',role},csrfToken:'csrf' }));
  responses.forEach(fn=>fetcher.mockImplementationOnce(fn));vi.stubGlobal('fetch',fetcher);
  render(<AuthProvider><App/></AuthProvider>);return fetcher;
}
describe('F-03 Borrower UI',()=>{
  it('UI-01 own requests has loading and empty states',async()=>{
    let resolve!:(r:Response)=>void;
    start([()=>new Promise(done=>{resolve=done;})]);
    fireEvent.click(await screen.findByRole('button',{name:'My Requests'}));
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
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
