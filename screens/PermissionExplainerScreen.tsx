import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Dimensions,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';

import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, typography } from '../theme';
import {
  requestSOSNotificationPermissions,
  setupSOSNotificationCategories,
} from '../services/sosNotification';

export const PERMISSIONS_ONBOARDING_KEY = 'AbhayaPermissionsExplainerComplete';

type PermissionKind = 'location' | 'microphone' | 'notifications' | 'background';
type PermissionState = Record<PermissionKind, boolean>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const INITIAL_STATE: PermissionState = {
  location: false,
  microphone: false,
  notifications: false,
  background: false,
};

const permissionCopy: Array<{
  kind: PermissionKind;
  icon: string;
  iconColor: string;
  title: string;
  stepLabel: string;
  stepTitle: string;
  description: string;
  shortReason: string;
  later: string;
}> = [
    {
      kind: 'location',
      icon: 'location',
      iconColor: colors.primary,
      title: 'Location',
      stepLabel: '01  •  LOCATION',
      stepTitle: 'Know where you are.',
      description: 'Share your location when an SOS is triggered.',
      shortReason: 'Live location helps trusted people reach you faster.',
      later: 'You can change this anytime in Settings.',
    },
    {
      kind: 'microphone',
      icon: 'mic',
      iconColor: colors.primary,
      title: 'Microphone',
      stepLabel: '02  •  VOICE SAFETY',
      stepTitle: 'Let your voice help.',
      description: 'Use keyword detection when touching your phone is difficult.',
      shortReason: 'A voice trigger gives you another way to start safety actions.',
      later: 'You can enable this later from Settings.',
    },
    {
      kind: 'notifications',
      icon: 'notifications',
      iconColor: colors.primary,
      title: 'Notifications',
      stepLabel: '03  •  ALERTS',
      stepTitle: 'Stay in the loop.',
      description: 'Receive SOS updates, countdowns and important safety alerts.',
      shortReason: 'Critical updates can still reach you when Abhaya is in the background.',
      later: 'You can change notification access later.',
    },
    {
      kind: 'background',
      icon: 'shield-check',
      iconColor: colors.primary,
      title: 'Background service',
      stepLabel: '04  •  ALWAYS READY',
      stepTitle: 'Keep Abhaya ready.',
      description: 'Allow safety handling to continue when the screen is off.',
      shortReason: 'Background access helps keep pending safety actions running.',
      later: 'You can change background access later in Settings.',
    },
  ];

export default function PermissionExplainerScreen({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<PermissionState>(INITIAL_STATE);
  const [busy, setBusy] = useState(false);

  const current = permissionCopy[currentIndex];
  const isLast = currentIndex === permissionCopy.length - 1;
  const granted = state[current.kind];

  const progress = useMemo(
    () => ((currentIndex + 1) / permissionCopy.length) * 100,
    [currentIndex],
  );

  const refresh = useCallback(async () => {
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();
      const notifications = await Notifications.getPermissionsAsync();

      const microphone =
        Platform.OS === 'android'
          ? {
            status: (
              await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
              )
            )
              ? 'granted'
              : 'denied',
          }
          : await Audio.getPermissionsAsync();

      setState({
        location: foreground.status === 'granted',
        background: background.status === 'granted',
        notifications: notifications.status === 'granted',
        microphone: microphone.status === 'granted',
      });
    } catch {
      // Keep the last known permission state if the check fails.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const goNext = useCallback(() => {
    if (isLast) {
      onComplete();
      return;
    }
    setCurrentIndex(index => index + 1);
  }, [isLast, onComplete]);

  const requestCurrentPermission = useCallback(async () => {
    setBusy(true);

    try {
      if (current.kind === 'location') {
        await Location.requestForegroundPermissionsAsync();
      } else if (current.kind === 'background') {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (foreground.status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
        await Location.requestBackgroundPermissionsAsync();
      } else if (current.kind === 'notifications') {
        await requestSOSNotificationPermissions();
        await setupSOSNotificationCategories();
      } else if (current.kind === 'microphone') {
        if (Platform.OS === 'android') {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          );
        } else {
          await Audio.requestPermissionsAsync();
        }
      }

      await refresh();
      goNext();
    } finally {
      setBusy(false);
    }
  }, [current.kind, goNext, refresh]);

  const skipCurrent = useCallback(() => {
    if (isLast) {
      onComplete();
      return;
    }
    setCurrentIndex(index => index + 1);
  }, [isLast, onComplete]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.decorTopRight} />
        <View style={styles.decorBottomLeft} />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Image
                source={require('../assets/icon.png')}
                style={styles.imageIcon}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brand}>ABHAYA</Text>
          </View>

          <TouchableOpacity
            onPress={skipCurrent}
            disabled={busy}
            activeOpacity={0.7}
            style={styles.skip}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {String(currentIndex + 1).padStart(2, '0')}/04
          </Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.stepLabel}>{current.stepLabel}</Text>
          <Text style={styles.title}>{current.stepTitle}</Text>
          <Text style={styles.description}>{current.description}</Text>
        </View>

        <View style={styles.mainCard}>
          <View style={styles.cardTop}>
            <View>
              <Text style={styles.cardEyebrow}>ABHAYA SAFETY</Text>
              <Text style={styles.cardTitle}>
                {granted ? 'Ready to protect.' : 'Built for the moment.'}
              </Text>
            </View>

            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: granted
                      ? colors.logoGreen
                      : colors.warning,
                  },
                ]}
              />
              <Text style={styles.statusText}>
                {granted ? 'ENABLED' : 'SETUP'}
              </Text>
            </View>
          </View>

          <View style={styles.signal}>
            <View style={styles.signalOuter} />
            <View style={styles.signalMiddle} />
            <View style={styles.signalInner}>
              {current.kind === 'location' ? (
                <Ionicons name="location" size={32} color="#fff" />
              ) : current.kind === 'microphone' ? (
                <Ionicons name="mic" size={32} color="#fff" />
              ) : current.kind === 'notifications' ? (
                <Ionicons name="notifications" size={32} color="#fff" />
              ) : (
                <MaterialCommunityIcons
                  name="shield-check"
                  size={34}
                  color="#fff"
                />
              )}
            </View>
          </View>

          <View style={styles.quickRow}>
            <QuickStat icon="shield-checkmark" label="Protected" />
            <View style={styles.quickDivider} />
            <QuickStat
              icon={current.kind === 'location' ? 'navigate' : current.icon}
              label={
                current.kind === 'location'
                  ? 'Live'
                  : current.kind === 'microphone'
                    ? 'Voice'
                    : current.kind === 'notifications'
                      ? 'Alerts'
                      : 'Ready'
              }
            />
            <View style={styles.quickDivider} />
            <QuickStat icon="people" label="Trusted" />
          </View>
        </View>

        <View style={styles.whyCard}>
          <View style={styles.whyIcon}>
            <Ionicons
              name="information-circle-outline"
              size={19}
              color={colors.primaryDark}
            />
          </View>
          <View style={styles.whyCopy}>
            <Text style={styles.whyTitle}>Why this matters</Text>
            <Text style={styles.whyText}>{current.shortReason}</Text>
          </View>
        </View>

        <View style={styles.controlRow}>
          <Ionicons
            name="settings-outline"
            size={16}
            color={colors.primaryDark}
          />
          <Text style={styles.controlText}>{current.later}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {permissionCopy.map((item, index) => (
            <View
              key={item.kind}
              style={[
                styles.dot,
                index === currentIndex && styles.dotActive,
                state[item.kind] &&
                index !== currentIndex &&
                styles.dotDone,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={granted ? goNext : requestCurrentPermission}
          disabled={busy}
          activeOpacity={0.88}
          style={[
            styles.primaryButton,
            granted && styles.primaryButtonGranted,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.primaryText}>
                {granted
                  ? isLast
                    ? 'Finish setup'
                    : 'Continue'
                  : `Allow ${current.title}`}
              </Text>
              <View style={styles.buttonArrow}>
                <Ionicons
                  name="arrow-forward"
                  size={15}
                  color={colors.primaryDark}
                />
              </View>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          You stay in control. Change permissions anytime.
        </Text>
      </View>
    </View>
  );
}

function QuickStat({
  icon,
  label,
}: {
  icon: string;
  label: string;
}) {
  return (
    <View style={styles.quickStat}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon as any} size={14} color={colors.logoMint} />
      </View>
      <Text style={styles.quickText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  imageIcon: {
    width: 46,  
    height: 46, 
   
  },
  scrollContent: {
    minHeight: Math.max(SCREEN_HEIGHT - 90, 760),
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 155,
  },

  decorTopRight: {
    position: 'absolute',
    top: -100,
    right: -90,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: colors.primaryLight,
    opacity: 0.24,
  },

  decorBottomLeft: {
    position: 'absolute',
    bottom: 80,
    left: -130,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#D7F5E8',
    opacity: 0.46,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4F6EE',
    borderWidth: 1,
    borderColor: '#CDEBDD',
  },

  brand: {
    ...typography.bodySmall,
    color: colors.text,
    fontSize: 13,
    letterSpacing: 2.6,
    fontFamily: 'Manrope_700Bold',
  },

  skip: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  skipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontFamily: 'Manrope_600SemiBold',
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 17,
  },

  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.inactive,
  },

  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },

  progressText: {
    ...typography.caption,
    color: colors.muted,
    fontFamily: 'Manrope_700Bold',
  },

  hero: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 22,
  },

  iconHalo: {
    width: 126,
    height: 126,
    borderRadius: 63,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(222, 248, 238, 0.68)',
  },

  iconCard: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#0B5E4A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },

  iconCheck: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },

  stepLabel: {
    ...typography.caption,
    color: colors.primaryDark,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 2,
    marginTop: 18,
  },

  title: {
    ...typography.title,
    color: colors.text,
    fontSize: 30,
    lineHeight: 35,
    textAlign: 'center',
    letterSpacing: -0.6,
    marginTop: 9,
  },

  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 310,
    marginTop: 8,
  },

  mainCard: {
    minHeight: 248,
    borderRadius: 28,
    padding: 20,
    overflow: 'hidden',
    backgroundColor: colors.logoDeep,
    shadowColor: colors.logoDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  cardEyebrow: {
    ...typography.caption,
    color: colors.logoMint,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1.7,
  },

  cardTitle: {
    ...typography.subheading,
    color: '#fff',
    fontSize: 18,
    marginTop: 5,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusText: {
    ...typography.caption,
    color: '#fff',
    fontSize: 9,
    letterSpacing: 0.7,
    fontFamily: 'Manrope_700Bold',
  },

  signal: {
    minHeight: 138,
    alignItems: 'center',
    justifyContent: 'center',
  },

  signalOuter: {
    position: 'absolute',
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 1,
    borderColor: 'rgba(186, 244, 222, 0.10)',
    backgroundColor: 'rgba(186, 244, 222, 0.06)',
  },

  signalMiddle: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 1,
    borderColor: 'rgba(186, 244, 222, 0.12)',
    backgroundColor: 'rgba(186, 244, 222, 0.07)',
  },

  signalInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },

  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  quickStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  quickIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(211, 246, 230, 0.10)',
  },

  quickText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.84)',
    fontFamily: 'Manrope_600SemiBold',
  },

  quickDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  whyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    marginTop: 12,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  whyIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F6F0',
  },

  whyCopy: {
    flex: 1,
  },

  whyTitle: {
    ...typography.bodySmall,
    color: colors.text,
    fontFamily: 'Manrope_700Bold',
    marginBottom: 3,
  },

  whyText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 11,
    paddingHorizontal: 8,
  },

  controlText: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'center',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 11,
    paddingBottom: Platform.OS === 'ios' ? 22 : 16,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(13,48,40,0.05)',
  },

  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 11,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.inactive,
  },

  dotActive: {
    width: 22,
    backgroundColor: colors.primaryDark,
  },

  dotDone: {
    backgroundColor: colors.primary,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 19,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primaryDark,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },

  primaryButtonGranted: {
    backgroundColor: colors.primary,
  },

  primaryText: {
    ...typography.body,
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },

  buttonArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D8F5E8',
  },

  footerNote: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
});