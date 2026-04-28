import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

export function setupSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      console.log(`Socket ${socket.id} joined session ${sessionId}`);
    });

    socket.on('location-update', (data: { sessionId: string; lat: number; lng: number }) => {
      const { sessionId, lat, lng } = data;
      // Broadcast to everyone in the room (parents)
      io.to(`session:${sessionId}`).emit('location-updated', { lat, lng, timestamp: Date.now() });
      console.log(`Location update for session ${sessionId}: ${lat}, ${lng}`);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
}
