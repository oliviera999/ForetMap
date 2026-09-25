/**
 * Séance pédagogique en cours, vue des appels d'API qui en dépendent.
 *
 * La séance impose son niveau, **verrouillage compris** (décision du mainteneur du 25/09/2026) :
 * un élève de collège dans une séance « lycée » reçoit les questions de lycée pour valider une
 * fiche. Le serveur ne peut pas deviner la séance ouverte dans l'onglet (quitter une séance ne
 * laisse aucune trace en base) : le client l'annonce par `?pedagoSession=<id>`, et le serveur
 * ne la croit que si l'élève en a une exécution démarrée et non terminée
 * (`lib/pedago/learnerLevel.js`, `loadActivePedagoSession`).
 *
 * Même clé de stockage que la séance affichée (`SessionsView.jsx`) : une seule vérité par
 * onglet (`sessionStorage`).
 */

export const PEDAGO_SESSION_STORAGE_KEY = 'foretmap.pedagoSession.v1';

/** Identifiant de la séance en cours dans cet onglet, ou `null`. */
export function activePedagoSessionId() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(PEDAGO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const id = JSON.parse(raw)?.id;
    return id != null && String(id).trim() ? String(id).trim() : null;
  } catch {
    return null;
  }
}

/** Ajoute `pedagoSession=<id>` à un chemin d'API (sans rien toucher sans séance). */
export function withPedagoSessionParam(path, sessionId = activePedagoSessionId()) {
  const p = String(path || '');
  if (!sessionId || /[?&]pedagoSession=/.test(p)) return p;
  const sep = p.includes('?') ? '&' : '?';
  return `${p}${sep}pedagoSession=${encodeURIComponent(sessionId)}`;
}

/**
 * Enveloppe un client HTTP (`api`) pour qu'il annonce la séance en cours. Réservé aux appels
 * du verrouillage : résumé, épreuve et validation d'une fiche, d'un tutoriel ou d'un terme.
 */
export function withPedagoSessionScope(request) {
  return (path, method, body) => request(withPedagoSessionParam(path), method, body);
}
