import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../../utils/browserStorage.js';

export function readJsonStorage(key, fallbackValue) {
  try {
    const raw = safeLocalStorageGetItem(key, null);
    if (!raw) return fallbackValue;
    const parsed = JSON.parse(raw);
    return parsed ?? fallbackValue;
  } catch (_) {
    return fallbackValue;
  }
}

export function writeJsonStorage(key, value) {
  try {
    safeLocalStorageSetItem(key, JSON.stringify(value));
  } catch (_) {
    // stockage indisponible/non critique
  }
}
