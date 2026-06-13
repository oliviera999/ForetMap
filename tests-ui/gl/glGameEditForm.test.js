import { describe, test, expect } from 'vitest';
import {
  EMPTY_GAME_EDIT_FORM,
  buildGameEditPayload,
  formatGameTimestamp,
  gameToEditForm,
} from '../../src/gl/utils/glGameEditForm.js';

describe('gameToEditForm', () => {
  test('retourne le formulaire vide pour une partie absente', () => {
    expect(gameToEditForm(null)).toEqual(EMPTY_GAME_EDIT_FORM);
    expect(gameToEditForm(undefined)).toEqual(EMPTY_GAME_EDIT_FORM);
  });

  test('ne partage pas la référence du formulaire vide', () => {
    const a = gameToEditForm(null);
    a.name = 'modifié';
    expect(EMPTY_GAME_EDIT_FORM.name).toBe('');
  });

  test('normalise les identifiants en chaînes', () => {
    const form = gameToEditForm({ id: 1, name: 'Partie', chapter_id: 3, class_id: 5 });
    expect(form.name).toBe('Partie');
    expect(form.chapterId).toBe('3');
    expect(form.classId).toBe('5');
  });

  test('mappe les retriggers et tri-états', () => {
    const form = gameToEditForm({
      zone_content_retrigger: 'every_arrival',
      lore_feuillet_retrigger: 'once_per_team',
      lore_effacement_enabled: 1,
      lore_gemme_costs_enabled: 0,
      lore_heart_rewards_enabled: null,
    });
    expect(form.zoneContentRetrigger).toBe('every_arrival');
    expect(form.loreFeuilletRetrigger).toBe('once_per_team');
    expect(form.loreEffacementEnabled).toBe('1');
    expect(form.loreGemmeCostsEnabled).toBe('0');
    expect(form.loreHeartRewardsEnabled).toBe('');
  });

  test('chaînes vides quand les champs sont absents', () => {
    const form = gameToEditForm({ id: 1 });
    expect(form).toEqual({ ...EMPTY_GAME_EDIT_FORM });
  });
});

describe('buildGameEditPayload', () => {
  const fullForm = {
    name: 'Partie',
    chapterId: '3',
    classId: '5',
    zoneContentRetrigger: 'every_arrival',
    loreFeuilletRetrigger: 'once_per_game',
    loreEffacementEnabled: '1',
    loreGemmeCostsEnabled: '0',
    loreHeartRewardsEnabled: '',
  };

  test('inclut chapitre et classe en brouillon', () => {
    const payload = buildGameEditPayload(fullForm, 'draft');
    expect(payload.name).toBe('Partie');
    expect(payload.chapterId).toBe(3);
    expect(payload.classId).toBe(5);
  });

  test('omet la classe hors brouillon mais garde le chapitre en pause', () => {
    const payload = buildGameEditPayload(fullForm, 'paused');
    expect(payload.chapterId).toBe(3);
    expect(payload).not.toHaveProperty('classId');
  });

  test('omet chapitre et classe en cours', () => {
    const payload = buildGameEditPayload(fullForm, 'live');
    expect(payload).not.toHaveProperty('chapterId');
    expect(payload).not.toHaveProperty('classId');
  });

  test('retriggers vides deviennent null', () => {
    const payload = buildGameEditPayload(
      { ...fullForm, zoneContentRetrigger: '', loreFeuilletRetrigger: '' },
      'draft'
    );
    expect(payload.zoneContentRetrigger).toBeNull();
    expect(payload.loreFeuilletRetrigger).toBeNull();
  });

  test('tri-états convertis en booléens, vide omis', () => {
    const payload = buildGameEditPayload(fullForm, 'draft');
    expect(payload.loreEffacementEnabled).toBe(true);
    expect(payload.loreGemmeCostsEnabled).toBe(false);
    expect(payload).not.toHaveProperty('loreHeartRewardsEnabled');
  });
});

describe('formatGameTimestamp', () => {
  test('renvoie une chaîne vide pour une valeur absente', () => {
    expect(formatGameTimestamp('')).toBe('');
    expect(formatGameTimestamp(null)).toBe('');
    expect(formatGameTimestamp(undefined)).toBe('');
  });

  test('formate une date valide en heure locale', () => {
    const out = formatGameTimestamp('2024-01-01T10:30:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});
