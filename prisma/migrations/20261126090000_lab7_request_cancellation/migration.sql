ALTER TYPE "BorrowRequestStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "BorrowRequest" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "BorrowRequest" DROP CONSTRAINT "BorrowRequest_fulfilledAt_consistent";
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_fulfilledAt_consistent" CHECK (
    ("status"::text = 'PENDING' AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL) OR
    ("status"::text = 'FULFILLED' AND "fulfilledAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
    ("status"::text = 'CANCELLED' AND "fulfilledAt" IS NULL AND "cancelledAt" IS NOT NULL)
);
