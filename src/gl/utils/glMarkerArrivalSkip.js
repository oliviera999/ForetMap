/** Registre éphémère pour ignorer la présentation d'arrivée (effet auto sans case finale). */

const skipUntilByKey = new Map();

function skipKey(teamId, markerId) {
  return `${Number(teamId)}:${Number(markerId)}`;
}

export function registerSkipMarkerArrival(teamId, markerId, ttlMs = 15000) {
  const key = skipKey(teamId, markerId);
  if (!Number.isFinite(Number(teamId)) || !Number.isFinite(Number(markerId))) return;
  skipUntilByKey.set(key, Date.now() + Math.max(1000, Number(ttlMs) || 15000));
}

export function consumeSkipMarkerArrival(teamId, markerId) {
  const key = skipKey(teamId, markerId);
  const until = skipUntilByKey.get(key);
  if (!until) return false;
  skipUntilByKey.delete(key);
  if (Date.now() > until) return false;
  return true;
}

export function shouldSkipMarkerArrival(teamId, markerId) {
  const key = skipKey(teamId, markerId);
  const until = skipUntilByKey.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    skipUntilByKey.delete(key);
    return false;
  }
  return true;
}
