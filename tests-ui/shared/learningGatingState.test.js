import { describe, it, expect } from 'vitest';
import { gatingState, countGatingStates } from '../../src/shared/utils/learningGatingState.js';

describe('gatingState', () => {
  it('ne dit rien quand rien ne conditionne la ressource', () => {
    expect(gatingState(null).kind).toBe('none');
    expect(gatingState({ required: false }).kind).toBe('none');
  });

  it('ne dit rien sur une ressource déjà validée', () => {
    // Afficher « ? » sur un tutoriel déjà lu inquiéterait sans raison.
    const summary = { required: true, ask_count: 2, pending_count: 2 };
    expect(gatingState(summary).kind).toBe('pending');
    expect(gatingState(summary, { done: true }).kind).toBe('none');
  });

  it('signale un verrou avant tout le reste', () => {
    const state = gatingState({
      required: true,
      locked: true,
      remaining_days: 2,
      ask_count: 3,
      pending_count: 3,
    });
    expect(state.kind).toBe('locked');
    expect(state.icon).toBe('🔒');
    expect(state.label).toContain('2 jours');
  });

  it('reconnaît un contrôle déjà réussi', () => {
    const state = gatingState({ required: true, satisfied: true, pending_count: 0 });
    expect(state.kind).toBe('acquired');
    expect(state.icon).toBe('✓');
    expect(state.shortLabel).toBe('Acquis');
  });

  it('compte ce qui sera posé maintenant, et dit le reste', () => {
    // `ask_count` = ce que le serveur pose dans cette session (plafond appliqué) ;
    // `pending_count` = ce qu'il reste au total.
    const state = gatingState({ required: true, ask_count: 3, pending_count: 8 });
    expect(state.kind).toBe('pending');
    expect(state.shortLabel).toBe('3 questions');
    expect(state.label).toContain('8 questions au total');
  });

  it('accorde le singulier', () => {
    const state = gatingState({ required: true, ask_count: 1, pending_count: 1 });
    expect(state.shortLabel).toBe('1 question');
    expect(state.label).not.toContain('au total');
  });

  it('un résumé incohérent ne casse rien', () => {
    const state = gatingState({ required: true, ask_count: 'x', pending_count: null });
    expect(state.kind).toBe('acquired'); // rien à poser = rien à attendre
  });
});

describe('countGatingStates', () => {
  it('ignore les ressources non conditionnées', () => {
    const map = new Map([
      ['1', { required: true, satisfied: true }],
      ['2', { required: true, ask_count: 1, pending_count: 1 }],
      ['3', { required: false }],
      ['4', { required: true, locked: true, remaining_days: 1 }],
    ]);
    expect(countGatingStates(map)).toEqual({
      acquired: 1,
      pending: 1,
      locked: 1,
      total: 3,
    });
  });

  it('accepte une liste comme une Map, et le vide', () => {
    expect(countGatingStates([{ required: true, satisfied: true }]).acquired).toBe(1);
    expect(countGatingStates(null).total).toBe(0);
  });
});
