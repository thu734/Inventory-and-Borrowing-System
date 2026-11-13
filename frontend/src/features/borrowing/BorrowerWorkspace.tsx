import { useEffect, useRef, useState } from 'react';
import { ApiError, request } from '../../lib/api-client';
import { useAuth } from '../auth/AuthProvider';
import './borrowing.css';

export interface SelectedAsset { assetId: string; assetCode?: string; modelName?: string; category?: string }
interface Asset { id: string; assetCode: string; modelName: string; category: string }
interface OwnRecord { id: string; asset: Asset; status?: 'PENDING' | 'FULFILLED'; createdAt?: string; checkedOutAt?: string }
type View = { kind: 'home' | 'request' | 'requests' | 'loans' | 'request-detail' | 'loan-detail'; id?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// F-02 public navigation seam: display labels are untrusted text, never authority.
export function openBorrowRequest(asset: SelectedAsset) {
  const query = new URLSearchParams({ assetId: asset.assetId });
  for (const key of ['assetCode', 'modelName', 'category'] as const) if (asset[key]) query.set(key, asset[key]);
  window.location.hash = `request?${query}`;
}
function selection(): SelectedAsset | null {
  if (!window.location.hash.startsWith('#request?')) return null;
  const query = new URLSearchParams(window.location.hash.split('?')[1]);
  const assetId = query.get('assetId') ?? '';
  if (!uuid.test(assetId)) return null;
  return { assetId, assetCode: query.get('assetCode')?.slice(0,120), modelName: query.get('modelName')?.slice(0,120), category: query.get('category')?.slice(0,120) };
}
function initialView(): View {
  const hash = window.location.hash;
  if (hash.startsWith('#request?')) return { kind: 'request' };
  const match = /^#(requests|loans)(?:\/([0-9a-f-]+))?$/.exec(hash);
  if (match) return { kind: match[2] ? (match[1] === 'requests' ? 'request-detail' : 'loan-detail') : match[1] as 'requests' | 'loans', id: match[2] };
  return { kind: 'home' };
}
export function BorrowerWorkspace() {
  const { session, retry } = useAuth();
  const [view, setView] = useState<View>(initialView);
  const [selected, setSelected] = useState(selection);
  const [items, setItems] = useState<OwnRecord[]>([]);
  const [detail, setDetail] = useState<OwnRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState<OwnRecord | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const submissionVersion = useRef(0);
  useEffect(() => {
    const change = () => { submissionVersion.current++; setView(initialView()); setSelected(selection()); setError(''); setSaved(null); setUncertain(false); };
    window.addEventListener('hashchange', change);
    return () => { submissionVersion.current++; window.removeEventListener('hashchange', change); };
  }, []);
  const denied = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) retry();
    return e instanceof Error ? e.message : 'Unable to load your records.';
  };
  useEffect(() => {
    if (!['requests','loans','request-detail','loan-detail'].includes(view.kind)) return;
    let active = true; setLoading(true); setError(''); setDetail(null); setItems([]);
    const type = view.kind.startsWith('request') ? 'borrow-requests' : 'loans';
    const path = `/me/${type}${view.id ? `/${encodeURIComponent(view.id)}` : ''}`;
    request<{items:OwnRecord[]} | OwnRecord>(path).then(data => {
      if (!active) return;
      if ('items' in data) setItems(data.items); else setDetail(data);
    }).catch(e => { if (active) setError(denied(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view.kind, view.id, attempt]);
  function navigate(kind: 'requests' | 'loans', id?: string) {
    const hash = `${kind}${id ? `/${id}` : ''}`;
    if (window.location.hash === `#${hash}`) setAttempt(n => n + 1); else window.location.hash = hash;
  }
  async function submit() {
    if (inFlight.current || !selected || uncertain || saved) return;
    inFlight.current = true; setBusy(true); setError('');
    const version = submissionVersion.current;
    try {
      const value = await request<OwnRecord>('/borrow-requests', { body: { assetId: selected.assetId }, csrf: session?.csrfToken });
      if (submissionVersion.current === version) setSaved(value);
    } catch (e) {
      if (submissionVersion.current !== version) return;
      const unknown = e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 201);
      setUncertain(unknown);
      setError(`${denied(e)}${unknown ? ' Check My Requests before submitting again; the outcome could not be confirmed.' : ''}`);
    } finally { inFlight.current = false; setBusy(false); }
  }
  const list = view.kind === 'requests' || view.kind === 'loans';
  const isRequest = view.kind.startsWith('request');
  return <section className="borrowing" aria-label="Your borrowing records">
    <nav className="borrowing-nav" aria-label="Borrower records">
      <button onClick={() => navigate('requests')}>My Requests</button>
      <button onClick={() => navigate('loans')}>My Active Loans</button>
    </nav>
    {view.kind === 'home' && <p>Select equipment from the catalog when available, or open your own records above.</p>}
    {view.kind === 'request' && <section aria-labelledby="request-title">
      <h2 id="request-title">Request selected Asset</h2>
      {!selected ? <p role="alert">Select a valid Asset from the equipment catalog.</p> : <>
        <p>{selected.assetCode ?? selected.assetId}{selected.modelName ? ` — ${selected.modelName}` : ''}</p>
        <p>A PENDING request does not reserve equipment or guarantee checkout.</p>
        {saved ? <div role="status"><p>Request saved — {saved.status}</p><button onClick={() => navigate('requests', saved.id)}>View saved request</button></div> :
          <form onSubmit={e => { e.preventDefault(); void submit(); }} aria-busy={busy}>
            <button className="primary-button" disabled={busy || uncertain} type="submit">{busy ? 'Submitting…' : 'Submit request'}</button>
          </form>}
      </>}
    </section>}
    {list && <h2>{isRequest ? 'My Requests' : 'My Active Loans'}</h2>}
    {!list && view.kind.endsWith('-detail') && <h2>{isRequest ? 'Request detail' : 'Active Loan detail'}</h2>}
    {loading && <p role="status">Loading your records…</p>}
    {error && <div><p role="alert" className="error">{error}</p>{view.kind !== 'request' && <button onClick={() => setAttempt(n => n + 1)}>Try again</button>}</div>}
    {!loading && !error && list && (items.length ? <ul className="record-list">{items.map(row => <li key={row.id}>
      <button onClick={() => navigate(isRequest ? 'requests' : 'loans', row.id)}>{row.asset.assetCode} — {row.asset.modelName}</button>
      <span>{row.status ?? 'Active Loan'}</span>
    </li>)}</ul> : <p>{isRequest ? 'No requests yet.' : 'No active Loans.'}</p>)}
    {!loading && !error && detail && <div className="record-detail">
      <p>{detail.asset.assetCode} — {detail.asset.modelName}</p><p>{detail.asset.category}</p>
      {detail.status && <p>{detail.status}</p>}
      <p>{isRequest ? 'Requested' : 'Checked out'}: <time dateTime={detail.createdAt ?? detail.checkedOutAt}>{new Date(detail.createdAt ?? detail.checkedOutAt ?? '').toLocaleString()}</time></p>
      <p className="record-id">Record: {detail.id}</p>
      <button onClick={() => navigate(isRequest ? 'requests' : 'loans')}>Back to list</button>
    </div>}
  </section>;
}
