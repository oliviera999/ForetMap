import { describe, test, expect } from 'vitest';
import {
  QUESTION_FIELD_LABELS,
  humanizeQuestionField,
  questionFieldLabel,
} from '../../src/shared/qcm/questionFieldLabels.js';
import { FORM_FIELDS as FM_FORM_FIELDS } from '../../src/utils/fmQuizEditorForm.js';
import { FORM_FIELDS as GL_FORM_FIELDS } from '../../src/gl/utils/glQcmEditorForm.js';
import { FORM_FIELDS as GL_LORE_FORM_FIELDS } from '../../src/gl/utils/glQcmLoreEditorForm.js';

describe('questionFieldLabels', () => {
  test('chaque champ des trois éditeurs a un libellé français explicite', () => {
    const all = new Set([...FM_FORM_FIELDS, ...GL_FORM_FIELDS, ...GL_LORE_FORM_FIELDS]);
    const missing = [...all].filter((key) => !QUESTION_FIELD_LABELS[key]);
    expect(missing).toEqual([]);
  });

  test('les six retours de choix disent à quel choix ils se rattachent', () => {
    for (const letter of ['a', 'b', 'c', 'd', 'e']) {
      expect(questionFieldLabel(`feedback_${letter}`)).toContain(letter.toUpperCase());
    }
    expect(questionFieldLabel('feedback_correct')).toMatch(/bonne réponse/i);
  });

  test('la légende photo annonce où elle sera affichée', () => {
    expect(questionFieldLabel('photo_legende')).toMatch(/légende/i);
  });

  test('aucun libellé ne laisse passer un underscore de nom de colonne', () => {
    for (const key of Object.keys(QUESTION_FIELD_LABELS)) {
      expect(questionFieldLabel(key)).not.toContain('_');
    }
  });

  test('repli lisible pour une clé inconnue', () => {
    expect(humanizeQuestionField('champ_futur')).toBe('Champ futur');
    expect(questionFieldLabel('champ_futur')).toBe('Champ futur');
    expect(questionFieldLabel('')).toBe('');
  });
});
