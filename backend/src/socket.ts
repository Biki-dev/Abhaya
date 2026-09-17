import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { prisma } from './db.js';

export function setupSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-session', async (sessionToken: string) => {
      if (typeof sessionToken !== 'string' || sessionToken.length < 16) return;
      const session = await prisma.safetySession.findFirst({
        where: {
          OR: [
            { publicToken: sessionToken },
            { id: sessionToken },
          ],
        },
        select: { id: true, expiresAt: true },
      });
      if (!session || session.expiresAt <= new Date()) {
        socket.emit('session-error', { message: 'This safety link is invalid or expired.' });
        return;
      }
      socket.join(`session:${session.id}`);
      socket.emit('session-joined', { ok: true });
      console.log(`Socket ${socket.id} joined public safety session ${session.id}`);
    });

    socket.on('location-update', async (data: { sessionId: string; lat: number; lng: number; accuracy?: number }) => {
      const { sessionId, lat, lng, accuracy } = data ?? {};
      if (!sessionId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const session = await prisma.safetySession.findUnique({
        where: { id: sessionId },
        select: { id: true, expiresAt: true, status: true },
      });
      if (!session || session.expiresAt <= new Date() || session.status === 'COMPLETED') return;

      await prisma.safetySession.update({
        where: { id: sessionId },
        data: { lastLat: lat, lastLng: lng, lastAccuracy: Number.isFinite(accuracy) ? accuracy : undefined },
      });
      io.to(`session:${sessionId}`).emit('location-updated', {
        lat,
        lng,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        timestamp: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
}
