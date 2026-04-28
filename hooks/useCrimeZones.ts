import { useCallback, useEffect, useRef, useState } from 'react';
import { CrimeFeatureCollection, fetchCrimeZones } from '../services/crimeZones';

type LocationLike = { latitude: number; longitude: number };

type UseCrimeZonesOptions = {
  enabled: boolean;
  radius?: number;
  refreshIntervalMs?: number;
  movementThresholdMeters?: number;
};

type UseCrimeZonesState = {
  zones: CrimeFeatureCollection;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  cached: boolean;
};

const EMPTY_COLLECTION: CrimeFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

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

export function useCrimeZones(
  location: LocationLike | null,
  options: UseCrimeZonesOptions,
): UseCrimeZonesState & { reload: () => Promise<void> } {
  const [zones, setZones] = useState<CrimeFeatureCollection>(EMPTY_COLLECTION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [cached, setCached] = useState(false);

  const lastFetchLocationRef = useRef<LocationLike | null>(null);
  const isMountedRef = useRef(true);

  const radius = options.radius ?? 2_000;
  const refreshIntervalMs = options.refreshIntervalMs ?? 120_000;
  const movementThresholdMeters = options.movementThresholdMeters ?? 500;

  const reload = useCallback(async () => {
    if (!location || !options.enabled) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetchCrimeZones({
        lat: location.latitude,
        lng: location.longitude,
        radius,
      });
      if (!isMountedRef.current) {
        return;
      }
      setZones({
        type: 'FeatureCollection',
        features: response.features ?? [],
      });
      setLastUpdated(response.meta?.generatedAt ?? Date.now());
      setCached(Boolean(response.meta?.cached));
      lastFetchLocationRef.current = location;
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load crime zones');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [location, options.enabled, radius]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!location || !options.enabled) {
      return;
    }

    const previous = lastFetchLocationRef.current;
    if (!previous) {
      void reload();
      return;
    }

    const moved = haversineMeters(previous, location);
    if (moved >= movementThresholdMeters) {
      void reload();
    }
  }, [location, movementThresholdMeters, options.enabled, reload]);

  useEffect(() => {
    if (!location || !options.enabled) {
      return;
    }
    const timer = setInterval(() => {
      void reload();
    }, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [location, options.enabled, refreshIntervalMs, reload]);

  return { zones, loading, error, lastUpdated, cached, reload };
}

