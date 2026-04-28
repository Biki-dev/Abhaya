import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { CrimeSeverity, getCrimeZones } from './crimeService.js';

export const crimeRouter = Router();

const crimeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().positive().max(10_000).default(2_000),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

crimeRouter.get('/api/crime-zones', async (req, res) => {
  const parsed = crimeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = await getCrimeZones({
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    radius: parsed.data.radius,
    severity: parsed.data.severity as CrimeSeverity | undefined,
  });

  return res.json(payload);
});

crimeRouter.get('/api/crime-zones/stats/:city', async (_req, res) => {
  const monthAgo = BigInt(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<
    Array<{
      severity: string;
      count: bigint;
    }>
  >`
    SELECT
      CASE
        WHEN cluster_counts.cnt >= 8 THEN 'critical'
        WHEN cluster_counts.cnt >= 5 THEN 'high'
        WHEN cluster_counts.cnt >= 3 THEN 'medium'
        ELSE 'low'
      END AS severity,
      COUNT(*)::bigint AS count
    FROM (
      SELECT
        FLOOR(("lat" / 0.0045))::bigint AS lat_bucket,
        FLOOR(("lng" / 0.0045))::bigint AS lng_bucket,
        COUNT(*)::bigint AS cnt
      FROM "SensorEvent"
      WHERE "type" = 'sos_triggered'
        AND "lat" IS NOT NULL
        AND "lng" IS NOT NULL
        AND "timestamp" >= ${monthAgo}
      GROUP BY lat_bucket, lng_bucket
    ) AS cluster_counts
    GROUP BY severity
  `;

  const summary = {
    city: _req.params.city,
    generatedAt: Date.now(),
    totals: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
  };

  for (const row of rows) {
    if (row.severity in summary.totals) {
      summary.totals[row.severity as keyof typeof summary.totals] = Number(row.count);
    }
  }

  return res.json(summary);
});

