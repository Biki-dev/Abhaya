CREATE TABLE "SubscriptionSnapshot" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "revenueCatAppUserId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "activeEntitlements" JSONB NOT NULL DEFAULT '[]',
    "purchasedProductIds" JSONB NOT NULL DEFAULT '[]',
    "requestDate" TIMESTAMP(3),
    "originalPurchaseDate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionSnapshot_userId_syncedAt_idx" ON "SubscriptionSnapshot"("userId", "syncedAt");
CREATE INDEX "SubscriptionSnapshot_revenueCatAppUserId_idx" ON "SubscriptionSnapshot"("revenueCatAppUserId");

ALTER TABLE "SubscriptionSnapshot" ADD CONSTRAINT "SubscriptionSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
