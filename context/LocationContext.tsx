import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firePendingBackgroundSOSIfDue } from '../services/backgroundSOS';

export interface Loc {
  latitude: number;
  longitude: number;
}

interface LocationContextType {
  userLocation: Loc | null;
  locationGranted: boolean;
}

const LOCATION_TASK_NAME = 'ABHAYA_BACKGROUND_LOCATION';
const LAST_LOCATION_KEY = 'AbhayaLastLocation';

function toLoc(location: Location.LocationObject): Loc {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

// This callback is executed by Expo TaskManager in the background task context.
// Keep it independent from React state: providers and screens may be unmounted
// while Android continues delivering location updates.
if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.warn('[Location] Background task error:', error.message);
      return;
    }

    const locations = (data as { locations?: Location.LocationObject[] } | null)?.locations;
    const latest = locations?.[locations.length - 1];
    if (!latest) return;

    try {
      const next = toLoc(latest);
      await AsyncStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(next));
      await firePendingBackgroundSOSIfDue(next.latitude, next.longitude);
    } catch (storageError) {
      console.warn('[Location] Could not persist background location:', storageError);
    }
  });
}

const LocationContext = createContext<LocationContextType>({
  userLocation: null,
  locationGranted: false,
});

export const useLocation = () => useContext(LocationContext);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userLocation, setUserLocation] = useState<Loc | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [permissionVersion, setPermissionVersion] = useState(0);
  const initialSet = useRef(false);

  useEffect(() => {
    let active = true;
    let subscription: Location.LocationSubscription | null = null;

    const publish = (location: Location.LocationObject) => {
      if (!active) return;
      const next = toLoc(location);
      setUserLocation(next);
      initialSet.current = true;
    };

    (async () => {
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      const foregroundGranted = foregroundStatus === 'granted';

      if (!foregroundGranted) {
        if (active) setLocationGranted(false);
        const retry = setTimeout(() => setPermissionVersion((version) => version + 1), 1000);
        return () => clearTimeout(retry);
      }
      if (active) setLocationGranted(true);

      const cached = await AsyncStorage.getItem(LAST_LOCATION_KEY).catch(() => null);
      if (cached && active) {
        try {
          setUserLocation(JSON.parse(cached) as Loc);
          initialSet.current = true;
        } catch (_) {
          // Ignore malformed legacy cache.
        }
      }

      const last = await Location.getLastKnownPositionAsync({}).catch(() => null);
      if (last) publish(last);

      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(publish)
        .catch(() => {});

      // Background permission must be requested after foreground permission.
      // The task is the resilient location path; the watcher is only the
      // low-latency foreground path used to update the UI.
      if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
        const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
        const backgroundGranted = backgroundStatus === 'granted';

        if (backgroundGranted) {
          const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (!running) {
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 30_000,
              distanceInterval: 25,
              pausesUpdatesAutomatically: false,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: 'Abhaya safety tracking is active',
                notificationBody: 'Your location is being monitored for emergency protection.',
                notificationColor: '#E11D48',
              },
            });
          }
        }
      }

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 10 },
        publish,
      );

      if (!active) subscription.remove();
    })();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [permissionVersion]);

  return (
    <LocationContext.Provider value={{ userLocation, locationGranted }}>
      {children}
    </LocationContext.Provider>
  );
};
