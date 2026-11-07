import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '../../app.ts';

export interface AssetDTO { id: string; assetCode: string; modelName: string; category: string }
export interface RequestDTO { id: string; status: 'PENDING' | 'FULFILLED'; createdAt: string; asset: AssetDTO }
export interface ActiveLoanDTO { id: string; borrowRequestId: string; checkedOutAt: string; asset: AssetDTO }
export interface BorrowingStore {
  create(borrowerId: string, assetId: string): Promise<RequestDTO>;
  requests(borrowerId: string): Promise<RequestDTO[]>;
  request(borrowerId: string, id: string): Promise<RequestDTO | null>;
  loans(borrowerId: string): Promise<ActiveLoanDTO[]>;
  loan(borrowerId: string, id: string): Promise<ActiveLoanDTO | null>;
}
const assetSelect = { id: true, assetCode: true, equipmentModel: { select: { name: true, category: true } } } as const;
const requestSelect = { id: true, status: true, createdAt: true, asset: { select: assetSelect } } as const;
const loanSelect = { id: true, borrowRequestId: true, checkedOutAt: true, asset: { select: assetSelect } } as const;
type RequestRow = Prisma.BorrowRequestGetPayload<{ select: typeof requestSelect }>;
type LoanRow = Prisma.LoanGetPayload<{ select: typeof loanSelect }>;
const assetDTO = (a: RequestRow['asset']): AssetDTO => ({ id: a.id, assetCode: a.assetCode,
  modelName: a.equipmentModel.name, category: a.equipmentModel.category });
const requestDTO = (r: RequestRow): RequestDTO => ({ id: r.id, status: r.status, createdAt: r.createdAt.toISOString(), asset: assetDTO(r.asset) });
const loanDTO = (r: LoanRow): ActiveLoanDTO => ({ id: r.id, borrowRequestId: r.borrowRequestId,
  checkedOutAt: r.checkedOutAt.toISOString(), asset: assetDTO(r.asset) });
const duplicate = () => new ApiError(409, 'DUPLICATE_PENDING_REQUEST', 'You already have a pending request for this asset.');

export class PrismaBorrowingStore implements BorrowingStore {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }
  async create(borrowerId: string, assetId: string) {
    try {
      return await this.db.$transaction(async tx => {
        // Shared F-04 handoff: lock Asset first, then inspect/mutate request/Loan rows.
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Asset" WHERE "id" = ${assetId} FOR UPDATE`;
        if (!rows.length) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
        const unit = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: { serviceability: true } });
        const active = await tx.loan.findFirst({ where: { assetId, returnedAt: null }, select: { id: true } });
        if (unit.serviceability !== 'SERVICEABLE' || active) {
          throw new ApiError(409, 'ASSET_UNAVAILABLE', 'This asset is not available for a new request.');
        }
        if (await tx.borrowRequest.findFirst({ where: { borrowerId, assetId, status: 'PENDING' }, select: { id: true } })) throw duplicate();
        const saved = await tx.borrowRequest.create({ data: { borrowerId, assetId, status: 'PENDING' }, select: requestSelect });
        return requestDTO(saved);
      });
    } catch (error) {
      // PostgreSQL's partial index is the final guard even for independent DB writers.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw duplicate();
      throw error;
    }
  }
  async requests(borrowerId: string) {
    return (await this.db.borrowRequest.findMany({ where: { borrowerId }, select: requestSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })).map(requestDTO);
  }
  async request(borrowerId: string, id: string) {
    const row = await this.db.borrowRequest.findFirst({ where: { id, borrowerId }, select: requestSelect });
    return row ? requestDTO(row) : null;
  }
  async loans(borrowerId: string) {
    return (await this.db.loan.findMany({ where: { borrowerId, returnedAt: null }, select: loanSelect,
      orderBy: [{ checkedOutAt: 'desc' }, { id: 'desc' }] })).map(loanDTO);
  }
  async loan(borrowerId: string, id: string) {
    const row = await this.db.loan.findFirst({ where: { id, borrowerId, returnedAt: null }, select: loanSelect });
    return row ? loanDTO(row) : null;
  }
}
