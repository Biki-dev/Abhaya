import { getApiBaseUrlCandidates } from './api';

export type CrimeSeverity = 'low' | 'medium' | 'high' | 'critical';

export type CrimeZoneFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'Polygon';
    coordinates: number[] | number[][][];
  };
  properties: {
    id: string;
    severity: CrimeSeverity;
    category: 'sos' | 'general' | 'theft' | 'assault' | 'harassment';
    count: number;
    radius: number;
    label: string;
    source: 'internal' | 'safecity' | 'ncrb';
    timestamp: number;
  };
};

export type CrimeFeatureCollection = {
  type: 'FeatureCollection';
  features: CrimeZoneFeature[];
};

export type CrimeZonesResponse = {
  type: 'FeatureCollection';
  features: CrimeZoneFeature[];
  meta?: {
    generatedAt: number;
    sourceBreakdown?: Record<string, number>;
    cached?: boolean;
  };
};

type FetchCrimeZonesParams = {
  lat: number;
  lng: number;
  radius?: number;
  severity?: CrimeSeverity;
};

export async function fetchCrimeZones(params: FetchCrimeZonesParams): Promise<CrimeZonesResponse> {
  const baseUrls = getApiBaseUrlCandidates();
  const query = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radius: String(params.radius ?? 2_000),
  });
  if (params.severity) {
    query.append('severity', params.severity);
  }

  let lastErr: unknown = null;

  for (const base of baseUrls) {
    try {
      const response = await fetch(`${base}/api/crime-zones?${query.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const reason = await response.text();
        throw new Error(reason || `crime-zones request failed (${response.status})`);
      }
      return (await response.json()) as CrimeZonesResponse;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr instanceof Error) {
    throw lastErr;
  }
  throw new Error('Unable to load crime zones');
}

