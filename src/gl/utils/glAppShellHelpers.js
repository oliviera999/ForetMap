/**
 * Helpers purs du shell AppGL (O6), extraits de `src/gl/AppGL.jsx` :
 * onglet mémorisé, rôle admin, payload OAuth du hash d'URL, view model de
 * partie et filtrage des onglets selon modules / gameplay.
 * Aucun état React ici — uniquement des dérivations.
 */
import {
  GL_TAB_STORAGE_KEY,
  GL_PLAYER_TABS,
  GL_ADMIN_EXTRA_TABS,
  GL_VALID_TABS,
} from '../constants/app-runtime.js';
import { isModuleEnabled } from '../constants/modules.js';

/** Décode un payload base64url (retour OAuth dans le hash d'URL) en objet JSON, `null` si invalide. */
export function decodeBase64UrlJson(value) {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (_) {
    return null;
  }
}

/** Onglet mémorisé en localStorage, replié sur `world` si absent ou inconnu. */
export function readStoredGlTab() {
  try {
    const raw = String(localStorage.getItem(GL_TAB_STORAGE_KEY) || '').trim();
    if (GL_VALID_TABS.has(raw)) return raw;
  } catch (_) {
    // noop
  }
  return 'world';
}

export function isGlAdminRole(auth) {
  return auth?.userType === 'gl_admin';
}

/** Onglet d'atterrissage : console MJ pour le staff, cartes pour les joueurs. */
export function defaultTabForGlAuth(auth) {
  return isGlAdminRole(auth) ? 'mj' : 'maps';
}

/** Normalise la réponse `/api/gl/games/:id` en view model stable pour l'UI. */
export function toGameViewModel(raw) {
  if (!raw) return null;
  const game = raw?.game || null;
  const teams = Array.isArray(raw?.teams) ? raw.teams : [];
  const markers = Array.isArray(raw?.markers) ? raw.markers : [];
  const scores = raw?.scores || {};
  const pendingActions = Array.isArray(raw?.pendingActions) ? raw.pendingActions : [];
  return { game, teams, markers, scores, pendingActions, events: raw?.events || [] };
}

/**
 * Interprète le hash OAuth (`#oauth=...` / `#oauth_error=...`) :
 * - `null` si le hash ne concerne pas OAuth ;
 * - `{ kind: 'error', code }` pour un refus serveur ;
 * - `{ kind: 'session', token, auth }` pour un payload staff/joueur valide ;
 * - `{ kind: 'invalid' }` pour un payload illisible ou d'un type inconnu.
 */
export function parseGlOauthHash(hashRaw) {
  if (!hashRaw) return null;
  const hashParams = new URLSearchParams(hashRaw);
  const oauthPayload = hashParams.get('oauth');
  const oauthError = hashParams.get('oauth_error');
  if (!oauthPayload && !oauthError) return null;
  if (oauthError) return { kind: 'error', code: oauthError };
  const payload = decodeBase64UrlJson(oauthPayload);
  const isKnownType = payload?.type === 'gl_staff' || payload?.type === 'gl_player';
  if (isKnownType && payload?.token) {
    return { kind: 'session', token: payload.token, auth: payload.auth || null };
  }
  return { kind: 'invalid' };
}

/**
 * Onglets visibles : onglets joueur filtrés par modules (et vitalité pour le
 * marché), suivis des onglets admin si l'UI staff est affichée.
 */
export function filterGlTabs({ modules, vitalityEnabled, showStaffAdminUi }) {
  const playerTabs = GL_PLAYER_TABS.filter((tab) => {
    if (tab.id === 'history') return isModuleEnabled(modules, 'journalEnabled');
    if (tab.id === 'tutorials') return isModuleEnabled(modules, 'tutorialsEnabled');
    if (tab.id === 'forum') return isModuleEnabled(modules, 'forumEnabled');
    if (tab.id === 'market') {
      return isModuleEnabled(modules, 'marketEnabled') && !!vitalityEnabled;
    }
    if (tab.id === 'journal') return isModuleEnabled(modules, 'journalEnabled');
    if (tab.id === 'my-journal') return isModuleEnabled(modules, 'playerJournalEnabled');
    if (tab.id === 'selene-carnet') return isModuleEnabled(modules, 'loreCarnetEnabled');
    if (tab.id === 'lore-glossary') return isModuleEnabled(modules, 'loreGlossaryEnabled');
    return true;
  });
  return showStaffAdminUi ? [...playerTabs, ...GL_ADMIN_EXTRA_TABS] : playerTabs;
}
