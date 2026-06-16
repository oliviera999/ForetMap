import { describe, test, expect } from 'vitest';
import {
  EMPTY_MARKER_FORM,
  toFormFromMarker,
  toMarkerPayload,
} from '../../src/gl/utils/glChapterMapStudioForm.js';

describe('EMPTY_MARKER_FORM', () => {
  test('valeurs par défaut', () => {
    expect(EMPTY_MARKER_FORM).toEqual({
      label: '',
      xPct: 50,
      yPct: 50,
      description: '',
      orderIndex: 0,
      sousBiomeSlug: '',
      effetMecanique: '',
    });
  });
});

describe('toFormFromMarker', () => {
  test('renvoie le formulaire vide si marqueur absent', () => {
    expect(toFormFromMarker(null)).toBe(EMPTY_MARKER_FORM);
    expect(toFormFromMarker(undefined)).toBe(EMPTY_MARKER_FORM);
  });

  test('mappe les champs snake_case du marqueur vers le formulaire', () => {
    const marker = {
      label: 'Départ',
      x_pct: 12.5,
      y_pct: 80,
      description: 'desc',
      order_index: 3,
      sous_biome_slug: 'jungle_afc',
      effet_mecanique: '+1 gemme',
    };
    expect(toFormFromMarker(marker)).toEqual({
      label: 'Départ',
      xPct: 12.5,
      yPct: 80,
      description: 'desc',
      orderIndex: 3,
      sousBiomeSlug: 'jungle_afc',
      effetMecanique: '+1 gemme',
    });
  });

  test('applique les valeurs de repli pour les champs manquants', () => {
    const form = toFormFromMarker({});
    expect(form.label).toBe('');
    expect(form.xPct).toBe(50);
    expect(form.yPct).toBe(50);
    expect(form.description).toBe('');
    expect(form.orderIndex).toBe(0);
    expect(form.sousBiomeSlug).toBe('');
    expect(form.effetMecanique).toBe('');
  });

  test('x_pct/y_pct à 0 sont préservés (pas écrasés par le défaut)', () => {
    const form = toFormFromMarker({ x_pct: 0, y_pct: 0 });
    expect(form.xPct).toBe(0);
    expect(form.yPct).toBe(0);
  });
});

describe('toMarkerPayload', () => {
  test('nettoie/trim les chaînes et convertit les nombres', () => {
    const form = {
      label: '  Repère  ',
      xPct: '25',
      yPct: '60',
      description: '  texte  ',
      orderIndex: '4',
      sousBiomeSlug: '  savane  ',
      effetMecanique: '  effet  ',
    };
    const eventDraft = { eventType: ' question ', eventConfig: { foo: 1 } };
    const payload = toMarkerPayload(form, eventDraft, {});
    expect(payload.label).toBe('Repère');
    expect(payload.xPct).toBe(25);
    expect(payload.yPct).toBe(60);
    expect(payload.eventType).toBe('question');
    expect(payload.description).toBe('texte');
    expect(payload.orderIndex).toBe(4);
    expect(payload.sousBiomeSlug).toBe('savane');
    expect(payload.effetMecanique).toBe('effet');
    expect(payload.eventConfig).toEqual({ foo: 1 });
  });

  test('les chaînes vides de slug/effet deviennent null', () => {
    const payload = toMarkerPayload(
      { label: 'x', xPct: 1, yPct: 2, sousBiomeSlug: '   ', effetMecanique: '' },
      null,
      {},
    );
    expect(payload.sousBiomeSlug).toBeNull();
    expect(payload.effetMecanique).toBeNull();
  });

  test('eventType par défaut question et eventConfig par défaut quand draft absent', () => {
    const payload = toMarkerPayload({ label: 'x', xPct: 0, yPct: 0 }, null, {});
    expect(payload.eventType).toBe('question');
    expect(payload.eventConfig).toBeTruthy();
    expect(payload.orderIndex).toBe(0);
  });

  test("fusionne le payload d'apparence", () => {
    const payload = toMarkerPayload({ label: 'x', xPct: 0, yPct: 0 }, null, {
      displayMode: 'emoji',
      emoji: '🌲',
    });
    expect(payload).toHaveProperty('displayMode');
  });
});
