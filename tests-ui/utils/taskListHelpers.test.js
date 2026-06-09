import { describe, test, expect } from 'vitest';
import {
  TASK_IMPORTANCE_SORT_WEIGHT,
  compareTasksByImportanceThenDueDate,
  normalizeDateOnly,
  currentLocalDateOnly,
  isBeforeTaskStartDate,
  taskEffectiveStatus,
  projectStatusLabel,
  normalizeProjectUiStatus,
  mapLabelFromMaps,
  taskHasZone,
  taskHasMarker,
  taskHasLocation,
  tutorialPickerLocationIds,
  tutorialPickerHasLocation,
  tutorialPickerLinkedToSameMap,
  dedupeTutorialsByIdForTasks,
  taskLinkedTutorialRefsForPicker,
  tutorialRefsFromTasksAtLocationFilter,
} from '../../src/utils/taskListHelpers.js';

describe('compareTasksByImportanceThenDueDate', () => {
  const sort = (list) => [...list].sort(compareTasksByImportanceThenDueDate).map((t) => t.id);

  test('importance explicite (poids décroissant) avant absence d’importance', () => {
    const tasks = [
      { id: 'a', importance_level: 'low' },
      { id: 'b' },
      { id: 'c', importance_level: 'absolute' },
      { id: 'd', importance_level: 'medium' },
    ];
    expect(sort(tasks)).toEqual(['c', 'd', 'a', 'b']);
  });

  test('même importance : tri par date limite croissante puis id', () => {
    const tasks = [
      { id: 'z', importance_level: 'high', due_date: '2026-02-01' },
      { id: 'a', importance_level: 'high', due_date: '2026-01-01' },
      { id: 'm', importance_level: 'high', due_date: '2026-01-01' },
    ];
    expect(sort(tasks)).toEqual(['a', 'm', 'z']);
  });

  test('importance inconnue traitée comme absente', () => {
    const tasks = [
      { id: 'a', importance_level: 'whatever' },
      { id: 'b', importance_level: 'medium' },
    ];
    expect(sort(tasks)).toEqual(['b', 'a']);
  });

  test('poids cohérents', () => {
    expect(TASK_IMPORTANCE_SORT_WEIGHT.absolute).toBeGreaterThan(TASK_IMPORTANCE_SORT_WEIGHT.high);
    expect(TASK_IMPORTANCE_SORT_WEIGHT.not_important).toBe(1);
  });
});

describe('normalizeDateOnly', () => {
  test('passe-plat sur YYYY-MM-DD', () => {
    expect(normalizeDateOnly('2026-06-09')).toBe('2026-06-09');
  });
  test('extrait la date d’un ISO complet', () => {
    expect(normalizeDateOnly('2026-06-09T12:34:56Z')).toBe('2026-06-09');
  });
  test('vide/invalide → null', () => {
    expect(normalizeDateOnly('')).toBeNull();
    expect(normalizeDateOnly(null)).toBeNull();
    expect(normalizeDateOnly('pas une date')).toBeNull();
  });
});

describe('currentLocalDateOnly', () => {
  test('format YYYY-MM-DD', () => {
    expect(currentLocalDateOnly()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isBeforeTaskStartDate', () => {
  test('date future → true', () => {
    expect(isBeforeTaskStartDate({ start_date: '2999-01-01' })).toBe(true);
  });
  test('date passée → false', () => {
    expect(isBeforeTaskStartDate({ start_date: '2000-01-01' })).toBe(false);
  });
  test('sans date → false', () => {
    expect(isBeforeTaskStartDate({})).toBe(false);
  });
});

describe('taskEffectiveStatus', () => {
  test('statut terminal renvoyé tel quel', () => {
    expect(taskEffectiveStatus({ status: 'done' })).toBe('done');
    expect(taskEffectiveStatus({ status: 'validated' })).toBe('validated');
    expect(taskEffectiveStatus({ status: 'proposed' })).toBe('proposed');
  });
  test('statut projet prioritaire si non terminal', () => {
    expect(taskEffectiveStatus({ status: 'available', project_status: 'validated' })).toBe('project_validated');
    expect(taskEffectiveStatus({ status: 'available', project_status: 'completed' })).toBe('project_completed');
  });
  test('on_hold via statut, projet, flag ou date de départ future', () => {
    expect(taskEffectiveStatus({ status: 'on_hold' })).toBe('on_hold');
    expect(taskEffectiveStatus({ status: 'available', project_status: 'on_hold' })).toBe('on_hold');
    expect(taskEffectiveStatus({ status: 'available', is_before_start_date: true })).toBe('on_hold');
    expect(taskEffectiveStatus({ status: 'available', start_date: '2999-01-01' })).toBe('on_hold');
  });
  test('défaut available', () => {
    expect(taskEffectiveStatus({})).toBe('available');
    expect(taskEffectiveStatus({ status: 'in_progress' })).toBe('in_progress');
  });
});

describe('projectStatusLabel / normalizeProjectUiStatus', () => {
  test('libellés suffixes', () => {
    expect(projectStatusLabel('on_hold')).toBe(' (en attente)');
    expect(projectStatusLabel('completed')).toBe(' (terminé)');
    expect(projectStatusLabel('validated')).toBe(' (validé)');
    expect(projectStatusLabel('active')).toBe('');
  });
  test('normalisation UI', () => {
    expect(normalizeProjectUiStatus('on_hold')).toBe('on_hold');
    expect(normalizeProjectUiStatus('completed')).toBe('completed');
    expect(normalizeProjectUiStatus('validated')).toBe('validated');
    expect(normalizeProjectUiStatus('autre')).toBe('active');
  });
});

describe('mapLabelFromMaps', () => {
  const maps = [{ id: 'foret', label: 'Forêt' }, { id: 'verger', label: 'Verger' }];
  test('sans mapId → Globale', () => {
    expect(mapLabelFromMaps('', maps)).toBe('Globale');
  });
  test('label trouvé', () => {
    expect(mapLabelFromMaps('verger', maps)).toBe('Verger');
  });
  test('repli sur l’id si absent', () => {
    expect(mapLabelFromMaps('inconnu', maps)).toBe('inconnu');
  });
});

describe('taskHasZone / taskHasMarker', () => {
  test('zone via zone_ids ou zone_id', () => {
    expect(taskHasZone({ zone_ids: ['1', '2'] }, '2')).toBe(true);
    expect(taskHasZone({ zone_id: '7' }, '7')).toBe(true);
    expect(taskHasZone({ zone_ids: ['1'] }, '9')).toBe(false);
  });
  test('sans filtre → true', () => {
    expect(taskHasZone({ zone_ids: [] }, '')).toBe(true);
    expect(taskHasMarker({}, '')).toBe(true);
  });
  test('marker via marker_ids ou marker_id', () => {
    expect(taskHasMarker({ marker_ids: ['m1'] }, 'm1')).toBe(true);
    expect(taskHasMarker({ marker_id: 'm2' }, 'm2')).toBe(true);
    expect(taskHasMarker({ marker_ids: ['m1'] }, 'm9')).toBe(false);
  });
});

describe('taskHasLocation', () => {
  const task = { zone_ids: ['z1'], marker_ids: ['m1'] };
  test('préfixe zone: / marker:', () => {
    expect(taskHasLocation(task, 'zone:z1')).toBe(true);
    expect(taskHasLocation(task, 'marker:m1')).toBe(true);
    expect(taskHasLocation(task, 'zone:zX')).toBe(false);
  });
  test('valeur brute interprétée comme zone', () => {
    expect(taskHasLocation(task, 'z1')).toBe(true);
  });
  test('sans filtre → true', () => {
    expect(taskHasLocation(task, '')).toBe(true);
  });
});

describe('tutorialPicker* helpers', () => {
  test('tutorialPickerLocationIds dédoublonne et nettoie', () => {
    expect(tutorialPickerLocationIds({ zone_ids: [' z1 ', 'z1', ''], marker_ids: ['m1'] }))
      .toEqual({ zoneIds: ['z1'], markerIds: ['m1'] });
    expect(tutorialPickerLocationIds(null)).toEqual({ zoneIds: [], markerIds: [] });
  });
  test('tutorialPickerHasLocation', () => {
    const tu = { zone_ids: ['z1'], marker_ids: ['m1'] };
    expect(tutorialPickerHasLocation(tu, 'zone:z1')).toBe(true);
    expect(tutorialPickerHasLocation(tu, 'marker:m1')).toBe(true);
    expect(tutorialPickerHasLocation(tu, 'zone:zX')).toBe(false);
    expect(tutorialPickerHasLocation(tu, '')).toBe(true);
  });
  test('tutorialPickerLinkedToSameMap', () => {
    expect(tutorialPickerLinkedToSameMap({ zones_linked: [{ map_id: 'foret' }] }, 'foret')).toBe(true);
    expect(tutorialPickerLinkedToSameMap({ zones_linked: [{ map_id: 'foret' }] }, 'verger')).toBe(false);
    expect(tutorialPickerLinkedToSameMap({ zones_linked: [], markers_linked: [] }, 'foret')).toBe(true);
    expect(tutorialPickerLinkedToSameMap({}, '')).toBe(true);
  });
});

describe('dedupeTutorialsByIdForTasks', () => {
  test('dédoublonne par id, ignore les entrées sans id', () => {
    const out = dedupeTutorialsByIdForTasks([
      { id: 1, t: 'a' }, { id: 1, t: 'b' }, { id: 2 }, null, { t: 'sans id' },
    ]);
    expect(out.map((x) => x.id)).toEqual([1, 2]);
    expect(out[0].t).toBe('a');
  });
});

describe('taskLinkedTutorialRefsForPicker', () => {
  test('priorité à tutorials_linked', () => {
    expect(taskLinkedTutorialRefsForPicker({ tutorials_linked: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });
  test('repli sur tutorial_ids résolus via catalogue', () => {
    const catalog = [{ id: 1, name: 'Un' }, { id: 2, name: 'Deux' }];
    expect(taskLinkedTutorialRefsForPicker({ tutorial_ids: [2, 99] }, catalog)).toEqual([{ id: 2, name: 'Deux' }]);
  });
  test('rien → []', () => {
    expect(taskLinkedTutorialRefsForPicker(null)).toEqual([]);
    expect(taskLinkedTutorialRefsForPicker({})).toEqual([]);
  });
});

describe('tutorialRefsFromTasksAtLocationFilter', () => {
  test('agrège les tutoriels des tâches actives au lieu, dédoublonnés', () => {
    const tasks = [
      { id: 't1', status: 'available', zone_ids: ['z1'], tutorials_linked: [{ id: 1 }] },
      { id: 't2', status: 'in_progress', zone_ids: ['z1'], tutorials_linked: [{ id: 1 }, { id: 2 }] },
      { id: 't3', status: 'done', zone_ids: ['z1'], tutorials_linked: [{ id: 9 }] }, // exclue (done)
      { id: 't4', status: 'available', zone_ids: ['zX'], tutorials_linked: [{ id: 5 }] }, // autre lieu
    ];
    const out = tutorialRefsFromTasksAtLocationFilter('zone:z1', tasks, []);
    expect(out.map((x) => x.id)).toEqual([1, 2]);
  });
  test('sans filtre → []', () => {
    expect(tutorialRefsFromTasksAtLocationFilter('', [], [])).toEqual([]);
  });
});
