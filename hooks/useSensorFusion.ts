import { useEffect, useRef, useState, useCallback } from 'react';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import { GlobalMicState } from './useEdgeImpulseKeywordDetection';


// ─── Thresholds (tune these for real-world testing) ──────────────────────────
const FALL_G_LOW       = 0.3;   // g — below this = free-fall phase
const FALL_G_HIGH      = 2.5;   // g — above this right after free-fall = impact
const SHAKE_G_DELTA    = 1.8;   // g — spike in magnitude between samples
const SHAKE_MIN_COUNT  = 3;     // spikes needed within window to call it a shake
const SHAKE_WINDOW_MS  = 1500;
const STATIONARY_G     = 0.08;  // delta-mag threshold for "not moving"
const MIC_PEAK_THRESH  = 0.72;  // 0-1 normalised audio level
const SENSOR_HZ_MS     = 100;   // 10 Hz (100 ms)
const GPS_INTERVAL_MS  = 5000;
const GPS_DISTANCE_M   = 10;
const IMPACT_CLEAR_MS  = 2500;  // how long impactDetected stays true

// ─── Types ────────────────────────────────────────────────────────────────────
export type Vec3 = { x: number; y: number; z: number };

export type GPSData = {
  latitude:  number;
  longitude: number;
  speed:     number | null;
  accuracy:  number | null;
  heading:   number | null;
  altitude:  number | null;
};

export type MicData = {
  isListening:  boolean;
  level:        number;   // 0-1 normalised RMS
  peakDetected: boolean;
};

export type MotionData = {
  isFalling:      boolean;
  impactDetected: boolean;
  isShaking:      boolean;
  isStationary:   boolean;
  shakeCount:     number;
};

export type SensorData = {
  accelerometer: Vec3 & { magnitude: number };
  gyroscope:     Vec3;
  gps:           GPSData | null;
  mic:           MicData;
  motion:        MotionData;
  timestamp:     number;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSensorFusion(active: boolean = true) {
  const [data, setData] = useState<SensorData>({
    accelerometer: { x: 0, y: 0, z: 1, magnitude: 1 },
    gyroscope:     { x: 0, y: 0, z: 0 },
    gps:           null,
    mic:           { isListening: false, level: 0, peakDetected: false },
    motion:        { isFalling: false, impactDetected: false, isShaking: false, isStationary: true, shakeCount: 0 },
    timestamp:     Date.now(),
  });

  const prevMag       = useRef(1);
  const shakeTimes    = useRef<number[]>([]);
  const fallPhase     = useRef<'none' | 'freefall'>('none');
  const impactTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationSub   = useRef<Location.LocationSubscription | null>(null);
  const accelSub      = useRef<{ remove(): void } | null>(null);
  const gyroSub       = useRef<{ remove(): void } | null>(null);
  const meterInterval = useRef<NodeJS.Timeout | null>(null);

  const mag = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

  // ── accelerometer ─────────────────────────────────────────────────────────
  const startAccel = useCallback(() => {
    Accelerometer.setUpdateInterval(SENSOR_HZ_MS);
    accelSub.current = Accelerometer.addListener(raw => {
      // expo-sensors accelerometer values are already in g units.
      const g: Vec3 = { x: raw.x, y: raw.y, z: raw.z };
      const m       = mag(g);
      const prev    = prevMag.current;
      const delta   = Math.abs(m - prev);
      prevMag.current = m;
      const now = Date.now();

      // fall detection
      let isFalling      = false;
      let impactDetected = false;
      if (m < FALL_G_LOW) {
        fallPhase.current = 'freefall';
      } else if (fallPhase.current === 'freefall' && m > FALL_G_HIGH) {
        isFalling      = true;
        impactDetected = true;
        fallPhase.current = 'none';
        if (impactTimer.current) clearTimeout(impactTimer.current);
        impactTimer.current = setTimeout(() => {
          setData(d => ({ ...d, motion: { ...d.motion, impactDetected: false, isFalling: false } }));
        }, IMPACT_CLEAR_MS);
      } else if (m > 0.5) {
        fallPhase.current = 'none';
      }

      // shake detection
      if (delta > SHAKE_G_DELTA) shakeTimes.current.push(now);
      shakeTimes.current = shakeTimes.current.filter(t => now - t < SHAKE_WINDOW_MS);
      const isShaking    = shakeTimes.current.length >= SHAKE_MIN_COUNT;
      const isStationary = delta < STATIONARY_G;

      setData(d => ({
        ...d,
        accelerometer: { ...g, magnitude: m },
        motion: {
          isFalling:      isFalling      || d.motion.isFalling,
          impactDetected: impactDetected || d.motion.impactDetected,
          isShaking,
          isStationary,
          shakeCount: shakeTimes.current.length,
        },
        timestamp: now,
      }));
    });
  }, []);

  // ── gyroscope ─────────────────────────────────────────────────────────────
  const startGyro = useCallback(() => {
    Gyroscope.setUpdateInterval(SENSOR_HZ_MS);
    gyroSub.current = Gyroscope.addListener(raw => {
      setData(d => ({ ...d, gyroscope: raw }));
    });
  }, []);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const startGPS = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: GPS_INTERVAL_MS, distanceInterval: GPS_DISTANCE_M },
      loc => setData(d => ({
        ...d,
        gps: {
          latitude:  loc.coords.latitude,
          longitude: loc.coords.longitude,
          speed:     loc.coords.speed,
          accuracy:  loc.coords.accuracy,
          heading:   loc.coords.heading,
          altitude:  loc.coords.altitude,
        },
      }))
    );
  }, []);

  // ── microphone metering logic (Reading from Shared State) ────────────────
  const updateMetering = useCallback(() => {
    // We now read the RMS level directly from the TFLite chunker
    // because Android does not allow two simultaneous Audio.Recording streams.
    const rawLevel = GlobalMicState.level;
    // Map RMS (0 to 1) to a visually pleasing 0 to 1 scale for the UI
    // Usually RMS speech peaks around 0.1 to 0.4. We multiply by 3 to make it visible.
    const visualLevel = Math.min(1, rawLevel * 3);
    
    setData(d => ({
      ...d,
      mic: {
        isListening: GlobalMicState.isListening,
        level: visualLevel,
        peakDetected: visualLevel > MIC_PEAK_THRESH,
      },
    }));
  }, []);

  const startMic = useCallback(() => {
    if (meterInterval.current) clearInterval(meterInterval.current);
    meterInterval.current = setInterval(updateMetering, 200);
    setData(d => ({ ...d, mic: { ...d.mic, isListening: true } }));
  }, [updateMetering]);

  const stopMic = useCallback(() => {
    if (meterInterval.current) clearInterval(meterInterval.current);
    setData(d => ({ ...d, mic: { isListening: false, level: 0, peakDetected: false } }));
  }, []);

  // ── lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    startAccel();
    startGyro();
    startGPS();
    startMic();
    return () => {
      accelSub.current?.remove();
      gyroSub.current?.remove();
      locationSub.current?.remove();
      stopMic();
      if (impactTimer.current) clearTimeout(impactTimer.current);
    };
  }, [active]);

  return data;
}