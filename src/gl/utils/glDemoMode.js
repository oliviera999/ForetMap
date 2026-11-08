/**
 * Modes de **démonstration** de Gnomes & Licornes, lus dans l'URL de `gl.html`.
 *
 * Deux déclinaisons du Mode Découverte (session invitée `gl_guest`, lecture seule) :
 *
 * - `?demo=parents` — la **vitrine pour les parents** : la session invitée s'ouvre seule,
 *   un onglet « Pour les parents » présente le jeu en cinq étapes (univers, plateau, fiche
 *   nature, quiz d'essai, apprentissages) et OLU guide la visite.
 * - `?kiosque=1` — la **borne** (CDI, portes ouvertes) : session invitée automatique, aucun
 *   bouton de connexion ni de sortie, écran d'accueil tactile et remise à zéro après
 *   `?inactivite=<secondes>` sans geste (120 s par défaut).
 *
 * Les deux se combinent (`?demo=parents&kiosque=1`). Ils ne font **rien** quand un compte
 * est déjà connecté : une URL ne doit jamais déconnecter un MJ. Pur, sans React : testé
 * dans `tests-ui/gl/glDemoMode.test.js`.
 */

export const GL_DEMO_PROFILE_PARENTS = 'parents';
export const GL_DEMO_PROFILES = Object.freeze([GL_DEMO_PROFILE_PARENTS]);

/** Remise à zéro de la borne : 2 minutes sans geste, bornée entre 30 s et 30 min. */
export const GL_KIOSK_IDLE_DEFAULT_SECONDS = 120;
export const GL_KIOSK_IDLE_MIN_SECONDS = 30;
export const GL_KIOSK_IDLE_MAX_SECONDS = 1800;

/** Mémoire des visites OLU propre aux démos : remise à zéro à chaque ouverture. */
export const GL_DEMO_TOUR_SEEN_STORAGE_KEY = 'gl_discovery_seen_demo_v1';

const TRUE_VALUES = new Set(['1', 'true', 'oui', 'yes', 'on']);

function normalizeFlag(value) {
  if (value == null) return false;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

/**
 * @param {string} search `window.location.search` (ou une chaîne de requête quelconque)
 * @returns {{ profile: string|null, kiosk: boolean, idleSeconds: number }}
 */
export function readGlDemoModeFromSearch(search = '') {
  let params;
  try {
    params = new URLSearchParams(String(search || ''));
  } catch (_) {
    params = new URLSearchParams();
  }
  const rawProfile = String(params.get('demo') || '')
    .trim()
    .toLowerCase();
  const profile = GL_DEMO_PROFILES.includes(rawProfile) ? rawProfile : null;
  const kiosk = normalizeFlag(params.get('kiosque')) || normalizeFlag(params.get('kiosk'));
  const rawIdleText = String(params.get('inactivite') || '').trim();
  const rawIdle = rawIdleText ? Number(rawIdleText) : NaN;
  const idleSeconds = Number.isFinite(rawIdle)
    ? Math.min(GL_KIOSK_IDLE_MAX_SECONDS, Math.max(GL_KIOSK_IDLE_MIN_SECONDS, Math.round(rawIdle)))
    : GL_KIOSK_IDLE_DEFAULT_SECONDS;
  return { profile, kiosk, idleSeconds };
}

/** Lecture depuis l'URL courante ; hors navigateur, aucun mode. */
export function readGlDemoModeFromUrl() {
  if (typeof window === 'undefined') return { profile: null, kiosk: false, idleSeconds: 0 };
  return readGlDemoModeFromSearch(window.location.search);
}

/** Un mode de démonstration est-il demandé par l'URL ? */
export function isGlDemoRequested(mode) {
  return !!(mode && (mode.profile || mode.kiosk));
}

/** Onglet d'atterrissage d'une session de démonstration. */
export function glDemoLandingTab(mode) {
  if (mode?.profile === GL_DEMO_PROFILE_PARENTS) return 'parents';
  return 'discovery';
}
