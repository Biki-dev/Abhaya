import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { sendSMS } from './smsService.js';
import { randomBytes } from 'crypto';

export const safetyRouter = Router();

const startSessionSchema = z.object({
  userId: z.number().optional(),
  userPhone: z.string().min(7).optional(),
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().nonnegative().optional(),
  reason: z.string().optional(),
}).refine((value) => value.userId != null || value.userPhone != null, 'userId or userPhone is required');

const endSessionSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().nonnegative().optional(),
});

const acknowledgeSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function publicStatus(session: { status: string; expiresAt: Date }) {
  if (session.status === 'COMPLETED') return 'RESOLVED';
  if (session.expiresAt.getTime() <= Date.now()) return 'EXPIRED';
  if (session.status === 'ACKNOWLEDGED') return 'ACKNOWLEDGED';
  return 'ACTIVE';
}

safetyRouter.post('/api/safety-sessions/start', async (req, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { userId: requestedUserId, userPhone, lat, lng, accuracy, reason } = parsed.data;

  // 1. Fetch user and emergency contacts
  const user = await prisma.user.findUnique({
    where: requestedUserId != null ? { id: requestedUserId } : { phone: userPhone! },
    include: { emergencyContacts: true }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // 2. Create the session
  const session = await prisma.safetySession.create({
    data: {
      userId: user.id,
      lastLat: lat,
      lastLng: lng,
      lastAccuracy: accuracy ?? null,
      reason: reason ?? null,
      status: 'ACTIVE',
      publicToken: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  // 3. Send SMS to emergency contacts (excluding Police)
  // Logic: Only send SMS if the user hasn't had another session start in the last 30 minutes
  // to prevent spamming contacts if the user is hovering at a zone boundary.
  const cooldownMs = 30 * 60 * 1000;
  const recentSession = await prisma.safetySession.findFirst({
    where: {
      userId: user.id,
      id: { not: session.id },
      startedAt: { gte: new Date(Date.now() - cooldownMs) }
    }
  });

  if (!recentSession || parsed.data.reason) {
    const viewerUrl = process.env.VIEWER_URL || 'https://abhayamain.netlify.app/';
    const trackingLink = `${viewerUrl}?t=${session.publicToken}`;
    const sosReason = parsed.data.reason || 'entered a high-risk zone';
    const message = `SOS! ${user.name} ${sosReason}. Track live location here: ${trackingLink}`;

    const smsPromises = user.emergencyContacts
      .filter(contact => !contact.name.toLowerCase().includes('police'))
      .map(contact => sendSMS(contact.phone, message));

    // Run SMS sending in background
    Promise.all(smsPromises).catch(err => console.error('[SMS Error]', err));
  } else {
    console.log(`[SMS] Skipping alert for user ${user.id} - cooldown active.`);
  }

  return res.status(201).json({
    ...session,
    viewerUrl: `${process.env.VIEWER_URL || 'https://abhayamain.netlify.app/'}?t=${session.publicToken}`,
    publicStatus: publicStatus(session),
  });
});

safetyRouter.patch('/api/safety-sessions/:id/end', async (req, res) => {
  const { id } = req.params;
  const parsed = endSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { lat, lng, accuracy } = parsed.data;

  const session = await prisma.safetySession.update({
    where: { id },
    data: {
      lastLat: lat,
      lastLng: lng,
      lastAccuracy: accuracy ?? null,
      status: 'COMPLETED',
      endedAt: new Date(),
    },
  });

  return res.json(session);
});

async function getPublicSession(token: string) {
  return prisma.safetySession.findFirst({
    where: {
      OR: [
        { publicToken: token },
        { id: token },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        }
      }
    }
  });

}

safetyRouter.get('/api/safety-sessions/public/:token', async (req, res) => {
  const session = await getPublicSession(req.params.token);
  if (!session) return res.status(404).json({ error: 'This safety link is invalid or has expired.' });

  const status = publicStatus(session);
  return res.json({
    id: session.id,
    user: session.user,
    status,
    reason: session.reason ?? null,
    lastLat: session.lastLat,
    lastLng: session.lastLng,
    lastAccuracy: session.lastAccuracy,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    acknowledgedAt: session.acknowledgedAt,
    endedAt: session.endedAt,
    canAcknowledge: status === 'ACTIVE',
  });
});

safetyRouter.post('/api/safety-sessions/public/:token/acknowledge', async (req, res) => {
  const parsed = acknowledgeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const session = await getPublicSession(req.params.token);
  if (!session) return res.status(404).json({ error: 'This safety link is invalid or has expired.' });
  if (publicStatus(session) === 'EXPIRED') return res.status(410).json({ error: 'This safety link has expired.' });
  if (session.status === 'COMPLETED') return res.status(409).json({ error: 'This safety session is already resolved.' });

  const updated = await prisma.safetySession.update({
    where: { id: session.id },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
  });
  return res.json({ status: publicStatus(updated), acknowledgedAt: updated.acknowledgedAt, acknowledgedBy: parsed.data.name ?? null });
});
