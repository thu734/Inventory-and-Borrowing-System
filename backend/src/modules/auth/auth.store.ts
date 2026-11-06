export type Role = 'BORROWER' | 'CUSTODIAN';
export interface AuthUser {
  id: string; normalizedEmail: string; displayName: string;
  passwordHash: string; role: Role; isActive: boolean;
}
export interface SessionRecord {
  id: string; tokenHash: string; userId: string;
  createdAt: Date; expiresAt: Date; revokedAt: Date | null;
}
export interface AuthStore {
  findUser(email: string): Promise<AuthUser | null>;
  findSession(hash: string): Promise<(SessionRecord & { user: AuthUser }) | null>;
  rotateSession(session: SessionRecord, previousHash?: string): Promise<void>;
  revokeSession(hash: string, at: Date): Promise<void>;
}

// Structural boundary for Member 2's generated Prisma client. No production
// in-memory implementation or migration is introduced by Member 6.
interface SessionWriter {
  updateMany(args: { where: { tokenHash: string; revokedAt: null }; data: { revokedAt: Date } }): Promise<unknown>;
  create(args: { data: SessionRecord }): Promise<unknown>;
}
export interface PrismaAuthDatabase {
  user: { findUnique(args: { where: { normalizedEmail: string } }): Promise<AuthUser | null> };
  session: SessionWriter & {
    findUnique(args: { where: { tokenHash: string }; include: { user: true } }): Promise<(SessionRecord & { user: AuthUser }) | null>;
  };
  $transaction<T>(work: (transaction: { session: SessionWriter }) => Promise<T>): Promise<T>;
}
export class PrismaAuthStore implements AuthStore {
  private readonly db: PrismaAuthDatabase;
  constructor(db: PrismaAuthDatabase) { this.db = db; }
  findUser(normalizedEmail: string) { return this.db.user.findUnique({ where: { normalizedEmail } }); }
  findSession(tokenHash: string) {
    return this.db.session.findUnique({ where: { tokenHash }, include: { user: true } });
  }
  async rotateSession(session: SessionRecord, previousHash?: string) {
    await this.db.$transaction(async tx => {
      if (previousHash) await tx.session.updateMany({
        where: { tokenHash: previousHash, revokedAt: null }, data: { revokedAt: session.createdAt },
      });
      await tx.session.create({ data: session });
    });
  }
  async revokeSession(tokenHash: string, at: Date) {
    await this.db.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: at } });
  }
}
