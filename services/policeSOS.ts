import { getApiBaseUrlCandidates } from './api';

export type PoliceStation = {
  name: string;
  phone: string;
  rawPhone: string | null;
  distance: number;
  lat: number;
  lng: number;
  osmId: number | null;
};

export type ContactSMSResult = {
  name: string;
  phone: string;
  sent: boolean;
  twilioSid: string | null;
  error: string | null;
};

export type PoliceSMSResult = {
  sent: boolean;
  station: PoliceStation | null;
  errorReason: string | null;
  message: string;
  twilioSid: string | null;
  contactResults: ContactSMSResult[];
};

function buildLocalFallbackMessage(params: {
  userPhone: string;
  lat: number;
  lng: number;
  timestamp: number;
}): string {
  const time = new Date(params.timestamp).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return [
    'EMERGENCY SOS ALERT',
    '---',
    `Phone  : ${params.userPhone}`,
    `Time   : ${time} IST`,
    `GPS    : ${params.lat.toFixed(6)}, ${params.lng.toFixed(6)}`,
    '---',
  ].join('\n');
}

async function postSOSAlert(baseUrl: string, payload: {
  userPhone: string;
  lat: number;
  lng: number;
  reason: string;
  timestamp: number;
}): Promise<PoliceSMSResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${baseUrl}/api/sos/alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `SOS API failed with status ${response.status}`);
    }

    return (await response.json()) as PoliceSMSResult;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendPoliceSOS(params: {
  userName: string;
  userPhone: string;
  lat: number;
  lng: number;
  reason: string;
  timestamp?: number;
}): Promise<PoliceSMSResult> {
  const timestamp = params.timestamp ?? Date.now();
  const payload = {
    userPhone: params.userPhone,
    lat: params.lat,
    lng: params.lng,
    reason: params.reason,
    timestamp,
  };

  const baseUrls = getApiBaseUrlCandidates();
  let lastError: string | null = null;

  for (const baseUrl of baseUrls) {
    try {
      return await postSOSAlert(baseUrl, payload);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    sent: false,
    station: null,
    errorReason: lastError ?? 'Unable to reach backend SOS endpoint',
    message: buildLocalFallbackMessage({
      userPhone: params.userPhone,
      lat: params.lat,
      lng: params.lng,
      timestamp,
    }),
    twilioSid: null,
    contactResults: [],
  };
}
