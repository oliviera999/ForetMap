/**
 * Stockage de l'appareil pour le hors ligne : demande de stockage **persistant** (le navigateur
 * ne videra plus les copies et les écritures en attente pour faire de la place) et estimation
 * de la place utilisée / disponible.
 *
 * API Storage du WHATWG (https://storage.spec.whatwg.org/) : `navigator.storage.persist()`,
 * `persisted()`, `estimate()`. Sur iPhone / iPad, Safari efface les données d'un site non
 * installé après ~7 jours sans visite : seul l'ajout à l'écran d'accueil les protège
 * (https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/).
 */

/** Au-delà de cette part du quota utilisée, l'appareil est jugé presque plein. */
export const LOW_STORAGE_RATIO = 0.9;
/** Place libre minimale pour garder quelques photos (octets). */
export const LOW_STORAGE_FREE_BYTES = 20 * 1024 * 1024;

function storageManager(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  return nav?.storage || null;
}

/**
 * État du stockage. Chaque valeur vaut `null` quand le navigateur ne la donne pas.
 * @returns {Promise<{ supported: boolean, persisted: boolean|null, usage: number|null,
 *   quota: number|null }>}
 */
export async function getStorageStatus(nav) {
  const storage = storageManager(nav);
  if (!storage) return { supported: false, persisted: null, usage: null, quota: null };
  let persisted = null;
  let usage = null;
  let quota = null;
  try {
    if (typeof storage.persisted === 'function') persisted = !!(await storage.persisted());
  } catch {
    persisted = null;
  }
  try {
    if (typeof storage.estimate === 'function') {
      const est = await storage.estimate();
      usage = Number.isFinite(est?.usage) ? est.usage : null;
      quota = Number.isFinite(est?.quota) ? est.quota : null;
    }
  } catch {
    usage = null;
    quota = null;
  }
  return { supported: true, persisted, usage, quota };
}

/**
 * Demande le stockage persistant. Chrome l'accorde sans question à une application installée
 * ou souvent visitée ; Firefox demande à l'utilisateur ; Safari ne répond pas toujours.
 * @returns {Promise<boolean|null>} accordé, refusé, ou `null` si indisponible
 */
export async function requestPersistentStorage(nav) {
  const storage = storageManager(nav);
  if (!storage || typeof storage.persist !== 'function') return null;
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    return !!(await storage.persist());
  } catch {
    return null;
  }
}

/** Appareil presque plein (les photos hors ligne risquent de ne plus être gardées). */
export function isStorageLow(usage, quota) {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return false;
  return usage / quota >= LOW_STORAGE_RATIO || quota - usage < LOW_STORAGE_FREE_BYTES;
}

/** iPhone / iPad (y compris iPadOS qui se présente comme un Mac tactile). */
export function isIosDevice(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  const ua = String(nav?.userAgent || '');
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && Number(nav?.maxTouchPoints) > 1;
}

/** Application lancée depuis l'écran d'accueil (installée). */
export function isStandaloneDisplay(
  win = typeof window !== 'undefined' ? window : undefined,
  nav = typeof navigator !== 'undefined' ? navigator : undefined,
) {
  if (nav?.standalone === true) return true;
  try {
    return !!win?.matchMedia?.('(display-mode: standalone)')?.matches;
  } catch {
    return false;
  }
}

/** iPhone / iPad sans installation : les données hors ligne peuvent être effacées par Safari. */
export function isIosNotInstalled(win, nav) {
  return isIosDevice(nav) && !isStandaloneDisplay(win, nav);
}

/** Taille lisible en français (« 12 Mo »). */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${units[unit]}`;
}
