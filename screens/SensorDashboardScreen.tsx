
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSensorFusion, SensorData }         from '../hooks/useSensorFusion';
import { useBLEMesh }                           from '../hooks/useBLEMesh';
import { logSensorEvent, getLocalEvents, SensorEvent } from '../services/sensorDb';
import { colors, spacing, typography, borderRadius } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── helpers ──────────────────────────────────────────────────────────────────
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function fmtNum(n: number, digits = 2) { return n.toFixed(digits); }

// ── animated bar (used for accel/gyro/mic) ────────────────────────────────────
function SensorBar({ value, color, label }: { value: number; color: string; label: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: clamp01(value), duration: 80, useNativeDriver: false }).start();
  }, [value]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={sb.row}>
      <Text style={sb.label}>{label}</Text>
      <View style={sb.track}>
        <Animated.View style={[sb.fill, { width, backgroundColor: color }]} />
      </View>
      <Text style={sb.val}>{fmtNum(value, 3)}</Text>
    </View>
  );
}
const sb = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  label: { width: 24, fontSize: 11, color: colors.muted, fontFamily: 'Manrope_500Medium' },
  track: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  fill:  { height: '100%', borderRadius: 4 },
  val:   { width: 52, fontSize: 11, color: colors.textSecondary, textAlign: 'right', fontFamily: 'Manrope_500Medium' },
});

// ── status pill ───────────────────────────────────────────────────────────────
function StatusPill({ label, active, color }: { label: string; active: boolean; color: string }) {
  return (
    <View style={[pill.wrap, { borderColor: active ? color : colors.border }]}>
      <View style={[pill.dot, { backgroundColor: active ? color : colors.border }]} />
      <Text style={[pill.text, { color: active ? color : colors.muted }]}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 8 },
  dot:  { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  text: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
});

// ── card wrapper ──────────────────────────────────────────────────────────────
function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <View style={[card.wrap, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : {}]}>
      <Text style={card.title}>{title}</Text>
      {children}
    </View>
  );
}
const card = StyleSheet.create({
  wrap:  { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  title: { ...typography.bodySmall, color: colors.muted, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ─── main screen ──────────────────────────────────────────────────────────────
export default function SensorDashboardScreen({ navigation }: any) {
  const [sensorActive, setSensorActive] = useState(true);
  const [meshActive,   setMeshActive]   = useState(false);
  const [userId,       setUserId]       = useState('');
  const [eventLog,     setEventLog]     = useState<SensorEvent[]>([]);

  const sensors = useSensorFusion(sensorActive);
  const { state: mesh, sendSOSViaMesh } = useBLEMesh(meshActive);

  // load userId
  useEffect(() => {
    AsyncStorage.getItem('AbhayaUserData').then(raw => {
      if (raw) setUserId((JSON.parse(raw) as any).phone ?? '');
    });
    refreshLog();
  }, []);

  const refreshLog = async () => {
    const events = await getLocalEvents(30);
    setEventLog(events);
  };

  // watch for critical motion events and log them
  const prevMotion = useRef(sensors.motion);
  const prevMicPeak = useRef(false);
  useEffect(() => {
    const m = sensors.motion;
    const p = prevMotion.current;

    if (!p.impactDetected && m.impactDetected && userId) {
      logSensorEvent(userId, 'fall_detected', {
        magnitude: sensors.accelerometer.magnitude,
        gyro:      sensors.gyroscope,
      }, sensors.gps?.latitude ?? null, sensors.gps?.longitude ?? null)
        .then(refreshLog);
    }
    if (!p.isShaking && m.isShaking && userId) {
      logSensorEvent(userId, 'shake_detected', { shakeCount: m.shakeCount },
        sensors.gps?.latitude ?? null, sensors.gps?.longitude ?? null)
        .then(refreshLog);
    }
    if (!prevMicPeak.current && sensors.mic.peakDetected && userId) {
      logSensorEvent(userId, 'audio_peak', { level: sensors.mic.level },
        sensors.gps?.latitude ?? null, sensors.gps?.longitude ?? null)
        .then(refreshLog);
    }
    prevMicPeak.current = sensors.mic.peakDetected;
    prevMotion.current = m;
  }, [sensors.motion, sensors.mic.peakDetected]);

  // normalise accelerometer for bars: 0 g = 0.5 on bar, ±4g = 0 or 1
  const normAccel = (v: number) => clamp01((v + 4) / 8);
  const normGyro  = (v: number) => clamp01((v + 10) / 20);
  const { accelerometer: acc, gyroscope: gyr, gps, mic, motion } = sensors;

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>

      {/* header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Sensor Dashboard</Text>
        <TouchableOpacity onPress={() => setSensorActive(a => !a)} style={s.toggleBtn}>
          <Text style={[s.toggleText, { color: sensorActive ? colors.safe : colors.danger }]}>
            {sensorActive ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* motion status pills */}
      <View style={s.pills}>
        <StatusPill label="Fall"       active={motion.isFalling}      color={colors.danger} />
        <StatusPill label="Impact"     active={motion.impactDetected}  color="#FF6B00" />
        <StatusPill label="Shaking"    active={motion.isShaking}       color={colors.warning} />
        <StatusPill label="Stationary" active={motion.isStationary}    color={colors.safe} />
        <StatusPill label="Mic Peak"   active={mic.peakDetected}       color="#A855F7" />
        <StatusPill label="GPS"        active={gps !== null}           color={colors.primary} />
      </View>

      {/* accelerometer */}
      <Card title="Accelerometer  (g)" accent={motion.impactDetected ? colors.danger : undefined}>
        <SensorBar value={normAccel(acc.x)} color="#3B82F6" label="X" />
        <SensorBar value={normAccel(acc.y)} color="#10B981" label="Y" />
        <SensorBar value={normAccel(acc.z)} color="#F59E0B" label="Z" />
        <View style={s.rowBetween}>
          <Text style={s.meta}>Magnitude: {fmtNum(acc.magnitude)} g</Text>
          {motion.impactDetected && <Text style={[s.meta, { color: colors.danger, fontFamily: 'Manrope_700Bold' }]}>IMPACT</Text>}
          {motion.isFalling      && <Text style={[s.meta, { color: '#FF6B00' }]}>FALLING</Text>}
        </View>
        <Text style={s.meta}>Shakes in 1.5s window: {motion.shakeCount}</Text>
      </Card>

      {/* gyroscope */}
      <Card title="Gyroscope  (rad/s)">
        <SensorBar value={normGyro(gyr.x)} color="#8B5CF6" label="X" />
        <SensorBar value={normGyro(gyr.y)} color="#EC4899" label="Y" />
        <SensorBar value={normGyro(gyr.z)} color="#06B6D4" label="Z" />
        <Text style={s.meta}>Angular velocity magnitude: {fmtNum(Math.sqrt(gyr.x*gyr.x+gyr.y*gyr.y+gyr.z*gyr.z))} rad/s</Text>
      </Card>

      {/* microphone */}
      <Card title="Microphone" accent={mic.peakDetected ? '#A855F7' : undefined}>
        <SensorBar value={mic.level} color="#A855F7" label="dB" />
        <View style={s.rowBetween}>
          <Text style={s.meta}>Level: {Math.round(mic.level * 100)}%</Text>
          <Text style={s.meta}>{mic.isListening ? '🔴 Listening' : '⚫ Off'}</Text>
          {mic.peakDetected && <Text style={[s.meta, { color: '#A855F7', fontFamily: 'Manrope_700Bold' }]}>DISTRESS PEAK</Text>}
        </View>
      </Card>

      {/* GPS */}
      <Card title="GPS Location">
        {gps ? (
          <>
            <Text style={s.gpsVal}>{fmtNum(gps.latitude, 5)}°N,  {fmtNum(gps.longitude, 5)}°E</Text>
            <View style={s.gpsGrid}>
              <View style={s.gpsItem}><Text style={s.gpsLbl}>Speed</Text><Text style={s.gpsNum}>{gps.speed != null ? fmtNum(gps.speed * 3.6) : '—'} km/h</Text></View>
              <View style={s.gpsItem}><Text style={s.gpsLbl}>Accuracy</Text><Text style={s.gpsNum}>{gps.accuracy != null ? fmtNum(gps.accuracy) : '—'} m</Text></View>
              <View style={s.gpsItem}><Text style={s.gpsLbl}>Heading</Text><Text style={s.gpsNum}>{gps.heading != null ? fmtNum(gps.heading) : '—'}°</Text></View>
              <View style={s.gpsItem}><Text style={s.gpsLbl}>Altitude</Text><Text style={s.gpsNum}>{gps.altitude != null ? fmtNum(gps.altitude) : '—'} m</Text></View>
            </View>
          </>
        ) : (
          <Text style={s.meta}>Waiting for GPS fix…</Text>
        )}
      </Card>

      {/* BLE Mesh */}
      <Card title="BLE Mesh Network" accent={mesh.isActive ? colors.primary : undefined}>
        <View style={s.rowBetween}>
          <TouchableOpacity onPress={() => setMeshActive(a => !a)} style={[s.meshBtn, { backgroundColor: meshActive ? colors.primary : colors.border }]}>
            <Text style={s.meshBtnText}>{meshActive ? 'Mesh Active' : 'Enable Mesh'}</Text>
          </TouchableOpacity>
          <View style={s.meshStats}>
            <Text style={s.meta}>Sent: {mesh.packetsSent}</Text>
            <Text style={s.meta}>Relayed: {mesh.packetsRelayed}</Text>
            <Text style={[s.meta, { color: mesh.networkReachable ? colors.safe : colors.danger }]}>
              {mesh.networkReachable ? '4G Online' : 'No Network — Mesh Mode'}
            </Text>
          </View>
        </View>
        {mesh.peers.length > 0 ? (
          <>
            <Text style={[s.meta, { marginTop: spacing.md, marginBottom: spacing.sm }]}>Nearby Abhaya users:</Text>
            {mesh.peers.map(peer => (
              <View key={peer.id} style={s.peerRow}>
                <Ionicons name="bluetooth" size={14} color={colors.primary} />
                <Text style={s.peerName}>{peer.name}</Text>
                <Text style={s.peerRssi}>{peer.rssi} dBm</Text>
                {peer.isRelaying && <Text style={s.peerRelay}>RELAYING</Text>}
              </View>
            ))}
          </>
        ) : (
          <Text style={[s.meta, { marginTop: spacing.sm }]}>No peers nearby</Text>
        )}
        {!mesh.networkReachable && gps && (
          <TouchableOpacity
            style={s.meshSosBtn}
            onPress={() => sendSOSViaMesh(gps.latitude, gps.longitude, userId)}
          >
            <MaterialCommunityIcons name="alarm-light" size={16} color="#fff" />
            <Text style={s.meshSosBtnText}>Broadcast SOS via Mesh</Text>
          </TouchableOpacity>
        )}
      </Card>

      {/* event log */}
      <Card title="Recent Events">
        <TouchableOpacity onPress={refreshLog} style={s.refreshBtn}>
          <Ionicons name="refresh" size={14} color={colors.primary} />
          <Text style={s.refreshText}>Refresh</Text>
        </TouchableOpacity>
        {eventLog.length === 0 ? (
          <Text style={s.meta}>No events yet</Text>
        ) : (
          eventLog.map(evt => (
            <View key={evt.id} style={s.evtRow}>
              <View style={[s.evtDot, { backgroundColor: eventColor(evt.type) }]} />
              <View style={s.evtInfo}>
                <Text style={s.evtType}>{evt.type.replace(/_/g, ' ')}</Text>
                <Text style={s.evtTime}>{new Date(evt.timestamp).toLocaleTimeString()}</Text>
              </View>
              {evt.synced && <Ionicons name="cloud-done-outline" size={12} color={colors.safe} />}
            </View>
          ))
        )}
      </Card>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function eventColor(type: string): string {
  if (type.includes('fall') || type.includes('impact')) return colors.danger;
  if (type.includes('shake'))  return colors.warning;
  if (type.includes('audio'))  return '#A855F7';
  if (type.includes('sos'))    return '#EF4444';
  if (type.includes('gps'))    return colors.primary;
  if (type.includes('checkin')) return colors.safe;
  return colors.muted;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.lg, marginBottom: spacing.md },
  backBtn:   { flexDirection: 'row', alignItems: 'center' },
  backText:  { ...typography.bodySmall, color: colors.textSecondary, marginLeft: 2 },
  title:     { ...typography.heading, color: colors.text },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  toggleText:{ fontSize: 12, fontFamily: 'Manrope_700Bold' },
  pills:     { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  meta:      { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  gpsVal:    { ...typography.subheading, color: colors.text, marginBottom: spacing.md },
  gpsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gpsItem:   { width: '45%' },
  gpsLbl:    { ...typography.caption, color: colors.muted },
  gpsNum:    { ...typography.body,    color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  rowBetween:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginTop: spacing.sm },
  meshBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  meshBtnText: { fontSize: 12, color: '#fff', fontFamily: 'Manrope_700Bold' },
  meshStats: { alignItems: 'flex-end' },
  peerRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  peerName:  { flex: 1, ...typography.bodySmall, color: colors.text },
  peerRssi:  { ...typography.caption, color: colors.muted },
  peerRelay: { ...typography.caption, color: colors.warning, fontFamily: 'Manrope_700Bold' },
  meshSosBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.lg, backgroundColor: colors.danger, borderRadius: borderRadius.md, paddingVertical: 12 },
  meshSosBtnText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  evtRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  evtDot:    { width: 8, height: 8, borderRadius: 4 },
  evtInfo:   { flex: 1 },
  evtType:   { ...typography.bodySmall, color: colors.text, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  evtTime:   { ...typography.caption, color: colors.muted },
  refreshBtn:{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md },
  refreshText:{ ...typography.caption, color: colors.primary },
});