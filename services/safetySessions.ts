import { getApiBaseUrlCandidates } from './api';

export type SafetySession = {
  id: string;
  userId: number;
  status: 'ACTIVE' | 'COMPLETED';
  lastLat: number | null;
  lastLng: number | null;
  startedAt: string;
  endedAt: string | null;
  user?: {
    name: string;
  };
};

export async function startSafetySession(userId: number, lat: number, lng: number, reason?: string): Promise<SafetySession> {
  const baseUrls = getApiBaseUrlCandidates();
  let lastErr: unknown = null;

  for (const base of baseUrls) {
    try {
      const response = await fetch(`${base}/api/safety-sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, lat, lng, reason }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start safety session: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Failed to start safety session');
}

export async function endSafetySession(id: string, lat: number, lng: number): Promise<SafetySession> {
  const baseUrls = getApiBaseUrlCandidates();
  let lastErr: unknown = null;

  for (const base of baseUrls) {
    try {
      const response = await fetch(`${base}/api/safety-sessions/${id}/end`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });

      if (!response.ok) {
        throw new Error(`Failed to end safety session: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Failed to end safety session');
}
