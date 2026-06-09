import { describe, test, expect, beforeEach } from 'vitest';
import {
  taskLogCommentDraftKey,
  readTaskLogCommentDraft,
  writeTaskLogCommentDraft,
} from '../../src/utils/taskLogDraft.js';

beforeEach(() => {
  sessionStorage.clear();
});

describe('taskLogCommentDraftKey', () => {
  test('clé namespacée par id', () => {
    expect(taskLogCommentDraftKey(42)).toBe('foretmap:taskLogCommentDraft:42');
    expect(taskLogCommentDraftKey(null)).toBe('foretmap:taskLogCommentDraft:');
  });
});

describe('read/writeTaskLogCommentDraft', () => {
  test('écrit puis relit un brouillon', () => {
    writeTaskLogCommentDraft(7, 'mon commentaire');
    expect(readTaskLogCommentDraft(7)).toBe('mon commentaire');
  });

  test('un texte vide / blanc supprime le brouillon', () => {
    writeTaskLogCommentDraft(7, 'x');
    writeTaskLogCommentDraft(7, '   ');
    expect(readTaskLogCommentDraft(7)).toBe('');
  });

  test('id absent : write est un no-op, read renvoie ""', () => {
    writeTaskLogCommentDraft('', 'ignoré');
    writeTaskLogCommentDraft(null, 'ignoré');
    expect(readTaskLogCommentDraft('')).toBe('');
    expect(readTaskLogCommentDraft(999)).toBe('');
  });

  test('brouillons isolés par id', () => {
    writeTaskLogCommentDraft(1, 'un');
    writeTaskLogCommentDraft(2, 'deux');
    expect(readTaskLogCommentDraft(1)).toBe('un');
    expect(readTaskLogCommentDraft(2)).toBe('deux');
  });
});
