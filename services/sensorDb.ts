
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY      = 'Abhaya_sensor_events';
const QUEUE_KEY        = 'Abhaya_sensor_queue';
const MAX_LOCAL_EVENTS = 200;

export type SensorEventType =
  | 'fall_detected'
  | 'impact_detected'
  | 'shake_detected'
  | 'audio_peak'
  | 'keyword_detected'
  | 'gps_update'
  | 'sos_triggered'
  | 'sos_cancelled'
  | 'police_alerted'       // fired after sendPoliceSOS() resolves
  | 'mesh_sos_relayed'
  | 'heartbeat_missed'
  | 'checkin_started'
  | 'checkin_completed'
  | 'checkin_late';

export type SensorEvent = {
  id:        string;
  userId:    string;
  type:      SensorEventType;
  lat:       number | null;
  lng:       number | null;
  data:      Record<string, unknown>;
  timestamp: number;
  synced:    boolean;
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

// ─── read/write ring buffer ───────────────────────────────────────────────────
async function readEvents(): Promise<SensorEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SensorEvent[]) : [];
  } catch {
    return [];
  }
}

async function writeEvents(events: SensorEvent[]): Promise<void> {
  // Keep only last MAX_LOCAL_EVENTS
  const trimmed = events.slice(-MAX_LOCAL_EVENTS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

// ─── public API ───────────────────────────────────────────────────────────────
export async function logSensorEvent(
  userId: string,
  type:   SensorEventType,
  data:   Record<string, unknown> = {},
  lat:    number | null = null,
  lng:    number | null = null
): Promise<SensorEvent> {
  const event: SensorEvent = {
    id:        makeId(),
    userId,
    type,
    lat,
    lng,
    data,
    timestamp: Date.now(),
    synced:    false,
  };

  const existing = await readEvents();
  await writeEvents([...existing, event]);

  // Queue for backend sync
  await queueForSync(event);

  return event;
}

export async function getLocalEvents(limit = 50): Promise<SensorEvent[]> {
  const events = await readEvents();
  return events.slice(-limit).reverse();
}

export async function clearLocalEvents(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// ─── offline sync queue ───────────────────────────────────────────────────────
async function queueForSync(event: SensorEvent): Promise<void> {
  try {
    const raw   = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? (JSON.parse(raw) as SensorEvent[]) : [];
    queue.push(event);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (_) {}
}

export async function flushSyncQueue(baseUrl: string, authToken?: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const queue: SensorEvent[] = JSON.parse(raw);
    if (queue.length === 0) return;

    const res = await fetch(`${baseUrl}/api/sensor-events/batch`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ events: queue }),
    });

    if (res.ok) {
      // Mark as synced in local store
      const local  = await readEvents();
      const synced = new Set(queue.map(e => e.id));
      await writeEvents(local.map(e => synced.has(e.id) ? { ...e, synced: true } : e));
      await AsyncStorage.removeItem(QUEUE_KEY);
    }
  } catch (err) {
    console.warn('[sensorDb] flush failed, will retry later', err);
  }
}