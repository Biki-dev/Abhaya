import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { sendSMS } from './smsService.js';

export const meshRouter = Router();

const meshRelaySchema = z.object({
  lat:       z.number().min(-90).max(90),
  lng:       z.number().min(-180).max(180),
  timestamp: z.number(),
  senderId:  z.string().max(20),
  hops:      z.number().int().min(0).max(5).default(1),
  source:    z.string().default('ble_mesh'),
});

// Dedup window: same senderId cannot trigger another alert within 5 minutes
const recentAlerts = new Map<string, number>();

meshRouter.post('/api/sos/mesh-relay', async (req, res) => {
  const parsed = meshRelaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { lat, lng, timestamp, senderId, hops, source } = parsed.data;

  // Dedup check
  const lastAlert = recentAlerts.get(senderId);
  if (lastAlert && Date.now() - lastAlert < 5 * 60 * 1000) {
    console.log(`[meshRelay] Duplicate SOS from ${senderId}, skipping`);
    return res.json({ status: 'duplicate', skipped: true });
  }
  recentAlerts.set(senderId, Date.now());

  // Log as sensor event (best-effort match by nearest user)
  try {
    await prisma.sensorEvent.create({
      data: {
        id:        `mesh-${senderId}-${timestamp}`,
        userId:    1, // system/unknown user — improve with actual user lookup
        type:      'sos_triggered',
        lat,
        lng,
        data:      { source, hops, senderId, meshRelay: true },
        timestamp: BigInt(timestamp),
      },
    });
  } catch (err: any) {
    // Don't fail the relay if DB insert fails — SMS is more important
    console.warn('[meshRelay] DB log failed:', err.message);
  }

  // Find nearest registered user by GPS and alert their emergency contacts
  // This is a best-effort: the senderId (last 4 chars of device UUID) isn't
  // enough to identify the exact user, so we use GPS proximity.
  const latDelta = 0.05; // ~5.5km
  const lngDelta = 0.05;

  const nearbyUsers = await prisma.user.findMany({
    where: {
      heartbeat: {
        lat: { gte: lat - latDelta, lte: lat + latDelta },
        lng: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
    },
    include: { emergencyContacts: true, heartbeat: true },
    take: 3,
  }).catch(() => []);

  let smsSent = 0;
  for (const user of nearbyUsers) {
    const mapsUrl = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    const message = [
      `${user.name} may be in danger (BLE mesh relay, ${hops} hop${hops > 1 ? 's' : ''})`,
      `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      `Time: ${new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
    ].join('\n');

    for (const contact of user.emergencyContacts) {
      await sendSMS(contact.phone, message).catch(() => {});
      smsSent++;
    }
  }

  console.log(`[meshRelay] SOS from ${senderId} — ${nearbyUsers.length} users found, ${smsSent} SMS sent`);

  return res.json({
    status:       'relayed',
    usersAlerted: nearbyUsers.length,
    smsSent,
    hops,
  });
});