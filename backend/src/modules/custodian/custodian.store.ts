
import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '../../app.ts';
import { assertCheckoutEligible } from './custodian.rules.ts';

export interface CustodianAssetDTO {
  id: string;
  assetCode: string;
  modelName: string;
  category: string;
  serviceability: 'SERVICEABLE' | 'MAINTENANCE' | 'RETIRED';
  available: boolean;
}

export interface CustodianRequestDTO {
  id: string;
  borrower: {
    id: string;
    displayName: string;
  };
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED';
  createdAt: string;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  asset: CustodianAssetDTO;
}

export interface CustodianLoanDTO {
  id: string;
  borrowRequestId: string;
  borrower: {
    id: string;
    displayName: string;
  };
  asset: CustodianAssetDTO;
  checkedOutAt: string;
}

export interface ReturnedLoanDTO extends CustodianLoanDTO {
  returnedAt: string;
  returnedBy: { id: string; displayName: string };
}

export interface CustodianStore {
  returnLoan(loanId: string, custodianId: string): Promise<ReturnedLoanDTO>;

  requests(
    status?: 'PENDING' | 'FULFILLED' | 'CANCELLED'
  ): Promise<CustodianRequestDTO[]>;

  request(id: string): Promise<CustodianRequestDTO | null>;

  loans(): Promise<CustodianLoanDTO[]>;

  checkout(
    requestId: string,
    custodianId: string
  ): Promise<{
    request: CustodianRequestDTO;
    loan: CustodianLoanDTO;
  }>;
}

const assetSelect = {
  id: true,
  assetCode: true,
  serviceability: true,
  equipmentModel: {
    select: {
      name: true,
      category: true
    }
  },
  loans: {
    where: {
      returnedAt: null
    },
    select: {
      id: true
    },
    take: 1
  }
} as const;

const borrowerSelect = {
  id: true,
  displayName: true
} as const;

const requestSelect = {
  id: true,
  status: true,
  createdAt: true,
  fulfilledAt: true,
  cancelledAt: true,
  borrower: {
    select: borrowerSelect
  },
  asset: {
    select: assetSelect
  }
} as const;

const loanSelect = {
  id: true,
  borrowRequestId: true,
  checkedOutAt: true,
  borrower: {
    select: borrowerSelect
  },
  asset: {
    select: assetSelect
  }
} as const;

type RequestRow = Prisma.BorrowRequestGetPayload<{
  select: typeof requestSelect;
}>;

type LoanRow = Prisma.LoanGetPayload<{
  select: typeof loanSelect;
}>;

type AssetRow = RequestRow['asset'];

function assetDTO(asset: AssetRow): CustodianAssetDTO {
  return {
    id: asset.id,
    assetCode: asset.assetCode,
    modelName: asset.equipmentModel.name,
    category: asset.equipmentModel.category,
    serviceability: asset.serviceability,
    available:
      asset.serviceability === 'SERVICEABLE' &&
      asset.loans.length === 0
  };
}

function requestDTO(row: RequestRow): CustodianRequestDTO {
  return {
    id: row.id,
    borrower: {
      id: row.borrower.id,
      displayName: row.borrower.displayName
    },
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    asset: assetDTO(row.asset)
  };
}

function loanDTO(row: LoanRow): CustodianLoanDTO {
  return {
    id: row.id,
    borrowRequestId: row.borrowRequestId,
    borrower: {
      id: row.borrower.id,
      displayName: row.borrower.displayName
    },
    asset: assetDTO(row.asset),
    checkedOutAt: row.checkedOutAt.toISOString()
  };
}

export class PrismaCustodianStore implements CustodianStore {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  async requests(status?: 'PENDING' | 'FULFILLED' | 'CANCELLED') {
    const rows = await this.db.borrowRequest.findMany({
      where: status ? { status } : {},
      select: requestSelect,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' }
      ]
    });

    return rows.map(requestDTO);
  }

  async request(id: string) {
    const row = await this.db.borrowRequest.findUnique({
      where: { id },
      select: requestSelect
    });

    return row ? requestDTO(row) : null;
  }

  async loans() {
    const rows = await this.db.loan.findMany({
      where: {
        returnedAt: null
      },
      select: loanSelect,
      orderBy: [
        { checkedOutAt: 'desc' },
        { id: 'desc' }
      ]
    });

    return rows.map(loanDTO);
  }

  async returnLoan(loanId: string, custodianId: string): Promise<ReturnedLoanDTO> {
    return this.db.$transaction(async tx => {
      const initial = await tx.loan.findUnique({ where: { id: loanId }, select: { assetId: true } });
      if (!initial) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');

      // Same lock order as request creation, checkout and cancellation: Asset first.
      await tx.$queryRaw`SELECT "id" FROM "Asset" WHERE "id" = ${initial.assetId} FOR UPDATE`;
      const rows = await tx.$queryRaw<{
        id: string; assetId: string; checkedOutAt: Date; returnedAt: Date | null;
      }[]>`SELECT "id", "assetId", "checkedOutAt", "returnedAt" FROM "Loan" WHERE "id" = ${loanId} FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
      if (current.assetId !== initial.assetId) {
        throw new ApiError(409, 'INVALID_LOAN_STATE', 'Loan state changed. Refresh and try again.');
      }
      if (current.returnedAt !== null) {
        throw new ApiError(409, 'LOAN_ALREADY_RETURNED', 'This Loan has already been returned.');
      }
      const returnedAt = new Date();
      if (returnedAt < current.checkedOutAt) {
        throw new ApiError(409, 'INVALID_LOAN_STATE', 'Return time cannot precede checkout.');
      }
      const changed = await tx.loan.updateMany({
        where: { id: loanId, assetId: initial.assetId, returnedAt: null },
        data: { returnedAt, returnedById: custodianId }
      });
      if (changed.count !== 1) {
        throw new ApiError(409, 'LOAN_ALREADY_RETURNED', 'This Loan has already been returned.');
      }
      const saved = await tx.loan.findUniqueOrThrow({ where: { id: loanId }, select: {
        ...loanSelect, returnedAt: true, returnedBy: { select: borrowerSelect }
      } });
      return { ...loanDTO(saved), returnedAt: saved.returnedAt!.toISOString(), returnedBy: saved.returnedBy! };
    }, { maxWait: 5000, timeout: 10000 });
  }

  async checkout(requestId: string, custodianId: string) {
    try {
      return await this.db.$transaction(
        async tx => {
          const initialRequest =
            await tx.borrowRequest.findUnique({
              where: {
                id: requestId
              },
              select: {
                assetId: true
              }
            });

          if (!initialRequest) {
            throw new ApiError(
              404,
              'NOT_FOUND',
              'Resource not found.'
            );
          }

          // Lock the physical Asset first.
          const lockedAssets = await tx.$queryRaw<
            { id: string }[]
          >`
            SELECT "id"
            FROM "Asset"
            WHERE "id" = ${initialRequest.assetId}
            FOR UPDATE
          `;

          if (lockedAssets.length === 0) {
            throw new ApiError(
              404,
              'NOT_FOUND',
              'Resource not found.'
            );
          }

          // Re-read and lock the request after locking the Asset.
          const lockedRequests = await tx.$queryRaw<
            {
              id: string;
              assetId: string;
              borrowerId: string;
              status: 'PENDING' | 'FULFILLED' | 'CANCELLED';
            }[]
          >`
            SELECT
              "id",
              "assetId",
              "borrowerId",
              "status"
            FROM "BorrowRequest"
            WHERE "id" = ${requestId}
            FOR UPDATE
          `;

          const currentRequest = lockedRequests[0];

          if (
            !currentRequest ||
            currentRequest.assetId !== initialRequest.assetId
          ) {
            throw new ApiError(
              409,
              'REQUEST_NOT_PENDING',
              'Request is no longer pending.'
            );
          }

          const asset = await tx.asset.findUniqueOrThrow({
            where: {
              id: currentRequest.assetId
            },
            select: {
              serviceability: true
            }
          });

          const activeLoan = await tx.loan.findFirst({
            where: {
              assetId: currentRequest.assetId,
              returnedAt: null
            },
            select: {
              id: true
            }
          });

          assertCheckoutEligible(
            currentRequest.status,
            asset.serviceability,
            activeLoan !== null
          );

          const checkedOutAt = new Date();

          // Update request and create Loan atomically.
          await tx.borrowRequest.update({
            where: {
              id: requestId
            },
            data: {
              status: 'FULFILLED',
              fulfilledAt: checkedOutAt
            }
          });

          const createdLoan = await tx.loan.create({
            data: {
              borrowRequestId: requestId,
              borrowerId: currentRequest.borrowerId,
              assetId: currentRequest.assetId,
              checkedOutById: custodianId,
              checkedOutAt
            },
            select: loanSelect
          });

          const fulfilledRequest =
            await tx.borrowRequest.findUniqueOrThrow({
              where: {
                id: requestId
              },
              select: requestSelect
            });

          return {
            request: requestDTO(fulfilledRequest),
            loan: loanDTO(createdLoan)
          };
        },
        {
          maxWait: 5000,
          timeout: 10000
        }
      );
    } catch (error) {
      // Handle database uniqueness conflicts safely.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ApiError(
          409,
          'ASSET_UNAVAILABLE',
          'This asset is unavailable for checkout.'
        );
      }

      throw error;
    }
  }
}
