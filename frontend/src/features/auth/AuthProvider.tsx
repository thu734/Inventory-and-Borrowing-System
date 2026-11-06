import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, request } from '../../lib/api-client';
export interface User { id: string; displayName: string; role: 'BORROWER' | 'CUSTODIAN' }
interface Session { user: User; csrfToken: string }
interface AuthContext {
  session: Session | null; loading: boolean; error: string;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retry(): void;
}
const Context = createContext<AuthContext | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  useEffect(() => {
    const current = ++version.current;
    setLoading(true); setError('');
    request<Session>('/auth/me').then(value => {
      if (version.current === current) setSession(value);
    }).catch((e: unknown) => {
      if (version.current !== current) return;
      setSession(null);
      if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : 'Unable to check your session.');
    }).finally(() => { if (version.current === current) setLoading(false); });
    return () => { version.current++; };
  }, [attempt]);
  async function login(email: string, password: string) {
    const value = await request<Session>('/auth/login', { body: { email, password } });
    setError(''); setSession(value);
  }
  async function logout() {
    try {
      await request<void>('/auth/logout', { body: {}, csrf: session?.csrfToken });
      setSession(null); setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setSession(null); return; }
      throw e;
    }
  }
  return <Context.Provider value={{ session, loading, error, login, logout, retry: () => setAttempt(x => x + 1) }}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}
