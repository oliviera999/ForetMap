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
  GL_DISCOVERY_TAB,
  GL_GUEST_TAB_IDS,
  GL_NATURE_SUB_TAB_IDS,
  GL_NATURE_TAB,
  GL_ADVENTURE_SUB_TABS,
  GL_ADVENTURE_SUB_TAB_IDS,
  GL_ADVENTURE_TAB,
  GL_MONDE_SUB_TABS,
  GL_MONDE_SUB_TAB_IDS,
  GL_MONDE_TAB,
  GL_JOUEURS_SUB_TABS,
  GL_JOUEURS_SUB_TAB_IDS,
  GL_JOUEURS_TAB,
} from '../constants/app-runtime.js';
import { isModuleEnabled } from '../constants/modules.js';
import { isGlGuest } from './glGuestMode.js';

/** Décode un payload base64url (retour OAuth dans le hash d'URL) en objet JSON, `null` si invalide. */
export function decodeBase64UrlJson(value) {
  try {
    const normalized = String(value || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (_) {
    return null;
  }
}

const GL_LEGACY_TAB_ALIASES = Object.freeze({
  biotope: 'ecosystemes',
  biocenose: 'biodiversite',
});

const GL_NATURE_SUB_TAB_SET = new Set(GL_NATURE_SUB_TAB_IDS);
const GL_ADVENTURE_SUB_TAB_SET = new Set(GL_ADVENTURE_SUB_TAB_IDS);
const GL_MONDE_SUB_TAB_SET = new Set(GL_MONDE_SUB_TAB_IDS);
const GL_JOUEURS_SUB_TAB_SET = new Set(GL_JOUEURS_SUB_TAB_IDS);

/** Sous-onglets visibles de « Les joueurs » selon modules et vitalité gameplay. */
export function filterGlJoueursSubTabs(modules, { vitalityEnabled = false } = {}) {
  return GL_JOUEURS_SUB_TABS.filter((subTab) => {
    if (subTab.id === 'stats') return true;
    if (subTab.requiresVitality) {
      return isModuleEnabled(modules, subTab.module) && !!vitalityEnabled;
    }
    if (subTab.module) return isModuleEnabled(modules, subTab.module);
    return true;
  });
}

/** Premier sous-onglet disponible de « Les joueurs ». */
export function defaultGlJoueursSubTab(modules, { vitalityEnabled = false } = {}) {
  return filterGlJoueursSubTabs(modules, { vitalityEnabled })[0]?.id || 'stats';
}

/** Sous-onglets visibles de « Le monde G&L » selon les modules activés. */
export function filterGlMondeSubTabs(modules) {
  return GL_MONDE_SUB_TABS.filter((subTab) => {
    if (!subTab.module) return true;
    return isModuleEnabled(modules, subTab.module);
  });
}

/** Premier sous-onglet disponible de « Le monde G&L ». */
export function defaultGlMondeSubTab(modules) {
  return filterGlMondeSubTabs(modules)[0]?.id || 'world';
}

/** Sous-onglets visibles de « L'aventure » selon les modules activés. */
export function filterGlAdventureSubTabs(modules) {
  return GL_ADVENTURE_SUB_TABS.filter((subTab) => {
    if (!subTab.module) return true;
    return isModuleEnabled(modules, subTab.module);
  });
}

/** Premier sous-onglet disponible de « L'aventure ». */
export function defaultGlAdventureSubTab(modules) {
  return filterGlAdventureSubTabs(modules)[0]?.id || 'spells';
}

/** Sous-onglet actif de « La nature » (écosystèmes par défaut). */
export function resolveGlNatureSubTab(tab) {
  const resolved = GL_LEGACY_TAB_ALIASES[tab] || tab;
  if (GL_NATURE_SUB_TAB_SET.has(resolved)) return resolved;
  return 'ecosystemes';
}

/** Sous-onglet actif de « L'aventure » (premier disponible par défaut). */
export function resolveGlAdventureSubTab(tab, modules) {
  const resolved = tab;
  const visibleIds = new Set(filterGlAdventureSubTabs(modules).map((subTab) => subTab.id));
  if (visibleIds.has(resolved)) return resolved;
  if (resolved === GL_ADVENTURE_TAB.id) return defaultGlAdventureSubTab(modules);
  return defaultGlAdventureSubTab(modules);
}

/** Sous-onglet actif de « Le monde G&L » (introduction par défaut). */
export function resolveGlMondeSubTab(tab, modules) {
  const resolved = tab;
  const visibleIds = new Set(filterGlMondeSubTabs(modules).map((subTab) => subTab.id));
  if (visibleIds.has(resolved)) return resolved;
  if (resolved === GL_MONDE_TAB.id) return defaultGlMondeSubTab(modules);
  return defaultGlMondeSubTab(modules);
}

/** Sous-onglet actif de « Les joueurs » (premier disponible par défaut). */
export function resolveGlJoueursSubTab(tab, modules, joueursOptions = {}) {
  const resolved = tab;
  const visibleIds = new Set(
    filterGlJoueursSubTabs(modules, joueursOptions).map((subTab) => subTab.id),
  );
  if (visibleIds.has(resolved)) return resolved;
  if (resolved === GL_JOUEURS_TAB.id) return defaultGlJoueursSubTab(modules, joueursOptions);
  return defaultGlJoueursSubTab(modules, joueursOptions);
}

export function isGlNatureSubTab(tab) {
  return GL_NATURE_SUB_TAB_SET.has(GL_LEGACY_TAB_ALIASES[tab] || tab);
}

export function isGlAdventureSubTab(tab) {
  return GL_ADVENTURE_SUB_TAB_SET.has(tab);
}

export function isGlMondeSubTab(tab) {
  return GL_MONDE_SUB_TAB_SET.has(tab);
}

export function isGlJoueursSubTab(tab) {
  return GL_JOUEURS_SUB_TAB_SET.has(tab);
}

/** Onglet principal mis en surbrillance dans la barre de navigation. */
export function resolveGlNavActiveTab(tab) {
  if (tab === GL_NATURE_TAB.id || isGlNatureSubTab(tab)) return GL_NATURE_TAB.id;
  if (tab === GL_ADVENTURE_TAB.id || isGlAdventureSubTab(tab)) return GL_ADVENTURE_TAB.id;
  if (tab === GL_MONDE_TAB.id || isGlMondeSubTab(tab)) return GL_MONDE_TAB.id;
  if (tab === GL_JOUEURS_TAB.id || isGlJoueursSubTab(tab)) return GL_JOUEURS_TAB.id;
  return tab;
}

/** Onglet mémorisé en localStorage, replié sur `world` si absent ou inconnu. */
export function readStoredGlTab() {
  try {
    const raw = String(localStorage.getItem(GL_TAB_STORAGE_KEY) || '').trim();
    const resolved = GL_LEGACY_TAB_ALIASES[raw] || raw;
    if (resolved === GL_NATURE_TAB.id) return 'ecosystemes';
    if (resolved === GL_ADVENTURE_TAB.id) return 'history';
    if (resolved === GL_MONDE_TAB.id) return 'world';
    if (resolved === GL_JOUEURS_TAB.id) return 'stats';
    if (GL_VALID_TABS.has(resolved)) return resolved;
  } catch (_) {
    // noop
  }
  return 'world';
}

/** Changement d’onglet depuis la barre principale (parents → sous-onglet par défaut). */
export function resolveGlMainTabChange(tabId, modules, joueursOptions = {}) {
  if (tabId === GL_NATURE_TAB.id) return 'ecosystemes';
  if (tabId === GL_ADVENTURE_TAB.id) return defaultGlAdventureSubTab(modules);
  if (tabId === GL_MONDE_TAB.id) return defaultGlMondeSubTab(modules);
  if (tabId === GL_JOUEURS_TAB.id) return defaultGlJoueursSubTab(modules, joueursOptions);
  return tabId;
}

export function isGlTabVisibleInNav(tab, tabs, modules, joueursOptions = {}) {
  if (isGlNatureSubTab(tab)) {
    return tabs.some((current) => current.id === GL_NATURE_TAB.id);
  }
  if (isGlAdventureSubTab(tab)) {
    if (!tabs.some((current) => current.id === GL_ADVENTURE_TAB.id)) return false;
    return filterGlAdventureSubTabs(modules).some((subTab) => subTab.id === tab);
  }
  if (isGlMondeSubTab(tab)) {
    if (!tabs.some((current) => current.id === GL_MONDE_TAB.id)) return false;
    return filterGlMondeSubTabs(modules).some((subTab) => subTab.id === tab);
  }
  if (isGlJoueursSubTab(tab)) {
    if (!tabs.some((current) => current.id === GL_JOUEURS_TAB.id)) return false;
    return filterGlJoueursSubTabs(modules, joueursOptions).some((subTab) => subTab.id === tab);
  }
  return tabs.some((current) => current.id === tab);
}

export function isGlAdminRole(auth) {
  return auth?.userType === 'gl_admin';
}

/** Onglet d'atterrissage : console MJ pour le staff, découverte pour invité, cartes pour les joueurs. */
export function defaultTabForGlAuth(auth) {
  if (isGlGuest(auth)) return 'discovery';
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
  const roster = Array.isArray(raw?.roster) ? raw.roster : [];
  const vitality = raw?.vitality && typeof raw.vitality === 'object' ? raw.vitality : null;
  return {
    game,
    teams,
    markers,
    scores,
    pendingActions,
    events: raw?.events || [],
    roster,
    vitality,
  };
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
export function filterGlTabs({ modules, vitalityEnabled, showStaffAdminUi, isGuest = false }) {
  if (isGuest) {
    return GL_GUEST_TAB_IDS.map((id) => {
      if (id === GL_DISCOVERY_TAB.id) return GL_DISCOVERY_TAB;
      if (id === GL_NATURE_TAB.id) return GL_NATURE_TAB;
      if (id === GL_ADVENTURE_TAB.id) return GL_ADVENTURE_TAB;
      if (id === GL_MONDE_TAB.id) return GL_MONDE_TAB;
      return GL_PLAYER_TABS.find((tab) => tab.id === id);
    }).filter(Boolean);
  }

  const playerTabs = GL_PLAYER_TABS.filter((tab) => {
    if (tab.id === GL_JOUEURS_TAB.id) {
      return filterGlJoueursSubTabs(modules, { vitalityEnabled }).length > 0;
    }
    if (tab.id === 'journal') return isModuleEnabled(modules, 'journalEnabled');
    if (tab.id === 'my-journal') return isModuleEnabled(modules, 'playerJournalEnabled');
    return true;
  });
  return showStaffAdminUi ? [...playerTabs, ...GL_ADMIN_EXTRA_TABS] : playerTabs;
}
