import { describe, test, expect } from 'vitest';
import {
  computeVisitLocationAside,
  EMPTY_VISIT_LOCATION_ASIDE,
} from '../../src/utils/visitLocationAside.js';

const MAP_ID = 'foret';

const baseCtx = (overrides = {}) => ({
  mapId: MAP_ID,
  mapZones: [],
  mapMarkers: [],
  tasks: [],
  catalogTutorials: [],
  isTeacher: false,
  ...overrides,
});

describe('computeVisitLocationAside', () => {
  test('sans sélection → aside vide (rien à afficher)', () => {
    expect(computeVisitLocationAside(null, null, baseCtx())).toEqual(EMPTY_VISIT_LOCATION_ASIDE);
    expect(computeVisitLocationAside({ id: 1 }, null, baseCtx())).toEqual(
      EMPTY_VISIT_LOCATION_ASIDE,
    );
    expect(computeVisitLocationAside(null, 'zone', baseCtx())).toEqual(EMPTY_VISIT_LOCATION_ASIDE);
  });

  test('zone : biodiversité depuis la zone carte de la même carte uniquement', () => {
    const ctx = baseCtx({
      mapZones: [
        { id: 7, map_id: 'autre', living_beings_list: ['Hêtre'] },
        { id: 7, map_id: MAP_ID, living_beings_list: ['Chêne', 'Fougère'], current_plant: 'Chêne' },
      ],
    });
    const out = computeVisitLocationAside({ id: 7 }, 'zone', ctx);
    expect(out.locationKind).toBe('zone');
    expect(out.primaryLivingNames).toEqual(['Chêne', 'Fougère']);
    expect(out.showBiodiversity).toBe(true);
    expect(out.showTutos).toBe(false);
  });

  test('zone spéciale : masque la biodiversité même avec des espèces', () => {
    const ctx = baseCtx({
      mapZones: [{ id: 7, map_id: MAP_ID, special: 1, living_beings_list: ['Chêne'] }],
    });
    const out = computeVisitLocationAside({ id: 7 }, 'zone', ctx);
    expect(out.primaryLivingNames).toEqual(['Chêne']);
    expect(out.showBiodiversity).toBe(false);
  });

  test('zone : espèces des missions du lieu, hors doublons avec la zone', () => {
    const ctx = baseCtx({
      mapZones: [{ id: 7, map_id: MAP_ID, living_beings_list: ['Chêne'] }],
      tasks: [
        { id: 1, zone_ids: [7], living_beings_list: ['Chêne', 'Mésange'] },
        { id: 2, zone_ids: [7], status: 'done', living_beings_list: ['Renard'] },
        { id: 3, zone_ids: [99], living_beings_list: ['Lierre'] },
      ],
    });
    const out = computeVisitLocationAside({ id: 7 }, 'zone', ctx);
    expect(out.primaryLivingNames).toEqual(['Chêne']);
    expect(out.livingBeingsOnlyOnTasks).toEqual(['Mésange']);
    expect(out.showBiodiversity).toBe(true);
  });

  test('zone : tutoriels liés directement + via missions, dédoublonnés', () => {
    const tuA = { id: 10, title: 'A', zone_ids: [7], marker_ids: [] };
    const tuB = { id: 11, title: 'B', zone_ids: [], marker_ids: [] };
    const ctx = baseCtx({
      catalogTutorials: [tuA, tuB],
      tasks: [{ id: 1, zone_ids: [7], tutorials_linked: [tuA, tuB] }],
    });
    const out = computeVisitLocationAside({ id: 7 }, 'zone', ctx);
    expect(out.tutorialListForPreview.map((t) => t.id)).toEqual([10, 11]);
    expect(out.showTutos).toBe(true);
  });

  test('élève : les tutoriels inactifs sont filtrés ; prof : conservés', () => {
    const actif = { id: 10, title: 'Actif', zone_ids: [7], is_active: true };
    const inactif = { id: 11, title: 'Inactif', zone_ids: [7], is_active: false };
    const ctx = baseCtx({ catalogTutorials: [actif, inactif] });
    const eleve = computeVisitLocationAside({ id: 7 }, 'zone', ctx);
    expect(eleve.tutorialListForPreview.map((t) => t.id)).toEqual([10]);
    const prof = computeVisitLocationAside({ id: 7 }, 'zone', { ...ctx, isTeacher: true });
    expect(prof.tutorialListForPreview.map((t) => t.id)).toEqual([10, 11]);
  });

  test('repère : biodiversité depuis le repère carte (plant_name en repli) + missions', () => {
    const ctx = baseCtx({
      mapMarkers: [{ id: 3, map_id: MAP_ID, living_beings_list: [], plant_name: 'Bouleau' }],
      tasks: [{ id: 1, marker_ids: [3], living_beings_list: ['Geai'] }],
    });
    const out = computeVisitLocationAside({ id: 3 }, 'marker', ctx);
    expect(out.locationKind).toBe('marker');
    expect(out.primaryLivingNames).toEqual(['Bouleau']);
    expect(out.livingBeingsOnlyOnTasks).toEqual(['Geai']);
    expect(out.showBiodiversity).toBe(true);
  });

  test('repère : tutoriels liés via marker_ids', () => {
    const tu = { id: 20, title: 'Repère', zone_ids: [], marker_ids: [3] };
    const ctx = baseCtx({ catalogTutorials: [tu] });
    const out = computeVisitLocationAside({ id: 3 }, 'marker', ctx);
    expect(out.showTutos).toBe(true);
    expect(out.tutorialListForPreview).toEqual([tu]);
  });

  test('repère inconnu sur la carte : pas de biodiversité primaire, missions seules', () => {
    const ctx = baseCtx({
      tasks: [{ id: 1, marker_ids: [3], living_beings_list: ['Geai'] }],
    });
    const out = computeVisitLocationAside({ id: 3 }, 'marker', ctx);
    expect(out.primaryLivingNames).toEqual([]);
    expect(out.livingBeingsOnlyOnTasks).toEqual(['Geai']);
    expect(out.showBiodiversity).toBe(true);
  });
});
