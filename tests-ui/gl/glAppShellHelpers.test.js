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

  test('mappe les anciens identifiants d’onglet vers les nouveaux libellés', () => {
    localStorage.setItem(GL_TAB_STORAGE_KEY, 'biotope');
    expect(readStoredGlTab()).toBe('ecosystemes');
    localStorage.setItem(GL_TAB_STORAGE_KEY, 'biocenose');
    expect(readStoredGlTab()).toBe('biodiversite');
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
    expect(ids).toContain('joueurs');
    expect(ids).toContain('nature');
    expect(ids).toContain('adventure');
    expect(ids).toContain('monde-gl');
    expect(ids).toContain('joueurs');
    expect(ids).not.toContain('ecosystemes');
    expect(ids).not.toContain('biodiversite');
    expect(ids).not.toContain('glossary');
    expect(ids).not.toContain('history');
    expect(ids).not.toContain('selene-carnet');
    expect(ids).not.toContain('spells');
    expect(ids).not.toContain('world');
    expect(ids).not.toContain('rules');
    expect(ids).not.toContain('tutorials');
    expect(ids).not.toContain('lore-glossary');
    expect(ids).not.toContain('forum');
    expect(ids).not.toContain('market');
    expect(ids).not.toContain('stats');
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
    expect(ids).toEqual(expect.arrayContaining(['users', 'contents', 'settings', 'mascots', 'mj']));
    expect(ids).not.toContain('stats');
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
    for (const hidden of ['journal', 'forum', 'my-journal']) {
      expect(ids).not.toContain(hidden);
    }
    expect(ids).toContain('maps');
    expect(ids).toContain('nature');
    expect(ids).toContain('adventure');
    expect(ids).toContain('monde-gl');
    expect(ids).toContain('joueurs');
    expect(ids).not.toContain('tutorials');
    expect(ids).not.toContain('lore-glossary');
    expect(ids).not.toContain('market');
  });

  test('marché : exige le module ET la vitalité gameplay', async () => {
    const { filterGlJoueursSubTabs } = await import('../../src/gl/utils/glAppShellHelpers.js');
    const withoutVitality = filterGlJoueursSubTabs(allModules, {
      vitalityEnabled: false,
    });
    expect(withoutVitality.map((t) => t.id)).not.toContain('market');
    const moduleOff = filterGlJoueursSubTabs(
      { ...allModules, marketEnabled: false },
      { vitalityEnabled: true },
    );
    expect(moduleOff.map((t) => t.id)).not.toContain('market');
    const staffOptions = filterGlJoueursSubTabs(allModules, { vitalityEnabled: true });
    expect(staffOptions.map((t) => t.id)).toContain('market');
  });
});

describe('onglet La nature', () => {
  test('resolveGlNavActiveTab regroupe les sous-onglets SVT', async () => {
    const {
      resolveGlNavActiveTab,
      resolveGlNatureSubTab,
      resolveGlMainTabChange,
      isGlNatureSubTab,
      isGlTabVisibleInNav,
    } = await import('../../src/gl/utils/glAppShellHelpers.js');
    const allModules = Object.fromEntries(
      Object.keys((await import('../../src/gl/constants/modules.js')).GL_MODULE_DEFAULTS).map(
        (k) => [k, true],
      ),
    );

    expect(resolveGlNavActiveTab('glossary')).toBe('nature');
    expect(resolveGlNavActiveTab('ecosystemes')).toBe('nature');
    expect(resolveGlNavActiveTab('maps')).toBe('maps');
    expect(resolveGlNatureSubTab('biodiversite')).toBe('biodiversite');
    expect(resolveGlNatureSubTab('nature')).toBe('ecosystemes');
    expect(resolveGlMainTabChange('nature', allModules)).toBe('ecosystemes');
    expect(isGlNatureSubTab('glossary')).toBe(true);
    expect(isGlNatureSubTab('maps')).toBe(false);
    expect(isGlTabVisibleInNav('glossary', [{ id: 'nature' }, { id: 'maps' }], allModules)).toBe(
      true,
    );
    expect(isGlTabVisibleInNav('forum', [{ id: 'nature' }, { id: 'maps' }], allModules)).toBe(
      false,
    );
  });

  test('readStoredGlTab mappe nature vers écosystèmes', () => {
    localStorage.setItem(GL_TAB_STORAGE_KEY, 'nature');
    expect(readStoredGlTab()).toBe('ecosystemes');
  });
});

describe("onglet L'aventure", () => {
  test('resolveGlNavActiveTab regroupe histoire, carnet et sortilèges', async () => {
    const {
      resolveGlNavActiveTab,
      resolveGlAdventureSubTab,
      resolveGlMainTabChange,
      isGlAdventureSubTab,
      filterGlAdventureSubTabs,
      isGlTabVisibleInNav,
    } = await import('../../src/gl/utils/glAppShellHelpers.js');
    const { GL_MODULE_DEFAULTS } = await import('../../src/gl/constants/modules.js');
    const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((k) => [k, true]));
    const modulesOff = { ...allModules, journalEnabled: false, loreCarnetEnabled: false };

    expect(resolveGlNavActiveTab('history')).toBe('adventure');
    expect(resolveGlNavActiveTab('spells')).toBe('adventure');
    expect(resolveGlAdventureSubTab('spells', allModules)).toBe('spells');
    expect(resolveGlAdventureSubTab('history', modulesOff)).toBe('spells');
    expect(resolveGlMainTabChange('adventure', allModules)).toBe('history');
    expect(resolveGlMainTabChange('adventure', modulesOff)).toBe('spells');
    expect(isGlAdventureSubTab('selene-carnet')).toBe(true);
    expect(filterGlAdventureSubTabs(modulesOff).map((t) => t.id)).toEqual(['spells']);
    expect(isGlTabVisibleInNav('history', [{ id: 'adventure' }], modulesOff)).toBe(false);
    expect(isGlTabVisibleInNav('spells', [{ id: 'adventure' }], modulesOff)).toBe(true);
  });

  test('readStoredGlTab mappe adventure vers histoire', () => {
    localStorage.setItem(GL_TAB_STORAGE_KEY, 'adventure');
    expect(readStoredGlTab()).toBe('history');
  });
});

describe('onglet Le monde G&L', () => {
  test('resolveGlNavActiveTab regroupe introduction, règles, lore et tutoriels', async () => {
    const {
      resolveGlNavActiveTab,
      resolveGlMondeSubTab,
      resolveGlMainTabChange,
      isGlMondeSubTab,
      filterGlMondeSubTabs,
      isGlTabVisibleInNav,
    } = await import('../../src/gl/utils/glAppShellHelpers.js');
    const { GL_MODULE_DEFAULTS } = await import('../../src/gl/constants/modules.js');
    const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((k) => [k, true]));
    const modulesOff = { ...allModules, loreGlossaryEnabled: false, tutorialsEnabled: false };

    expect(resolveGlNavActiveTab('world')).toBe('monde-gl');
    expect(resolveGlNavActiveTab('rules')).toBe('monde-gl');
    expect(resolveGlMondeSubTab('rules', allModules)).toBe('rules');
    expect(resolveGlMondeSubTab('tutorials', modulesOff)).toBe('world');
    expect(resolveGlMainTabChange('monde-gl', allModules)).toBe('world');
    expect(isGlMondeSubTab('lore-glossary')).toBe(true);
    expect(filterGlMondeSubTabs(modulesOff).map((t) => t.id)).toEqual(['world', 'rules']);
    expect(isGlTabVisibleInNav('tutorials', [{ id: 'monde-gl' }], modulesOff)).toBe(false);
    expect(isGlTabVisibleInNav('world', [{ id: 'monde-gl' }], modulesOff)).toBe(true);
  });

  test('readStoredGlTab mappe monde-gl vers introduction', () => {
    localStorage.setItem(GL_TAB_STORAGE_KEY, 'monde-gl');
    expect(readStoredGlTab()).toBe('world');
  });
});

describe('onglet Les joueurs', () => {
  test('resolveGlNavActiveTab regroupe forum, marché et statistiques', async () => {
    const {
      resolveGlNavActiveTab,
      resolveGlJoueursSubTab,
      resolveGlMainTabChange,
      isGlJoueursSubTab,
      filterGlJoueursSubTabs,
      isGlTabVisibleInNav,
    } = await import('../../src/gl/utils/glAppShellHelpers.js');
    const { GL_MODULE_DEFAULTS } = await import('../../src/gl/constants/modules.js');
    const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((k) => [k, true]));
    const modulesOff = { ...allModules, forumEnabled: false, marketEnabled: false };
    const joueursOptions = { vitalityEnabled: true };

    expect(resolveGlNavActiveTab('forum')).toBe('joueurs');
    expect(resolveGlNavActiveTab('stats')).toBe('joueurs');
    expect(resolveGlJoueursSubTab('stats', modulesOff, joueursOptions)).toBe('stats');
    expect(resolveGlJoueursSubTab('forum', modulesOff, joueursOptions)).toBe('stats');
    expect(resolveGlMainTabChange('joueurs', allModules, joueursOptions)).toBe('forum');
    expect(isGlJoueursSubTab('market')).toBe(true);
    expect(filterGlJoueursSubTabs(allModules, joueursOptions).map((t) => t.id)).toEqual([
      'forum',
      'market',
      'stats',
    ]);
    expect(filterGlJoueursSubTabs(modulesOff, { vitalityEnabled: false }).map((t) => t.id)).toEqual(
      ['stats'],
    );
    expect(isGlTabVisibleInNav('forum', [{ id: 'joueurs' }], modulesOff, joueursOptions)).toBe(
      false,
    );
    expect(isGlTabVisibleInNav('stats', [{ id: 'joueurs' }], modulesOff, joueursOptions)).toBe(
      true,
    );
  });

  test('readStoredGlTab mappe joueurs vers statistiques', () => {
    localStorage.setItem(GL_TAB_STORAGE_KEY, 'joueurs');
    expect(readStoredGlTab()).toBe('stats');
  });
});
