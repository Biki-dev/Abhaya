import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const EXPO_PUBLIC_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const EXPO_PUBLIC_LAN_API_BASE_URL = process.env.EXPO_PUBLIC_LAN_API_BASE_URL?.trim();

function getExpoHostBaseUrl() {
  const anyConstants = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
    manifest?: { debuggerHost?: string };
  };

  const hostUri =
    anyConstants.expoConfig?.hostUri ??
    anyConstants.manifest2?.extra?.expoClient?.hostUri ??
    anyConstants.manifest?.debuggerHost;

  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : null;
}

export function getApiBaseUrlCandidates() {
  const PRODUCTION_URL = 'https://abhaya-backend.onrender.com';
  
  const expoHostBaseUrl = getExpoHostBaseUrl();

  const platformDefaults =
    Platform.OS === 'android'
      ? ['http://10.0.2.2:4000', 'http://localhost:4000']
      : ['http://localhost:4000'];

  const candidates = [
    EXPO_PUBLIC_API_BASE_URL,
    PRODUCTION_URL,
    EXPO_PUBLIC_LAN_API_BASE_URL,
    expoHostBaseUrl,
    ...platformDefaults,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

type UserPayload = {
  phone: string;
  name: string;
  email?: string;
};

export type UserProfile = {
  phone: string;
  name: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup: string;
  address: string;
  city: string;
  guardianName: string;
  guardianPhone: string;
  createdAt: string;
  updatedAt: string;
};

type UserProfileUpdate = Omit<UserProfile, 'createdAt' | 'updatedAt'>;

type CreateRoutePayload = {
  userPhone: string;
  destinationName: string;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  estimatedMinutes: number;
  startedAt: string;
};

export type RouteHistoryRecord = {
  id: number;
  destinationName: string;
  estimatedMinutes: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

class ApiHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getReadableApiError(raw: string, status: number) {
  try {
    const payload = JSON.parse(raw) as { error?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | string };
    if (typeof payload.error === 'string') return payload.error;
    if (payload.error?.fieldErrors) {
      const messages = Object.entries(payload.error.fieldErrors).flatMap(([field, fieldMessages]) =>
        fieldMessages.map((message) => `${field}: ${message}`)
      );
      if (messages.length) return messages.join('\n');
    }
    if (payload.error?.formErrors?.length) return payload.error.formErrors.join('\n');
  } catch {
    // Fall through for non-JSON server responses.
  }
  return raw || `Request failed (${status})`;
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrls = getApiBaseUrlCandidates();
  let lastError: unknown = null;

  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers ?? {}),
        },
        ...options,
      });

      if (!response.ok) {
        const raw = await response.text();
        throw new ApiHttpError(response.status, getReadableApiError(raw, response.status));
      }

      return response.json() as Promise<T>;
    } catch (error) {
      // If server responded (e.g., 400/404), do not mask with fallback network errors.
      if (error instanceof ApiHttpError) {
        throw error;
      }
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('Unable to reach backend API');
}

export async function upsertUser(payload: UserPayload) {
  return apiRequest('/api/users/upsert', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getUserProfile(phone: string) {
  return apiRequest<UserProfile>(`/api/users/${encodeURIComponent(phone)}`, { method: 'GET' });
}

export async function updateUserProfile(payload: UserProfileUpdate) {
  const local = await getStoredUserProfile();
  const next = { ...local, ...payload };
  await AsyncStorage.setItem('AbhayaUserData', JSON.stringify(next));
  const saved = await apiRequest<UserProfile>(`/api/users/${encodeURIComponent(payload.phone)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  await AsyncStorage.setItem('AbhayaUserData', JSON.stringify({ ...next, ...saved }));
  return saved;
}

export async function createRouteHistory(payload: CreateRoutePayload) {
  return apiRequest<{ id: number }>('/api/routes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function completeRouteHistory(routeId: number, status: 'COMPLETED' | 'CANCELLED') {
  return apiRequest(`/api/routes/${routeId}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      completedAt: new Date().toISOString(),
    }),
  });
}

export async function getUserRouteHistory(userPhone: string) {
  return apiRequest<RouteHistoryRecord[]>(`/api/users/${userPhone}/routes`, {
    method: 'GET',
  });
}

export type SubscriptionSnapshotPayload = {
  phone: string;
  revenueCatAppUserId: string;
  store: 'test_store';
  plan: 'free' | 'plus' | 'family';
  activeEntitlements: string[];
  purchasedProductIds: string[];
  requestDate?: string | null;
  originalPurchaseDate?: string | null;
};

/**
 * Stores purchase history for support/account history only. Never use this
 * response to decide whether a premium feature is available.
 */
export async function saveSubscriptionSnapshot(payload: SubscriptionSnapshotPayload) {
  return apiRequest<{ id: string; syncedAt: string }>('/api/subscriptions/snapshot', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getStoredUserPhone() {
  const dataString = await AsyncStorage.getItem('AbhayaUserData');
  if (!dataString) {
    return null;
  }

  const data = JSON.parse(dataString) as { phone?: string };
  return data.phone ?? null;
}

export async function getStoredUserData() {
  const dataString = await AsyncStorage.getItem('AbhayaUserData');
  if (!dataString) {
    return null;
  }

  const data = JSON.parse(dataString) as {
    phone?: string;
    name?: string;
    email?: string;
  };

  return {
    phone: data.phone ?? '',
    name: data.name ?? '',
    email: data.email ?? '',
  };
}

export async function getStoredUserProfile(): Promise<Partial<UserProfile> | null> {
  const dataString = await AsyncStorage.getItem('AbhayaUserData');
  if (!dataString) return null;
  return JSON.parse(dataString) as Partial<UserProfile>;
}

/**
 * Manually set the backend IP address. 
 * Use this if automatic detection fails.
 * Example: setManualBackendIp('192.168.1.5')
 */
export async function setManualBackendIp(ip: string) {
  const baseUrl = ip.startsWith('http') ? ip : `http://${ip}:4000`;
  await AsyncStorage.setItem('Abhaya_api_base', baseUrl);
  console.log('[API] Manual backend IP set to:', baseUrl);
}

export async function syncStoredUserWithBackend() {
  const userData = await getStoredUserData();
  if (!userData?.phone || !userData?.name) {
    return null;
  }

  return upsertUser({
    phone: userData.phone,
    name: userData.name,
    email: userData.email,
  });
}

export { API_BASE_URL };

export async function logoutUser(phone: string) {
  return apiRequest<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function clearLocalUserData() {
  await AsyncStorage.removeItem('AbhayaUserData');
  await AsyncStorage.removeItem('Abhaya_emergency_contacts');
}
