// This runs on the VICTIM's device — broadcasts SOS over BLE when internet is down

import { useCallback, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { MESH_CONFIG, encodePacket } from '../constants/bleMesh';
import AsyncStorage from '@react-native-async-storage/async-storage';

// NOTE: react-native-ble-peripheral is a native module.
// Import conditionally to avoid crash if native build isn't configured yet.
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
};

export function useBLESender() {
  const [state, setState] = useState<BLESenderState>({
    isBroadcasting: false,
    packetsSent: 0,
    lastPacket: null,
    error: null,
  });

  const broadcastTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(granted).every(
        v => v === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch {
      return false;
    }
  };

  const startBroadcast = useCallback(async (
    lat: number,
    lng: number,
  ) => {
    if (!BLEPeripheral) {
      setState(s => ({ ...s, error: 'BLE peripheral not available on this build' }));
      return;
    }

    const ok = await requestPermissions();
    if (!ok) {
      setState(s => ({ ...s, error: 'Bluetooth permissions denied' }));
      return;
    }

    // Get stable device ID
    let deviceId = await AsyncStorage.getItem('Abhaya_mesh_id').catch(() => null);
    if (!deviceId) {
      deviceId = 'Abhaya_' + Math.random().toString(36).substring(2, 10);
      await AsyncStorage.setItem('Abhaya_mesh_id', deviceId);
    }

    const packet = encodePacket(lat, lng, deviceId);

    try {
      // Stop any previous broadcast first
      await BLEPeripheral.stop().catch(() => {});

      // Configure service
      BLEPeripheral.addService(MESH_CONFIG.SERVICE_UUID, true);
      BLEPeripheral.setName(packet);

      // Start advertising
      await BLEPeripheral.start();

      setState({
        isBroadcasting: true,
        packetsSent: 1,
        lastPacket: packet,
        error: null,
      });

      console.log('[BLESender] Broadcasting:', packet);

      // Re-broadcast every 5 seconds (keeps packet fresh in nearby scanners)
      broadcastTimer.current = setInterval(async () => {
        const freshPacket = encodePacket(lat, lng, deviceId!);
        try {
          BLEPeripheral.setName(freshPacket);
          setState(s => ({
            ...s,
            packetsSent: s.packetsSent + 1,
            lastPacket: freshPacket,
          }));
        } catch (err: any) {
          console.warn('[BLESender] Re-broadcast error:', err.message);
        }
      }, 5_000);

      // Auto-stop after BROADCAST_DURATION_MS
      stopTimer.current = setTimeout(stopBroadcast, MESH_CONFIG.BROADCAST_DURATION_MS);

    } catch (err: any) {
      setState(s => ({ ...s, error: err.message ?? 'Broadcast failed' }));
      console.error('[BLESender] Start failed:', err);
    }
  }, []);

  const stopBroadcast = useCallback(async () => {
    if (broadcastTimer.current) clearInterval(broadcastTimer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    try {
      await BLEPeripheral?.stop();
    } catch {}
    setState(s => ({ ...s, isBroadcasting: false }));
    console.log('[BLESender] Broadcast stopped');
  }, []);

  return { state, startBroadcast, stopBroadcast };
}