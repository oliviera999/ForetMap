import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  CONTEXT_COMMENT_PREVIEW_SIZE,
  DEFAULT_REACTION_EMOJIS,
  canModerate,
  contextCommentDraftKey,
  contextCommentReadCursorKey,
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
  test('écrit puis relit le curseur', () => {
    writeContextCommentReadCursor('eleve', 'u1', 'task', 5, 12);
    expect(readContextCommentReadCursor('eleve', 'u1', 'task', 5)).toEqual({ newestId: 12 });
  });

  test('plancher à 0 pour les valeurs négatives', () => {
    writeContextCommentReadCursor('eleve', 'u1', 'task', 5, -3);
    expect(readContextCommentReadCursor('eleve', 'u1', 'task', 5)).toEqual({ newestId: 0 });
  });

  test('retourne null sans identité complète', () => {
    expect(readContextCommentReadCursor('', 'u1', 'task', 5)).toBeNull();
    expect(writeContextCommentReadCursor('', 'u1', 'task', 5, 9)).toBeUndefined();
  });

  test('retourne null sur stockage corrompu', () => {
    window.localStorage.setItem(contextCommentReadCursorKey('eleve', 'u1', 'task', 5), '{bad json');
    expect(readContextCommentReadCursor('eleve', 'u1', 'task', 5)).toBeNull();
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
