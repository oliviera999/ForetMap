/**
 * Sabliers de « Tenir à deux » — noyau PUR partagé serveur / client (miroir CJS
 * `lib/shared/glSablierCore.js`, régénéré par `npm run sync:shared-cores`).
 *
 * Un sablier n'annule jamais rien : il donne un rythme. Trois usages, un même calcul :
 * - le sablier de **l'équipe active** au tableau (console du prof, côté client) ;
 * - le sablier de **phase**, commun à toutes les équipes pendant la phase `jeu` en hybride et
 *   sur tablette : son départ et sa durée viennent du serveur, pour que console, tablettes et
 *   projection affichent la même chose ;
 * - le sablier d'un **défi**.
 *
 * État d'un sablier servi par le serveur : `{ startedAtMs, pausedAtMs, pausedMs }`. Le temps
 * écoulé = (instant de lecture, ou instant de la pause) − départ − pauses cumulées.
 */

/** Durées proposées d'un clic, en minutes. */
export const SABLIER_DUREES_MINUTES = Object.freeze([1, 2, 3, 5, 8, 10]);
export const SABLIER_SECONDES_MIN = 10;
export const SABLIER_SECONDES_MAX = 3600;
export const SABLIER_ACTIONS = Object.freeze(['pause', 'reprise', 'zero']);

function entierPositif(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Durée en secondes bornée [10, 3600], ou `null` si la valeur n'est pas un nombre. */
export function normaliserSecondesSablier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(SABLIER_SECONDES_MAX, Math.max(SABLIER_SECONDES_MIN, Math.round(n)));
}

/** État normalisé, ou `null` si le sablier n'a pas démarré. */
export function normaliserEtatSablier(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const startedAtMs = entierPositif(value.startedAtMs);
  if (startedAtMs == null || startedAtMs === 0) return null;
  const pausedAtMs = entierPositif(value.pausedAtMs);
  return {
    startedAtMs,
    pausedAtMs: pausedAtMs ? pausedAtMs : null,
    pausedMs: entierPositif(value.pausedMs) || 0,
  };
}

/** Sablier qui démarre à `nowMs`. */
export function demarrerSablier(nowMs) {
  return { startedAtMs: Math.floor(Number(nowMs) || 0), pausedAtMs: null, pausedMs: 0 };
}

/**
 * Applique `pause`, `reprise` ou `zero` (remise à zéro : le sablier repart plein, et reste en
 * pause s'il l'était). Une action sans objet (reprise d'un sablier qui tourne) ne change rien.
 */
export function appliquerActionSablier(etat, action, nowMs) {
  const now = Math.floor(Number(nowMs) || 0);
  const current = normaliserEtatSablier(etat) || demarrerSablier(now);
  if (action === 'pause') {
    return current.pausedAtMs ? current : { ...current, pausedAtMs: now };
  }
  if (action === 'reprise') {
    if (!current.pausedAtMs) return current;
    return {
      startedAtMs: current.startedAtMs,
      pausedAtMs: null,
      pausedMs: current.pausedMs + Math.max(0, now - current.pausedAtMs),
    };
  }
  if (action === 'zero') {
    return { startedAtMs: now, pausedAtMs: current.pausedAtMs ? now : null, pausedMs: 0 };
  }
  return current;
}

/**
 * Temps restant d'un sablier de `secondes` à l'instant `nowMs`.
 * @returns {{ restantSecondes: number, enPause: boolean, termine: boolean }}
 */
export function restantSablier({ secondes, etat, nowMs }) {
  const total = Math.max(0, Math.round(Number(secondes) || 0));
  const current = normaliserEtatSablier(etat);
  if (!current) return { restantSecondes: total, enPause: false, termine: false };
  const lecture = current.pausedAtMs || Math.floor(Number(nowMs) || 0);
  const ecoule = Math.max(0, lecture - current.startedAtMs - current.pausedMs);
  const restantSecondes = Math.max(0, total - Math.floor(ecoule / 1000));
  return {
    restantSecondes,
    enPause: current.pausedAtMs != null,
    termine: total > 0 && restantSecondes === 0,
  };
}

/** « 3:00 », « 0:07 » : minutes et secondes sur deux chiffres. */
export function formatSablier(secondes) {
  const total = Math.max(0, Math.round(Number(secondes) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
