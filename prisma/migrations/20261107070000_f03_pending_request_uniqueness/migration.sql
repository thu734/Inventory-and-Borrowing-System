-- Q-01: only PENDING requests are unique per Borrower/Asset pair.
-- An ordinary Prisma @@unique would also prohibit future requests after fulfillment.
-- Fail rather than delete/merge any pre-existing duplicate data during deployment.
CREATE UNIQUE INDEX "BorrowRequest_one_pending_per_borrower_asset"
ON "BorrowRequest" ("borrowerId", "assetId") WHERE "status" = 'PENDING';
