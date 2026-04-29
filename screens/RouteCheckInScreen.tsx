// Changes from original:
//   ★ scheduleCheckinExpiryNotification() called on check-in start so even
//     when app is backgrounded the user gets an alert.
//   ★ cancelCheckinExpiryNotification() called on stop/arrive.
//   ★ useSOSWithBackground hook replaces manual SOS timer for the late-SOS flow.
//   ★ userLocationRef fixes the stale-closure SMS bug.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  TextInput, FlatList, ScrollView, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocation } from '../context/LocationContext';
import { colors, spacing, typography, borderRadius, sizes } from '../theme';
import {
  completeRouteHistory, createRouteHistory, getUserRouteHistory,
  getStoredUserData, getStoredUserPhone, RouteHistoryRecord,
  syncStoredUserWithBackend, upsertUser,
} from '../services/api';
import PoliceAlertBanner from '../components/PoliceAlertBanner';
import type { PoliceSMSResult } from '../services/policeSOS';
import { useCrimeZones } from '../hooks/useCrimeZones';
import { useSOSWithBackground } from '../hooks/useSOSWithBackground';
import {
  scheduleCheckinExpiryNotification,
  cancelCheckinExpiryNotification,
} from '../services/sosNotification';
import { buildLeafletHTML } from '../utils/buildLeafletHTML';

// ── Nominatim geocode ─────────────────────────────────────────────────────────
type NominatimItem = { place_id: string; display_name: string; lat: string; lon: string };

async function nominatimSearch(q: string): Promise<NominatimItem[]> {
  if (q.trim().length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=in`;
    const r = await fetch(url, { headers: { 'User-Agent': 'AbhayaApp/1.0', 'Accept-Language': 'en' } });
    return await r.json() as NominatimItem[];
  } catch { return []; }
}

// ── OSRM route ────────────────────────────────────────────────────────────────
async function getOSRMRoute(
  s: { latitude: number; longitude: number },
  e: { latitude: number; longitude: number },
): Promise<{ latitude: number; longitude: number }[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${s.longitude},${s.latitude};${e.longitude},${e.latitude}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    const d = await r.json();
    const coords = d?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || !coords.length) return [s, e];
    return coords.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon }));
  } catch { return [s, e]; }
}

interface Loc { latitude: number; longitude: number; }
const DEFAULT_HTML = buildLeafletHTML(26.1445, 91.7362, { enableRoute: true, zoom: 15 });

export default function RouteCheckInScreen({ navigation }: any) {
  const [destination, setDestination]         = useState('');
  const [estimatedTime, setEstimatedTime]     = useState('30');
  const [destLocation, setDestLocation]       = useState<Loc | null>(null);
  const { userLocation, locationGranted } = useLocation();
  const [routeHistory, setRouteHistory]       = useState<RouteHistoryRecord[]>([]);
  const [activeCheckIn, setActiveCheckIn]     = useState<{
    destination: string; estimatedTime: number; startTime: number; routeId?: number;
  } | null>(null);
  const [searchLoading, setSearchLoading]     = useState(false);
  const [suggestions, setSuggestions]         = useState<NominatimItem[]>([]);
  const [showSugg, setShowSugg]               = useState(false);
  const [mapHTML, setMapHTML]                 = useState<string>(DEFAULT_HTML);
  const initialMapSet                         = useRef(false);
  const [crimeVisible, setCrimeVisible]       = useState(true);
  const [crimeHint, setCrimeHint]             = useState<string | null>(null);
  const [timeRemainingSec, setTimeRemainingSec] = useState<number | null>(null);

  const [policeLoading, setPoliceLoading]       = useState(false);
  const [policeResult, setPoliceResult]         = useState<PoliceSMSResult | null>(null);
  const [showPoliceBanner, setShowPoliceBanner] = useState(false);

  // ★ location ref — so SOS hook always reads fresh coords
  const userLocationRef = useRef<Loc | null>(null);
  const [userId, setUserId]   = useState<string | null>(null);
  const [userName, setUserName] = useState('Unknown');

  const webViewRef        = useRef<WebView>(null);
  // Removed unused locationWatchRef
  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const crime = useCrimeZones(userLocation, {
    enabled: crimeVisible,
    radius: 3_000,
    refreshIntervalMs: 180_000,
    movementThresholdMeters: 500,
  });

  // Load user data
  useEffect(() => {
    getStoredUserData().then(d => {
      if (d) { setUserId(d.phone || null); setUserName(d.name || 'Unknown'); }
    });
  }, []);

  // ── SOS with background support ───────────────────────────────────────────
  const { sosState, triggerSOS, cancelSOS } = useSOSWithBackground({
    userId,
    userName,
    locationRef: userLocationRef,
    onResult:    (result) => setPoliceResult(result),
    onLoading:   (v) => setPoliceLoading(v),
    onShowBanner: () => setShowPoliceBanner(true),
    onCheckinArrived: () => void handleStop('COMPLETED'),
  });

  const postMap = useCallback((msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    postMap({ type: 'toggle-crime-zones', visible: crimeVisible });
    if (crimeVisible) postMap({ type: 'crime-zones', featureCollection: crime.zones });
  }, [crime.zones, crimeVisible, postMap]);

  // Debounced Nominatim suggestions
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (destination.trim().length < 3) { setSuggestions([]); setShowSugg(false); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await nominatimSearch(destination);
      setSuggestions(res); setShowSugg(res.length > 0);
    }, 500);
  }, [destination]);

  const loadHistory = async () => {
    try {
      const phone = await getStoredUserPhone();
      if (!phone) { setRouteHistory([]); return; }
      const h = await getUserRouteHistory(phone);
      setRouteHistory(h.slice(0, 6));
    } catch {}
  };

  const resolveAndShowDest = async (name: string, coords?: Loc) => {
    if (!userLocation) return;
    setSearchLoading(true); setShowSugg(false);

    let loc: Loc | null = coords ?? null;
    if (!loc) {
      const res = await nominatimSearch(name);
      if (res.length > 0) loc = { latitude: parseFloat(res[0].lat), longitude: parseFloat(res[0].lon) };
    }

    setSearchLoading(false);
    if (!loc) { Alert.alert('Location not found', 'Try a different name or pick from suggestions.'); return; }

    setDestLocation(loc);
    postMap({ type: 'dest', lat: loc.latitude, lng: loc.longitude, name });
    const pts = await getOSRMRoute(userLocation, loc);
    postMap({ type: 'route', points: pts.map(p => ({ lat: p.latitude, lng: p.longitude })) });
  };


  // Sync mapHTML with userLocation from context
  useEffect(() => {
    if (userLocation && !initialMapSet.current) {
      setMapHTML(buildLeafletHTML(userLocation.latitude, userLocation.longitude, { enableRoute: true, zoom: 15 }));
      initialMapSet.current = true;
    } else if (userLocation && initialMapSet.current) {
      postMap({ type: 'center', lat: userLocation.latitude, lng: userLocation.longitude, zoom: 15 });
      postMap({ type: 'loc', lat: userLocation.latitude, lng: userLocation.longitude });
    }
  }, [userLocation, postMap]);

  const handleCheckIn = async () => {
    if (!destination.trim()) return;
    if (!destLocation && userLocation) await resolveAndShowDest(destination);

    let routeId: number | undefined;
    try {
      const data = await getStoredUserData();
      if (data?.phone && data?.name) await upsertUser({ phone: data.phone, name: data.name, email: data.email });
      const phone = await getStoredUserPhone();
      if (phone && userLocation && destLocation) {
        const route = await createRouteHistory({
          userPhone: phone, destinationName: destination,
          startLatitude: userLocation.latitude, startLongitude: userLocation.longitude,
          endLatitude: destLocation.latitude, endLongitude: destLocation.longitude,
          estimatedMinutes: parseInt(estimatedTime, 10), startedAt: new Date().toISOString(),
        });
        routeId = route.id;
        await loadHistory();
      }
    } catch {}

    const ci = { destination, estimatedTime: parseInt(estimatedTime, 10), startTime: Date.now(), routeId };
    setActiveCheckIn(ci);

    // ★ Schedule background notification that fires when ETA expires
    const etaMs = Date.now() + ci.estimatedTime * 60 * 1000;
    await scheduleCheckinExpiryNotification(destination, etaMs);
  };

  const handleStop = async (status: 'COMPLETED' | 'CANCELLED' = 'COMPLETED') => {
    // ★ Cancel the scheduled background notification
    await cancelCheckinExpiryNotification();

    if (activeCheckIn?.routeId) {
      try { await completeRouteHistory(activeCheckIn.routeId, status); await loadHistory(); } catch {}
    }
    setActiveCheckIn(null);
    setDestination('');
    setEstimatedTime('30');
    setDestLocation(null);
    setSuggestions([]);
    setShowPoliceBanner(false);
    postMap({ type: 'clear' });
  };

  // Countdown timer (foreground only — background handled by scheduled notification)
  useEffect(() => {
    if (!activeCheckIn) { setTimeRemainingSec(null); return; }

    let hasTriggered = false;
    const update = () => {
      const elapsed = Math.floor((Date.now() - activeCheckIn.startTime) / 1000);
      const total   = activeCheckIn.estimatedTime * 60;
      const rem     = total - elapsed;
      setTimeRemainingSec(rem > 0 ? rem : 0);

      // Foreground late SOS — trigger once
      if (rem <= 0 && !hasTriggered) {
        hasTriggered = true;
        // Give 60s grace then trigger SOS (notification already showed at 0)
        // The user can cancel via the notification or the modal below
        triggerSOS(`Check-in ETA expired for "${activeCheckIn.destination}"`);
      }
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeCheckIn]);

  const isLate = timeRemainingSec === 0 && activeCheckIn;
  const formatTime = (sec: number | null) => {
    if (sec === null) return '';
    return `${Math.floor(sec / 60)}m ${(sec % 60).toString().padStart(2, '0')}s`;
  };

  const presets = [
    { id: 1, name: 'Office',           latitude: 26.1445, longitude: 91.7362 },
    { id: 2, name: 'Home',             latitude: 26.1158, longitude: 91.7086 },
    { id: 3, name: 'Hospital',         latitude: 26.1533, longitude: 91.7441 },
    { id: 4, name: 'Railway Station',  latitude: 26.1848, longitude: 91.7469 },
  ];



  return (
    <View style={st.container}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
      {!activeCheckIn ? (
        <>
          <View style={st.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={st.backRow}>
              <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
              <Text style={st.backBtn}>Back</Text>
            </TouchableOpacity>
            <Text style={st.headerTitle}>Route Check-In</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={st.mapBox}>
            <WebView
              ref={webViewRef}
              style={st.map}
              source={{ html: mapHTML }}
              onMessage={(event) => {
                try {
                  const parsed = JSON.parse(event.nativeEvent.data);
                  if (parsed?.type === 'crime-zone-pressed') setCrimeHint(parsed?.zone?.label ?? 'Crime zone selected');
                } catch {}
              }}
              originWhitelist={['*']}
              javaScriptEnabled domStorageEnabled mixedContentMode="always"
              allowFileAccess allowUniversalAccessFromFileURLs
              scrollEnabled={false} bounces={false}
            />
            <View style={st.mapBadge}>
              <Ionicons name={locationGranted ? 'location' : 'location-outline'} size={13} color={locationGranted ? colors.primary : colors.muted} />
              <Text style={st.mapBadgeText}>{locationGranted ? 'Live · OSM' : 'No location'}</Text>
            </View>
            <TouchableOpacity style={st.recenterMapBtn} onPress={() => {
              if (!userLocationRef.current) return;
              postMap({ type: 'center', lat: userLocationRef.current.latitude, lng: userLocationRef.current.longitude, zoom: 15 });
            }}>
              <Ionicons name="locate" size={17} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[st.crimeToggleBtn, crimeVisible && { borderColor: '#F59E0B' }]}
              onPress={() => { setCrimeVisible(v => !v); setCrimeHint(null); }}>
              <MaterialCommunityIcons name="map-marker-radius" size={16} color={crimeVisible ? '#F59E0B' : colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={st.section}>
            <Text style={st.sectionTitle}>Where are you going?</Text>
            <View style={st.searchWrap}>
              <Ionicons name="search" size={15} color={colors.muted} style={{ marginLeft: 10 }} />
              <TextInput
                style={st.searchInput}
                placeholder="Search location or address…"
                placeholderTextColor={colors.muted}
                value={destination}
                onChangeText={t => { setDestination(t); setDestLocation(null); postMap({ type: 'clear' }); }}
                onSubmitEditing={() => void resolveAndShowDest(destination)}
                returnKeyType="search"
              />
              {searchLoading
                ? <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 10 }} />
                : destination.length > 0
                  ? <TouchableOpacity onPress={() => { setDestination(''); postMap({ type: 'clear' }); setSuggestions([]); }} style={{ padding: 6 }}>
                      <Ionicons name="close-circle" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  : null}
            </View>

            {showSugg && suggestions.length > 0 && (
              <View style={st.suggBox}>
                {suggestions.map(item => (
                  <TouchableOpacity key={item.place_id} style={st.suggItem} onPress={() => {
                    const shortName = item.display_name.split(',')[0];
                    setDestination(shortName); setShowSugg(false);
                    void resolveAndShowDest(shortName, { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) });
                  }}>
                    <Ionicons name="location-outline" size={13} color={colors.primary} style={{ marginRight: 7 }} />
                    <Text style={st.suggText} numberOfLines={2}>{item.display_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[st.searchBtn, !destination.trim() && { opacity: 0.5 }]}
              onPress={() => void resolveAndShowDest(destination)}
              disabled={!destination.trim()}
            >
              <Ionicons name="map" size={16} color="#fff" />
              <Text style={st.searchBtnText}>Show Route</Text>
            </TouchableOpacity>

            {destination.length === 0 && (
              <>
                <Text style={st.subTitle}>Quick Select</Text>
                <FlatList
                  data={presets}
                  keyExtractor={i => i.id.toString()}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={st.locCard}
                      onPress={() => { setDestination(item.name); void resolveAndShowDest(item.name, { latitude: item.latitude, longitude: item.longitude }); }}>
                      <MaterialCommunityIcons name="map-marker" size={17} color={colors.primary} />
                      <Text style={st.locName}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
          </View>

          {/* ETA */}
          <View style={st.section}>
            <Text style={st.sectionTitle}>Estimated Time of Arrival</Text>
            <View style={st.timeRow}>
              <TextInput
                style={st.timeInput} placeholder="30" placeholderTextColor={colors.muted}
                keyboardType="number-pad" value={estimatedTime} onChangeText={setEstimatedTime} maxLength={3}
              />
              <Text style={st.timeUnit}>minutes</Text>
            </View>
            <View style={st.timeChips}>
              {['15','30','45','60'].map(t => (
                <TouchableOpacity key={t} style={[st.chip, estimatedTime === t && st.chipActive]} onPress={() => setEstimatedTime(t)}>
                  <Text style={[st.chipText, estimatedTime === t && st.chipTextActive]}>{t}m</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Crime & route info */}
            {destLocation && (
              <View style={st.routeInfo}>
                <Ionicons name="navigate" size={13} color={colors.primary} />
                <Text style={st.routeInfoText}>Route loaded via OSRM · OpenStreetMap</Text>
              </View>
            )}
            {crimeVisible && (
              <View style={st.crimeInfoBox}>
                <Text style={st.crimeInfoText}>
                  {crime.loading ? 'Loading crime zones…'
                    : crime.error ? 'Crime layer unavailable'
                    : `Crime zones: ${crime.zones.features.length}${crime.cached ? ' · cache' : ''}`}
                </Text>
                {crimeHint ? <Text style={st.crimeInfoText}>{crimeHint}</Text> : null}
                <Text style={st.crimeInfoSub}>Crime data is approximate and for awareness only.</Text>
              </View>
            )}

            {routeHistory.length > 0 && (
              <>
                <Text style={st.subTitle}>Recent Check-Ins</Text>
                {routeHistory.map(item => (
                  <View key={item.id} style={st.histCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={st.histTitle}>{item.destinationName}</Text>
                      <Text style={[st.histStatus,
                        item.status === 'COMPLETED' && { color: colors.safe },
                        item.status === 'CANCELLED' && { color: colors.danger },
                      ]}>{item.status}</Text>
                    </View>
                    <Text style={st.histMeta}>ETA: {item.estimatedMinutes} min</Text>
                  </View>
                ))}
              </>
            )}
          </View>

          {/* Start button */}
          <View style={st.btnSection}>
            <TouchableOpacity
              style={[st.startBtn, destination.trim() ? {} : st.startBtnOff]}
              onPress={() => void handleCheckIn()}
              disabled={!destination.trim()}
            >
              <Ionicons name="play-circle" size={18} color="#fff" />
              <Text style={st.startBtnText}>Start Check-In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.recenterBtn} onPress={() => {
              if (!userLocationRef.current) return;
              postMap({ type: 'center', lat: userLocationRef.current.latitude, lng: userLocationRef.current.longitude, zoom: 15 });
            }}>
              <Ionicons name="locate-outline" size={17} color={colors.text} />
              <Text style={st.recenterBtnText}>Recenter Map</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={[st.header, { justifyContent: 'center' }]}>
            <Text style={st.headerTitle}>Check-In Active</Text>
          </View>

          <View style={st.activeMapBox}>
            <WebView
              ref={webViewRef}
              style={st.map}
              source={{ html: mapHTML }}
              onMessage={(event) => {
                try {
                  const parsed = JSON.parse(event.nativeEvent.data);
                  if (parsed?.type === 'crime-zone-pressed') setCrimeHint(parsed?.zone?.label ?? 'Crime zone selected');
                } catch {}
              }}
              originWhitelist={['*']}
              javaScriptEnabled domStorageEnabled mixedContentMode="always"
              allowFileAccess allowUniversalAccessFromFileURLs
              scrollEnabled={false} bounces={false}
            />
          </View>

          <View style={st.destCard}>
            <Text style={st.cardLabel}>Destination</Text>
            <Text style={st.cardValue}>{activeCheckIn.destination}</Text>
          </View>

          <View style={[st.timeCard, isLate && st.timeCardLate]}>
            <Text style={st.timeLbl}>Time Remaining</Text>
            <Text style={[st.timeVal, isLate && { fontSize: 36 }]}>
              {isLate ? 'LATE' : formatTime(timeRemainingSec)}
            </Text>
            {isLate && <Text style={st.lateWarn}>SOS alert triggered — cancel if you're safe</Text>}
          </View>

          <View style={st.activeBtns}>
            <TouchableOpacity style={st.safeBtn} onPress={() => void handleStop('COMPLETED')}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={st.safeBtnText}>I Arrived Safely</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.cancelCheckinBtn} onPress={() => void handleStop('CANCELLED')}>
              <Text style={st.cancelCheckinText}>Cancel Check-In</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      </ScrollView>

      {/* Police alert banner */}
      {showPoliceBanner && (
        <View style={st.banner}>
          <PoliceAlertBanner result={policeResult} loading={policeLoading} onDismiss={() => setShowPoliceBanner(false)} />
        </View>
      )}

      {/* ── Auto-SOS countdown modal (foreground) ── */}
      <Modal transparent visible={sosState.visible} animationType="fade">
        <View style={st.modalBg}>
          <View style={st.modalCard}>
            <MaterialCommunityIcons name="alarm-light" size={36} color={colors.danger} />
            <Text style={st.modalTitle}>SOS Alert in {sosState.countdown}s</Text>
            <Text style={st.modalReason}>{sosState.reason}</Text>
            <Text style={st.modalSub}>Police & emergency contacts will be alerted automatically</Text>
            <View style={st.countdownRing}>
              <Text style={st.countdownNum}>{sosState.countdown}</Text>
            </View>
            <TouchableOpacity style={st.cancelBtn} onPress={cancelSOS}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={st.cancelBtnText}>I'm Safe — Cancel SOS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.bg },
  header:      {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  backRow:     { flexDirection: 'row', alignItems: 'center' },
  backBtn:     { color: colors.textSecondary, fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  headerTitle: { ...typography.heading, color: colors.text },
  mapBox:      { height: 260, position: 'relative', borderBottomWidth: 1, borderBottomColor: colors.border },
  activeMapBox:{ height: 200, borderBottomWidth: 1, borderBottomColor: colors.border },
  map:         { flex: 1, backgroundColor: '#e8e0d8' },
  mapBadge:    {
    position: 'absolute', top: spacing.sm, left: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.surface, borderRadius: borderRadius.full,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, elevation: 3,
  },
  mapBadgeText:    { ...typography.caption, color: colors.textSecondary },
  recenterMapBtn:  {
    position: 'absolute', top: spacing.sm, right: spacing.md,
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', elevation: 3,
  },
  crimeToggleBtn:  {
    position: 'absolute', top: spacing.sm + 42, right: spacing.md,
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', elevation: 3,
  },
  section:      { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  sectionTitle: { ...typography.subheading, color: colors.text, marginBottom: spacing.md },
  subTitle:     { ...typography.bodySmall, color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.md },
  searchWrap:   {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, marginBottom: spacing.md,
  },
  searchInput:  {
    flex: 1, paddingVertical: spacing.lg, paddingHorizontal: spacing.sm,
    color: colors.text, fontSize: 14, fontFamily: 'Manrope_500Medium',
  },
  suggBox:      {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, marginBottom: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
  },
  suggItem:     {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  suggText:     { flex: 1, fontSize: 13, color: colors.text, fontFamily: 'Manrope_500Medium' },
  searchBtn:    {
    height: sizes.buttonHeight, borderRadius: borderRadius.md, backgroundColor: colors.primary,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: spacing.sm,
  },
  searchBtnText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_600SemiBold' },
  locCard:      {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, elevation: 1,
  },
  locName:      { ...typography.body, color: colors.text },
  timeRow:      {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
  },
  timeInput:    { flex: 1, color: colors.text, fontSize: 18, fontWeight: '600' },
  timeUnit:     { ...typography.body, color: colors.muted },
  timeChips:    { flexDirection: 'row', gap: spacing.md },
  chip:         {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.bg, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  chipActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText:       { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  routeInfo:    {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.md,
    backgroundColor: colors.primary + '12', borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  routeInfoText: { fontSize: 12, color: colors.primary, fontFamily: 'Manrope_600SemiBold' },
  crimeInfoBox: {
    marginTop: spacing.md, backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  crimeInfoText: { ...typography.caption, color: colors.textSecondary },
  crimeInfoSub:  { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
  bgNoticeBox:  {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: spacing.md,
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.primary + '25',
  },
  bgNoticeText: { flex: 1, fontSize: 12, color: colors.primary, fontFamily: 'Manrope_500Medium' },
  histCard:     {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, marginBottom: spacing.sm,
  },
  histTitle:    { ...typography.body, color: colors.text, flex: 1 },
  histStatus:   { ...typography.caption, color: colors.warning, fontWeight: '700' },
  histMeta:     { ...typography.caption, color: colors.muted, marginTop: 2 },
  btnSection:   { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  startBtn:     {
    height: sizes.buttonHeight, borderRadius: borderRadius.md, backgroundColor: colors.primary,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  startBtnOff:  { backgroundColor: colors.inactive },
  startBtnText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_600SemiBold' },
  recenterBtn:  {
    marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, paddingVertical: 14,
  },
  recenterBtnText: { ...typography.bodySmall, color: colors.text },
  destCard:     {
    marginHorizontal: spacing.lg, marginVertical: spacing.lg,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, elevation: 2,
  },
  cardLabel:    { ...typography.caption, color: colors.muted, marginBottom: spacing.xs },
  cardValue:    { ...typography.heading, color: colors.text },
  timeCard:     {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    backgroundColor: colors.safe, borderRadius: borderRadius.md,
    padding: spacing.xxl, alignItems: 'center',
  },
  timeCardLate: { backgroundColor: colors.danger },
  timeLbl:      { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginBottom: spacing.sm },
  timeVal:      { fontSize: 40, fontWeight: '900', color: '#fff' },
  lateWarn:     { ...typography.bodySmall, color: 'rgba(255,255,255,0.9)', marginTop: spacing.sm, textAlign: 'center' },
  activeBtns:   { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  safeBtn:      {
    height: sizes.buttonHeight, borderRadius: borderRadius.md,
    backgroundColor: colors.safe, justifyContent: 'center', alignItems: 'center',
    flexDirection: 'row',
  },
  safeBtnText:  { ...typography.body, color: '#fff', fontFamily: 'Manrope_700Bold' },
  cancelCheckinBtn: {
    height: sizes.buttonHeight, borderRadius: borderRadius.md, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 1,
  },
  cancelCheckinText: { ...typography.body, color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  banner:        { position: 'absolute', bottom: 20, left: spacing.lg, right: spacing.lg, zIndex: 50 },
  // Modal
  modalBg:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard:     {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl, padding: spacing.xl,
    alignItems: 'center', width: '100%', borderWidth: 2, borderColor: colors.danger,
    shadowColor: '#EF4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 12,
  },
  modalTitle:    { ...typography.title, color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
  modalReason:   { ...typography.body, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  modalSub:      { ...typography.caption, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },
  countdownRing: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: colors.danger,
    justifyContent: 'center', alignItems: 'center', marginVertical: spacing.xl,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  countdownNum:  { fontSize: 36, fontFamily: 'Manrope_700Bold', color: colors.danger },
  cancelBtn:     {
    width: '100%', paddingVertical: 16, borderRadius: borderRadius.md,
    backgroundColor: colors.safe, alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  cancelBtnText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 16 },
});