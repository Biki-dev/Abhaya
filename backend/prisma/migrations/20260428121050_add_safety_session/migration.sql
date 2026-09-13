-- CreateTable
CREATE TABLE "SafetySession" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SafetySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetySession_userId_idx" ON "SafetySession"("userId");

-- AddForeignKey
ALTER TABLE "SafetySession" ADD CONSTRAINT "SafetySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
