import { useSyncExternalStore } from 'react';
import { getNetworkMode, subscribeNetworkStatus } from '../networkStatus.js';

function subscribe(onChange) {
  return subscribeNetworkStatus(() => onChange());
}

function getServerSnapshot() {
  return 'online';
}

/**
 * État réseau à afficher : `online`, `offline` (mode avion) ou `unreachable` (réseau présent
 * mais inutilisable).
 * @returns {'online'|'offline'|'unreachable'}
 */
export function useNetworkMode() {
  return useSyncExternalStore(subscribe, () => getNetworkMode(), getServerSnapshot);
}
