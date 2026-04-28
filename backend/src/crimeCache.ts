import { prisma } from './db.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

type CacheParams = {
  lat: number;
  lng: number;
  radius: number;
  severity?: string;
};

export function buildCrimeCacheKey(params: CacheParams): string {
  const latKey = params.lat.toFixed(3);
  const lngKey = params.lng.toFixed(3);
  const radiusKey = Math.round(params.radius);
  const sev = params.severity ?? 'all';
  return `crime:v1:${latKey}:${lngKey}:${radiusKey}:${sev}`;
}

export async function readCrimeCache<T>(key: string): Promise<T | null> {
  const entry = await prisma.crimeZoneCache.findUnique({ where: { key } });
  if (!entry) {
    return null;
  }

  if (entry.expiresAt.getTime() <= Date.now()) {
    await prisma.crimeZoneCache.delete({ where: { key } }).catch(() => {});
    return null;
  }

  return entry.payload as T;
}

export async function writeCrimeCache(
  key: string,
  params: CacheParams,
  payload: unknown,
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);

  await prisma.crimeZoneCache.upsert({
    where: { key },
    update: {
      payload: payload as object,
      lat: params.lat,
      lng: params.lng,
      radius: params.radius,
      severity: params.severity ?? null,
      expiresAt,
    },
    create: {
      key,
      payload: payload as object,
      lat: params.lat,
      lng: params.lng,
      radius: params.radius,
      severity: params.severity ?? null,
      expiresAt,
    },
  });
}

