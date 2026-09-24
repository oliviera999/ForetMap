import { describe, test, expect } from 'vitest';
import {
  DEFAULT_REACTION_EMOJIS,
  parseReactionEmojiList,
  isForumModerator,
  forumPageCount,
  applyReactionToggle,
  appendQuoteToDraft,
  buildQuoteMarkdown,
  forumThreadReadStorageKey,
  initialThreadReadState,
  isThreadUnread,
  markThreadRead,
  readThreadReadState,
  sameForumId,
  writeThreadReadState,
} from '../../src/utils/forumHelpers.js';

describe('citation', () => {
  test('bloc Markdown avec l’auteur, citations imbriquées retirées', () => {
    const quote = buildQuoteMarkdown({
      author_display_name: 'Momo',
      body: '> ancienne citation\nLigne 1\n\nLigne 2',
    });
    expect(quote).toBe('> **Momo** a écrit :\n> Ligne 1\n>\n> Ligne 2\n\n');
  });

  test('texte long tronqué, auteur absent remplacé', () => {
    const quote = buildQuoteMarkdown({ body: 'x'.repeat(500) });
    expect(quote.startsWith('> **Quelqu’un** a écrit :')).toBe(true);
    expect(quote).toContain('…');
    expect(quote.length).toBeLessThan(450);
  });

  test('ajout au brouillon : ligne vide de séparation', () => {
    expect(appendQuoteToDraft('', '> q\n\n')).toBe('> q\n\n');
    expect(appendQuoteToDraft('Bonjour  \n', '> q\n\n')).toBe('Bonjour\n\n> q\n\n');
  });
});

describe('non-lus par sujet', () => {
  const t1 = { id: 1, last_other_post_at: '2026-09-01 10:00:00' };
  const t2 = { id: 2, last_other_post_at: '2026-09-03 10:00:00' };

  test('clé par produit et compte ; vide sans identifiant', () => {
    expect(forumThreadReadStorageKey('gl', 'gl_player', 12)).toBe(
      'foretmap:forumThreadRead:gl:gl_player:12',
    );
    expect(forumThreadReadStorageKey('foret', 'student', '')).toBe('');
  });

  test('première ouverture : tout ce qui est visible est lu', () => {
    const state = initialThreadReadState([t1, t2]);
    expect(isThreadUnread(t1, state)).toBe(false);
    expect(isThreadUnread(t2, state)).toBe(false);
    expect(isThreadUnread({ id: 3, last_other_post_at: '2026-09-04 08:00:00' }, state)).toBe(true);
  });

  test('marquer lu jusqu’au dernier message d’autrui', () => {
    const state = { baseline: '2026-09-02 00:00:00', threads: {} };
    expect(isThreadUnread(t2, state)).toBe(true);
    const next = markThreadRead(state, t2);
    expect(isThreadUnread(t2, next)).toBe(false);
    expect(markThreadRead(next, t2)).toBe(next);
    expect(isThreadUnread({ id: 4, last_other_post_at: null }, state)).toBe(false);
  });

  test('lecture / écriture tolérantes (JSON corrompu → null)', () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    };
    writeThreadReadState('k', { baseline: 'b', threads: { 1: 'x' } }, storage);
    expect(readThreadReadState('k', storage)).toEqual({ baseline: 'b', threads: { 1: 'x' } });
    store.set('k', '{pas du json');
    expect(readThreadReadState('k', storage)).toBeNull();
  });

  test('sameForumId compare nombre et chaîne', () => {
    expect(sameForumId(7, '7')).toBe(true);
    expect(sameForumId(null, 'null')).toBe(false);
  });
});

describe('parseReactionEmojiList', () => {
  test('vide/absent : copie de la liste par défaut (jamais la même référence)', () => {
    expect(parseReactionEmojiList('')).toEqual(DEFAULT_REACTION_EMOJIS);
    expect(parseReactionEmojiList(null)).toEqual(DEFAULT_REACTION_EMOJIS);
    expect(parseReactionEmojiList('   ')).toEqual(DEFAULT_REACTION_EMOJIS);
    expect(parseReactionEmojiList('')).not.toBe(DEFAULT_REACTION_EMOJIS);
  });

  test('sépare sur espaces et virgules, dédoublonne', () => {
    expect(parseReactionEmojiList('👍, ❤️ 👍  🔥')).toEqual(['👍', '❤️', '🔥']);
  });

  test('écarte les tokens de plus de 16 caractères', () => {
    expect(parseReactionEmojiList(`👍 ${'a'.repeat(17)} ❤️`)).toEqual(['👍', '❤️']);
  });

  test('plafonne à 24 tokens uniques', () => {
    const tokens = Array.from({ length: 30 }, (_, i) => `e${i}`);
    expect(parseReactionEmojiList(tokens.join(' '))).toEqual(tokens.slice(0, 24));
  });

  test('repli sur la liste par défaut si aucun token retenu', () => {
    expect(parseReactionEmojiList('a'.repeat(20))).toEqual(DEFAULT_REACTION_EMOJIS);
  });
});

describe('isForumModerator', () => {
  test('admin par roleSlug (insensible à la casse)', () => {
    expect(isForumModerator({ roleSlug: 'admin' })).toBe(true);
    expect(isForumModerator({ roleSlug: 'ADMIN' })).toBe(true);
  });

  /**
   * Resserrement apporté par `feat(rbac): profil Prof de classe` : la modération ne se
   * déduit plus d'un rôle ni de l'accès enseignant en général, elle demande la permission
   * dédiée. Un tuteur de classe enseigne sans pour autant modérer le forum de tout le monde.
   */
  test('prof et teacher.access ne suffisent plus : il faut forum.group.moderate', () => {
    expect(isForumModerator({ roleSlug: 'Prof' })).toBe(false);
    expect(isForumModerator({ roleSlug: 'prof_classe', permissions: ['teacher.access'] })).toBe(
      false,
    );
    expect(isForumModerator({ roleSlug: 'prof', permissions: ['forum.group.moderate'] })).toBe(
      true,
    );
    expect(isForumModerator({ roleSlug: 'n3beur', permissions: ['forum.group.moderate'] })).toBe(
      true,
    );
  });

  test('sinon non modérateur (claims absents ou permissions non tableau)', () => {
    expect(isForumModerator(null)).toBe(false);
    expect(isForumModerator({ roleSlug: 'n3beur', permissions: 'teacher.access' })).toBe(false);
    expect(isForumModerator({ roleSlug: 'n3beur', permissions: ['forum.participate'] })).toBe(
      false,
    );
  });
});

describe('forumPageCount', () => {
  test('toujours au moins 1 page, arrondi au supérieur', () => {
    expect(forumPageCount(0, 20)).toBe(1);
    expect(forumPageCount(20, 20)).toBe(1);
    expect(forumPageCount(21, 20)).toBe(2);
    expect(forumPageCount(101, 50)).toBe(3);
  });
});

describe('applyReactionToggle', () => {
  test('ajoute une réaction absente, avec reacted_by_me', () => {
    expect(applyReactionToggle([], '👍', true)).toEqual([
      { emoji: '👍', count: 1, reacted_by_me: true },
    ]);
    expect(applyReactionToggle(undefined, '👍', false)).toEqual([]);
  });

  test('incrémente / décrémente la réaction existante', () => {
    const list = [{ emoji: '👍', count: 2, reacted_by_me: false }];
    expect(applyReactionToggle(list, '👍', true)).toEqual([
      { emoji: '👍', count: 3, reacted_by_me: true },
    ]);
    const mine = [{ emoji: '👍', count: 3, reacted_by_me: true }];
    expect(applyReactionToggle(mine, '👍', false)).toEqual([
      { emoji: '👍', count: 2, reacted_by_me: false },
    ]);
  });

  test('retire la réaction retombée à zéro, sans toucher aux autres', () => {
    const list = [
      { emoji: '👍', count: 1, reacted_by_me: true },
      { emoji: '🌱', count: 4, reacted_by_me: false },
    ];
    expect(applyReactionToggle(list, '👍', false)).toEqual([list[1]]);
  });

  test('idempotent si l’état est déjà celui annoncé', () => {
    const list = [{ emoji: '👍', count: 2, reacted_by_me: true }];
    expect(applyReactionToggle(list, '👍', true)).toBe(list);
  });
});
