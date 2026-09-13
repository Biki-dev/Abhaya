import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { CrimeFeatureCollection } from '../services/crimeZones';
import { getApiBaseUrlCandidates, getStoredUserData, upsertUser } from '../services/api';
import { startSafetySession, endSafetySession, SafetySession } from '../services/safetySessions';

type LocationLike = { latitude: number; longitude: number };

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: LocationLike, b: LocationLike): number {
  const earthRadius = 6_371_000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function useSafetyTracking(location: LocationLike | null, zones: CrimeFeatureCollection) {
  const [session, setSession] = useState<SafetySession | null>(null);
  const [isInsideCrimeZone, setIsInsideCrimeZone] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const userIdRef = useRef<number | null>(null);
  const lastAutoAlertTimeRef = useRef<number>(0);
  const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes

  // 1. Resolve User ID
  useEffect(() => {
    const resolveUser = async () => {
      try {
        const userData = await getStoredUserData();
        if (userData?.phone) {
          const user = await upsertUser(userData);
          userIdRef.current = (user as any).id;
        }
      } catch (err) {
        console.error('[useSafetyTracking] Failed to resolve user:', err);
      }
    };
    resolveUser();
  }, []);

  // 2. Check if inside any crime zone
  useEffect(() => {
    if (!location || !zones.features.length) {
      setIsInsideCrimeZone(false);
      return;
    }

    const inside = zones.features.some((zone) => {
      const [zLng, zLat] = zone.geometry.coordinates as number[];
      const distance = haversineMeters(location, { latitude: zLat, longitude: zLng });
      return distance <= (zone.properties.radius || 500);
    });

    setIsInsideCrimeZone(inside);
  }, [location, zones]);

  // 3. Handle Session Lifecycle
  useEffect(() => {
    const manageSession = async () => {
      if (isInsideCrimeZone && !session && userIdRef.current && location) {
        // Start Session
        try {
          const newSession = await startSafetySession(
            userIdRef.current,
            location.latitude,
            location.longitude
          );
          setSession(newSession);

          // Initialize Socket
          const baseUrl = getApiBaseUrlCandidates()[0];
          const socket = io(baseUrl);
          socketRef.current = socket;

          socket.on('connect', () => {
            socket.emit('join-session', newSession.id);
            console.log('[useSafetyTracking] Socket connected and joined session:', newSession.id);
          });
        } catch (err) {
          console.error('[useSafetyTracking] Failed to start session:', err);
        }
      } else if (!isInsideCrimeZone && session && location) {
        // End Session
        try {
          await endSafetySession(session.id, location.latitude, location.longitude);
          if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
          }
          setSession(null);
          console.log('[useSafetyTracking] Session ended');
        } catch (err) {
          console.error('[useSafetyTracking] Failed to end session:', err);
        }
      }
    };

    manageSession();
  }, [isInsideCrimeZone, session, location]);

  // 4. Stream Location Updates
  useEffect(() => {
    if (session && location && socketRef.current?.connected) {
      socketRef.current.emit('location-update', {
        sessionId: session.id,
        lat: location.latitude,
        lng: location.longitude,
      });
    }
  }, [location, session]);

  const triggerManualSOS = async (reason: string) => {
    if (session || !userIdRef.current || !location) return;

    try {
      const newSession = await startSafetySession(
        userIdRef.current,
        location.latitude,
        location.longitude,
        reason
      );
      setSession(newSession);

      const baseUrl = getApiBaseUrlCandidates()[0];
      const socket = io(baseUrl);
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join-session', newSession.id);
        console.log('[useSafetyTracking] Manual SOS session started:', newSession.id);
      });
    } catch (err) {
      console.error('[useSafetyTracking] Failed to trigger manual SOS:', err);
    }
  };

  return { session, isInsideCrimeZone, triggerManualSOS };
}
