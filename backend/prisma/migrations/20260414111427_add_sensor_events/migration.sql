CREATE TABLE IF NOT EXISTS "SensorEvent" (
    "id"        TEXT NOT NULL,
    "userId"    INTEGER NOT NULL,
    "type"      TEXT NOT NULL,
    "lat"       DOUBLE PRECISION,
    "lng"       DOUBLE PRECISION,
    "data"      JSONB NOT NULL DEFAULT '{}'::jsonb,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SensorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SensorEvent_userId_timestamp_idx" ON "SensorEvent"("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "SensorEvent_type_idx" ON "SensorEvent"("type");

ALTER TABLE "SensorEvent" DROP CONSTRAINT IF EXISTS "SensorEvent_userId_fkey";
ALTER TABLE "SensorEvent"
  ADD CONSTRAINT "SensorEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Heartbeat" (
    "id"        SERIAL NOT NULL,
    "userId"    INTEGER NOT NULL UNIQUE,
    "lat"       DOUBLE PRECISION,
    "lng"       DOUBLE PRECISION,
    "timestamp" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Heartbeat" DROP CONSTRAINT IF EXISTS "Heartbeat_userId_fkey";
ALTER TABLE "Heartbeat"
  ADD CONSTRAINT "Heartbeat_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
