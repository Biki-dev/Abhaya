// services/policeSOS.ts
// ─────────────────────────────────────────────────────────────────────────────
// Triggered directly from the mobile app (no backend dependency).
// 1. Queries OpenStreetMap Overpass API → nearest police station
// 2. Sends SMS alert via Twilio REST API (direct HTTPS call from the app)
//    → to the nearest police station (if found)
//    → to ALL emergency contacts stored locally (offline-first)
// 3. Returns structured result so the UI can show station name & SMS status
//
// FIX: AbortSignal.timeout() is not available in React Native's Hermes/JSC
//      engine. Replaced with fetchWithTimeout() using AbortController +
//      setTimeout instead — works on all RN versions.
// ─────────────────────────────────────────────────────────────────────────────

import { getContacts } from './emergencyContacts';

// ── Twilio config ─────────────────────────────────────────────────────────────
// Add to your root .env file:
//   EXPO_PUBLIC_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   EXPO_PUBLIC_TWILIO_AUTH_TOKEN=your_auth_token
//   EXPO_PUBLIC_TWILIO_FROM_NUMBER=+1XXXXXXXXXX
const TWILIO_ACCOUNT_SID = process.env.EXPO_PUBLIC_TWILIO_ACCOUNT_SID ?? '';
const TWILIO_AUTH_TOKEN   = process.env.EXPO_PUBLIC_TWILIO_AUTH_TOKEN  ?? '';
const TWILIO_FROM_NUMBER  = process.env.EXPO_PUBLIC_TWILIO_FROM_NUMBER ?? '';

// Fallback when OSM has no phone tag for the found station
const FALLBACK_POLICE_NUMBER = '+917896390573'; // replace with India national emergency in prod

// ── Types ─────────────────────────────────────────────────────────────────────
export type PoliceStation = {
  name:     string;
  phone:    string;
  rawPhone: string | null;
  distance: number;
  lat:      number;
  lng:      number;
  osmId:    number | null;
};

export type ContactSMSResult = {
  name:      string;
  phone:     string;
  sent:      boolean;
  twilioSid: string | null;
  error:     string | null;
};

export type PoliceSMSResult = {
  sent:            boolean;
  station:         PoliceStation | null;
  errorReason:     string | null;
  message:         string;
  twilioSid:       string | null;
  /** Results for each emergency contact SMS */
  contactResults:  ContactSMSResult[];
};

// ─────────────────────────────────────────────────────────────────────────────
// fetchWithTimeout
// React Native's JS engine does NOT support AbortSignal.timeout().
// ─────────────────────────────────────────────────────────────────────────────
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timerId));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FIND NEAREST POLICE STATION via OpenStreetMap Overpass API
// ─────────────────────────────────────────────────────────────────────────────
export async function findNearestPoliceStation(
  lat: number,
  lng: number,
): Promise<PoliceStation | null> {
  for (const radiusM of [5000, 15000]) {
    const station = await queryOverpass(lat, lng, radiusM);
    if (station) return station;
  }
  return null;
}

async function queryOverpass(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<PoliceStation | null> {
  const query = `
[out:json][timeout:12];
(
  node["amenity"="police"](around:${radiusM},${lat},${lng});
  way["amenity"="police"](around:${radiusM},${lat},${lng});
);
out center 10;
  `.trim();

  try {
    const res = await fetchWithTimeout(
      'https://overpass-api.de/api/interpreter',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      },
      12_000,
    );

    if (!res.ok) {
      console.warn(`[policeSOS] Overpass HTTP ${res.status}`);
      return null;
    }

    type OSMElement = {
      id:      number;
      type:    'node' | 'way';
      lat?:    number;
      lon?:    number;
      center?: { lat: number; lon: number };
      tags?: {
        name?:            string;
        phone?:           string;
        'contact:phone'?: string;
        'phone:IN'?:      string;
      };
    };

    const data = (await res.json()) as { elements: OSMElement[] };
    if (!data.elements || data.elements.length === 0) return null;

    let best: OSMElement | null = null;
    let bestDist = Infinity;

    for (const el of data.elements) {
      const eLat = el.lat ?? el.center?.lat;
      const eLng = el.lon ?? el.center?.lon;
      if (eLat == null || eLng == null) continue;
      const d = haversineMetres(lat, lng, eLat, eLng);
      if (d < bestDist) { bestDist = d; best = el; }
    }

    if (!best) return null;

    const sLat = best.lat ?? best.center?.lat ?? lat;
    const sLng = best.lon ?? best.center?.lon ?? lng;

    const rawPhone =
      best.tags?.phone ??
      best.tags?.['contact:phone'] ??
      best.tags?.['phone:IN'] ??
      null;

    return {
      name:     best.tags?.name ?? 'Police Station',
      phone:    normalisePhone(rawPhone) ?? FALLBACK_POLICE_NUMBER,
      rawPhone,
      distance: Math.round(haversineMetres(lat, lng, sLat, sLng)),
      lat:      sLat,
      lng:      sLng,
      osmId:    best.id,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn(`[policeSOS] Overpass timed out at ${radiusM}m radius`);
    } else {
      console.warn('[policeSOS] Overpass error:', err);
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BUILD SMS MESSAGE — used for both police & emergency contacts
// ─────────────────────────────────────────────────────────────────────────────
export function buildPoliceMessage(params: {
  userName:  string;
  userPhone: string;
  lat:       number;
  lng:       number;
  reason:    string;
  timestamp: number;
}): string {
  const time = new Date(params.timestamp).toLocaleString('en-IN', {
    timeZone:  'Asia/Kolkata',
    day:       '2-digit',
    month:     'short',
    year:      'numeric',
    hour:      '2-digit',
    minute:    '2-digit',
    hour12:    true,
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

/** Slightly different copy for personal emergency contacts */
function buildContactMessage(params: {
  userName:  string;
  userPhone: string;
  lat:       number;
  lng:       number;
  reason:    string;
  timestamp: number;
  contactName: string;
}): string {
  const time = new Date(params.timestamp).toLocaleString('en-IN', {
    timeZone:  'Asia/Kolkata',
    day:       '2-digit',
    month:     'short',
    year:      'numeric',
    hour:      '2-digit',
    minute:    '2-digit',
    hour12:    true,
  });

  const mapsUrl = `https://maps.google.com/?q=${params.lat.toFixed(6)},${params.lng.toFixed(6)}`;

  return [
    'EMERGENCY SOS ALERT',
    '---',
    `Phone  : ${params.userPhone}`,
    `GPS    : ${params.lat.toFixed(6)}, ${params.lng.toFixed(6)}`,
    `Time   : ${time} IST`,
    '---',
    'Please help or call emergency services immediately.',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SEND SMS VIA TWILIO REST API
// ─────────────────────────────────────────────────────────────────────────────
async function sendTwilioSMS(to: string, body: string): Promise<string> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    throw new Error(
      'Twilio credentials not configured. ' +
      'Set EXPO_PUBLIC_TWILIO_ACCOUNT_SID, EXPO_PUBLIC_TWILIO_AUTH_TOKEN, ' +
      'and EXPO_PUBLIC_TWILIO_FROM_NUMBER in your .env file.',
    );
  }

  const url    = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const body64 = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

  const formParams = new URLSearchParams();
  formParams.append('To',   to);
  formParams.append('From', TWILIO_FROM_NUMBER);
  formParams.append('Body', body);

  const res = await fetchWithTimeout(
    url,
    {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${body64}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: formParams.toString(),
    },
    15_000,
  );

  const json = (await res.json()) as {
    sid?:     string;
    message?: string;
    code?:    number;
  };

  if (!res.ok) {
    throw new Error(
      `Twilio ${res.status}: ${json.message ?? 'Unknown error'} (code ${json.code ?? '?'})`,
    );
  }

  return json.sid ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPoliceSOS(params: {
  userName:   string;
  userPhone:  string;
  lat:        number;
  lng:        number;
  reason:     string;
  timestamp?: number;
}): Promise<PoliceSMSResult> {
  const ts      = params.timestamp ?? Date.now();
  const message = buildPoliceMessage({ ...params, timestamp: ts });

  // ── 1. Find nearest station ───────────────────────────────────────────────
  let station: PoliceStation | null = null;
  try {
    station = await findNearestPoliceStation(params.lat, params.lng);
  } catch (err) {
    console.warn('[policeSOS] Station lookup threw:', err);
  }

  // ── 2. SMS the police station ─────────────────────────────────────────────
  const targetPhone = station?.phone ?? FALLBACK_POLICE_NUMBER;
  let sent      = false;
  let error     = null as string | null;
  let twilioSid = null as string | null;

  try {
    twilioSid = await sendTwilioSMS(targetPhone, message);
    sent      = true;
    console.log(
      `[policeSOS] ✅ Police SMS sent → ${station?.name ?? 'emergency'} (${targetPhone}) SID: ${twilioSid}`,
    );
  } catch (err: any) {
    error = err?.message ?? String(err);
    console.error('[policeSOS] Police SMS failed:', error);
  }

  // ── 3. SMS all emergency contacts (from local cache — offline-safe) ────────
  const contactResults: ContactSMSResult[] = [];
  try {
    const contacts = await getContacts();

    if (contacts.length > 0) {
      console.log(`[policeSOS] Sending SOS to ${contacts.length} emergency contacts...`);

      const contactMessage = buildContactMessage({
        ...params,
        timestamp:   ts,
        contactName: '', // will be per-contact if needed
      });

      // Fire all in parallel — don't let one failure block others
      const settled = await Promise.allSettled(
        contacts.map(async (contact) => {
          const normalised = normalisePhone(contact.phone) ?? contact.phone;
          let cSid: string | null = null;
          let cErr: string | null = null;
          let cSent = false;

          try {
            cSid  = await sendTwilioSMS(normalised, contactMessage);
            cSent = true;
            console.log(`[policeSOS] ✅ Contact SMS sent → ${contact.name} (${normalised}) SID: ${cSid}`);
          } catch (err: any) {
            cErr = err?.message ?? String(err);
            console.warn(`[policeSOS] Contact SMS failed → ${contact.name}: ${cErr}`);
          }

          return {
            name:      contact.name,
            phone:     contact.phone,
            sent:      cSent,
            twilioSid: cSid,
            error:     cErr,
          } as ContactSMSResult;
        })
      );

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          contactResults.push(result.value);
        } else {
          contactResults.push({
            name:      'Unknown',
            phone:     '',
            sent:      false,
            twilioSid: null,
            error:     result.reason?.message ?? 'Unknown error',
          });
        }
      }
    }
  } catch (err: any) {
    console.error('[policeSOS] Emergency contacts SMS error:', err?.message);
  }

  return {
    sent,
    station,
    errorReason:    error,
    message,
    twilioSid,
    contactResults,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R    = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalisePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+'))                            return digits;
  if (digits.length === 10)                              return `+91${digits}`;
  if (digits.startsWith('0') && digits.length === 11)   return `+91${digits.slice(1)}`;
  if (digits.startsWith('91') && digits.length === 12)  return `+${digits}`;
  return digits.length >= 7 ? `+${digits}` : null;
}