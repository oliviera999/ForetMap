import { describe, test, expect, beforeEach } from 'vitest';
import {
  decodeBase64UrlJson,
  readStoredGlTab,
  isGlAdminRole,
  defaultTabForGlAuth,
  toGameViewModel,
  parseGlOauthHash,
  filterGlTabs,
} from '../../src/gl/utils/glAppShellHelpers.js';
import { GL_TAB_STORAGE_KEY } from '../../src/gl/constants/app-runtime.js';
import { GL_MODULE_DEFAULTS } from '../../src/gl/constants/modules.js';

function encodeBase64Url(obj) {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('decodeBase64UrlJson', () => {
  test('décode un payload base64url avec padding implicite', () => {
    const payload = { type: 'gl_player', token: 'abc' };
    expect(decodeBase64UrlJson(encodeBase64Url(payload))).toEqual(payload);
  });

  test('retourne null sur une valeur illisible ou vide', () => {
    expect(decodeBase64UrlJson('%%%')).toBeNull();
    expect(decodeBase64UrlJson('')).toBeNull();
    expect(decodeBase64UrlJson(null)).toBeNull();
  });
});

describe('readStoredGlTab', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('retourne l’onglet mémorisé quand il est connu', () => {
    localStorage.setItem(GL_TAB_STORAGE_KEY, 'glossary');
    expect(readStoredGlTab()).toBe('glossary');
  });

  test('replie sur world si absent ou inconnu', () => {
    expect(readStoredGlTab()).toBe('world');
    localStorage.setItem(GL_TAB_STORAGE_KEY, 'onglet-fantome');
    expect(readStoredGlTab()).toBe('world');
  });
});

describe('isGlAdminRole / defaultTabForGlAuth', () => {
  test('gl_admin atterrit sur la console MJ, joueur sur les cartes', () => {
    expect(isGlAdminRole({ userType: 'gl_admin' })).toBe(true);
    expect(isGlAdminRole({ userType: 'gl_player' })).toBe(false);
    expect(isGlAdminRole(null)).toBe(false);
    expect(defaultTabForGlAuth({ userType: 'gl_admin' })).toBe('mj');
    expect(defaultTabForGlAuth({ userType: 'gl_player' })).toBe('maps');
    expect(defaultTabForGlAuth(null)).toBe('maps');
  });
});

describe('toGameViewModel', () => {
  test('null reste null', () => {
    expect(toGameViewModel(null)).toBeNull();
  });

  test('normalise les collections manquantes en valeurs sûres', () => {
    const vm = toGameViewModel({ game: { id: 4 }, teams: 'oops' });
    expect(vm).toEqual({
      game: { id: 4 },
      teams: [],
      markers: [],
      scores: {},
      pendingActions: [],
      events: [],
      roster: [],
      vitality: null,
    });
  });

  test('préserve les collections fournies', () => {
    const raw = {
      game: { id: 1 },
      teams: [{ id: 9 }],
      markers: [{ id: 'm' }],
      scores: { 9: 3 },
      pendingActions: [{ id: 'a' }],
      events: [{ id: 'e' }],
      roster: [{ playerId: 2, teamId: 9 }],
      vitality: { enabled: true, byPlayerId: { 2: { health: 3, power: 3 } } },
    };
    expect(toGameViewModel(raw)).toEqual(raw);
  });
});

describe('parseGlOauthHash', () => {
  test('hash vide ou sans clé oauth → null', () => {
    expect(parseGlOauthHash('')).toBeNull();
    expect(parseGlOauthHash('foo=bar')).toBeNull();
  });

  test('oauth_error → erreur avec le code serveur', () => {
    expect(parseGlOauthHash('oauth_error=oauth_google_refused')).toEqual({
      kind: 'error',
      code: 'oauth_google_refused',
    });
  });

  test('payload staff ou joueur valide → session', () => {
    const staff = encodeBase64Url({
      type: 'gl_staff',
      token: 'tok-s',
      auth: { userType: 'gl_admin' },
    });
    expect(parseGlOauthHash(`oauth=${staff}`)).toEqual({
      kind: 'session',
      token: 'tok-s',
      auth: { userType: 'gl_admin' },
    });
    const player = encodeBase64Url({ type: 'gl_player', token: 'tok-p' });
    expect(parseGlOauthHash(`oauth=${player}`)).toEqual({
      kind: 'session',
      token: 'tok-p',
      auth: null,
    });
  });

  test('payload illisible, type inconnu ou token manquant → invalid', () => {
    expect(parseGlOauthHash('oauth=%%%')).toEqual({ kind: 'invalid' });
    const unknown = encodeBase64Url({ type: 'autre', token: 'tok' });
    expect(parseGlOauthHash(`oauth=${unknown}`)).toEqual({ kind: 'invalid' });
    const noToken = encodeBase64Url({ type: 'gl_staff' });
    expect(parseGlOauthHash(`oauth=${noToken}`)).toEqual({ kind: 'invalid' });
  });
});

describe('filterGlTabs', () => {
  const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((k) => [k, true]));

  test('joueur avec tous les modules : tous les onglets joueur, aucun admin', () => {
    const tabs = filterGlTabs({
      modules: allModules,
      vitalityEnabled: true,
      showStaffAdminUi: false,
    });
    const ids = tabs.map((t) => t.id);
    expect(ids).toContain('maps');
    expect(ids).toContain('market');
    expect(ids).toContain('lore-glossary');
    expect(ids).not.toContain('mj');
    expect(ids).not.toContain('settings');
  });

  test('staff : onglets admin ajoutés après les onglets joueur', () => {
    const tabs = filterGlTabs({
      modules: allModules,
      vitalityEnabled: true,
      showStaffAdminUi: true,
    });
    const ids = tabs.map((t) => t.id);
    expect(ids.indexOf('mj')).toBeGreaterThan(ids.indexOf('maps'));
    expect(ids).toEqual(
      expect.arrayContaining(['stats', 'users', 'contents', 'settings', 'mascots', 'mj']),
    );
  });

  test('modules coupés → onglets gérés masqués', () => {
    const modules = {
      ...allModules,
      journalEnabled: false,
      tutorialsEnabled: false,
      forumEnabled: false,
      playerJournalEnabled: false,
      loreCarnetEnabled: false,
      loreGlossaryEnabled: false,
    };
    const ids = filterGlTabs({ modules, vitalityEnabled: true, showStaffAdminUi: false }).map(
      (t) => t.id,
    );
    for (const hidden of [
      'history',
      'journal',
      'tutorials',
      'forum',
      'my-journal',
      'selene-carnet',
      'lore-glossary',
    ]) {
      expect(ids).not.toContain(hidden);
    }
    expect(ids).toContain('maps');
    expect(ids).toContain('glossary');
  });

  test('marché : exige le module ET la vitalité gameplay', () => {
    const withoutVitality = filterGlTabs({
      modules: allModules,
      vitalityEnabled: false,
      showStaffAdminUi: false,
    });
    expect(withoutVitality.map((t) => t.id)).not.toContain('market');
    const moduleOff = filterGlTabs({
      modules: { ...allModules, marketEnabled: false },
      vitalityEnabled: true,
      showStaffAdminUi: false,
    });
    expect(moduleOff.map((t) => t.id)).not.toContain('market');
  });
});
