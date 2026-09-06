'use strict';

/**
 * Anti-force-brute PAR COMPTE (audit `docs/AUDIT_COMPTES_2026-09.md`, S3).
 *
 * Le limiteur d'IP (`lib/rateLimit.js`) est le seul rempart historique. En établissement,
 * toute une classe sort par la même adresse publique : il bloque trente élèves après vingt
 * fautes de frappe cumulées (faux positif garanti le jour de la rentrée) et ne protège
 * aucun compte pris individuellement depuis plusieurs adresses. Ce module ajoute un
 * compteur d'échecs par identifiant, avec verrou progressif :
 *
 *   échecs < FAILURES_BEFORE_LOCK  → rien ;
 *   5ᵉ échec                       → verrou 30 s ;
 *   chaque échec suivant           → durée doublée, plafonnée à MAX_LOCK_MS (15 min).
 *
 * Une connexion réussie remet le compteur à zéro. Les entrées inactives depuis
 * INACTIVITY_RESET_MS disparaissent. État en mémoire (un seul processus Node ;
 * un redémarrage remet à zéro, ce qui est acceptable pour ce niveau de menace).
 *
 * S'applique à toute route qui vérifie un mot de passe de compte : connexions ForetMap et
 * GL (joueur, staff) et rattachement d'un compte ForetMap depuis GL.
 */

const FAILURES_BEFORE_LOCK = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;
const INACTIVITY_RESET_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10000;

function normalizeKey(scope, identifier) {
  const id = String(identifier || '')
    .trim()
    .toLowerCase();
  return `${String(scope || 'login')}:${id}`;
}

function createLoginThrottle({ now = () => Date.now() } = {}) {
  const entries = new Map();

  function prune(currentTime) {
    for (const [key, entry] of entries) {
      if (
        currentTime - entry.lastFailureAt > INACTIVITY_RESET_MS &&
        entry.lockedUntil <= currentTime
      ) {
        entries.delete(key);
      }
    }
    // Garde-fou mémoire : au-delà du plafond, on oublie les plus anciennes entrées.
    if (entries.size > MAX_TRACKED_KEYS) {
      const excess = entries.size - MAX_TRACKED_KEYS;
      let dropped = 0;
      for (const key of entries.keys()) {
        if (dropped >= excess) break;
        entries.delete(key);
        dropped += 1;
      }
    }
  }

  /** @returns {{ blocked: boolean, retryAfterSeconds: number }} */
  function check(scope, identifier) {
    const key = normalizeKey(scope, identifier);
    const currentTime = now();
    const entry = entries.get(key);
    if (!entry) return { blocked: false, retryAfterSeconds: 0 };
    if (entry.lockedUntil > currentTime) {
      return {
        blocked: true,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - currentTime) / 1000)),
      };
    }
    if (currentTime - entry.lastFailureAt > INACTIVITY_RESET_MS) {
      entries.delete(key);
    }
    return { blocked: false, retryAfterSeconds: 0 };
  }

  /** Enregistre un échec ; renvoie l'état (verrouillé ou non) après cet échec. */
  function recordFailure(scope, identifier) {
    const key = normalizeKey(scope, identifier);
    const currentTime = now();
    prune(currentTime);
    const previous = entries.get(key);
    const failures =
      previous && currentTime - previous.lastFailureAt <= INACTIVITY_RESET_MS
        ? previous.failures + 1
        : 1;
    let lockedUntil = 0;
    if (failures >= FAILURES_BEFORE_LOCK) {
      const exponent = failures - FAILURES_BEFORE_LOCK;
      const lockMs = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** exponent);
      lockedUntil = currentTime + lockMs;
    }
    entries.set(key, { failures, lastFailureAt: currentTime, lockedUntil });
    return {
      failures,
      blocked: lockedUntil > currentTime,
      retryAfterSeconds:
        lockedUntil > currentTime ? Math.ceil((lockedUntil - currentTime) / 1000) : 0,
    };
  }

  function clear(scope, identifier) {
    entries.delete(normalizeKey(scope, identifier));
  }

  function reset() {
    entries.clear();
  }

  return { check, recordFailure, clear, reset, size: () => entries.size };
}

const loginThrottle = createLoginThrottle();

/** Réponse 429 normalisée (même forme que le limiteur d'IP, avec `Retry-After`). */
function sendLoginThrottled(res, state) {
  const retry = Math.max(1, Number(state?.retryAfterSeconds || 1));
  res.set('Retry-After', String(retry));
  return res.status(429).json({
    error: `Trop de tentatives pour ce compte, réessayez dans ${retry} s.`,
    retryAfterSeconds: retry,
  });
}

module.exports = {
  FAILURES_BEFORE_LOCK,
  BASE_LOCK_MS,
  MAX_LOCK_MS,
  INACTIVITY_RESET_MS,
  createLoginThrottle,
  loginThrottle,
  sendLoginThrottled,
};
