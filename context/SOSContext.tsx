// Global SOS context — lives at the app root so keyword detection, the
// countdown timer, and background notifications work regardless of which
// screen is active or whether the app is in the background.
//
// Previously all of this lived inside HomeMapScreen, which meant:
//   • Navigating to Settings/CheckIn → hooks unmount → countdown freezes
//   • Background state → same problem
//
// FIX: Move EdgeImpulseWebView + useSOSWithBackground here, at App level.
//      Any screen that needs to trigger/cancel SOS just calls useSOSContext().
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EdgeImpulseWebView,
  EIWebViewHandle,
  useEdgeImpulseKeywordDetection,
  EIKeywordDetectionState,
} from '../hooks/useEdgeImpulseKeywordDetection';
import { useSOSWithBackground, SOSCountdownState } from '../hooks/useSOSWithBackground';
import { logSensorEvent } from '../services/sensorDb';
import type { PoliceSMSResult } from '../services/policeSOS';
import { useBLEMesh } from '../hooks/useBLEMesh';

// ── Context shape ─────────────────────────────────────────────────────────────
type SOSContextType = {
  /** Current countdown state (visible, countdown, reason) */
  sosState: SOSCountdownState;
  /** Manually trigger SOS countdown from any screen */
  triggerSOS: (reason: string) => void;
  /** Cancel the running countdown */
  cancelSOS: () => void;
  /** Latest police SMS result (for UI banners) */
  policeResult: PoliceSMSResult | null;
  /** True while the SMS is in-flight */
  policeLoading: boolean;
  /** Whether to show the result banner */
  showPoliceBanner: boolean;
  setShowPoliceBanner: (v: boolean) => void;
  /** Keyword detection state (for status pills on HomeMap) */
  keywordState: EIKeywordDetectionState;
};

const SOSContext = createContext<SOSContextType | null>(null);

export function useSOSContext(): SOSContextType {
  const ctx = useContext(SOSContext);
  if (!ctx) throw new Error('useSOSContext must be used inside <SOSProvider>');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function SOSProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId]     = useState<string | null>(null);
  const [userName, setUserName] = useState('Unknown');

  const [policeLoading, setPoliceLoading]       = useState(false);
  const [policeResult, setPoliceResult]         = useState<PoliceSMSResult | null>(null);
  const [showPoliceBanner, setShowPoliceBanner] = useState(false);

  // ★ Always-fresh location ref — updated by whoever has GPS (HomeMap / sensors)
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  
  const { state: meshState, sendSOSViaMesh, stopBroadcast } = useBLEMesh(true);


  // WebView ref for Edge Impulse audio bridge
  const eiWebViewRef = useRef<EIWebViewHandle>(null);

  // Load user identity on mount
  useEffect(() => {
    AsyncStorage.getItem('AbhayaUserData').then((raw) => {
      if (raw) {
        const d = JSON.parse(raw) as any;
        setUserId(d.phone ?? null);
        setUserName(d.name ?? 'Unknown');
      }
    });
  }, []);

  // ── SOS countdown (global — never unmounts) ───────────────────────────────
  const { sosState, triggerSOS, cancelSOS } = useSOSWithBackground({
    userId,
    userName,
    locationRef,
    onResult:    (result) => setPoliceResult(result),
    onLoading:   (v)      => setPoliceLoading(v),
    onShowBanner: ()      => setShowPoliceBanner(true),
  });

  // ── Keyword detection callback ────────────────────────────────────────────
  const onKeywordDetected = useCallback(
    (confidence: number, label: string) => {
      if (userId) {
        logSensorEvent(
          userId,
          'keyword_detected',
          { keyword: label, confidence, model: 'edge_impulse' },
          locationRef.current?.latitude  ?? null,
          locationRef.current?.longitude ?? null,
        ).catch(() => {});
      }
      triggerSOS(
        `🎤 Keyword detected: "${label}" (${(confidence * 100).toFixed(0)}% confidence)`,
      );
    },
    [userId, triggerSOS],
  );

  // ── Edge Impulse keyword detection hook ──────────────────────────────────
  const { state: keywordState, handleModelReady, handleResult } =
    useEdgeImpulseKeywordDetection(true, onKeywordDetected, eiWebViewRef);

  // ── Expose locationRef updater so screens can push fresh GPS ─────────────
  // Screens call: sosContext.updateLocation(lat, lng)  (see below)
  const updateLocation = useCallback(
    (lat: number, lng: number) => {
      locationRef.current = { latitude: lat, longitude: lng };
    },
    [],
  );

  return (
    <SOSContext.Provider
      value={{
        sosState,
        triggerSOS,
        cancelSOS,
        policeResult,
        policeLoading,
        showPoliceBanner,
        setShowPoliceBanner,
        keywordState,
        // Extra helpers that screens can use:
        // @ts-ignore — we extend the type below
        updateLocation,
        // @ts-ignore
        eiWebViewRef,
      }}
    >
      {/* Hidden Edge Impulse WebView — always mounted at app root */}
      <EdgeImpulseWebView
        ref={eiWebViewRef}
        modelFile="edge-impulse-standalone-all.js"
        onReady={handleModelReady}
        onResult={handleResult}
        onError={(msg) => console.warn('[EI Classifier]', msg)}
      />
      {children}
    </SOSContext.Provider>
  );
}

// Extended type with helpers (avoids breaking existing consumers)
export type SOSContextExtended = SOSContextType & {
  updateLocation: (lat: number, lng: number) => void;
  eiWebViewRef: React.RefObject<EIWebViewHandle | null>;
};

export function useSOSContextFull(): SOSContextExtended {
  return useSOSContext() as SOSContextExtended;
}