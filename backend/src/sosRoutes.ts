import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { sendSMS } from './smsService.js';

export const sosRouter = Router();

const FALLBACK_POLICE_NUMBER = process.env.POLICE_FALLBACK_NUMBER?.trim() || '+917896390573';

type PoliceStation = {
  name: string;
  phone: string;
  rawPhone: string | null;
  distance: number;
  lat: number;
  lng: number;
  osmId: number | null;
};

type ContactSMSResult = {
  name: string;
  phone: string;
  sent: boolean;
  twilioSid: string | null;
  error: string | null;
};

const sosAlertSchema = z.object({
  userPhone: z.string().min(10),
  lat: z.number(),
  lng: z.number(),
  reason: z.string().optional(),
  timestamp: z.number().int().positive().optional(),
});

sosRouter.post('/api/sos/alert', async (req, res) => {
  const parsed = sosAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { userPhone, lat, lng, reason } = parsed.data;
  const timestamp = parsed.data.timestamp ?? Date.now();

  const user = await prisma.user.findUnique({
    where: { phone: userPhone },
    include: { emergencyContacts: true },
  });

  const message = buildPoliceMessage({
    userPhone,
    lat,
    lng,
    reason: reason ?? 'Emergency SOS',
    timestamp,
  });

  let station: PoliceStation | null = null;
  try {
    station = await findNearestPoliceStation(lat, lng);
  } catch (error) {
    console.warn('[SOS] Police station lookup failed:', error);
  }

  const targetPhone = station?.phone ?? FALLBACK_POLICE_NUMBER;
  let sent = false;
  let errorReason: string | null = null;
  let twilioSid: string | null = null;

  try {
    twilioSid = await sendSMS(targetPhone, message);
    sent = true;
  } catch (error) {
    errorReason = error instanceof Error ? error.message : String(error);
    console.error('[SOS] Police SMS failed:', errorReason);
  }

  const contactResults: ContactSMSResult[] = [];
  const contacts = user?.emergencyContacts ?? [];

  if (contacts.length > 0) {
    const contactMessage = buildContactMessage({
      userPhone,
      lat,
      lng,
      reason: reason ?? 'Emergency SOS',
      timestamp,
    });

    const settled = await Promise.allSettled(
      contacts.map(async (contact) => {
        const normalised = normalisePhone(contact.phone) ?? contact.phone;
        try {
          const sid = await sendSMS(normalised, contactMessage);
          return {
            name: contact.name,
            phone: contact.phone,
            sent: true,
            twilioSid: sid,
            error: null,
          } as ContactSMSResult;
        } catch (error) {
          return {
            name: contact.name,
            phone: contact.phone,
            sent: false,
            twilioSid: null,
            error: error instanceof Error ? error.message : String(error),
          } as ContactSMSResult;
        }
      }),
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        contactResults.push(result.value);
      } else {
        contactResults.push({
          name: 'Unknown',
          phone: '',
          sent: false,
          twilioSid: null,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  return res.json({
    sent,
    station,
    errorReason,
    message,
    twilioSid,
    contactResults,
  });
});

async function findNearestPoliceStation(lat: number, lng: number): Promise<PoliceStation | null> {
  for (const radiusM of [5000, 15000]) {
    const station = await queryOverpass(lat, lng, radiusM);
    if (station) {
      return station;
    }
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    type OSMElement = {
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: {
        name?: string;
        phone?: string;
        'contact:phone'?: string;
        'phone:IN'?: string;
      };
    };

    const data = (await response.json()) as { elements?: OSMElement[] };
    const elements = data.elements ?? [];
    if (elements.length === 0) {
      return null;
    }

    let best: OSMElement | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const el of elements) {
      const eLat = el.lat ?? el.center?.lat;
      const eLng = el.lon ?? el.center?.lon;
      if (eLat == null || eLng == null) {
        continue;
      }

      const dist = haversineMetres(lat, lng, eLat, eLng);
      if (dist < bestDist) {
        best = el;
        bestDist = dist;
      }
    }

    if (!best) {
      return null;
    }

    const stationLat = best.lat ?? best.center?.lat ?? lat;
    const stationLng = best.lon ?? best.center?.lon ?? lng;
    const rawPhone =
      best.tags?.phone ??
      best.tags?.['contact:phone'] ??
      best.tags?.['phone:IN'] ??
      null;

    return {
      name: best.tags?.name ?? 'Police Station',
      phone: normalisePhone(rawPhone) ?? FALLBACK_POLICE_NUMBER,
      rawPhone,
      distance: Math.round(bestDist),
      lat: stationLat,
      lng: stationLng,
      osmId: best.id,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPoliceMessage(params: {
  userPhone: string;
  lat: number;
  lng: number;
  reason: string;
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

function buildContactMessage(params: {
  userPhone: string;
  lat: number;
  lng: number;
  reason: string;
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
    `GPS    : ${params.lat.toFixed(6)}, ${params.lng.toFixed(6)}`,
    `Time   : ${time} IST`,
    '---',
    'Please help or call emergency services immediately.',
  ].join('\n');
}

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusM = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalisePhone(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    return digits;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }

  return digits.length >= 7 ? `+${digits}` : null;
}