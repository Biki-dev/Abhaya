export const MESH_CONFIG = {
  // Unique service UUID for Abhaya — distinguishes us from other BLE devices
  SERVICE_UUID: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',

  // Characteristic UUID for the SOS data payload
  CHAR_UUID: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',

  // Packet prefix — scanner checks this to confirm it's an Abhaya SOS
  SOS_PREFIX: 'AB_SOS:',

  // Max BLE advertisement name length = 26 bytes
  // Format: "AB_SOS:26.14,91.73,1746012345"
  //          prefix  lat    lng   unix_ts (seconds, 10 digits)
  MAX_PACKET_LEN: 29,

  // How long to keep advertising after SOS (ms)
  BROADCAST_DURATION_MS: 5 * 60 * 1000, // 5 minutes

  // Relay scan duration (0 = infinite)
  SCAN_DURATION: 0,

  // Max hops before packet is dropped
  MAX_HOPS: 5,

  // Cooldown before re-relaying same SOS (prevents flooding)
  RELAY_COOLDOWN_MS: 30_000,
};

// Packet format encoder/decoder
export type MeshSOSPacket = {
  lat: number;
  lng: number;
  timestamp: number; // unix seconds
  hops: number;
  senderId: string;  // last 4 chars of device UUID
};

export function encodePacket(lat: number, lng: number, senderId: string): string {
  const ts = Math.floor(Date.now() / 1000);
  // "AB_SOS:26.14,91.73,1746012,ID:a3f2"
  return `${MESH_CONFIG.SOS_PREFIX}${lat.toFixed(2)},${lng.toFixed(2)},${ts},${senderId.slice(-4)}`;
}

export function decodePacket(raw: string): MeshSOSPacket | null {
  if (!raw?.startsWith(MESH_CONFIG.SOS_PREFIX)) return null;
  try {
    const body = raw.replace(MESH_CONFIG.SOS_PREFIX, '');
    const [latStr, lngStr, tsStr, id] = body.split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const timestamp = parseInt(tsStr, 10);
    if (isNaN(lat) || isNaN(lng) || isNaN(timestamp)) return null;
    // Reject packets older than 10 minutes (stale SOS)
    if (Date.now() / 1000 - timestamp > 600) return null;
    return { lat, lng, timestamp, hops: 0, senderId: id ?? 'unkn' };
  } catch {
    return null;
  }
}