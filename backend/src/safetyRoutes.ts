import { Router } from 'express';
import { prisma } from './db.js';
import { z } from 'zod';
import { sendSMS } from './smsService.js';

export const safetyRouter = Router();

const startSessionSchema = z.object({
  userId: z.number(),
  lat: z.number(),
  lng: z.number(),
  reason: z.string().optional(),
});

const endSessionSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

safetyRouter.post('/api/safety-sessions/start', async (req, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { userId, lat, lng } = parsed.data;

  // 1. Fetch user and emergency contacts
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { emergencyContacts: true }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // 2. Create the session
  const session = await prisma.safetySession.create({
    data: {
      userId,
      lastLat: lat,
      lastLng: lng,
      status: 'ACTIVE',
    },
  });

  // 3. Send SMS to emergency contacts (excluding Police)
  // Logic: Only send SMS if the user hasn't had another session start in the last 30 minutes
  // to prevent spamming contacts if the user is hovering at a zone boundary.
  const cooldownMs = 30 * 60 * 1000;
  const recentSession = await prisma.safetySession.findFirst({
    where: {
      userId,
      id: { not: session.id },
      startedAt: { gte: new Date(Date.now() - cooldownMs) }
    }
  });

  if (!recentSession || parsed.data.reason) {
    const viewerUrl = process.env.VIEWER_URL || 'http://localhost:4000/view';
    const trackingLink = `${viewerUrl}?s=${session.id}`;
    const sosReason = parsed.data.reason || 'entered a high-risk zone';
    const message = `SOS! ${user.name} ${sosReason}. Track live location here: ${trackingLink}`;

    const smsPromises = user.emergencyContacts
      .filter(contact => !contact.name.toLowerCase().includes('police'))
      .map(contact => sendSMS(contact.phone, message));

    // Run SMS sending in background
    Promise.all(smsPromises).catch(err => console.error('[SMS Error]', err));
  } else {
    console.log(`[SMS] Skipping alert for user ${userId} - cooldown active.`);
  }

  return res.status(201).json(session);
});

safetyRouter.patch('/api/safety-sessions/:id/end', async (req, res) => {
  const { id } = req.params;
  const parsed = endSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { lat, lng } = parsed.data;

  const session = await prisma.safetySession.update({
    where: { id },
    data: {
      lastLat: lat,
      lastLng: lng,
      status: 'COMPLETED',
      endedAt: new Date(),
    },
  });

  return res.json(session);
});

safetyRouter.get('/api/safety-sessions/:id', async (req, res) => {
  const { id } = req.params;
  const session = await prisma.safetySession.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        }
      }
    }
  });

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Fetch 5 most recent previous sessions for this user for history
  const history = await prisma.safetySession.findMany({
    where: {
      userId: session.user.id,
      id: { not: session.id }
    },
    orderBy: { startedAt: 'desc' },
    take: 5
  });

  return res.json({ ...session, history });
});
