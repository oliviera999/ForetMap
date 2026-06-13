import { describe, test, expect } from 'vitest';
import {
  buildMarkerPayload,
  computeMarkerVisitImageBlocks,
  markerFormFromMarker,
  markerTaskMapId,
} from '../../src/utils/markerModalForm.js';

describe('markerFormFromMarker', () => {
  test('repère vide → valeurs par défaut (emoji vide, titre « Détails »)', () => {
    const form = markerFormFromMarker({});
    expect(form).toEqual({
      label: '',
      living_beings: [],
      note: '',
      emoji: '',
      visit_subtitle: '',
      visit_short_description: '',
      visit_details_title: 'Détails',
      visit_details_text: '',
    });
  });

  test('reprend les champs du repère et trim l’emoji', () => {
    const form = markerFormFromMarker({
      label: 'Olivier',
      note: 'Note',
      emoji: ' 🌳 ',
      visit_subtitle: 'Sous-titre',
      visit_short_description: 'Court',
      visit_details_title: 'Plus',
      visit_details_text: 'Détails longs',
    });
    expect(form.label).toBe('Olivier');
    expect(form.note).toBe('Note');
    expect(form.emoji).toBe('🌳');
    expect(form.visit_subtitle).toBe('Sous-titre');
    expect(form.visit_details_title).toBe('Plus');
  });

  test('defaultEmoji appliqué uniquement quand le repère n’a pas d’emoji', () => {
    expect(markerFormFromMarker({}, { defaultEmoji: '🌱' }).emoji).toBe('🌱');
    expect(markerFormFromMarker({ emoji: '🌳' }, { defaultEmoji: '🌱' }).emoji).toBe('🌳');
    // emoji vide explicite → on retombe sur le défaut
    expect(markerFormFromMarker({ emoji: '' }, { defaultEmoji: '🌱' }).emoji).toBe('🌱');
  });

  test('living_beings : ordre conservé depuis living_beings_list, sinon plant_name', () => {
    expect(markerFormFromMarker({ living_beings_list: ['B', 'A'] }).living_beings).toEqual(['B', 'A']);
    expect(markerFormFromMarker({ plant_name: 'Tomate' }).living_beings).toEqual(['Tomate']);
  });
});

describe('markerTaskMapId', () => {
  test('priorité résolu > map_id > zone_map_id > marker_map_id', () => {
    expect(markerTaskMapId({ map_id_resolved: 1, map_id: 2 })).toBe(1);
    expect(markerTaskMapId({ map_id: 2, zone_map_id: 3 })).toBe(2);
    expect(markerTaskMapId({ zone_map_id: 3, marker_map_id: 4 })).toBe(3);
    expect(markerTaskMapId({ marker_map_id: 4 })).toBe(4);
  });
  test('aucun champ / tâche nulle → null', () => {
    expect(markerTaskMapId({})).toBe(null);
    expect(markerTaskMapId(null)).toBe(null);
  });
});

describe('buildMarkerPayload', () => {
  test('fusionne marker + form, force plant_name vide, normalise emoji et blocs', () => {
    const marker = { id: 9, map_id: 'm1', x_pct: 10, plant_name: 'ancien' };
    const form = {
      label: 'Pin',
      living_beings: ['Pin'],
      note: 'note',
      emoji: ' 🌲 ',
      visit_subtitle: 'st',
      visit_short_description: 'sd',
      visit_details_title: 'dt',
      visit_details_text: 'dtx',
    };
    const payload = buildMarkerPayload(marker, form, []);
    expect(payload.id).toBe(9);
    expect(payload.map_id).toBe('m1');
    expect(payload.x_pct).toBe(10);
    expect(payload.label).toBe('Pin');
    expect(payload.plant_name).toBe('');
    expect(payload.living_beings).toEqual(['Pin']);
    expect(payload.emoji).toBe('🌲');
    expect(Array.isArray(payload.visit_editorial_blocks)).toBe(true);
  });
});

describe('computeMarkerVisitImageBlocks', () => {
  test('corps vide → blocs image par défaut depuis les médias (1er en lg)', () => {
    const blocks = computeMarkerVisitImageBlocks('', [
      { id: 5, caption: ' Vue ' },
      { id: 6, caption: '' },
      { id: 0 },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ id: 'default-img-5', media_ids: [5], size: 'lg', caption: 'Vue' });
    expect(blocks[1]).toMatchObject({ id: 'default-img-6', media_ids: [6], size: 'md' });
  });

  test('corps vide sans média → liste vide', () => {
    expect(computeMarkerVisitImageBlocks(null, [])).toEqual([]);
  });

  test('JSON avec blocs image → conserve uniquement les blocs image', () => {
    const json = JSON.stringify([
      { id: 'a', type: 'image', media_ids: [1] },
      { id: 'b', type: 'text', text: 'x' },
    ]);
    const blocks = computeMarkerVisitImageBlocks(json, []);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('a');
  });

  test('JSON sans bloc image mais médias dispo → fusionne les médias par défaut', () => {
    const json = JSON.stringify([{ id: 'b', type: 'text', text: 'x' }]);
    const blocks = computeMarkerVisitImageBlocks(json, [{ id: 7, caption: '' }]);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.type === 'image')).toBe(true);
  });
});
