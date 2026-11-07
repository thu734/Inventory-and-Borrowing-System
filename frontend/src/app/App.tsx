import { useState } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
export function App() {
  const { session, loading, error, retry, logout } = useAuth();
  const [busy, setBusy] = useState(false); const [logoutError, setLogoutError] = useState('');
  async function signOut() {
    setBusy(true); setLogoutError('');
    try { await logout(); }
    catch { setLogoutError('Logout was not confirmed. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  return <><a className="skip" href="#main">Skip to content</a>
    <header className="site-header"><div className="brand"><span className="brand-mark" aria-hidden="true">B</span><div><strong>BorrowBase</strong></div></div><span className="department">CPE Equipment Borrowing System · Demo</span></header>
    <main id="main">
      {loading ? <p role="status">Checking your session…</p> : error ?
        <section className="card status-card"><p className="eyebrow">Connection issue</p><h1>Service unavailable</h1><p role="alert">{error}</p><button onClick={retry}>Try again</button></section> : !session ? <LoginPage/> :
        <section className="card status-card"><p className="eyebrow">{session.user.role === 'BORROWER' ? 'Borrower account' : 'Custodian account'}</p>
          <h1>Welcome, {session.user.displayName}</h1>
          <p className="muted">You are securely signed in to BorrowBase. Your role determines which equipment actions are available.</p>
          <div className="identity-panel"><span className="identity-label">Signed in as</span><strong>{session.user.role === 'BORROWER' ? 'Borrower' : 'Custodian'}</strong></div>
          <button className="secondary-button" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
          {logoutError && <p role="alert" className="error">{logoutError}</p>}
        </section>}
    </main></>;
}
