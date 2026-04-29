
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MeshPeer = {
  id:          string;
  name:        string;
  rssi:        number;   // signal strength -100 (far) to -30 (close)
  lastSeen:    number;   // timestamp
  isRelaying:  boolean;  // currently relaying SOS for another user
};

export type MeshPacket = {
  type:      'location' | 'sos' | 'heartbeat' | 'relay';
  senderId:  string;
  payload:   Record<string, unknown>;
  hops:      number;   // number of mesh hops so far
  timestamp: number;
};

export type MeshState = {
  isActive:        boolean;
  peers:           MeshPeer[];
  networkReachable: boolean;
  packetsSent:     number;
  packetsRelayed:  number;
  lastPacket:      MeshPacket | null;
  myId:            string;
};

// Max hops before a packet is dropped (prevents infinite flooding)
const MAX_HOPS = 5;
// Drop peers not seen in 30s
const PEER_TIMEOUT_MS = 30_000;
// How often we broadcast heartbeat
const HEARTBEAT_MS = 8_000;

export function useBLEMesh(enabled: boolean = false) {
  const [state, setState] = useState<MeshState>({
    isActive:         false,
    peers:            [],
    networkReachable: true,
    packetsSent:      0,
    packetsRelayed:   0,
    lastPacket:       null,
    myId:             '',
  });

  const myIdRef         = useRef('');
  const heartbeatTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerCleanTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── get or create stable device ID ───────────────────────────────────────
  const getMyId = useCallback(async () => {
    let id = await AsyncStorage.getItem('Abhaya_mesh_id');
    if (!id) {
      id = 'Abhaya_' + Math.random().toString(36).substring(2, 10);
      await AsyncStorage.setItem('Abhaya_mesh_id', id);
    }
    myIdRef.current = id;
    setState(s => ({ ...s, myId: id! }));
    return id;
  }, []);

  // ── SIMULATED: in a real build replace this with BLE scan + advertise ────
  // react-native-ble-plx pattern:
  //   manager.startDeviceScan(null, null, (error, device) => { ... });
  //   manager.startAdvertising({ serviceUUIDs: ['Abhaya-MESH'] }, ...);
  const simulatePeerDiscovery = useCallback(() => {
    // Simulates 0-3 nearby peers being detected
    const count = Math.floor(Math.random() * 4);
    const fakePeers: MeshPeer[] = Array.from({ length: count }, (_, i) => ({
      id:         `peer_${i}_${Math.random().toString(36).substring(2, 6)}`,
      name:       `Abhaya User ${i + 1}`,
      rssi:       -40 - Math.floor(Math.random() * 60),
      lastSeen:   Date.now(),
      isRelaying: false,
    }));
    setState(s => ({ ...s, peers: fakePeers }));
  }, []);

  // ── send packet (real: write to BLE characteristic; sim: log) ────────────
  const sendPacket = useCallback(
    (type: MeshPacket['type'], payload: Record<string, unknown>) => {
      const packet: MeshPacket = {
        type,
        senderId:  myIdRef.current,
        payload,
        hops:      0,
        timestamp: Date.now(),
      };
      // REAL BLE: manager.writeCharacteristicWithoutResponseForDevice(...)
      console.log('[BLEMesh] Sending packet', packet);
      setState(s => ({
        ...s,
        packetsSent: s.packetsSent + 1,
        lastPacket:  packet,
      }));
    },
    []
  );

  // ── relay a received packet (increment hop count) ─────────────────────────
  const relayPacket = useCallback((incoming: MeshPacket) => {
    if (incoming.hops >= MAX_HOPS) return;
    if (incoming.senderId === myIdRef.current) return;  // don't echo own packets
    const relayed: MeshPacket = { ...incoming, hops: incoming.hops + 1 };
    // REAL BLE: broadcast relayed to all connected peers
    console.log('[BLEMesh] Relaying packet', relayed);
    setState(s => ({
      ...s,
      packetsRelayed: s.packetsRelayed + 1,
      lastPacket:     relayed,
    }));
  }, []);

  // ── send location via mesh ────────────────────────────────────────────────
  const sendLocationViaMesh = useCallback(
    (lat: number, lng: number) => {
      sendPacket('location', { lat, lng, t: Date.now() });
    },
    [sendPacket]
  );

  // ── send SOS via mesh ─────────────────────────────────────────────────────
  const sendSOSViaMesh = useCallback(
    (lat: number | null, lng: number | null, userId: string) => {
      sendPacket('sos', { lat, lng, userId, t: Date.now() });
    },
    [sendPacket]
  );

  // ── clean stale peers ─────────────────────────────────────────────────────
  const cleanPeers = useCallback(() => {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    setState(s => ({ ...s, peers: s.peers.filter(p => p.lastSeen > cutoff) }));
  }, []);

  // ── check network ─────────────────────────────────────────────────────────
  // In production: use @react-native-community/netinfo
  const checkNetwork = useCallback(async () => {
    try {
      const res = await fetch('https://dns.google/resolve?name=google.com', { method: 'HEAD' });
      setState(s => ({ ...s, networkReachable: res.ok }));
    } catch {
      setState(s => ({ ...s, networkReachable: false }));
    }
  }, []);

  // ── lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    getMyId().then(() => {
      if (!mounted) return;
      setState(s => ({ ...s, isActive: true }));
      simulatePeerDiscovery();

      heartbeatTimer.current = setInterval(() => {
        sendPacket('heartbeat', { t: Date.now() });
        checkNetwork();
      }, HEARTBEAT_MS);

      peerCleanTimer.current = setInterval(cleanPeers, 10_000);
    });

    return () => {
      mounted = false;
      if (heartbeatTimer.current)  clearInterval(heartbeatTimer.current);
      if (peerCleanTimer.current)  clearInterval(peerCleanTimer.current);
      setState(s => ({ ...s, isActive: false }));
    };
  }, [enabled]);

  return { state, sendLocationViaMesh, sendSOSViaMesh, relayPacket, sendPacket };
}