import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';
export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setError(''); setBusy(true);
    try { await login(email.trim(), password); setPassword(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in. Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="card login-card" aria-labelledby="login-heading">
    <div className="login-intro"><span className="login-icon" aria-hidden="true">↗</span><div><p className="eyebrow">Welcome back</p><h1 id="login-heading">Sign in to BorrowBase</h1></div></div>
    <p className="muted">Use your assigned department account to manage equipment lending.</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/>
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary-button" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      <span role="status" className="status">{busy ? 'Checking your account…' : ''}</span>
    </form>
    <p className="note">Synthetic department data · Secure role-based access</p>
  </section>;
}
