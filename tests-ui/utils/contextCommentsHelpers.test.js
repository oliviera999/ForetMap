import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  CONTEXT_COMMENT_PREVIEW_SIZE,
  DEFAULT_REACTION_EMOJIS,
  canModerate,
  contextCommentDraftKey,
  contextCommentReadCursorKey,
  hasUnreadContextComments,
  parseReactionEmojiList,
  readContextCommentDraft,
  readContextCommentReadCursor,
  writeContextCommentDraft,
  writeContextCommentReadCursor,
} from '../../src/utils/contextCommentsHelpers.js';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('contextCommentDraftKey', () => {
  test('compose le préfixe avec type et id', () => {
    expect(contextCommentDraftKey('task', 42)).toBe('foretmap:contextCommentDraft:task:42');
  });

  test('tolère les valeurs nulles', () => {
    expect(contextCommentDraftKey(null, null)).toBe('foretmap:contextCommentDraft::');
  });
});

describe('CONTEXT_COMMENT_PREVIEW_SIZE', () => {
  test('vaut 2 pour l’aperçu replié', () => {
    expect(CONTEXT_COMMENT_PREVIEW_SIZE).toBe(2);
  });
});

describe('draft session storage', () => {
  test('écrit puis relit un brouillon non vide', () => {
    writeContextCommentDraft('task', 7, '  bonjour ');
    expect(readContextCommentDraft('task', 7)).toBe('  bonjour ');
  });

  test('un brouillon vide / blanc supprime la clé', () => {
    writeContextCommentDraft('task', 7, 'x');
    writeContextCommentDraft('task', 7, '   ');
    expect(readContextCommentDraft('task', 7)).toBe('');
  });

  test('ne persiste rien sans contexte valide', () => {
    writeContextCommentDraft('', '', 'ignoré');
    expect(readContextCommentDraft('', '')).toBe('');
  });
});

describe('read cursor local storage', () => {
  // Le curseur porte un marqueur **opaque** : les identifiants de commentaire sont des UUID.
  // Les convertir en nombre donnait `NaN`, replié en `0`, et le badge « non lus » restait muet.
  const UUID = '973af731-ad0e-4477-9668-bf37c406f795';

  test('écrit puis relit un marqueur UUID', () => {
    writeContextCommentReadCursor('eleve', 'u1', 'task', 5, UUID);
    expect(readContextCommentReadCursor('eleve', 'u1', 'task', 5)).toEqual({ newestId: UUID });
  });

  test('un curseur hérité de l’ancienne version (0) vaut « aucun »', () => {
    // Écrit par le code d'avant, qui stockait un nombre. Le relire comme un marqueur ferait
    // paraître le fil non lu une fois — préférable à l'inverse, qui le taisait indéfiniment.
    window.localStorage.setItem(
      contextCommentReadCursorKey('eleve', 'u1', 'task', 5),
      JSON.stringify({ newestId: 0 }),
    );
    expect(readContextCommentReadCursor('eleve', 'u1', 'task', 5)).toBeNull();
  });

  test('un curseur numérique hérité reste lisible', () => {
    window.localStorage.setItem(
      contextCommentReadCursorKey('eleve', 'u1', 'task', 5),
      JSON.stringify({ newestId: 12 }),
    );
    expect(readContextCommentReadCursor('eleve', 'u1', 'task', 5)).toEqual({ newestId: '12' });
  });

  test('retourne null sans identité complète', () => {
    expect(readContextCommentReadCursor('', 'u1', 'task', 5)).toBeNull();
    expect(writeContextCommentReadCursor('', 'u1', 'task', 5, UUID)).toBeUndefined();
  });

  test('retourne null sur stockage corrompu', () => {
    window.localStorage.setItem(contextCommentReadCursorKey('eleve', 'u1', 'task', 5), '{bad json');
    expect(readContextCommentReadCursor('eleve', 'u1', 'task', 5)).toBeNull();
  });
});

describe('hasUnreadContextComments', () => {
  const VU = '973af731-ad0e-4477-9668-bf37c406f795';
  const NOUVEAU = '0304444d-8d91-464f-9ece-c2d3dd1fb281';

  test('sans commentaire : pas de non-lu', () => {
    expect(hasUnreadContextComments('', null)).toBe(false);
    expect(hasUnreadContextComments('', { newestId: VU })).toBe(false);
    // `0` est la valeur que servait l'ancienne API : elle ne désigne aucun message.
    expect(hasUnreadContextComments(0, null)).toBe(false);
  });

  test('jamais consulté avec commentaires : non lu', () => {
    expect(hasUnreadContextComments(VU, null)).toBe(true);
  });

  test('le défaut corrigé : un marqueur UUID déclenche bien le badge', () => {
    // Avant, `Number(uuid)` valait `NaN`, replié en `0`, et cette fonction rendait toujours
    // `false` : la moitié « non lus » de la fonctionnalité ne se déclenchait jamais.
    expect(hasUnreadContextComments(NOUVEAU, { newestId: VU })).toBe(true);
  });

  test('curseur à jour : lu', () => {
    expect(hasUnreadContextComments(VU, { newestId: VU })).toBe(false);
  });

  test('comparaison par égalité, pas par ordre', () => {
    // On ne peut pas dire qu'un UUID est « plus grand » qu'un autre : la seule question
    // décidable est « est-ce le même ? ». Un marqueur différent vaut donc « le fil a changé »,
    // y compris dans le cas de bord où l'ancien disparaîtrait.
    expect(hasUnreadContextComments(VU, { newestId: NOUVEAU })).toBe(true);
  });
});

describe('parseReactionEmojiList', () => {
  test('fallback par défaut si vide', () => {
    expect(parseReactionEmojiList('')).toEqual(DEFAULT_REACTION_EMOJIS);
    expect(parseReactionEmojiList(null)).toEqual(DEFAULT_REACTION_EMOJIS);
  });

  test('découpe sur virgules et espaces, dédoublonne', () => {
    expect(parseReactionEmojiList('👍, ❤️ 👍 🔥')).toEqual(['👍', '❤️', '🔥']);
  });

  test('limite à 24 tokens', () => {
    const many = Array.from({ length: 30 }, (_, i) => `e${i}`).join(' ');
    expect(parseReactionEmojiList(many)).toHaveLength(24);
  });

  test('exclut les tokens trop longs', () => {
    expect(parseReactionEmojiList('ok ' + 'x'.repeat(20))).toEqual(['ok']);
  });
});

describe('canModerate', () => {
  test('admin et prof modèrent', () => {
    expect(canModerate({ roleSlug: 'admin' })).toBe(true);
    expect(canModerate({ roleSlug: 'PROF' })).toBe(true);
  });

  test('permission teacher.access modère', () => {
    expect(canModerate({ permissions: ['teacher.access'] })).toBe(true);
  });

  test('sinon non', () => {
    expect(canModerate({ roleSlug: 'eleve', permissions: [] })).toBe(false);
    expect(canModerate(null)).toBe(false);
  });
});
