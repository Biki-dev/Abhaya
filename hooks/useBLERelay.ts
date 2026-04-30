// Runs on ANY nearby Abhaya device — scans for SOS packets and forwards to cloud

import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, AppState } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { MESH_CONFIG, MeshSOSPacket, decodePacket } from '../constants/bleMesh';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrlCandidates } from '../services/api';

let BleManagerModule: any = null;
let bleEmitter: NativeEventEmitter | null = null;

try {
  BleManagerModule = NativeModules.BleManager;
  bleEmitter = new NativeEventEmitter(BleManagerModule);
} catch {
  console.warn('[BLERelay] react-native-ble-manager not available');
}

export type RelayState = {
  isScanning:     boolean;
  packetsRelayed: number;
  lastRelayed:    MeshSOSPacket | null;
  nearbySOSCount: number;
  error:          string | null;
};

export function useBLERelay(enabled: boolean = true) {
  const [state, setState] = useState<RelayState>({
    isScanning:     false,
    packetsRelayed: 0,
    lastRelayed:    null,
    nearbySOSCount: 0,
    error:          null,
  });

  // Track already-relayed packets to prevent flooding
  const relayedCache = useRef<Map<string, number>>(new Map());
  const listenerRef  = useRef<any>(null);
  const scannerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(grants).every(
        v => v === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch {
      return false;
    }
  };

  // Deduplicate relay: same senderId+timestamp = same SOS event
  const shouldRelay = (packet: MeshSOSPacket): boolean => {
    const key = `${packet.senderId}:${packet.timestamp}`;
    const lastSeen = relayedCache.current.get(key);
    if (lastSeen && Date.now() - lastSeen < MESH_CONFIG.RELAY_COOLDOWN_MS) {
      return false; // already relayed recently
    }
    relayedCache.current.set(key, Date.now());
    // Clean old cache entries
    if (relayedCache.current.size > 50) {
      const cutoff = Date.now() - MESH_CONFIG.RELAY_COOLDOWN_MS * 2;
      for (const [k, v] of relayedCache.current.entries()) {
        if (v < cutoff) relayedCache.current.delete(k);
      }
    }
    return true;
  };

  const forwardToCloud = async (packet: MeshSOSPacket): Promise<boolean> => {
    const candidates = getApiBaseUrlCandidates();
    const storedBase = await AsyncStorage.getItem('Abhaya_api_base').catch(() => null);
    const allBases = [...new Set([storedBase, ...candidates].filter(Boolean) as string[])];

    for (const base of allBases) {
      try {
        const res = await fetch(`${base}/api/sos/mesh-relay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat:       packet.lat,
            lng:       packet.lng,
            timestamp: packet.timestamp * 1000, // convert to ms
            senderId:  packet.senderId,
            hops:      packet.hops + 1,
            source:    'ble_mesh',
          }),
          signal: AbortSignal.timeout?.(5000) ?? undefined,
        });
        if (res.ok) {
          console.log(`[BLERelay] ✅ Forwarded to cloud via ${base}`);
          return true;
        }
      } catch {
        // try next base URL
      }
    }

    console.warn('[BLERelay] All cloud endpoints unreachable — packet queued locally');
    // Queue for later retry (reuse sensorDb queue pattern)
    const raw = await AsyncStorage.getItem('Abhaya_mesh_relay_queue').catch(() => null);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ ...packet, queuedAt: Date.now() });
    await AsyncStorage.setItem('Abhaya_mesh_relay_queue', JSON.stringify(queue.slice(-20)));
    return false;
  };

  const handleDiscoveredPeripheral = useCallback(async (data: any) => {
    const name: string = data?.name ?? data?.advertising?.localName ?? '';
    if (!name.startsWith(MESH_CONFIG.SOS_PREFIX)) return;

    const packet = decodePacket(name);
    if (!packet) {
      console.warn('[BLERelay] Invalid packet format:', name);
      return;
    }

    if (!shouldRelay(packet)) {
      console.log('[BLERelay] Duplicate packet, skipping:', packet.senderId);
      return;
    }

    console.log(`[BLERelay] 🚨 SOS detected from ${packet.senderId} at ${packet.lat},${packet.lng}`);

    setState(s => ({
      ...s,
      nearbySOSCount: s.nearbySOSCount + 1,
      lastRelayed: packet,
    }));

    const forwarded = await forwardToCloud(packet);

    if (forwarded) {
      setState(s => ({
        ...s,
        packetsRelayed: s.packetsRelayed + 1,
      }));
    }
  }, []);

  const startRelay = useCallback(async () => {
    if (!bleEmitter || !BleManagerModule) {
      setState(s => ({ ...s, error: 'BLE not available on this device/build' }));
      return;
    }

    const ok = await requestPermissions();
    if (!ok) {
      setState(s => ({ ...s, error: 'Bluetooth permissions denied' }));
      return;
    }

    try {
      await BleManager.start({ showAlert: false });

      // Register listener
      listenerRef.current = bleEmitter!.addListener(
        'BleManagerDiscoverPeripheral',
        handleDiscoveredPeripheral,
      );

      // Scan for our service UUID specifically
      await BleManager.scan({
        serviceUUIDs: [MESH_CONFIG.SERVICE_UUID],
        seconds: MESH_CONFIG.SCAN_DURATION,
        allowDuplicates: true,
      });

      setState(s => ({ ...s, isScanning: true, error: null }));
      console.log('[BLERelay] Scanning started for Abhaya SOS packets');

      // Restart scan every 30s (Android BLE scan times out)
      scannerRef.current = setInterval(async () => {
        try {
          await BleManager.scan({
            serviceUUIDs: [MESH_CONFIG.SERVICE_UUID],
            seconds: MESH_CONFIG.SCAN_DURATION,
            allowDuplicates: true,
          });
        } catch {}
      }, 30_000);

    } catch (err: any) {
      setState(s => ({ ...s, error: err.message ?? 'Scan failed' }));
      console.error('[BLERelay] Start failed:', err);
    }
  }, [handleDiscoveredPeripheral]);

  const stopRelay = useCallback(async () => {
    if (scannerRef.current) clearInterval(scannerRef.current);
    listenerRef.current?.remove();
    try { await BleManager.stopScan(); } catch {}
    setState(s => ({ ...s, isScanning: false }));
  }, []);

  // Flush queued packets when back online
  const flushOfflineQueue = useCallback(async () => {
    const raw = await AsyncStorage.getItem('Abhaya_mesh_relay_queue').catch(() => null);
    if (!raw) return;
    const queue: MeshSOSPacket[] = JSON.parse(raw);
    if (queue.length === 0) return;

    const remaining = [];
    for (const packet of queue) {
      const ok = await forwardToCloud(packet);
      if (!ok) remaining.push(packet);
    }

    if (remaining.length === 0) {
      await AsyncStorage.removeItem('Abhaya_mesh_relay_queue');
      console.log('[BLERelay] Offline queue flushed');
    } else {
      await AsyncStorage.setItem('Abhaya_mesh_relay_queue', JSON.stringify(remaining));
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      startRelay();
      // Try to flush any queued packets on start
      flushOfflineQueue();
    } else {
      stopRelay();
    }

    // Handle app coming to foreground — try flush again
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushOfflineQueue();
    });

    return () => {
      stopRelay();
      sub.remove();
    };
  }, [enabled]);

  return { state, startRelay, stopRelay, flushOfflineQueue };
}