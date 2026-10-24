import { useSyncExternalStore } from 'react';
import { isDeviceOffline, subscribeNetworkStatus } from '../networkStatus.js';

function subscribe(onChange) {
  return subscribeNetworkStatus(() => onChange());
}

function getSnapshot() {
  return !isDeviceOffline();
}

function getServerSnapshot() {
  return true;
}

/** Vrai tant que l'appareil a une interface réseau active (faux en mode avion). */
export function useDeviceOnline() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
