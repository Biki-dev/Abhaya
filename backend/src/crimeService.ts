
// ─────────────────────────────────────────────────────────────────────────────
// Merges two data sources:
//   1. Internal SOS events from SensorEvent table (real triggers in Abhaya)
//   2. SafeCity crowd-sourced incident reports (Indian harassment/crime data)
//
// Both are aggregated to a ~500 m grid, severity-classified, and returned
// as a GeoJSON FeatureCollection with metadata.
//
// If SafeCity is unreachable the internal-only result is returned — never
// throw so the app always gets a valid (possibly empty) response.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from './db.js';
import { buildCrimeCacheKey, readCrimeCache, writeCrimeCache } from './crimeCache.js';
import {
  fetchSafecityIncidents,
  safecitySeverity,
  type SafecityIncident,
} from './safecityClient.js';

// ── Public types ──────────────────────────────────────────────────────────────
export type CrimeSeverity = 'low' | 'medium' | 'high' | 'critical';
type CrimeCategory = 'sos' | 'harassment' | 'general';
type CrimeSource   = 'internal' | 'safecity' | 'ncrb';

type CrimeFeatureProperties = {
  id:        string;
  severity:  CrimeSeverity;
  category:  CrimeCategory;
  count:     number;
  radius:    number;
  label:     string;
  source:    CrimeSource;
  timestamp: number;
};

export type CrimeFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: CrimeFeatureProperties;
};

export type CrimeFeatureCollection = {
  type:     'FeatureCollection';
  features: CrimeFeature[];
};

type CrimeZoneResponse = {
  type:     'FeatureCollection';
  features: CrimeFeature[];
  meta: {
    generatedAt:     number;
    sourceBreakdown: Record<CrimeSource, number>;
    cached:          boolean;
  };
};

type GetCrimeZoneParams = {
  lat:      number;
  lng:      number;
  radius:   number;
  severity?: CrimeSeverity;
};

// ── Geo helpers ───────────────────────────────────────────────────────────────
function toRadians(v: number) { return (v * Math.PI) / 180; }

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R    = 6_371_000;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const sinL = Math.sin(dLat / 2);
  const sinG = Math.sin(dLng / 2);
  const aa   = sinL * sinL + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * sinG * sinG;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function metersToLngDeg(meters: number, atLat: number): number {
  const cosLat = Math.max(Math.cos(toRadians(atLat)), 0.1);
  return meters / (111_320 * cosLat);
}

function clampRadius(input: number): number {
  if (Number.isNaN(input)) return 2_000;
  return Math.min(10_000, Math.max(500, Math.round(input)));
}

// ── Severity helpers ──────────────────────────────────────────────────────────
function sosCountSeverity(count: number): CrimeSeverity {
  if (count >= 8) return 'critical';
  if (count >= 5) return 'high';
  if (count >= 3) return 'medium';
  return 'low';
}

const SEVERITY_RANK: Record<CrimeSeverity, number> = {
  low: 1, medium: 2, high: 3, critical: 4,
};

function higherSeverity(a: CrimeSeverity, b: CrimeSeverity): CrimeSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// ── Grid aggregation helpers ───────────────────────────────────────────────────
type GridCell = {
  count:    number;
  latSum:   number;
  lngSum:   number;
  latestTs: number;
  severity: CrimeSeverity;
  source:   CrimeSource;
  category: CrimeCategory;
};

function latStepDeg(gridSizeMeters: number)  { return gridSizeMeters / 111_320; }
function lngStepDeg(gridSizeMeters: number, atLat: number) {
  return metersToLngDeg(gridSizeMeters, atLat);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. INTERNAL SOS DATA
// ─────────────────────────────────────────────────────────────────────────────
type SensorPoint = { lat: number; lng: number; timestamp: number };

async function getInternalSosPoints(
  lat: number, lng: number, radius: number,
): Promise<SensorPoint[]> {
  const latDelta = radius / 111_320;
  const lngDelta = metersToLngDeg(radius, lat);

  const events = await prisma.sensorEvent.findMany({
    where: {
      type: 'sos_triggered',
      lat:  { not: null, gte: lat - latDelta, lte: lat + latDelta },
      lng:  { not: null, gte: lng - lngDelta, lte: lng + lngDelta },
    },
    select:  { lat: true, lng: true, timestamp: true },
    orderBy: { timestamp: 'desc' },
    take:    2000,
  });

  return events
    .filter((e) => e.lat !== null && e.lng !== null)
    .map((e) => ({ lat: e.lat as number, lng: e.lng as number, timestamp: Number(e.timestamp) }))
    .filter((e) => haversineMeters(lat, lng, e.lat, e.lng) <= radius);
}

function aggregateInternalToGrid(
  points: SensorPoint[],
  centerLat: number,
  gridSizeMeters = 500,
): CrimeFeature[] {
  const latStep = latStepDeg(gridSizeMeters);
  const lngStep = lngStepDeg(gridSizeMeters, centerLat);
  const agg     = new Map<string, GridCell>();

  for (const pt of points) {
    const key = `${Math.floor(pt.lat / latStep)}:${Math.floor(pt.lng / lngStep)}`;
    const prev = agg.get(key);
    if (prev) {
      prev.count   += 1;
      prev.latSum  += pt.lat;
      prev.lngSum  += pt.lng;
      prev.latestTs = Math.max(prev.latestTs, pt.timestamp);
    } else {
      agg.set(key, {
        count:    1,
        latSum:   pt.lat,
        lngSum:   pt.lng,
        latestTs: pt.timestamp,
        severity: 'low',
        source:   'internal',
        category: 'sos',
      });
    }
  }

  let idx = 0;
  const features: CrimeFeature[] = [];

  for (const cell of agg.values()) {
    const cellLat  = cell.latSum / cell.count;
    const cellLng  = cell.lngSum / cell.count;
    const severity = sosCountSeverity(cell.count);
    const radius   = Math.min(900, 260 + cell.count * 55);
    idx++;

    features.push({
      type:     'Feature',
      geometry: { type: 'Point', coordinates: [cellLng, cellLat] },
      properties: {
        id:        `internal-${idx}`,
        severity,
        category:  'sos',
        count:     cell.count,
        radius,
        label:     `${cell.count} SOS incident${cell.count > 1 ? 's' : ''}`,
        source:    'internal',
        timestamp: cell.latestTs,
      },
    });
  }

  return features;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SAFECITY DATA  →  grid aggregation
// ─────────────────────────────────────────────────────────────────────────────
function aggregateSafecityToGrid(
  incidents: SafecityIncident[],
  centerLat:      number,
  gridSizeMeters: number = 500,
): CrimeFeature[] {
  const latStep = latStepDeg(gridSizeMeters);
  const lngStep = lngStepDeg(gridSizeMeters, centerLat);
  const agg     = new Map<string, GridCell & { categories: string[] }>();

  for (const inc of incidents) {
    const key = `sc:${Math.floor(inc.latitude / latStep)}:${Math.floor(inc.longitude / lngStep)}`;
    const sev = safecitySeverity(inc.category);
    const ts  = new Date(inc.date).getTime() || Date.now();

    const prev = agg.get(key);
    if (prev) {
      prev.count   += 1;
      prev.latSum  += inc.latitude;
      prev.lngSum  += inc.longitude;
      prev.latestTs = Math.max(prev.latestTs, ts);
      prev.severity = higherSeverity(prev.severity, sev);
      if (!prev.categories.includes(inc.category)) prev.categories.push(inc.category);
    } else {
      agg.set(key, {
        count:      1,
        latSum:     inc.latitude,
        lngSum:     inc.longitude,
        latestTs:   ts,
        severity:   sev,
        source:     'safecity',
        category:   'harassment',
        categories: [inc.category],
      });
    }
  }

  let idx = 0;
  const features: CrimeFeature[] = [];

  for (const cell of agg.values()) {
    const cellLat = cell.latSum / cell.count;
    const cellLng = cell.lngSum / cell.count;
    const radius  = Math.min(700, 200 + cell.count * 45);
    idx++;

    // Human-readable label
    const topCat = (cell as typeof cell & { categories: string[] }).categories[0] ?? 'Incident';
    const label  = cell.count > 1
      ? `${cell.count} reported incidents (incl. ${topCat})`
      : topCat;

    features.push({
      type:     'Feature',
      geometry: { type: 'Point', coordinates: [cellLng, cellLat] },
      properties: {
        id:        `safecity-${idx}`,
        severity:  cell.severity,
        category:  'harassment',
        count:     cell.count,
        radius,
        label,
        source:    'safecity',
        timestamp: cell.latestTs,
      },
    });
  }

  return features;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MERGE + DEDUPLICATE  (collapse internal + safecity cells that are <200 m apart)
// ─────────────────────────────────────────────────────────────────────────────
function mergeFeatures(
  internal: CrimeFeature[],
  safecity: CrimeFeature[],
): CrimeFeature[] {
  const all = [...internal, ...safecity];
  if (internal.length === 0 || safecity.length === 0) return all;

  const merged:  CrimeFeature[] = [...internal];
  const absorbed = new Set<number>();

  safecity.forEach((sf, si) => {
    const [sfLng, sfLat] = sf.geometry.coordinates;
    let tooClose = false;

    for (const mf of merged) {
      const [mLng, mLat] = mf.geometry.coordinates;
      if (haversineMeters(sfLat, sfLng, mLat, mLng) < 200) {
        // Upgrade severity on the internal cell if SafeCity is worse
        const newSev = higherSeverity(
          mf.properties.severity,
          sf.properties.severity,
        );
        mf.properties.severity = newSev;
        mf.properties.count   += sf.properties.count;
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      absorbed.add(si);
    }
  });

  // Add SafeCity cells that weren't absorbed
  safecity.forEach((sf, si) => {
    if (absorbed.has(si)) merged.push(sf);
  });

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export async function getCrimeZones(params: GetCrimeZoneParams): Promise<CrimeZoneResponse> {
  const normalized = {
    lat:      Number(params.lat),
    lng:      Number(params.lng),
    radius:   clampRadius(params.radius),
    severity: params.severity,
  };

  // ── Cache hit? ──────────────────────────────────────────────────────────
  const cacheKey = buildCrimeCacheKey(normalized);
  const cached   = await readCrimeCache<CrimeZoneResponse>(cacheKey);
  if (cached) {
    console.log(`[crimeService] Cache hit for key: ${cacheKey} (${cached.features.length} features)`);
    return { ...cached, meta: { ...cached.meta, cached: true } };
  }

  // ── Fetch both sources in parallel ─────────────────────────────────────
  const [internalPoints, safecityIncidents] = await Promise.all([
    getInternalSosPoints(normalized.lat, normalized.lng, normalized.radius)
      .catch((err) => {
        console.warn('[crimeService] Internal SOS fetch failed:', err);
        return [] as SensorPoint[];
      }),
    fetchSafecityIncidents(normalized.lat, normalized.lng, normalized.radius)
      .catch((err) => {
        console.warn('[crimeService] SafeCity fetch failed:', err);
        return [] as SafecityIncident[];
      }),
  ]);

  console.log(
    `[crimeService] Fetched — internal SOS: ${internalPoints.length} pts, ` +
    `SafeCity: ${safecityIncidents.length} incidents`,
  );

  // ── Aggregate each source to grid ──────────────────────────────────────
  const internalFeatures  = aggregateInternalToGrid(internalPoints,  normalized.lat);
  const safecityFeatures  = aggregateSafecityToGrid(safecityIncidents, normalized.lat);

  // ── Merge + optional severity filter ───────────────────────────────────
  let features = mergeFeatures(internalFeatures, safecityFeatures);

  if (normalized.severity) {
    features = features.filter((f) => f.properties.severity === normalized.severity);
  }

  console.log(
    `[crimeService] Result — ${features.length} total zones ` +
    `(${internalFeatures.length} internal, ${safecityFeatures.length} safecity before merge)`,
  );

  const response: CrimeZoneResponse = {
    type:     'FeatureCollection',
    features,
    meta: {
      generatedAt: Date.now(),
      sourceBreakdown: {
        internal: internalFeatures.length,
        safecity: safecityFeatures.length,
        ncrb:     0,
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