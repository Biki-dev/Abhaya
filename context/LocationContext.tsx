import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export interface Loc {
  latitude: number;
  longitude: number;
}

interface LocationContextType {
  userLocation: Loc | null;
  locationGranted: boolean;
}

const LocationContext = createContext<LocationContextType>({
  userLocation: null,
  locationGranted: false,
});

export const useLocation = () => useContext(LocationContext);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userLocation, setUserLocation] = useState<Loc | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const initialSet = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { status: ex } = await Location.getForegroundPermissionsAsync();
      let granted = ex === 'granted';
      if (!granted) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
      }
      if (!granted) { setLocationGranted(false); return; }
      setLocationGranted(true);

      // 1. Try last known position for instant result
      const last = await Location.getLastKnownPositionAsync({}).catch(() => null);
      if (last && active) {
        const c = { latitude: last.coords.latitude, longitude: last.coords.longitude };
        setUserLocation(c);
        initialSet.current = true;
      }

      // 2. Get fresh GPS fix for accuracy
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(loc => {
        if (!active) return;
        const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(c);
        initialSet.current = true;
      }).catch(() => {});

      // 3. Start watcher for continuous updates
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        u => {
          if (!active) return;
          const uc = { latitude: u.coords.latitude, longitude: u.coords.longitude };
          setUserLocation(uc);
        },
      );
    })();
    return () => { active = false; };
  }, []);

  return (
    <LocationContext.Provider value={{ userLocation, locationGranted }}>
      {children}
    </LocationContext.Provider>
  );
};
