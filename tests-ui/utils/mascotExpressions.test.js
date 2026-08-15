import { describe, test, expect } from 'vitest';
import {
  MASCOT_EXPRESSION,
  MASCOT_EXPRESSIONS,
  MASCOT_EXPRESSION_STATE,
  MASCOT_EXPRESSION_LABELS,
  MASCOT_FRAMINGS,
  DEFAULT_MASCOT_EXPRESSION,
  resolveMascotExpression,
  resolveMascotFraming,
  mascotExpressionToState,
} from '../../src/utils/mascotExpressions.js';
import { VISIT_MASCOT_STATE } from '../../src/utils/visitMascotState.js';

describe('mascotExpressions', () => {
  test('les 8 expressions du plan sont présentes et ordonnées', () => {
    expect(MASCOT_EXPRESSIONS).toEqual([
      'neutre',
      'parle',
      'montre',
      'content',
      'vigilant',
      'cherche',
      'grave',
      'complice',
    ]);
    expect(Object.values(MASCOT_EXPRESSION).sort()).toEqual([...MASCOT_EXPRESSIONS].sort());
  });

  test('chaque expression est mappée sur un état canonique existant (aucun enum concurrent)', () => {
    const canonical = new Set(Object.values(VISIT_MASCOT_STATE));
    for (const expression of MASCOT_EXPRESSIONS) {
      const state = MASCOT_EXPRESSION_STATE[expression];
      expect(state, `expression sans état : ${expression}`).toBeTruthy();
      expect(canonical.has(state), `état hors VISIT_MASCOT_STATE : ${state}`).toBe(true);
    }
  });

  test('le mapping est exactement celui du §4.3', () => {
    expect(MASCOT_EXPRESSION_STATE).toEqual({
      neutre: 'idle',
      parle: 'talk',
      montre: 'point',
      content: 'happy',
      vigilant: 'alert',
      cherche: 'search',
      grave: 'sad',
      complice: 'wave',
    });
  });

  test('deux expressions ne partagent pas le même état', () => {
    const states = Object.values(MASCOT_EXPRESSION_STATE);
    expect(new Set(states).size).toBe(states.length);
  });

  test('chaque expression a un libellé d’administration', () => {
    for (const expression of MASCOT_EXPRESSIONS) {
      expect(MASCOT_EXPRESSION_LABELS[expression]).toBeTruthy();
    }
  });

  test('toute expression inconnue retombe sur neutre', () => {
    expect(DEFAULT_MASCOT_EXPRESSION).toBe('neutre');
    for (const raw of [undefined, null, '', '   ', 'hilare', 42, {}, 'idle']) {
      expect(resolveMascotExpression(raw)).toBe('neutre');
    }
  });

  test('la résolution tolère espaces et casse', () => {
    expect(resolveMascotExpression('  PARLE ')).toBe('parle');
    expect(resolveMascotExpression('Complice')).toBe('complice');
  });

  test('tout cadrage inconnu retombe sur bust', () => {
    expect(MASCOT_FRAMINGS).toEqual(['face', 'bust', 'body']);
    for (const framing of MASCOT_FRAMINGS) {
      expect(resolveMascotFraming(framing)).toBe(framing);
    }
    for (const raw of [undefined, null, '', 'torse', 42]) {
      expect(resolveMascotFraming(raw)).toBe('bust');
    }
  });

  test('mascotExpressionToState traverse la résolution', () => {
    expect(mascotExpressionToState('montre')).toBe(VISIT_MASCOT_STATE.POINT);
    expect(mascotExpressionToState('inconnue')).toBe(VISIT_MASCOT_STATE.IDLE);
  });
});
