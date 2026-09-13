CREATE TABLE IF NOT EXISTS "CrimeZoneCache" (
    "key" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius" INTEGER NOT NULL,
    "severity" TEXT,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrimeZoneCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "CrimeZoneCache_expiresAt_idx" ON "CrimeZoneCache"("expiresAt");
