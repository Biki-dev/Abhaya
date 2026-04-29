import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  Modal, Vibration, ActivityIndicator, Share,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocation } from '../context/LocationContext';
import { colors, spacing, typography, borderRadius } from '../theme';
import { useSensorFusion } from '../hooks/useSensorFusion';
import { useBLEMesh } from '../hooks/useBLEMesh';
import { useHeartbeat } from '../hooks/useHeartbeat';
import { useCrimeZones } from '../hooks/useCrimeZones';
import { useSafetyTracking } from '../hooks/useSafetyTracking';
import { useSOSWithBackground } from '../hooks/useSOSWithBackground';
import {
  EdgeImpulseWebView,
  EIWebViewHandle,
  useEdgeImpulseKeywordDetection,
} from '../hooks/useEdgeImpulseKeywordDetection';
import { logSensorEvent } from '../services/sensorDb';
import type { PoliceSMSResult } from '../services/policeSOS';
import PoliceAlertBanner from '../components/PoliceAlertBanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildLeafletHTML } from '../utils/buildLeafletHTML';

const DEFAULT_HTML = buildLeafletHTML(26.1445, 91.7362, { showPulse: true, zoom: 16 });


export default function HomeMapScreen({ navigation }: any) {
  const { userLocation, locationGranted } = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Unknown');
  // locationGranted is now provided by useLocation context
  const [mapHTML, setMapHTML] = useState(DEFAULT_HTML);
  const initialMapSet = useRef(false);
  const [crimeVisible, setCrimeVisible] = useState(true);
  const [selectedCrimeLabel, setSelectedCrimeLabel] = useState<string | null>(null);

  // ★ KEY FIX: userLocationRef always holds fresh GPS — passed to SOS hook
  //   so the setInterval closure in useSOSWithBackground never sees stale null.
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const [policeLoading, setPoliceLoading] = useState(false);
  const [policeResult, setPoliceResult] = useState<PoliceSMSResult | null>(null);
  const [showPoliceBanner, setShowPoliceBanner] = useState(false);

  // Removed unused locationWatcherRef
  const mapWebViewRef = useRef<WebView>(null);
  const eiWebViewRef = useRef<EIWebViewHandle>(null);
  const prevMotion = useRef({ isFalling: false, impactDetected: false, isShaking: false, shakeCount: 0 });
  const pPeak = useRef(false);

  const sensors = useSensorFusion(true);
  useBLEMesh(false);

  const crime = useCrimeZones(userLocation, {
    enabled: crimeVisible,
    radius: 2_500,
    refreshIntervalMs: 180_000,
    movementThresholdMeters: 500,
  });

  const { session, triggerManualSOS } = useSafetyTracking(userLocation, crime.zones);

  // ── SOS with background support ───────────────────────────────────────────
  const { sosState, triggerSOS, cancelSOS } = useSOSWithBackground({
    userId,
    userName,
    locationRef: userLocationRef,           // ← ref, not state
    onResult: (result) => setPoliceResult(result),
    onLoading: (v) => setPoliceLoading(v),
    onShowBanner: () => setShowPoliceBanner(true),
  });

  // ── Keyword detection ─────────────────────────────────────────────────────
  const onKeywordDetected = useCallback((confidence: number, label: string) => {
    if (userId) {
      logSensorEvent(userId, 'keyword_detected',
        { keyword: label, confidence, model: 'edge_impulse' },
        userLocationRef.current?.latitude ?? null,
        userLocationRef.current?.longitude ?? null).catch(() => { });
    }
    triggerManualSOS(`keyword detected (${label})`);
    triggerSOS(`🎤 Keyword detected: "${label}" (${(confidence * 100).toFixed(0)}% confidence)`);
  }, [userId, triggerManualSOS, triggerSOS]);

  const { state: keywordState, handleModelReady, handleResult } =
    useEdgeImpulseKeywordDetection(true, onKeywordDetected, eiWebViewRef);

  useHeartbeat(userId, userLocation?.latitude ?? null, userLocation?.longitude ?? null, !!userId);

  // Load user data
  useEffect(() => {
    AsyncStorage.getItem('AbhayaUserData').then(raw => {
      if (raw) {
        const data = JSON.parse(raw) as any;
        setUserId(data.phone ?? null);
        setUserName(data.name ?? 'Unknown');
      }
    });
  }, []);

  const postToMap = useCallback((msg: object) => {
    mapWebViewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    postToMap({ type: 'toggle-crime-zones', visible: crimeVisible });
    if (crimeVisible) {
      postToMap({ type: 'crime-zones', featureCollection: crime.zones });
    }
  }, [crime.zones, crimeVisible, postToMap]);


  // Sync mapHTML with userLocation from context
  useEffect(() => {
    if (userLocation && !initialMapSet.current) {
      setMapHTML(buildLeafletHTML(userLocation.latitude, userLocation.longitude, { showPulse: true, zoom: 16 }));
      initialMapSet.current = true;
    } else if (userLocation && initialMapSet.current) {
      postToMap({ type: 'center', lat: userLocation.latitude, lng: userLocation.longitude });
      postToMap({ type: 'loc', lat: userLocation.latitude, lng: userLocation.longitude });
    }
  }, [userLocation, postToMap]);

  // Sensor watch — triggers SOS for fall / shake
  useEffect(() => {
    const m = sensors.motion, p = prevMotion.current;
    if (!p.impactDetected && m.impactDetected) {
      Vibration.vibrate([0, 200, 100, 200]);
      if (userId) logSensorEvent(userId, 'fall_detected',
        { magnitude: sensors.accelerometer.magnitude },
        userLocationRef.current?.latitude ?? null,
        userLocationRef.current?.longitude ?? null).catch(() => { });
      triggerSOS('📱 Fall detected — impact registered');
    }
    if (!p.isShaking && m.isShaking) {
      Vibration.vibrate(400);
      if (userId) logSensorEvent(userId, 'shake_detected', { count: m.shakeCount },
        userLocationRef.current?.latitude ?? null,
        userLocationRef.current?.longitude ?? null).catch(() => { });
      triggerSOS('📳 Rapid shaking detected');
    }
    if (!pPeak.current && sensors.mic.peakDetected && userId) {
      logSensorEvent(userId, 'audio_peak', { level: sensors.mic.level },
        userLocationRef.current?.latitude ?? null,
        userLocationRef.current?.longitude ?? null).catch(() => { });
    }
    pPeak.current = sensors.mic.peakDetected;
    prevMotion.current = m;
  }, [sensors.motion.impactDetected, sensors.motion.isShaking, sensors.mic.peakDetected]);

  const sensorStatus = sensors.motion.isFalling
    ? { text: 'FALL DETECTED', color: colors.danger }
    : sensors.motion.isShaking
      ? { text: 'Shaking', color: colors.warning }
      : keywordState.status === 'detected'
        ? { text: 'Keyword Detected!', color: colors.danger }
        : sensors.mic.peakDetected
          ? { text: 'Audio Peak', color: '#A855F7' }
          : { text: 'Tracking Active', color: colors.safe };

  const kwStatus = keywordState.modelLoaded
    ? `🎤 Listening${keywordState.projectInfo ? ` · ${keywordState.projectInfo.project}` : ' (EI)'}`
    : '🎤 Loading model...';

  return (
    <View style={s.container}>
      {/* Hidden Edge Impulse WebView */}
      <EdgeImpulseWebView
        ref={eiWebViewRef}
        modelFile="edge-impulse-standalone-all.js"
        onReady={handleModelReady}
        onResult={handleResult}
        onError={(msg) => console.warn('[EI Classifier]', msg)}
      />

      {/* Leaflet map */}
      <WebView
        ref={mapWebViewRef}
        style={s.map}
        source={{ html: mapHTML }}
        onMessage={(event) => {
          try {
            const parsed = JSON.parse(event.nativeEvent.data);
            if (parsed?.type === 'crime-zone-pressed') {
              setSelectedCrimeLabel(parsed?.zone?.label ?? 'Crime zone selected');
            }
          } catch { }
        }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        scrollEnabled={false}
        bounces={false}
      />

      {!locationGranted && !userLocation && (
        <View style={[StyleSheet.absoluteFill, s.overlay]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.overlayText}>Getting location…</Text>
        </View>
      )}

      {/* Status pill */}
      <View style={s.topBar}>
        <TouchableOpacity
          style={[s.statusPill, { borderColor: sensorStatus.color + '50' }]}
          onPress={() => navigation.navigate('SensorDashboard')}
        >
          <Ionicons name="shield-checkmark" size={16} color={sensorStatus.color} />
          <Text style={[s.statusText, { color: sensorStatus.color }]}>{sensorStatus.text}</Text>
          <Ionicons name="chevron-forward" size={12} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Keyword pill */}
      <View style={s.kwBar}>
        <View style={s.kwPill}>
          <Text style={s.kwText}>{kwStatus}</Text>
          {keywordState.lastConfidence > 0.2 && (
            <Text style={[s.kwText, { color: colors.warning, marginLeft: 5 }]}>
              {(keywordState.lastConfidence * 100).toFixed(0)}%
            </Text>
          )}
        </View>
      </View>

      {/* Safety session pill */}
      {session && (
        <View style={s.safetyBar}>
          <TouchableOpacity
            style={s.safetyPill}
            onPress={async () => {
              const base = 'https://rakhshitahtml.netlify.app';
              const url = `${base}/?s=${session.id}`;
              await Share.share({
                message: `I'm in a crime zone. Follow my live location here: ${url}`,
                url,
              });
            }}
          >
            <View style={s.liveDot} />
            <Text style={s.safetyText}>Live Sharing Active · Tap to Share</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Right-side quick buttons */}
      <View style={s.quickActions}>
        <TouchableOpacity style={s.quickBtn} onPress={() => navigation.navigate('SensorDashboard')}>
          <MaterialCommunityIcons name="monitor-dashboard" size={20} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => {
          if (userLocationRef.current) {
            postToMap({ type: 'center', lat: userLocationRef.current.latitude, lng: userLocationRef.current.longitude });
          }
        }}>
          <Ionicons name="locate" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.quickBtn, crimeVisible && { borderColor: '#F59E0B' }]}
          onPress={() => { setCrimeVisible(v => !v); setSelectedCrimeLabel(null); }}
        >
          <MaterialCommunityIcons name="map-marker-radius" size={20} color={crimeVisible ? '#F59E0B' : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Police alert banner */}
      {showPoliceBanner && (
        <View style={s.banner}>
          <PoliceAlertBanner result={policeResult} loading={policeLoading} onDismiss={() => setShowPoliceBanner(false)} />
        </View>
      )}

      {/* Bottom action sheet */}
      <View style={s.sheet}>
        <View style={s.sheetRow}>
          <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.navigate('RouteCheckIn')}>
            <MaterialCommunityIcons name="map-marker-path" size={20} color="#fff" />
            <Text style={s.primaryBtnText}>Check-In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.sosBtn} onPress={() => triggerSOS('🔴 Manual SOS button pressed')}>
            <MaterialCommunityIcons name="alarm-light" size={20} color="#fff" />
            <Text style={s.sosBtnText}>SOS</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.hint}>
          {sensors.motion.isStationary ? '● Stationary' : `● Moving  ${sensors.gps?.speed ? (sensors.gps.speed * 3.6).toFixed(1) + ' km/h' : ''}`}
          {'   Shakes: ' + sensors.motion.shakeCount}
          {'   Acc: ' + sensors.accelerometer.magnitude.toFixed(2) + 'g'}
        </Text>
        {crimeVisible && (
          <>
            <View style={s.legendRow}>
              <Text style={s.legendTitle}>Crime zones</Text>
              <View style={s.legendPills}>
                {['#EF4444', '#F97316', '#F59E0B', '#84CC16'].map(c => (
                  <View key={c} style={[s.legendDot, { backgroundColor: c }]} />
                ))}
              </View>
            </View>
            <Text style={s.hintSmall}>
              {crime.loading ? 'Loading crime zones…'
                : crime.error ? 'Crime data unavailable'
                  : `Zones: ${crime.zones.features.length}${crime.lastUpdated ? ` · ${new Date(crime.lastUpdated).toLocaleTimeString()}` : ''}${crime.cached ? ' · cache' : ''}`}
            </Text>
            {selectedCrimeLabel && <Text style={s.hintSmall}>{selectedCrimeLabel}</Text>}
            <Text style={s.disclaimer}>Crime data is approximate and for awareness only.</Text>
          </>
        )}
      </View>

      {/* ── Auto-SOS countdown modal (foreground) ── */}
      <Modal transparent visible={sosState.visible} animationType="fade">
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <MaterialCommunityIcons name="alarm-light" size={36} color={colors.danger} />
            <Text style={s.modalTitle}>SOS Alert in {sosState.countdown}s</Text>
            <Text style={s.modalReason}>{sosState.reason}</Text>
            <Text style={s.modalSub}>Police & emergency contacts will be alerted automatically</Text>

            {/* Countdown ring */}
            <View style={s.countdownRing}>
              <Text style={s.countdownNum}>{sosState.countdown}</Text>
            </View>

            <TouchableOpacity style={s.cancelBtn} onPress={cancelSOS}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.cancelBtnText}>I'm Safe — Cancel SOS</Text>
            </TouchableOpacity>

            <Text style={s.modalHint}>
              Or press "I'm Safe" in the notification if app goes to background
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1, backgroundColor: '#e8e0d8' },
  overlay: { zIndex: 99, backgroundColor: 'rgba(250,251,252,0.93)', justifyContent: 'center', alignItems: 'center' },
  overlayText: { color: colors.muted, marginTop: 10, fontFamily: 'Manrope_500Medium' },
  topBar: { position: 'absolute', top: 14, left: spacing.lg, right: spacing.lg },
  statusPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: borderRadius.full,
    paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 4,
  },
  statusText: { ...typography.bodySmall, color: colors.text },
  kwBar: { position: 'absolute', top: 64, left: spacing.lg },
  kwPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface + 'EE', borderRadius: borderRadius.full,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border, elevation: 2,
  },
  kwText: { fontSize: 11, color: colors.muted, fontFamily: 'Manrope_500Medium' },
  safetyBar: { position: 'absolute', top: 100, left: spacing.lg },
  safetyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: borderRadius.full,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  safetyText: { fontSize: 11, color: '#EF4444', fontFamily: 'Manrope_700Bold' },
  quickActions: { position: 'absolute', right: spacing.lg, top: 70, gap: 10 },
  quickBtn: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3,
  },
  banner: { position: 'absolute', bottom: 160, left: spacing.lg, right: spacing.lg, zIndex: 50 },
  sheet: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 86,
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  sheetRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  iconBtn: {
    width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, minWidth: 120, borderRadius: borderRadius.md, backgroundColor: colors.primary,
  },
  primaryBtnText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_600SemiBold' },
  sosBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, minWidth: 80, borderRadius: borderRadius.md, backgroundColor: colors.danger,
  },
  sosBtnText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_700Bold' },
  hint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  legendRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendTitle: { ...typography.bodySmall, color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  legendPills: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  hintSmall: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  disclaimer: { ...typography.caption, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },

  // Modal styles
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl, padding: spacing.xl,
    alignItems: 'center', width: '100%', borderWidth: 2, borderColor: colors.danger,
    shadowColor: '#EF4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 12,
  },
  modalTitle: { ...typography.title, color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
  modalReason: { ...typography.body, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  modalSub: { ...typography.caption, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },
  countdownRing: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: colors.danger,
    justifyContent: 'center', alignItems: 'center', marginVertical: spacing.xl,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  countdownNum: { fontSize: 36, fontFamily: 'Manrope_700Bold', color: colors.danger },
  cancelBtn: {
    width: '100%', paddingVertical: 16, borderRadius: borderRadius.md,
    backgroundColor: colors.safe, alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  cancelBtnText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 16 },
  modalHint: { ...typography.caption, color: colors.muted, marginTop: spacing.lg, textAlign: 'center' },

});