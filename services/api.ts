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
  const expoHostBaseUrl = getExpoHostBaseUrl();

  const platformDefaults =
    Platform.OS === 'android'
      ? ['http://10.191.223.47:4000', 'http://localhost:4000']
      : ['http://localhost:4000'];

  const candidates = [
    EXPO_PUBLIC_API_BASE_URL,
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
        const message = await response.text();
        throw new ApiHttpError(response.status, message || `Request failed: ${response.status}`);
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

export async function getStoredUserPhone() {
  const dataString = await AsyncStorage.getItem('saathiUserData');
  if (!dataString) {
    return null;
  }

  const data = JSON.parse(dataString) as { phone?: string };
  return data.phone ?? null;
}

export async function getStoredUserData() {
  const dataString = await AsyncStorage.getItem('saathiUserData');
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

/**
 * Manually set the backend IP address. 
 * Use this if automatic detection fails.
 * Example: setManualBackendIp('192.168.1.5')
 */
export async function setManualBackendIp(ip: string) {
  const baseUrl = ip.startsWith('http') ? ip : `http://${ip}:4000`;
  await AsyncStorage.setItem('saathi_api_base', baseUrl);
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
  await AsyncStorage.removeItem('saathiUserData');
  await AsyncStorage.removeItem('saathi_emergency_contacts');
}
