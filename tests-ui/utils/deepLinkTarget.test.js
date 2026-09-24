// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import {
  buildDeepLinkUrl,
  clearPendingDeepLink,
  consumeDeepLinkFromLocation,
  readDeepLinkTargetFromSearch,
} from '../../src/utils/deepLinkTarget.js';

describe('readDeepLinkTargetFromSearch', () => {
  test('tâche, avec ou sans carte', () => {
    expect(readDeepLinkTargetFromSearch('?tache=42&carte=foret')).toEqual({
      type: 'task',
      id: '42',
      mapId: 'foret',
    });
    expect(readDeepLinkTargetFromSearch('?tache=abc-1')).toEqual({
      type: 'task',
      id: 'abc-1',
      mapId: null,
    });
  });

  test('lieu : zone ou repère', () => {
    expect(readDeepLinkTargetFromSearch('?lieu=zone:z12&carte=n3')).toEqual({
      type: 'place',
      kind: 'zone',
      id: 'z12',
      mapId: 'n3',
    });
    expect(readDeepLinkTargetFromSearch('?lieu=marker:7')).toMatchObject({
      type: 'place',
      kind: 'marker',
      id: '7',
    });
    expect(readDeepLinkTargetFromSearch('?lieu=plante:7')).toBeNull();
  });

  test('sujet du forum, réponse optionnelle', () => {
    expect(readDeepLinkTargetFromSearch('?fil=t1&message=p9')).toEqual({
      type: 'thread',
      id: 't1',
      postId: 'p9',
    });
  });

  test('valeurs invalides ou absentes : rien', () => {
    expect(readDeepLinkTargetFromSearch('')).toBeNull();
    expect(readDeepLinkTargetFromSearch('?tache=<script>')).toBeNull();
    expect(readDeepLinkTargetFromSearch('?tab=tasks')).toBeNull();
  });
});

describe('buildDeepLinkUrl', () => {
  test('aller-retour avec la lecture', () => {
    const targets = [
      { type: 'task', id: '42', mapId: 'foret' },
      { type: 'place', kind: 'marker', id: '7', mapId: 'n3' },
      { type: 'thread', id: 't1', postId: 'p9' },
    ];
    for (const target of targets) {
      const url = new URL(buildDeepLinkUrl('https://exemple.test/', target));
      expect(readDeepLinkTargetFromSearch(url.search)).toEqual(target);
    }
  });
});

describe('consumeDeepLinkFromLocation', () => {
  beforeEach(() => {
    clearPendingDeepLink();
    window.history.replaceState(null, '', '/');
  });

  test('retire les paramètres de l’adresse en gardant les autres, et met la cible de côté', () => {
    window.history.replaceState(null, '', '/?tab=map&lieu=zone:z1&carte=foret#x');
    const target = consumeDeepLinkFromLocation(window);
    expect(target).toEqual({ type: 'place', kind: 'zone', id: 'z1', mapId: 'foret' });
    expect(window.location.search).toBe('?tab=map');
    expect(window.location.hash).toBe('#x');
    // Rechargement (écran de connexion) : la cible est retrouvée.
    expect(consumeDeepLinkFromLocation(window)).toEqual(target);
    clearPendingDeepLink();
    expect(consumeDeepLinkFromLocation(window)).toBeNull();
  });
});
