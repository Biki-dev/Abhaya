import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrlCandidates } from '../services/api';

const HEARTBEAT_INTERVAL_MS = 30_000;  // reduced from 15s → 30s to save battery
const API_ENDPOINT = '/api/heartbeat';
const MAX_SILENT_FAILS = 3; // only log first 3 failures, then go silent

type HeartbeatPayload = {
  userId:    string;
  lat:       number | null;
  lng:       number | null;
  timestamp: number;
};

export function useHeartbeat(
  userId: string | null,
  lat: number | null,
  lng: number | null,
  active: boolean = true
) {
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef(0);
  const workingBaseRef = useRef<string | null>(null); // cache the working URL

  const sendHeartbeat = useCallback(async () => {
    if (!userId) return;
    const payload: HeartbeatPayload = { userId, lat, lng, timestamp: Date.now() };

    try {
      // Use cached working URL first, then fall back to candidates
      const candidates = workingBaseRef.current
        ? [workingBaseRef.current, ...getApiBaseUrlCandidates().filter(u => u !== workingBaseRef.current)]
        : getApiBaseUrlCandidates();

      const storedBase = await AsyncStorage.getItem('Abhaya_api_base').catch(() => null);
      const allUrls = [...new Set([storedBase, ...candidates].filter((v): v is string => Boolean(v)))];

      let ok = false;
      for (const base of allUrls) {
        try {
          const response = await fetch(`${base}${API_ENDPOINT}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
            signal:  AbortSignal.timeout(5000), // 5s timeout
          });
          if (response.ok) {
            ok = true;
            failCountRef.current = 0;
            workingBaseRef.current = base;
            if (storedBase !== base) {
              AsyncStorage.setItem('Abhaya_api_base', base).catch(() => {});
            }
            break;
          }
        } catch {
          // try next URL
        }
      }

      if (!ok) {
        failCountRef.current++;
        // Log only for first MAX_SILENT_FAILS failures, then go silent
        if (failCountRef.current <= MAX_SILENT_FAILS) {
          console.warn(`[Heartbeat] Server unreachable (attempt ${failCountRef.current}) — app running offline`);
        }
        // Clear cached working URL after several failures (server may have moved)
        if (failCountRef.current === 10) {
          workingBaseRef.current = null;
        }
      }
    } catch (err) {
      failCountRef.current++;
      if (failCountRef.current <= MAX_SILENT_FAILS) {
        console.warn('[Heartbeat] Error:', err);
      }
    }
  }, [userId, lat, lng]);

  useEffect(() => {
    if (!active || !userId) return;

    // First ping after a short delay (let app stabilise)
    const initialDelay = setTimeout(sendHeartbeat, 3000);

    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (_: AppStateStatus) => {
      // No action needed — interval keeps running in background
    });

    return () => {
      clearTimeout(initialDelay);
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [active, userId, sendHeartbeat]);
}