// Unified SOS countdown hook.
//
// FOREGROUND: Shows the in-app modal (5s countdown + cancel button).
// BACKGROUND: Shows a sticky notification with "I'm Safe" cancel button.
//             If the user taps the cancel action → countdown is cancelled.
//             If countdown expires → fires sendPoliceSOS() using the CURRENT
//             location (stored in a ref, not stale state closure).
//
// KEY FIX: userLocation is passed as a MutableRefObject so the setInterval
// closure always reads the latest value — this was the original bug causing
// SMS to silently skip when location state was stale.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';

import {
  requestSOSNotificationPermissions,
  setupSOSNotificationCategories,
  showSOSCountdownNotification,
  dismissSOSCountdownNotification,
  showSOSFiredNotification,
  SOS_CANCEL_ACTION_ID,
  CHECKIN_ARRIVED_ACTION_ID,
} from '../services/sosNotification';
import { logSensorEvent } from '../services/sensorDb';
import { sendPoliceSOS, PoliceSMSResult } from '../services/policeSOS';

const COUNTDOWN_SECS = 5;

export type SOSCountdownState = {
  visible:   boolean;
  countdown: number;
  reason:    string;
};

type SOSHookOptions = {
  userId:      string | null;
  userName:    string;
  /** Mutable ref — always holds latest GPS coords. Never use state here. */
  locationRef: React.MutableRefObject<{ latitude: number; longitude: number } | null>;
  onResult:    (result: PoliceSMSResult) => void;
  onLoading:   (v: boolean) => void;
  onShowBanner: () => void;
  /** Optional: called when check-in "arrived" notification action is tapped */
  onCheckinArrived?: () => void;
};

export function useSOSWithBackground(opts: SOSHookOptions) {
  const [sosState, setSOSState] = useState<SOSCountdownState>({
    visible: false, countdown: COUNTDOWN_SECS, reason: '',
  });

  // ── refs (used inside setInterval / AppState handlers to avoid stale closures) ──
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef       = useRef(false);    // prevents double-fire
  const activeRef      = useRef(false);    // is countdown currently running?
  const isFgRef        = useRef(AppState.currentState === 'active');
  const reasonRef      = useRef('');
  const countdownRef   = useRef(COUNTDOWN_SECS);

  // Stable references to callbacks so interval doesn't capture stale closures
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  // ── Setup: permissions + categories ──────────────────────────────────────
  useEffect(() => {
    requestSOSNotificationPermissions();
    setupSOSNotificationCategories();
  }, []);

  // ── Notification response listener ────────────────────────────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const dataType = resp.notification.request.content.data?.type as string | undefined;

      if (resp.actionIdentifier === SOS_CANCEL_ACTION_ID) {
        if (dataType === 'sos_countdown') {
          cancelSOS();
        } else if (dataType === 'checkin_expired') {
          // "I Need Help" was tapped on check-in expiry → fire SOS immediately
          const { locationRef: lr, userId, userName } = optsRef.current;
          const loc = lr.current;
          if (loc) {
            fireSOS('Check-in expired — SOS requested via notification', loc);
          }
        }
      } else if (resp.actionIdentifier === CHECKIN_ARRIVED_ACTION_ID) {
        optsRef.current.onCheckinArrived?.();
      } else if (
        resp.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
        dataType === 'sos_countdown'
      ) {
        // User tapped the notification body → brings app to foreground.
        // Dismiss the notification; the modal is already visible.
        dismissSOSCountdownNotification();
      }
    });
    return () => sub.remove();
  }, []);

  // ── AppState: switch between modal ↔ notification ─────────────────────────
  useEffect(() => {
    const handler = (nextState: AppStateStatus) => {
      const wasFg = isFgRef.current;
      isFgRef.current = nextState === 'active';

      if (!activeRef.current) return;

      if (!isFgRef.current && wasFg) {
        // App went to background mid-countdown → show sticky notification
        showSOSCountdownNotification(reasonRef.current, countdownRef.current);
      }
      if (isFgRef.current && !wasFg) {
        // App came back to foreground → dismiss notification (modal is visible)
        dismissSOSCountdownNotification();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, []);

  // ── Internal fire function ────────────────────────────────────────────────
  const fireSOS = useCallback(async (
    reason: string,
    loc: { latitude: number; longitude: number } | null,
  ) => {
    const { userId, userName, onResult, onLoading, onShowBanner } = optsRef.current;

    if (userId && loc) {
      logSensorEvent(userId, 'sos_triggered', { reason },
        loc.latitude, loc.longitude).catch(() => {});
    }

    onShowBanner();
    onLoading(true);

    try {
      const result = await sendPoliceSOS({
        userName,
        userPhone: userId ?? 'Unknown',
        lat: loc?.latitude ?? 0,
        lng: loc?.longitude ?? 0,
        reason,
        timestamp: Date.now(),
      });

      if (userId && loc) {
        logSensorEvent(userId, 'police_alerted',
          { smsSent: result.sent, station: result.station?.name ?? null },
          loc.latitude, loc.longitude).catch(() => {});
      }

      onResult(result);

      // If still in background, show a "sent" confirmation notification
      if (!isFgRef.current) {
        showSOSFiredNotification({
          stationName: result.station?.name ?? null,
          contactsSent: result.contactResults?.filter(c => c.sent).length ?? 0,
        });
      }
    } catch (err: any) {
      onResult({
        sent:          false,
        station:       null,
        errorReason:   err?.message ?? 'Unknown error',
        message:       '',
        twilioSid:     null,
        contactResults: [],
      });
    } finally {
      onLoading(false);
    }
  }, []);

  // ── PUBLIC: trigger SOS countdown ────────────────────────────────────────
  const triggerSOS = useCallback((reason: string) => {
    if (activeRef.current || firedRef.current) return;

    activeRef.current = true;
    reasonRef.current = reason;
    countdownRef.current = COUNTDOWN_SECS;
    setSOSState({ visible: true, countdown: COUNTDOWN_SECS, reason });

    // If app is already in background (edge case), show notification immediately
    if (!isFgRef.current) {
      showSOSCountdownNotification(reason, COUNTDOWN_SECS);
    }

    let cnt = COUNTDOWN_SECS;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(async () => {
      cnt -= 1;
      countdownRef.current = cnt;
      setSOSState(s => ({ ...s, countdown: cnt }));

      // Keep notification updated while in background
      if (!isFgRef.current && activeRef.current) {
        showSOSCountdownNotification(reasonRef.current, cnt);
      }

      if (cnt <= 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        activeRef.current = false;
        firedRef.current = true;
        setSOSState({ visible: false, countdown: COUNTDOWN_SECS, reason: '' });

        await dismissSOSCountdownNotification();

        // ★ KEY FIX: read location from ref (always fresh), NOT from stale closure
        const loc = optsRef.current.locationRef.current;
        await fireSOS(reason, loc);

        setTimeout(() => { firedRef.current = false; }, 6000);
      }
    }, 1000);
  }, [fireSOS]);

  // ── PUBLIC: cancel SOS ────────────────────────────────────────────────────
  const cancelSOS = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    activeRef.current = false;
    firedRef.current = false;
    setSOSState({ visible: false, countdown: COUNTDOWN_SECS, reason: '' });
    dismissSOSCountdownNotification();

    const { userId, locationRef } = optsRef.current;
    const loc = locationRef.current;
    if (userId) {
      logSensorEvent(userId, 'sos_cancelled', { reason: reasonRef.current },
        loc?.latitude ?? null, loc?.longitude ?? null).catch(() => {});
    }
  }, []);

  return { sosState, triggerSOS, cancelSOS };
}