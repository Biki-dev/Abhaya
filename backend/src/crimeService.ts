import { prisma } from './db.js';
import { buildCrimeCacheKey, readCrimeCache, writeCrimeCache } from './crimeCache.js';

export type CrimeSeverity = 'low' | 'medium' | 'high' | 'critical';
type CrimeCategory = 'sos' | 'general';
type CrimeSource = 'internal' | 'safecity' | 'ncrb';

type CrimeFeatureProperties = {
  id: string;
  severity: CrimeSeverity;
  category: CrimeCategory;
  count: number;
  radius: number;
  label: string;
  source: CrimeSource;
  timestamp: number;
};

export type CrimeFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: CrimeFeatureProperties;
};

export type CrimeFeatureCollection = {
  type: 'FeatureCollection';
  features: CrimeFeature[];
};

type CrimeZoneResponse = {
  type: 'FeatureCollection';
  features: CrimeFeature[];
  meta: {
    generatedAt: number;
    sourceBreakdown: Record<CrimeSource, number>;
    cached: boolean;
  };
};

type GetCrimeZoneParams = {
  lat: number;
  lng: number;
  radius: number;
  severity?: CrimeSeverity;
};

type SensorPoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const earthRadius = 6_371_000;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aa =
    sinLat * sinLat +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return earthRadius * c;
}

function severityFromCount(count: number): CrimeSeverity {
  if (count >= 8) return 'critical';
  if (count >= 5) return 'high';
  if (count >= 3) return 'medium';
  return 'low';
}

function metersToLongitudeDegrees(meters: number, atLat: number): number {
  const cosLat = Math.max(Math.cos(toRadians(atLat)), 0.1);
  return meters / (111_320 * cosLat);
}

function clampRadius(input: number): number {
  if (Number.isNaN(input)) return 2_000;
  return Math.min(10_000, Math.max(500, Math.round(input)));
}

async function getInternalSosPoints(lat: number, lng: number, radius: number): Promise<SensorPoint[]> {
  const latDelta = radius / 111_320;
  const lngDelta = metersToLongitudeDegrees(radius, lat);

  const events = await prisma.sensorEvent.findMany({
    where: {
      type: 'sos_triggered',
      lat: { not: null, gte: lat - latDelta, lte: lat + latDelta },
      lng: { not: null, gte: lng - lngDelta, lte: lng + lngDelta },
    },
    select: {
      lat: true,
      lng: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'desc' },
    take: 2000,
  });

  return events
    .filter((evt) => evt.lat !== null && evt.lng !== null)
    .map((evt) => ({
      lat: evt.lat as number,
      lng: evt.lng as number,
      timestamp: Number(evt.timestamp),
    }))
    .filter((evt) => haversineMeters(lat, lng, evt.lat, evt.lng) <= radius);
}

type GridAgg = {
  count: number;
  latSum: number;
  lngSum: number;
  latestTs: number;
};

function aggregateToGrid(points: SensorPoint[], centerLat: number): CrimeFeature[] {
  const gridSizeMeters = 500;
  const latStep = gridSizeMeters / 111_320;
  const lngStep = metersToLongitudeDegrees(gridSizeMeters, centerLat);
  const agg = new Map<string, GridAgg>();

  for (const point of points) {
    const latIdx = Math.floor(point.lat / latStep);
    const lngIdx = Math.floor(point.lng / lngStep);
    const key = `${latIdx}:${lngIdx}`;
    const prev = agg.get(key);
    if (prev) {
      prev.count += 1;
      prev.latSum += point.lat;
      prev.lngSum += point.lng;
      prev.latestTs = Math.max(prev.latestTs, point.timestamp);
    } else {
      agg.set(key, {
        count: 1,
        latSum: point.lat,
        lngSum: point.lng,
        latestTs: point.timestamp,
      });
    }
  }

  let idx = 0;
  const features: CrimeFeature[] = [];
  for (const cell of agg.values()) {
    const cellLat = cell.latSum / cell.count;
    const cellLng = cell.lngSum / cell.count;
    const severity = severityFromCount(cell.count);
    const meters = Math.min(900, 260 + cell.count * 55);
    idx += 1;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cellLng, cellLat] },
      properties: {
        id: `internal-${idx}`,
        severity,
        category: 'sos',
        count: cell.count,
        radius: meters,
        label: `${cell.count} SOS incident${cell.count > 1 ? 's' : ''}`,
        source: 'internal',
        timestamp: cell.latestTs,
      },
    });
  }

  return features;
}

export async function getCrimeZones(params: GetCrimeZoneParams): Promise<CrimeZoneResponse> {
  const normalized = {
    lat: Number(params.lat),
    lng: Number(params.lng),
    radius: clampRadius(params.radius),
    severity: params.severity,
  };

  const cacheKey = buildCrimeCacheKey(normalized);
  const cached = await readCrimeCache<CrimeZoneResponse>(cacheKey);
  if (cached) {
    return {
      ...cached,
      meta: {
        ...cached.meta,
        cached: true,
      },
    };
  }

  const internalPoints = await getInternalSosPoints(
    normalized.lat,
    normalized.lng,
    normalized.radius,
  );

  let features = aggregateToGrid(internalPoints, normalized.lat);
  if (normalized.severity) {
    features = features.filter((feature) => feature.properties.severity === normalized.severity);
  }

  const response: CrimeZoneResponse = {
    type: 'FeatureCollection',
    features,
    meta: {
      generatedAt: Date.now(),
      sourceBreakdown: {
        internal: features.length,
        safecity: 0,
        ncrb: 0,
      },
      cached: false,
    },
  };

  await writeCrimeCache(cacheKey, normalized, response);
  return response;
}

export function getEmptyCrimeFeatureCollection(): CrimeFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

