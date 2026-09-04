function resolveStorage(kind) {
  if (typeof window === 'undefined') return null;
  return kind === 'session' ? window.sessionStorage : window.localStorage;
}

function safeStorageGetItem(kind, key, fallback = null) {
  const storage = resolveStorage(kind);
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function safeStorageSetItem(kind, key, value) {
  const storage = resolveStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemoveItem(kind, key) {
  const storage = resolveStorage(kind);
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function safeStorageReadJson(kind, key, fallback = null) {
  const raw = safeStorageGetItem(kind, key, null);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function safeStorageWriteJson(kind, key, value) {
  try {
    return safeStorageSetItem(kind, key, JSON.stringify(value));
  } catch {
    return false;
  }
}

const safeLocalStorageGetItem = (key, fallback = null) =>
  safeStorageGetItem('local', key, fallback);
const safeLocalStorageSetItem = (key, value) => safeStorageSetItem('local', key, value);
const safeLocalStorageRemoveItem = (key) => safeStorageRemoveItem('local', key);
const safeLocalStorageReadJson = (key, fallback = null) =>
  safeStorageReadJson('local', key, fallback);
const safeLocalStorageWriteJson = (key, value) => safeStorageWriteJson('local', key, value);

const safeSessionStorageGetItem = (key, fallback = null) =>
  safeStorageGetItem('session', key, fallback);
const safeSessionStorageSetItem = (key, value) => safeStorageSetItem('session', key, value);
const safeSessionStorageRemoveItem = (key) => safeStorageRemoveItem('session', key);
const safeSessionStorageReadJson = (key, fallback = null) =>
  safeStorageReadJson('session', key, fallback);
const safeSessionStorageWriteJson = (key, value) => safeStorageWriteJson('session', key, value);

export {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageReadJson,
  safeLocalStorageWriteJson,
  safeSessionStorageGetItem,
  safeSessionStorageSetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageReadJson,
  safeSessionStorageWriteJson,
};
