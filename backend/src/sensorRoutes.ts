
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';

export const sensorRouter = Router();

// ── /api/audio-risk/analyze ───────────────────────────────────────────────────
// Called by the mobile app's useKeywordDetectionSOS hook.
// Accepts:
//   { transcript?: string, features?: number[] }
// Returns:
//   { label: string, confidence: number, triggered: boolean }
//
// Strategy:
//   1. If features[] provided → run heuristic confidence scoring
//   2. If transcript provided → keyword-match against distress words
//   3. Combine both scores and return the highest confidence path
//
const audioRiskSchema = z.object({
  transcript: z.string().optional(),
  features:   z.array(z.number()).optional(),
});

const DISTRESS_KEYWORDS = ['help help', 'help me', 'bachao', 'help', 'please help', 'sos'];
const DISTRESS_THRESHOLD = 0.60;

function scoreFeatures(features: number[]): number {
  const rms   = features[0] ?? 0;   // linear 0-1
  const zcr   = features[1] ?? 0;   // 0-1
  let score   = 0;

  if (rms > 0.05)                         score += 0.25;
  else if (rms > 0.02)                    score += 0.10;
  if (zcr > 0.05 && zcr < 0.40)          score += 0.25;
  const avgPower = (features.slice(2, 12).reduce((a, b) => a + b, 0)) / 10;
  if (avgPower > 0.001)                   score += 0.25;
  const temporal = features.slice(12, 20);
  if (temporal.length > 0) {
    const mean = temporal.reduce((a, b) => a + b, 0) / temporal.length;
    const variance = Math.sqrt(temporal.reduce((s, f) => s + (f - mean) ** 2, 0) / temporal.length);
    if (variance > 0.001)                 score += 0.25;
  }
  return Math.min(score, 1);
}

function scoreTranscript(transcript: string): number {
  const lower = transcript.toLowerCase();
  for (const kw of DISTRESS_KEYWORDS) {
    if (lower.includes(kw)) {
      // how many times does the primary keyword appear?
      const count = (lower.match(/help/g) ?? []).length;
      // "help help" (2+ occurrences) = high confidence
      return count >= 2 ? 0.95 : 0.75;
    }
  }
  return 0;
}

sensorRouter.post('/api/audio-risk/analyze', (req, res) => {
  const parsed = audioRiskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { transcript, features } = parsed.data;

  let featureConfidence  = features  ? scoreFeatures(features)          : 0;
  let transcriptConfidence = transcript ? scoreTranscript(transcript)   : 0;

  // Take the maximum signal from either path
  const confidence = Math.max(featureConfidence, transcriptConfidence);
  const triggered  = confidence >= DISTRESS_THRESHOLD;
  const label      = triggered ? 'help_help' : 'noise';

  console.log(
    `[audio-risk] transcript="${transcript ?? ''}" feat_conf=${featureConfidence.toFixed(2)} ` +
    `tx_conf=${transcriptConfidence.toFixed(2)} final=${confidence.toFixed(2)} triggered=${triggered}`
  );

  return res.json({ label, confidence, triggered });
});


// ── batch ingest sensor events ────────────────────────────────────────────────
const sensorEventSchema = z.object({
  id:        z.string(),
  userId:    z.string(),          // phone used as lookup key
  type:      z.string(),
  lat:       z.number().nullable().optional(),
  lng:       z.number().nullable().optional(),
  data:      z.record(z.unknown()).default({}),
  timestamp: z.number(),
});

sensorRouter.post('/api/sensor-events/batch', async (req, res) => {
  const parsed = z.object({ events: z.array(sensorEventSchema) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { events } = parsed.data;

  // Resolve userId from phone (stored as userId string on client = phone)
  const results = await Promise.allSettled(
    events.map(async evt => {
      const user = await prisma.user.findUnique({ where: { phone: evt.userId } });
      if (!user) return;
      return prisma.$executeRaw`
        INSERT INTO "SensorEvent" ("id", "userId", "type", "lat", "lng", "data", "timestamp")
        VALUES (${evt.id}, ${user.id}, ${evt.type}, ${evt.lat ?? null}, ${evt.lng ?? null},
                ${JSON.stringify(evt.data)}::jsonb, ${BigInt(evt.timestamp)})
        ON CONFLICT ("id") DO NOTHING
      `;
    })
  );

  const saved = results.filter(r => r.status === 'fulfilled').length;
  return res.json({ saved });
});

// ── heartbeat ping ────────────────────────────────────────────────────────────
sensorRouter.post('/api/heartbeat', async (req, res) => {
  const parsed = z.object({
    userId:    z.string(),
    lat:       z.number().nullable().optional(),
    lng:       z.number().nullable().optional(),
    timestamp: z.number(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { userId, lat, lng, timestamp } = parsed.data;
  const user = await prisma.user.findUnique({ where: { phone: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  await prisma.$executeRaw`
    INSERT INTO "Heartbeat" ("userId", "lat", "lng", "timestamp", "updatedAt")
    VALUES (${user.id}, ${lat ?? null}, ${lng ?? null}, ${BigInt(timestamp)}, NOW())
    ON CONFLICT ("userId") DO UPDATE
      SET "lat" = ${lat ?? null}, "lng" = ${lng ?? null},
          "timestamp" = ${BigInt(timestamp)}, "updatedAt" = NOW()
  `;

  return res.json({ ok: true });
});

// ── guardian check: is user's heartbeat still alive? ─────────────────────────
// Call this from a cron job or guardian poll every 30s
sensorRouter.get('/api/heartbeat/check/:phone', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { phone: req.params.phone } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hb = await prisma.$queryRaw<{ timestamp: bigint; lat: number | null; lng: number | null }[]>`
    SELECT "timestamp", "lat", "lng" FROM "Heartbeat" WHERE "userId" = ${user.id}
  `;

  if (hb.length === 0) return res.json({ alive: null, lastSeen: null });

  const last    = Number(hb[0].timestamp);
  const elapsed = Date.now() - last;
  const alive   = elapsed < 60_000; // 60 second threshold

  return res.json({
    alive,
    lastSeen:     last,
    elapsedMs:    elapsed,
    lastLat:      hb[0].lat,
    lastLng:      hb[0].lng,
    guardianAlert: !alive,  // frontend uses this to show alert
  });
});

// ── recent sensor events for a user ──────────────────────────────────────────
sensorRouter.get('/api/sensor-events/:phone', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { phone: req.params.phone } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const type  = req.query.type as string | undefined;

  const events = type
    ? await prisma.$queryRaw<{ id: string; type: string; lat: number | null; lng: number | null; data: object; timestamp: bigint }[]>`
        SELECT "id", "type", "lat", "lng", "data", "timestamp"
        FROM "SensorEvent"
        WHERE "userId" = ${user.id}
          AND "type" = ${type}
        ORDER BY "timestamp" DESC
        LIMIT ${limit}
      `
    : await prisma.$queryRaw<{ id: string; type: string; lat: number | null; lng: number | null; data: object; timestamp: bigint }[]>`
        SELECT "id", "type", "lat", "lng", "data", "timestamp"
        FROM "SensorEvent"
        WHERE "userId" = ${user.id}
        ORDER BY "timestamp" DESC
        LIMIT ${limit}
      `;

  return res.json(events.map((e: { id: string; type: string; lat: number | null; lng: number | null; data: object; timestamp: bigint }) => ({
    ...e,
    timestamp: Number(e.timestamp),
  })));
});