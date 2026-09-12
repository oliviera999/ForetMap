import { describe, test, expect } from 'vitest';
import {
  DEFAULT_REACTION_EMOJIS,
  parseReactionEmojiList,
  isForumModerator,
  forumPageCount,
} from '../../src/utils/forumHelpers.js';

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
