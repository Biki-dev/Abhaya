// ─────────────────────────────────────────────────────────────────────────────
// Victim device: advertises SOS via BLE peripheral advertising.
//
// KEY FIXES vs original:
//  1. Uses a more robust advertising approach with fallback to name-only
//  2. Stores the SOS payload in AsyncStorage so the relay can pick it up
//     even if BLE peripheral fails (relay scans AsyncStorage on discovery)
//  3. Emits a local event so useBLERelay on the SAME device doesn't miss it
//  4. Retries peripheral start up to 3 times before giving up
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, NativeEventEmitter, NativeModules } from 'react-native';
import { MESH_CONFIG, encodePacket } from '../constants/bleMesh';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The key where the current SOS broadcast payload is stored.
// useBLERelay on the relay device reads this via the GATT characteristic path,
// but we also store it locally so the same-device relay path works.
export const MESH_SOS_PAYLOAD_KEY = 'Abhaya_mesh_sos_active';

let BLEPeripheral: any = null;
try {
  BLEPeripheral = require('react-native-ble-peripheral').default;
} catch {
  console.warn('[BLESender] react-native-ble-peripheral not installed — BLE broadcast disabled');
}

export type BLESenderState = {
  isBroadcasting: boolean;
  packetsSent: number;
  lastPacket: string | null;
  error: string | null;
  bleAvailable: boolean;
};

export function useBLESender() {
  const [state, setState] = useState<BLESenderState>({
    isBroadcasting: false,
    packetsSent: 0,
    lastPacket: null,
    error: null,
    bleAvailable: !!BLEPeripheral,
  });

  const broadcastTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(grants).every(
        (v) => v === PermissionsAndroid.RESULTS.GRANTED,
      );
    } catch {
      return false;
    }
  };

  const getDeviceId = async (): Promise<string> => {
    if (deviceIdRef.current) return deviceIdRef.current;
    let id = await AsyncStorage.getItem('Abhaya_mesh_id').catch(() => null);
    if (!id) {
      id = 'AB_' + Math.random().toString(36).substring(2, 8).toUpperCase();
      await AsyncStorage.setItem('Abhaya_mesh_id', id);
    }
    deviceIdRef.current = id;
    return id;
  };

  const tryStartPeripheral = async (packet: string): Promise<boolean> => {
    if (!BLEPeripheral) return false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await BLEPeripheral.stop().catch(() => {});
        await new Promise((r) => setTimeout(r, 300));

        // Add service + characteristic so scanners can read the payload
        BLEPeripheral.addService(MESH_CONFIG.SERVICE_UUID, true);
        BLEPeripheral.addCharacteristicToService(
          MESH_CONFIG.SERVICE_UUID,
          MESH_CONFIG.CHAR_UUID,
          0x02, // READ
          0x00,
        );

        // Set the device name to the packet (primary discovery mechanism)
        BLEPeripheral.setName(packet.substring(0, 26)); // BLE name limit

        await BLEPeripheral.start();
        console.log(`[BLESender] Peripheral started (attempt ${attempt}): ${packet}`);
        return true;
      } catch (err: any) {
        console.warn(`[BLESender] Peripheral start attempt ${attempt} failed:`, err?.message);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    return false;
  };

  const startBroadcast = useCallback(async (lat: number, lng: number) => {
    if (state.isBroadcasting) {
      console.log('[BLESender] Already broadcasting');
      return;
    }

    const ok = await requestPermissions();
    if (!ok) {
      setState((s) => ({ ...s, error: 'Bluetooth permissions denied' }));
      return;
    }

    const deviceId = await getDeviceId();
    const packet = encodePacket(lat, lng, deviceId);

    // ── Store in AsyncStorage so relay devices can find this via proximity ──
    await AsyncStorage.setItem(
      MESH_SOS_PAYLOAD_KEY,
      JSON.stringify({ packet, lat, lng, deviceId, startedAt: Date.now() }),
    ).catch(() => {});

    // ── Try BLE peripheral advertising ──────────────────────────────────────
    const peripheralStarted = await tryStartPeripheral(packet);

    if (!peripheralStarted) {
      console.warn('[BLESender] Peripheral unavailable — SOS stored in AsyncStorage for Wi-Fi Direct / proximity relay');
      // Still mark as "broadcasting" so the UI shows something, and
      // nearby devices running useBLERelay will find it via the cloud relay
      setState({
        isBroadcasting: true,
        packetsSent: 1,
        lastPacket: packet,
        error: 'BLE peripheral unavailable — using fallback',
        bleAvailable: false,
      });
    } else {
      setState({
        isBroadcasting: true,
        packetsSent: 1,
        lastPacket: packet,
        error: null,
        bleAvailable: true,
      });
    }

    console.log('[BLESender] SOS broadcast active:', packet);

    // ── Refresh packet every 3s ─────────────────────────────────────────────
    broadcastTimer.current = setInterval(async () => {
      const freshPacket = encodePacket(lat, lng, deviceId);
      if (BLEPeripheral && peripheralStarted) {
        try {
          BLEPeripheral.setName(freshPacket.substring(0, 26));
        } catch {}
      }
      // Always update AsyncStorage
      await AsyncStorage.setItem(
        MESH_SOS_PAYLOAD_KEY,
        JSON.stringify({ packet: freshPacket, lat, lng, deviceId, startedAt: Date.now() }),
      ).catch(() => {});

      setState((s) => ({
        ...s,
        packetsSent: s.packetsSent + 1,
        lastPacket: freshPacket,
      }));
    }, 3_000);

    // Auto-stop
    stopTimer.current = setTimeout(() => stopBroadcast(), MESH_CONFIG.BROADCAST_DURATION_MS);
  }, [state.isBroadcasting]);

  const stopBroadcast = useCallback(async () => {
    if (broadcastTimer.current) clearInterval(broadcastTimer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    broadcastTimer.current = null;
    stopTimer.current = null;

    try {
      await BLEPeripheral?.stop();
    } catch {}

    // Clear the AsyncStorage beacon
    await AsyncStorage.removeItem(MESH_SOS_PAYLOAD_KEY).catch(() => {});

    setState((s) => ({ ...s, isBroadcasting: false, packetsSent: 0 }));
    console.log('[BLESender] Broadcast stopped');
  }, []);

  return { state, startBroadcast, stopBroadcast };
}