import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../theme';
import { requestSOSNotificationPermissions, setupSOSNotificationCategories } from '../services/sosNotification';

export const PERMISSIONS_ONBOARDING_KEY = 'AbhayaPermissionsExplainerComplete';

type PermissionKind = 'location' | 'microphone' | 'notifications' | 'background';
type PermissionState = Record<PermissionKind, boolean>;

const INITIAL_STATE: PermissionState = { location: false, microphone: false, notifications: false, background: false };

const permissionCopy: Array<{
  kind: PermissionKind;
  icon: string;
  iconColor: string;
  title: string;
  stepTitle: string;
  preview: string;
  why: string;
  denied: string;
  later: string;
}> = [
  {
    kind: 'location', icon: 'location', iconColor: colors.primary, title: 'Location', stepTitle: 'Stay connected to your safe circle',
    preview: 'LIVE LOCATION  •  You  →  Trusted contacts',
    why: 'Abhaya uses your location to share a live safety link and send accurate coordinates during an SOS.',
    denied: 'Live tracking and location-based emergency messages will be unavailable until you allow it.',
    later: 'Settings → Abhaya → Location → While Using or Always',
  },
  {
    kind: 'microphone', icon: 'mic', iconColor: colors.logoTeal, title: 'Microphone', stepTitle: 'Let your voice be a safety signal',
    preview: 'KEYWORD DETECTION  •  Listening only when enabled',
    why: 'Keyword detection can trigger the countdown when reaching for your phone is difficult.',
    denied: 'Keyword detection will stay off. You can still use the on-screen safety action.',
    later: 'Settings → Abhaya → Microphone → Allow',
  },
  {
    kind: 'notifications', icon: 'notifications', iconColor: colors.warning, title: 'Notifications', stepTitle: 'Never miss a safety update',
    preview: 'SAFETY CHECK IN 5s  •  I’m Safe',
    why: 'Notifications keep countdowns and emergency updates available when the app is in the background.',
    denied: 'You may miss countdown and emergency updates while Abhaya is not open.',
    later: 'Settings → Abhaya → Notifications → Allow Alerts',
  },
  {
    kind: 'background', icon: 'phone-portrait', iconColor: colors.logoGreen, title: 'Background service', stepTitle: 'Keep protection active when the screen is off',
    preview: 'SCREEN OFF  •  SAFETY TRACKING ACTIVE',
    why: 'Background access helps continued safety tracking and pending SOS handling when the screen is off.',
    denied: 'Tracking pauses more easily in the background and Android may limit SOS continuation.',
    later: 'Settings → Abhaya → Location → Allow all the time',
  },
];

export default function PermissionExplainerScreen({ onComplete }: { onComplete: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<PermissionState>(INITIAL_STATE);
  const [busy, setBusy] = useState(false);
  const current = permissionCopy[currentIndex];
  const isLast = currentIndex === permissionCopy.length - 1;
  const granted = state[current.kind];

  const refresh = useCallback(async () => {
    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await Location.getBackgroundPermissionsAsync();
    const notifications = await Notifications.getPermissionsAsync();
    const microphone = Platform.OS === 'android'
      ? { status: (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) ? 'granted' : 'denied' }
      : await Audio.getPermissionsAsync();
    setState({
      location: foreground.status === 'granted',
      background: background.status === 'granted',
      notifications: notifications.status === 'granted',
      microphone: microphone.status === 'granted',
    });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const goNext = useCallback(() => {
    if (isLast) onComplete();
    else setCurrentIndex((index) => index + 1);
  }, [isLast, onComplete]);

  const requestCurrentPermission = useCallback(async () => {
    setBusy(true);
    try {
      if (current.kind === 'location') {
        await Location.requestForegroundPermissionsAsync();
      } else if (current.kind === 'background') {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (foreground.status !== 'granted') await Location.requestForegroundPermissionsAsync();
        await Location.requestBackgroundPermissionsAsync();
      } else if (current.kind === 'notifications') {
        await requestSOSNotificationPermissions();
        await setupSOSNotificationCategories();
      } else if (current.kind === 'microphone') {
        if (Platform.OS === 'android') await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        else await Audio.requestPermissionsAsync();
      }
      await refresh();
      goNext();
    } finally {
      setBusy(false);
    }
  }, [current.kind, goNext, refresh]);

  const skipCurrent = useCallback(() => {
    if (isLast) onComplete();
    else setCurrentIndex((index) => index + 1);
  }, [isLast, onComplete]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View style={styles.logoBadge}>
            <Ionicons name="shield-checkmark" size={17} color={colors.primary} />
            <Text style={styles.logo}>Abhaya</Text>
          </View>
          <Text style={styles.stepCount}>{currentIndex + 1} of {permissionCopy.length}</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((currentIndex + 1) / permissionCopy.length) * 100}%` }]} />
        </View>

        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: current.iconColor + '18' }]}>
            {current.kind === 'background'
              ? <MaterialCommunityIcons name="cellphone-link" size={40} color={current.iconColor} />
              : <Ionicons name={current.icon as any} size={40} color={current.iconColor} />}
          </View>
          <Text style={styles.eyebrow}>SAFETY SETUP</Text>
          <Text style={styles.title}>{current.stepTitle}</Text>
          <Text style={styles.subtitle}>Before we continue, here’s how {current.title.toLowerCase()} supports your safety.</Text>
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewHeader}><View style={styles.liveDot} /><Text style={styles.previewLabel}>ABHAYA PREVIEW</Text></View>
          <Text style={styles.previewText}>{current.preview}</Text>
          <View style={styles.previewLine}><View style={styles.previewLineFill} /></View>
        </View>

        <View style={styles.infoCard}>
          <InfoRow icon="help-circle-outline" label="Why Abhaya needs this" text={current.why} />
          <View style={styles.divider} />
          <InfoRow icon="close-circle-outline" label="If you deny it" text={current.denied} />
          <View style={styles.divider} />
          <InfoRow icon="settings-outline" label="Enable it later" text={current.later} />
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, granted ? styles.statusGranted : styles.statusPending]}>
            <Ionicons name={granted ? 'checkmark' : 'ellipse-outline'} size={15} color={granted ? colors.primaryDark : colors.muted} />
          </View>
          <Text style={styles.statusText}>{granted ? `${current.title} is enabled` : `${current.title} is not enabled yet`}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.primaryButton, granted && styles.primaryButtonGranted]} onPress={granted ? goNext : requestCurrentPermission} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <><Text style={styles.primaryText}>{granted ? (isLast ? 'Finish setup' : 'Continue') : 'Allow permission'}</Text><Ionicons name="arrow-forward" size={18} color="#fff" /></>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={skipCurrent} disabled={busy}>
          <Text style={styles.skipText}>{isLast ? 'Skip for now' : 'Not now'}</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>You stay in control. Permissions can be changed anytime in Settings.</Text>
      </View>
    </View>
  );
}

function InfoRow({ icon, label, text }: { icon: string; label: string; text: string }) {
  return <View style={styles.infoRow}><Ionicons name={icon as any} size={18} color={colors.primaryDark} /><View style={styles.infoCopy}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoText}>{text}</Text></View></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  logo: { ...typography.subheading, color: colors.text },
  stepCount: { ...typography.caption, color: colors.textSecondary, fontFamily: 'Manrope_700Bold' },
  progressTrack: { height: 5, backgroundColor: colors.inactive, borderRadius: borderRadius.full, marginTop: spacing.lg, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: borderRadius.full },
  hero: { alignItems: 'center', paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  heroIcon: { width: 88, height: 88, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  eyebrow: { ...typography.caption, color: colors.primaryDark, fontFamily: 'Manrope_700Bold', letterSpacing: 1.4 },
  title: { ...typography.title, color: colors.text, fontSize: 25, lineHeight: 31, textAlign: 'center', marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginTop: spacing.sm, maxWidth: 330 },
  previewCard: { backgroundColor: colors.logoDeep, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, shadowColor: colors.logoDeep, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 4 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.logoMint },
  previewLabel: { ...typography.caption, color: colors.logoMint, fontFamily: 'Manrope_700Bold', letterSpacing: 1 },
  previewText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_600SemiBold', marginTop: spacing.lg },
  previewLine: { height: 3, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2, marginTop: spacing.lg },
  previewLineFill: { width: '62%', height: 3, borderRadius: 2, backgroundColor: colors.logoMint },
  infoCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  infoRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg },
  infoCopy: { flex: 1 },
  infoLabel: { ...typography.bodySmall, color: colors.text, fontFamily: 'Manrope_700Bold', marginBottom: 3 },
  infoText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.border },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  statusIcon: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  statusGranted: { backgroundColor: colors.primaryLight },
  statusPending: { backgroundColor: colors.card },
  statusText: { ...typography.bodySmall, color: colors.textSecondary },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, backgroundColor: colors.bg },
  primaryButton: { minHeight: 52, borderRadius: borderRadius.md, backgroundColor: colors.primaryDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  primaryButtonGranted: { backgroundColor: colors.primary },
  primaryText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_700Bold' },
  skipButton: { alignItems: 'center', paddingVertical: spacing.md },
  skipText: { ...typography.bodySmall, color: colors.textSecondary, fontFamily: 'Manrope_600SemiBold' },
  footerNote: { ...typography.caption, color: colors.muted, textAlign: 'center', lineHeight: 16 },
});
