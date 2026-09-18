import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendPoliceSOS } from './policeSOS';

const PENDING_SOS_KEY = 'Abhaya_pending_background_sos';

export type PendingBackgroundSOS = {
  userName: string;
  userPhone: string;
  reason: string;
  deadline: number;
  createdAt: number;
};

export async function savePendingBackgroundSOS(payload: PendingBackgroundSOS): Promise<void> {
  await AsyncStorage.setItem(PENDING_SOS_KEY, JSON.stringify(payload));
}

export async function clearPendingBackgroundSOS(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_SOS_KEY);
}

export async function getPendingBackgroundSOS(): Promise<PendingBackgroundSOS | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SOS_KEY);
    return raw ? (JSON.parse(raw) as PendingBackgroundSOS) : null;
  } catch {
    return null;
  }
}

/**
 * Called by the Expo background-location task. If Android suspended the JS
 * countdown before it expired, the next location event completes the SOS.
 * The record is removed before the network request to avoid repeated sends.
 */
export async function firePendingBackgroundSOSIfDue(
  latitude: number,
  longitude: number,
): Promise<boolean> {
  const pending = await getPendingBackgroundSOS();
  if (!pending || pending.deadline > Date.now()) return false;

  await clearPendingBackgroundSOS();
  try {
    await sendPoliceSOS({
      userName: pending.userName,
      userPhone: pending.userPhone,
      lat: latitude,
      lng: longitude,
      reason: pending.reason,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn('[BackgroundSOS] Escalation failed:', error);
  }
  return true;
}
