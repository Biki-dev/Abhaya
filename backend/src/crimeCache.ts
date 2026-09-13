
import { prisma } from './db.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

type CacheParams = { lat: number; lng: number; radius: number; severity?: string; };

// v2 — busts stale empty v1 entries
export function buildCrimeCacheKey(params: CacheParams): string {
  return `crime:v2:${params.lat.toFixed(3)}:${params.lng.toFixed(3)}:${Math.round(params.radius)}:${params.severity ?? 'all'}`;
}

export async function readCrimeCache<T>(key: string): Promise<T | null> {
  try {
    const entry = await prisma.crimeZoneCache.findUnique({ where: { key } });
    if (!entry) return null;
    if (entry.expiresAt.getTime() <= Date.now()) {
      await prisma.crimeZoneCache.delete({ where: { key } }).catch(() => {});
      return null;
    }
    return entry.payload as T;
  } catch { return null; }
}

export async function writeCrimeCache(key: string, params: CacheParams, payload: unknown): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    await prisma.crimeZoneCache.upsert({
      where:  { key },
      update: { payload: payload as object, lat: params.lat, lng: params.lng, radius: params.radius, severity: params.severity ?? null, expiresAt },
      create: { key, payload: payload as object, lat: params.lat, lng: params.lng, radius: params.radius, severity: params.severity ?? null, expiresAt },
    });
  } catch (err) { console.warn('[crimeCache] write failed:', err); }
}