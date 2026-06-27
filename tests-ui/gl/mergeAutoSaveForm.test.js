import { describe, test, expect } from 'vitest';
import { mergeAutoSaveForm } from '../../src/gl/utils/mergeAutoSaveForm.js';

describe('mergeAutoSaveForm', () => {
  test('sans frappe en vol : applique intégralement la version serveur', () => {
    const sent = { question: 'Q', choix_a: 'A', feedback_correct: 'fb' };
    const current = sent; // aucune édition depuis l'envoi (même référence)
    const server = { question: 'Q', choix_a: 'A', feedback_correct: 'fb', question_code: 'QF1' };
    expect(mergeAutoSaveForm(current, sent, server)).toEqual(server);
  });

  test('préserve un champ édité pendant la requête en vol', () => {
    const sent = { question: 'Q', choix_a: 'A' };
    const current = { question: 'Q tapée pendant le save', choix_a: 'A' };
    const server = { question: 'Q', choix_a: 'A', question_code: 'QF1' };
    const merged = mergeAutoSaveForm(current, sent, server);
    expect(merged.question).toBe('Q tapée pendant le save'); // saisie en vol conservée
    expect(merged.choix_a).toBe('A'); // inchangé → valeur serveur
    expect(merged.question_code).toBe('QF1'); // champ serveur appliqué
  });

  test('applique le code attribué par le serveur sur une création (code non édité)', () => {
    const sent = { question: 'Q', question_code: '' };
    const current = { question: 'Q', question_code: '' };
    const server = { question: 'Q', question_code: 'QF42' };
    expect(mergeAutoSaveForm(current, sent, server).question_code).toBe('QF42');
  });

  test('tolère des entrées nulles', () => {
    expect(mergeAutoSaveForm(null, null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeAutoSaveForm({ a: 2 }, {}, null)).toEqual({ a: 2 });
  });
});
