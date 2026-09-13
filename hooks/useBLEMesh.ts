// Combines sender + relay into one unified hook
// Replaces the simulation stub with real BLE calls

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBLESender } from './useBLESender';
import { useBLERelay }  from './useBLERelay';

export type MeshPeer = {
  id:         string;
  name:       string;
  rssi:       number;
  lastSeen:   number;
  isRelaying: boolean;
};

export type MeshState = {
  isActive:         boolean;
  peers:            MeshPeer[];
  networkReachable: boolean;
  packetsSent:      number;
  packetsRelayed:   number;
  lastPacket:       null;
  myId:             string;
  senderState:      ReturnType<typeof useBLESender>["state"];
  relayState:       ReturnType<typeof useBLERelay>["state"];
  isBroadcasting:   boolean;
  nearbySOSCount:   number;
};

export function useBLEMesh(enabled: boolean = false) {
  const { state: senderState, startBroadcast, stopBroadcast } = useBLESender();
  const { state: relayState, flushOfflineQueue }               = useBLERelay(enabled);

  const sendSOSViaMesh = useCallback(
    (lat: number | null, lng: number | null, _userId: string) => {
      if (lat == null || lng == null) {
        console.warn('[BLEMesh] Cannot send SOS — no GPS coords');
        return;
      }
      startBroadcast(lat, lng);
    },
    [startBroadcast],
  );

  const sendLocationViaMesh = useCallback(
    (lat: number, lng: number) => {
      // Location sharing via mesh uses same broadcast mechanism
      // In a full build, you'd use a different packet prefix (AB_LOC:)
      console.log('[BLEMesh] Location mesh packet (not yet implemented):', lat, lng);
    },
    [],
  );

  const state: MeshState = {
    isActive:         relayState.isScanning || senderState.isBroadcasting,
    peers:            [],  // populated by BleManagerDiscoverPeripheral in relay
    networkReachable: true,
    packetsSent:      senderState.packetsSent,
    packetsRelayed:   relayState.packetsRelayed,
    lastPacket:       null,
    myId:             '',
    senderState,
    relayState,
    isBroadcasting:   senderState.isBroadcasting,
    nearbySOSCount:   relayState.nearbySOSCount,
  };

  return { state, sendLocationViaMesh, sendSOSViaMesh, stopBroadcast, flushOfflineQueue };
}