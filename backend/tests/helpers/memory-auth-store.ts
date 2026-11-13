// Test double only. Never imported by application startup or persistence tests.
import type { AuthStore, AuthUser, SessionRecord } from '../../src/modules/auth/auth.store.ts';
export class MemoryAuthStore implements AuthStore {
  readonly users = new Map<string, AuthUser>();
  readonly sessions = new Map<string, SessionRecord>();
  async findUser(email: string) { return [...this.users.values()].find(user => user.normalizedEmail === email) ?? null; }
  async findSession(hash: string) {
    const session = this.sessions.get(hash); if (!session) return null;
    const user = this.users.get(session.userId); return user ? { ...session, user } : null;
  }
  async rotateSession(session: SessionRecord, previousHash?: string) {
    if (previousHash) await this.revokeSession(previousHash, session.createdAt);
    this.sessions.set(session.tokenHash, session);
  }
  async revokeSession(hash: string, at: Date) {
    const value = this.sessions.get(hash); if (value) value.revokedAt = at;
  }
}
