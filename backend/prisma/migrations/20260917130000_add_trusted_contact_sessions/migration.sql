ALTER TABLE "SafetySession"
  ADD COLUMN "publicToken" TEXT,
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "lastAccuracy" DOUBLE PRECISION,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

UPDATE "SafetySession"
SET
  "publicToken" = COALESCE("id", md5(random()::text || clock_timestamp()::text)),
  "expiresAt" = COALESCE("endedAt", "startedAt" + INTERVAL '24 hours')
WHERE "publicToken" IS NULL OR "expiresAt" IS NULL;

ALTER TABLE "SafetySession"
  ALTER COLUMN "publicToken" SET NOT NULL,
  ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE UNIQUE INDEX "SafetySession_publicToken_key" ON "SafetySession"("publicToken");
