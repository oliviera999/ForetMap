import { describe, test, expect } from 'vitest';
import {
  resolveOauthErrorMessage,
  decodeBase64UrlJson,
  readStoredTab,
  detectIosDevice,
  pickVisibleMapId,
  shouldUseDesktopSplitLayout,
} from '../../src/utils/appShellHelpers';
import { TAB_STORAGE_KEY } from '../../src/constants/app-runtime';

function setUserAgent(value) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value,
    configurable: true,
  });
}

describe('resolveOauthErrorMessage', () => {
  test('code connu → message dédié', () => {
    expect(resolveOauthErrorMessage('oauth_google_refused')).toBe('Connexion Google annulée.');
  });

  test('code inconnu ou absent → message générique', () => {
    expect(resolveOauthErrorMessage('oauth_mystere')).toBe('Connexion Google refusée.');
    expect(resolveOauthErrorMessage(undefined)).toBe('Connexion Google refusée.');
  });
});

describe('decodeBase64UrlJson', () => {
  test('décode un payload base64url (sans padding, alphabet -_ )', () => {
    const payload = { type: 'teacher', token: 'abc?>~' };
    const encoded = window.btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeBase64UrlJson(encoded)).toEqual(payload);
  });

  test('payload illisible → lève (géré par le try/catch appelant)', () => {
    expect(() => decodeBase64UrlJson('%%%')).toThrow();
  });
});

describe('readStoredTab', () => {
  test('aucune valeur mémorisée → map', () => {
    expect(readStoredTab()).toBe('map');
  });

  test('onglet connu mémorisé (casse ignorée) → restitué', () => {
    localStorage.setItem(TAB_STORAGE_KEY, '  TASKS ');
    expect(readStoredTab()).toBe('tasks');
  });

  test('valeur inconnue → repli sur map', () => {
    localStorage.setItem(TAB_STORAGE_KEY, 'onglet-disparu');
    expect(readStoredTab()).toBe('map');
  });
});

describe('detectIosDevice', () => {
  test('iPhone → vrai ; desktop → faux', () => {
    const original = window.navigator.userAgent;
    try {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
      expect(detectIosDevice()).toBe(true);
      setUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/120');
      expect(detectIosDevice()).toBe(false);
    } finally {
      setUserAgent(original);
    }
  });
});

describe('pickVisibleMapId', () => {
  const maps = [{ id: 'foret' }, { id: 'jardin' }];

  test('liste vide ou invalide → chaîne vide', () => {
    expect(pickVisibleMapId([], 'foret')).toBe('');
    expect(pickVisibleMapId(null, 'foret')).toBe('');
  });

  test('carte préférée visible → conservée', () => {
    expect(pickVisibleMapId(maps, 'jardin')).toBe('jardin');
  });

  test('carte préférée absente ou vide → première carte visible', () => {
    expect(pickVisibleMapId(maps, 'mare')).toBe('foret');
    expect(pickVisibleMapId(maps)).toBe('foret');
  });
});

describe('shouldUseDesktopSplitLayout', () => {
  test('sous la largeur minimale → faux', () => {
    expect(shouldUseDesktopSplitLayout(1023)).toBe(false);
  });

  test('largeur minimale atteinte mais colonnes trop étroites → faux', () => {
    // 1100px : colonne carte ≈ 584px < 620px requis.
    expect(shouldUseDesktopSplitLayout(1100)).toBe(false);
  });

  test('viewport large → vrai', () => {
    expect(shouldUseDesktopSplitLayout(1200)).toBe(true);
    expect(shouldUseDesktopSplitLayout(1600)).toBe(true);
  });
});
