import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
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
  preview: string;
  why: string;
  denied: string;
  later: string;
}> = [
  {
    kind: 'location', icon: 'location', iconColor: '#2563EB', title: 'Location',
    preview: 'Live tracking  ·  • You  →  Trusted contacts',
    why: 'Abhaya uses your location to share a live safety link and send accurate coordinates during an SOS.',
    denied: 'Live tracking and location-based emergency messages will be unavailable until you allow it.',
    later: 'Open Settings → Abhaya → Location and choose While Using or Always.',
  },
  {
    kind: 'microphone', icon: 'mic', iconColor: '#7C3AED', title: 'Microphone',
    preview: 'Listening for your chosen safety keyword',
    why: 'Keyword detection can trigger the countdown when reaching for your phone is difficult.',
    denied: 'Keyword detection will stay off. You can still use the on-screen safety action.',
    later: 'Open Settings → Abhaya → Microphone and turn access on.',
  },
  {
    kind: 'notifications', icon: 'notifications', iconColor: '#D97706', title: 'Notifications',
    preview: 'Safety check in 5s  ·  I’m Safe',
    why: 'Notifications keep countdowns and emergency updates available when the app is in the background.',
    denied: 'You may miss countdown and emergency updates while Abhaya is not open.',
    later: 'Open Settings → Abhaya → Notifications and allow alerts.',
  },
  {
    kind: 'background', icon: 'phone-portrait', iconColor: '#059669', title: 'Background service',
    preview: 'Screen off  ·  Safety tracking active',
    why: 'Background access helps continued safety tracking and pending SOS handling when the screen is off.',
    denied: 'Tracking pauses more easily in the background and Android may limit SOS continuation.',
    later: 'Open Settings → Abhaya → Location → Allow all the time, and permit battery use in the background.',
  },
];

export default function PermissionExplainerScreen({ onComplete }: { onComplete: () => void }) {
  const [state, setState] = useState<PermissionState>(INITIAL_STATE);
  const [busy, setBusy] = useState<PermissionKind | null>(null);

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

  const requestPermission = useCallback(async (kind: PermissionKind) => {
    setBusy(kind);
    try {
      if (kind === 'location') {
        await Location.requestForegroundPermissionsAsync();
      } else if (kind === 'background') {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (foreground.status !== 'granted') await Location.requestForegroundPermissionsAsync();
        if (Platform.OS === 'android' || Platform.OS === 'ios') await Location.requestBackgroundPermissionsAsync();
      } else if (kind === 'notifications') {
        await requestSOSNotificationPermissions();
        await setupSOSNotificationCategories();
      } else if (kind === 'microphone') {
        if (Platform.OS === 'android') {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        } else {
          await Audio.requestPermissionsAsync();
        }
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const allChecked = useMemo(() => Object.values(state).every(Boolean), [state]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.logoBadge}><Ionicons name="shield-checkmark" size={18} color={colors.primary} /><Text style={styles.logo}>Abhaya</Text></View>
        <Text style={styles.title}>Set up safety, your way</Text>
        <Text style={styles.subtitle}>We’ll explain each permission before asking. Choose what feels right now; you can change it later.</Text>
      </View>

      {permissionCopy.map((item) => {
        const granted = state[item.kind];
        return (
          <View key={item.kind} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrap, { backgroundColor: item.iconColor + '18' }]}>
                {item.kind === 'background' ? <MaterialCommunityIcons name="cellphone-link" size={22} color={item.iconColor} /> : <Ionicons name={item.icon as any} size={22} color={item.iconColor} />}
              </View>
              <View style={styles.cardHeading}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.preview}>{item.preview}</Text></View>
              <View style={[styles.statusPill, granted ? styles.grantedPill : styles.pendingPill]}><Text style={[styles.statusText, granted ? styles.grantedText : styles.pendingText]}>{granted ? 'Allowed' : 'Not set'}</Text></View>
            </View>
            <View style={styles.previewBox}><Text style={styles.previewBoxText}>{item.preview}</Text></View>
            <Text style={styles.label}>Why Abhaya needs this</Text><Text style={styles.body}>{item.why}</Text>
            <Text style={styles.label}>What happens if you deny it</Text><Text style={styles.body}>{item.denied}</Text>
            <Text style={styles.label}>How to enable it later</Text><Text style={styles.body}>{item.later}</Text>
            <TouchableOpacity style={[styles.action, granted && styles.actionSecondary]} onPress={() => granted ? Linking.openSettings() : requestPermission(item.kind)} disabled={busy !== null}>
              {busy === item.kind ? <ActivityIndicator size="small" color={granted ? colors.primary : '#fff'} /> : <Text style={[styles.actionText, granted && styles.actionSecondaryText]}>{granted ? 'Review in Settings' : 'Allow & continue'}</Text>}
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity style={[styles.continueButton, allChecked && styles.continueReady]} onPress={onComplete}>
        <Text style={styles.continueText}>{allChecked ? 'Continue to Abhaya' : 'Continue with selected permissions'}</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.disclaimer}>Permissions are optional. Abhaya cannot bypass Android or iOS restrictions, and denied permissions may limit safety features.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  logoBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.lg },
  logo: { ...typography.subheading, color: colors.text },
  title: { ...typography.title, color: colors.text, textAlign: 'center', fontSize: 26 },
  subtitle: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, shadowColor: '#12332D', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardHeading: { flex: 1 },
  cardTitle: { ...typography.subheading, color: colors.text },
  preview: { ...typography.caption, color: colors.muted, marginTop: 3 },
  statusPill: { borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 5 },
  grantedPill: { backgroundColor: colors.primaryLight }, pendingPill: { backgroundColor: '#F3F4F6' },
  statusText: { ...typography.caption, fontFamily: 'Manrope_700Bold' }, grantedText: { color: colors.primaryDark }, pendingText: { color: colors.muted },
  previewBox: { backgroundColor: colors.card, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.lg, marginBottom: spacing.md },
  previewBoxText: { ...typography.bodySmall, color: colors.text, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  label: { ...typography.caption, color: colors.text, fontFamily: 'Manrope_700Bold', marginTop: spacing.sm, marginBottom: 2 },
  body: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 18 },
  action: { minHeight: 42, borderRadius: borderRadius.md, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  actionText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_700Bold' },
  actionSecondary: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  actionSecondaryText: { color: colors.primaryDark },
  continueButton: { minHeight: 52, borderRadius: borderRadius.md, backgroundColor: colors.primaryDark, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  continueReady: { backgroundColor: colors.primary },
  continueText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_700Bold' },
  disclaimer: { ...typography.caption, color: colors.muted, textAlign: 'center', lineHeight: 17, marginTop: spacing.md },
});
