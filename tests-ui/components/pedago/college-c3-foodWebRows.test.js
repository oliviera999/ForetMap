import { describe, it, expect } from 'vitest';
import {
  EMPTY_INTERACTION_FORM,
  describeRow,
  editFormFromRow,
  groupRowsByType,
  interactionPayload,
  speciesOptionsFromPlants,
} from '../../../src/components/pedago/foodWebRows.js';

describe('foodWebRows (sorti de FoodWebView)', () => {
  it('l’efficacité de pollinisation n’est envoyée que pour une pollinisation', () => {
    const form = {
      ...EMPTY_INTERACTION_FORM,
      toId: '4',
      type: 'predation',
      pollinationEfficacy: 'efficace',
      description: ' x ',
      sourceRef: '',
    };
    expect(interactionPayload(form)).toMatchObject({
      to_id: 4,
      interaction_type: 'predation',
      pollination_efficacy: null,
      description: 'x',
      source_ref: null,
    });
    expect(interactionPayload({ ...form, type: 'pollinisation' }).pollination_efficacy).toBe(
      'efficace',
    );
  });
  it('describeRow oriente « est mangée par » et nomme l’environnement', () => {
    const d = describeRow({
      id: 1,
      interaction_type: 'predation',
      from_id: 3,
      from_name: 'Renard',
      to_id: 2,
      to_name: 'Lapin',
    });
    expect(d.tail.name).toBe('Lapin');
    expect(d.head.name).toBe('Renard');
    expect(
      describeRow({
        id: 2,
        interaction_type: 'nitrification',
        from_id: 7,
        from_name: 'Bactérie',
        to_id: null,
      }).head.name,
    ).toBe('Environnement');
    expect(describeRow(null)).toBeNull();
  });
  it('editFormFromRow, groupRowsByType, speciesOptionsFromPlants', () => {
    expect(
      editFormFromRow({ id: 9, from_id: 1, to_id: null, interaction_type: 'herbivorie' }),
    ).toMatchObject({ id: 9, toId: '', evidenceLevel: 'bibliographie' });
    expect(
      groupRowsByType([
        { interaction_type: 'predation' },
        { interaction_type: 'herbivorie' },
        {},
      ]).map(([t]) => t),
    ).toEqual(['autre', 'herbivorie', 'predation']);
    expect(
      speciesOptionsFromPlants([
        { id: 2, name: 'Érable' },
        { id: 0, name: 'x' },
        { id: 1, name: 'Abricotier' },
      ]).map((s) => s.id),
    ).toEqual([1, 2]);
  });
});
