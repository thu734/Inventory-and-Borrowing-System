CREATE TYPE "Role" AS ENUM ('BORROWER', 'CUSTODIAN');
CREATE TYPE "Serviceability" AS ENUM ('SERVICEABLE', 'MAINTENANCE', 'RETIRED');
CREATE TYPE "BorrowRequestStatus" AS ENUM ('PENDING', 'FULFILLED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EquipmentModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EquipmentModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "equipmentModelId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "serviceability" "Serviceability" NOT NULL DEFAULT 'SERVICEABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BorrowRequest" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" "BorrowRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),
    CONSTRAINT "BorrowRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "borrowRequestId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "checkedOutById" TEXT NOT NULL,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "EquipmentModel_name_category_key" ON "EquipmentModel"("name", "category");
CREATE UNIQUE INDEX "Asset_assetCode_key" ON "Asset"("assetCode");
CREATE INDEX "Asset_equipmentModelId_idx" ON "Asset"("equipmentModelId");
CREATE INDEX "Asset_serviceability_idx" ON "Asset"("serviceability");
CREATE UNIQUE INDEX "BorrowRequest_id_borrowerId_assetId_key" ON "BorrowRequest"("id", "borrowerId", "assetId");
CREATE INDEX "BorrowRequest_borrowerId_status_idx" ON "BorrowRequest"("borrowerId", "status");
CREATE INDEX "BorrowRequest_assetId_status_idx" ON "BorrowRequest"("assetId", "status");
CREATE UNIQUE INDEX "Loan_borrowRequestId_key" ON "Loan"("borrowRequestId");
CREATE UNIQUE INDEX "Loan_borrowRequestId_borrowerId_assetId_key" ON "Loan"("borrowRequestId", "borrowerId", "assetId");
CREATE INDEX "Loan_assetId_idx" ON "Loan"("assetId");
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");
CREATE INDEX "Loan_returnedAt_idx" ON "Loan"("returnedAt");
CREATE UNIQUE INDEX "Loan_one_active_per_asset" ON "Loan"("assetId") WHERE "returnedAt" IS NULL;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_equipmentModelId_fkey" FOREIGN KEY ("equipmentModelId") REFERENCES "EquipmentModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowRequestId_borrowerId_assetId_fkey" FOREIGN KEY ("borrowRequestId", "borrowerId", "assetId") REFERENCES "BorrowRequest"("id", "borrowerId", "assetId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_normalizedEmail_nonblank" CHECK (length(trim("normalizedEmail")) > 0);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assetCode_nonblank" CHECK (length(trim("assetCode")) > 0);
ALTER TABLE "Session" ADD CONSTRAINT "Session_expiry_after_creation" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_fulfilledAt_consistent" CHECK (
    ("status" = 'PENDING' AND "fulfilledAt" IS NULL) OR
    ("status" = 'FULFILLED' AND "fulfilledAt" IS NOT NULL)
);
