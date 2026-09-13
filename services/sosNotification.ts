// Manages local notifications for background SOS.
// Works alongside the in-app modal (which is shown when app is in foreground).
// In background: shows a high-priority sticky notification with a Cancel button.
// ─────────────────────────────────────────────────────────────────────────────

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SOS_CANCEL_ACTION_ID      = 'SOS_CANCEL';
export const SOS_CATEGORY_ID           = 'SOS_ALERT';
export const SOS_COUNTDOWN_NOTIF_ID    = 'sos_countdown';
export const SOS_CHECKIN_NOTIF_ID      = 'sos_checkin_expired';
export const SOS_CHECKIN_CATEGORY_ID   = 'CHECKIN_ALERT';
export const CHECKIN_ARRIVED_ACTION_ID = 'CHECKIN_ARRIVED';

// ── Foreground handler ────────────────────────────────────────────────────────
// In foreground we show our own modal UI — suppress the banner.
// In background this handler doesn't run, so OS shows the notification.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification.request.content.data?.type as string | undefined;
    // Never suppress checkin/sos fired notifications even in foreground
    if (type === 'checkin_expired' || type === 'sos_fired') {
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
    }
    // sos_countdown: we show our modal, so suppress the OS banner in foreground
    return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: true, shouldSetBadge: false };
  },
});

// ── Permission ────────────────────────────────────────────────────────────────
export async function requestSOSNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return status === 'granted';
  } catch {
    return false;
  }
}

// ── Category / action setup ───────────────────────────────────────────────────
export async function setupSOSNotificationCategories(): Promise<void> {
  try {
    // SOS countdown category — has "I'm Safe" cancel button
    await Notifications.setNotificationCategoryAsync(SOS_CATEGORY_ID, [
      {
        identifier: SOS_CANCEL_ACTION_ID,
        buttonTitle: "✅ I'm Safe — Cancel SOS",
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          opensAppToForeground: true,
        },
      },
    ]);

    // Check-in expiry category — has "Arrived Safely" button
    await Notifications.setNotificationCategoryAsync(SOS_CHECKIN_CATEGORY_ID, [
      {
        identifier: CHECKIN_ARRIVED_ACTION_ID,
        buttonTitle: '✅ I Arrived Safely',
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          opensAppToForeground: true,
        },
      },
      {
        identifier: SOS_CANCEL_ACTION_ID,
        buttonTitle: '🚨 I Need Help — Send SOS',
        options: {
          isDestructive: true,
          isAuthenticationRequired: false,
          opensAppToForeground: true,
        },
      },
    ]);
  } catch (err) {
    console.warn('[SOSNotif] Category setup failed:', err);
  }
}

// ── SOS countdown notification (shown in background during 5s countdown) ──────
export async function showSOSCountdownNotification(
  reason: string,
  secondsLeft: number,
): Promise<void> {
  // Dismiss any previous one first
  try { await Notifications.dismissNotificationAsync(SOS_COUNTDOWN_NOTIF_ID); } catch {}

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: SOS_COUNTDOWN_NOTIF_ID,
      content: {
        title: `🚨 SOS Alert in ${secondsLeft}s`,
        body: `${reason}\n\nPress "I'm Safe" to cancel — police & contacts will be alerted automatically.`,
        categoryIdentifier: SOS_CATEGORY_ID,
        color: '#EF4444',
        sound: true,
        vibrate: [0, 400, 200, 400],
        // Android-specific sticky notification (user must act)
        ...(Platform.OS === 'android'
          ? { autoDismiss: false, sticky: true, priority: 'max' }
          : {}),
        data: { type: 'sos_countdown', reason, secondsLeft },
      },
      trigger: null, // fire immediately
    });
  } catch (err) {
    console.warn('[SOSNotif] showSOSCountdownNotification failed:', err);
  }
}

export async function dismissSOSCountdownNotification(): Promise<void> {
  try { await Notifications.dismissNotificationAsync(SOS_COUNTDOWN_NOTIF_ID); } catch {}
  try { await Notifications.cancelScheduledNotificationAsync(SOS_COUNTDOWN_NOTIF_ID); } catch {}
}

// ── SOS fired confirmation notification ───────────────────────────────────────
export async function showSOSFiredNotification(params: {
  stationName: string | null;
  contactsSent: number;
}): Promise<void> {
  const parts = [
    params.stationName ? `Police: ${params.stationName}` : 'Police alerted',
    params.contactsSent > 0 ? `${params.contactsSent} contact(s) notified` : '',
  ].filter(Boolean);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚨 SOS Sent — Help Is Coming',
        body: parts.join(' · '),
        color: '#EF4444',
        sound: true,
        data: { type: 'sos_fired' },
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[SOSNotif] showSOSFiredNotification failed:', err);
  }
}

// ── Check-in expiry notification (scheduled at check-in start) ────────────────
export async function scheduleCheckinExpiryNotification(
  destinationName: string,
  etaTimestamp: number, // unix ms when ETA expires
): Promise<void> {
  // Cancel any existing first
  await cancelCheckinExpiryNotification();

  const secsFromNow = Math.max(5, Math.round((etaTimestamp - Date.now()) / 1000));

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: SOS_CHECKIN_NOTIF_ID,
      content: {
        title: '⏰ You\'re Late on Your Check-In!',
        body: `You haven't confirmed arrival at "${destinationName}". Reply or SOS will fire in 60s.`,
        categoryIdentifier: SOS_CHECKIN_CATEGORY_ID,
        color: '#F59E0B',
        sound: true,
        vibrate: [0, 500, 200, 500, 200, 500],
        ...(Platform.OS === 'android' ? { priority: 'max', autoDismiss: false } : {}),
        data: {
          type: 'checkin_expired',
          destination: destinationName,
          etaTimestamp,
        },
      },
      trigger: { seconds: secsFromNow } as any,
    });
    console.log(`[SOSNotif] Check-in expiry scheduled in ${secsFromNow}s for "${destinationName}"`);
  } catch (err) {
    console.warn('[SOSNotif] scheduleCheckinExpiryNotification failed:', err);
  }
}

export async function cancelCheckinExpiryNotification(): Promise<void> {
  try { await Notifications.cancelScheduledNotificationAsync(SOS_CHECKIN_NOTIF_ID); } catch {}
  try { await Notifications.dismissNotificationAsync(SOS_CHECKIN_NOTIF_ID); } catch {}
}