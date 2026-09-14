import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { prisma } from './db.js';
import { sensorRouter } from './sensorRoutes.js';
import { contactsRouter } from './contactsRoutes.js';
import { crimeRouter } from './crimeRoutes.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const DATE_OF_BIRTH_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isValidPastDate(value: string) {
  const match = DATE_OF_BIRTH_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return date.getDate() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date <= new Date();
}

const upsertUserSchema = z.object({
  phone: z.string().min(10),
  name: z.string().trim().min(1).max(100),
  email: z.string().email().or(z.literal('')).nullish(),
  gender: z.string().max(40).nullish(),
  dateOfBirth: z.string().max(30).refine((value) => value === '' || isValidPastDate(value), 'Use DD/MM/YYYY for a valid past date.').nullish(),
  bloodGroup: z.enum(BLOOD_GROUPS).or(z.literal('')).nullish(),
  address: z.string().max(250).nullish(),
  city: z.string().max(100).nullish(),
});

const updateUserProfileSchema = upsertUserSchema.omit({ phone: true }).partial().extend({
  name: z.string().trim().min(1).max(100).optional(),
});

const subscriptionSnapshotSchema = z.object({
  phone: z.string().min(7).max(30),
  revenueCatAppUserId: z.string().min(1).max(200),
  store: z.literal('test_store'),
  plan: z.enum(['free', 'plus', 'family']),
  activeEntitlements: z.array(z.string().max(100)).max(10),
  purchasedProductIds: z.array(z.string().max(200)).max(100),
  requestDate: z.string().datetime().nullable().optional(),
  originalPurchaseDate: z.string().datetime().nullable().optional(),
});

const createRouteSchema = z.object({
  userPhone: z.string().min(10),
  destinationName: z.string().min(1),
  startLatitude: z.number(),
  startLongitude: z.number(),
  endLatitude: z.number(),
  endLongitude: z.number(),
  estimatedMinutes: z.number().int().positive(),
  startedAt: z.string().datetime(),
});

const completeRouteSchema = z.object({
  status: z.enum(['COMPLETED', 'CANCELLED']).default('COMPLETED'),
  completedAt: z.string().datetime().optional(),
});

import { createServer } from 'http';
import { setupSocket } from './socket.js';
import { safetyRouter } from './safetyRoutes.js';
import { sosRouter } from './sosRoutes.js';

export function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const port = Number(process.env.PORT ?? 4000);

  setupSocket(httpServer);

  app.use(cors());
  app.use(express.json());
  
  // Serve web-viewer static files
  const webViewerPath = join(__dirname, '../../web-viewer');
  app.use('/view', express.static(webViewerPath));

  // ── Routers ──────────────────────────────────────────────────────────────
  app.use(sensorRouter);
  app.use(contactsRouter);
  app.use(crimeRouter);
  app.use(safetyRouter);
  app.use(sosRouter);

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  app.post('/api/users/upsert', async (req, res) => {
    const parsed = upsertUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { phone, name, email, gender, dateOfBirth, bloodGroup, address, city } = parsed.data;
    const user = await prisma.user.upsert({
      where: { phone },
      update: {
        name,
        email: email || null,
        ...(gender !== undefined ? { gender: gender || null } : {}),
        ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth || null } : {}),
        ...(bloodGroup !== undefined ? { bloodGroup: bloodGroup || null } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
        ...(city !== undefined ? { city: city || null } : {}),
      },
      create: { phone, name, email: email || null, gender: gender || null, dateOfBirth: dateOfBirth || null, bloodGroup: bloodGroup || null, address: address || null, city: city || null },
    });

    return res.json(user);
  });

  app.get('/api/users/:phone', async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { phone: req.params.phone },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(user);
  });

  app.patch('/api/users/:phone', async (req, res) => {
    const parsed = updateUserProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const existing = await prisma.user.findUnique({ where: { phone: req.params.phone } });
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const data = parsed.data;
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.gender !== undefined ? { gender: data.gender || null } : {}),
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth || null } : {}),
        ...(data.bloodGroup !== undefined ? { bloodGroup: data.bloodGroup || null } : {}),
        ...(data.address !== undefined ? { address: data.address || null } : {}),
        ...(data.city !== undefined ? { city: data.city || null } : {}),
      },
    });
    return res.json(user);
  });

  // Purchase history/support audit only. Paid access is never granted from this
  // client-submitted snapshot; RevenueCat CustomerInfo remains the app authority.
  app.post('/api/subscriptions/snapshot', async (req, res) => {
    const parsed = subscriptionSnapshotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const payload = parsed.data;
    const user = await prisma.user.findUnique({ where: { phone: payload.phone } });
    if (!user) return res.status(404).json({ error: 'User not found for subscription snapshot' });

    const snapshot = await prisma.subscriptionSnapshot.create({
      data: {
        userId: user.id,
        revenueCatAppUserId: payload.revenueCatAppUserId,
        store: payload.store,
        plan: payload.plan,
        activeEntitlements: payload.activeEntitlements,
        purchasedProductIds: payload.purchasedProductIds,
        requestDate: payload.requestDate ? new Date(payload.requestDate) : null,
        originalPurchaseDate: payload.originalPurchaseDate ? new Date(payload.originalPurchaseDate) : null,
      },
    });

    return res.status(201).json({ id: snapshot.id, syncedAt: snapshot.syncedAt });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.post('/api/routes', async (req, res) => {
    const parsed = createRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const payload = parsed.data;
    const user = await prisma.user.findUnique({ where: { phone: payload.userPhone } });

    if (!user) {
      return res.status(404).json({ error: 'User not found for route create' });
    }

    const route = await prisma.routeHistory.create({
      data: {
        userId: user.id,
        destinationName: payload.destinationName,
        startLatitude: payload.startLatitude,
        startLongitude: payload.startLongitude,
        endLatitude: payload.endLatitude,
        endLongitude: payload.endLongitude,
        estimatedMinutes: payload.estimatedMinutes,
        startedAt: new Date(payload.startedAt),
      },
    });

    return res.status(201).json(route);
  });

  app.patch('/api/routes/:id/complete', async (req, res) => {
    const routeId = Number(req.params.id);
    if (Number.isNaN(routeId)) {
      return res.status(400).json({ error: 'Invalid route id' });
    }

    const parsed = completeRouteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const payload = parsed.data;

    const route = await prisma.routeHistory.update({
      where: { id: routeId },
      data: {
        status: payload.status,
        completedAt: payload.completedAt ? new Date(payload.completedAt) : new Date(),
      },
    });

    return res.json(route);
  });

  app.get('/api/users/:phone/routes', async (req, res) => {
    const user = await prisma.user.findUnique({ where: { phone: req.params.phone } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const routes = await prisma.routeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(routes);
  });

  // ── Auth / Logout ──────────────────────────────────────────────────────────
  app.post('/api/auth/logout', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required for logout' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { phone } });
      if (user) {
        // Invalidate all sessions for this user in the database
        await prisma.session.deleteMany({
          where: { userId: user.id },
        });
      }
      return res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ error: 'Failed to logout' });
    }
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Backend running on http://0.0.0.0:${port}`);
  });

// Global error handlers — prevent crashes in production
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
  // Don't exit — Render will restart if needed
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, closing connections...');
  await prisma.$disconnect();
  process.exit(0);
});

}
