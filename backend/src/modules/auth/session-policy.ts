export interface SessionLifetime { expiresAt: Date; revokedAt: Date | null }

export function isSessionActive(session: SessionLifetime, now: Date): boolean {
  return session.revokedAt === null && now.getTime() < session.expiresAt.getTime();
}
