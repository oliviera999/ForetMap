import { describe, test, expect } from 'vitest';
import {
  zonePickDisplayName,
  initialLocationIds,
  initialLinkedObjectIds,
  normalizeTutorialIds,
  referentCandidateLabel,
  referentRoleHint,
  initialTaskFormMapId,
  buildInitialTaskForm,
  buildTaskSavePayload,
} from '../../src/utils/taskFormHelpers.js';

describe('zonePickDisplayName', () => {
  test('nom seul si aucun être vivant', () => {
    expect(zonePickDisplayName({ name: 'Zone A' })).toBe('Zone A');
  });
  test('nom + liste si êtres vivants', () => {
    const label = zonePickDisplayName({ name: 'Zone A', living_beings_list: ['Pommier'] });
    expect(label.startsWith('Zone A — ')).toBe(true);
  });
});

describe('initialLocationIds', () => {
  test('clé multi prioritaire, dédupliquée/nettoyée', () => {
    expect(initialLocationIds({ zone_ids: [' 1 ', '1', '', '2'] }, 'zone_ids', 'zone_id')).toEqual([
      '1',
      '2',
    ]);
  });
  test('repli sur la clé simple', () => {
    expect(initialLocationIds({ zone_id: '7' }, 'zone_ids', 'zone_id')).toEqual(['7']);
  });
  test('vide si rien / editTask absent', () => {
    expect(initialLocationIds(null, 'zone_ids', 'zone_id')).toEqual([]);
    expect(initialLocationIds({}, 'zone_ids', 'zone_id')).toEqual([]);
  });
});

describe('initialLinkedObjectIds', () => {
  test('extrait les id d’objets liés, dédupliqués', () => {
    expect(
      initialLinkedObjectIds(
        { zones_linked: [{ id: '1' }, { id: '1' }, { id: '2' }] },
        'zones_linked',
      ),
    ).toEqual(['1', '2']);
  });
  test('vide si absent / non tableau', () => {
    expect(initialLinkedObjectIds({}, 'zones_linked')).toEqual([]);
    expect(initialLinkedObjectIds(null, 'zones_linked')).toEqual([]);
  });
});

describe('normalizeTutorialIds', () => {
  test('entiers positifs uniques, ignore invalides', () => {
    expect(normalizeTutorialIds(['1', 2, 2, '0', -3, 'x', 4])).toEqual([1, 2, 4]);
  });
  test('non-tableau → []', () => {
    expect(normalizeTutorialIds(null)).toEqual([]);
    expect(normalizeTutorialIds(undefined)).toEqual([]);
  });
});

describe('referentCandidateLabel', () => {
  test('display_name prioritaire', () => {
    expect(referentCandidateLabel({ display_name: 'Alice', first_name: 'A', last_name: 'B' })).toBe(
      'Alice',
    );
  });
  test('repli prénom + nom puis id', () => {
    expect(referentCandidateLabel({ first_name: 'Jean', last_name: 'Dupont' })).toBe('Jean Dupont');
    expect(referentCandidateLabel({ id: 'u7' })).toBe('u7');
  });
});

describe('referentRoleHint', () => {
  const terms = { teacherSingular: 'prof', studentSingular: 'élève' };
  test('équipe enseignante : admin / prof / équipe', () => {
    expect(referentRoleHint({ user_type: 'teacher', primary_role_slug: 'admin' }, terms)).toBe(
      'Admin',
    );
    expect(referentRoleHint({ user_type: 'teacher', primary_role_slug: 'prof' }, terms)).toBe(
      'prof',
    );
    expect(referentRoleHint({ user_type: 'teacher', primary_role_slug: 'autre' }, terms)).toBe(
      'Équipe',
    );
  });
  test('élève par défaut + replis sans termes', () => {
    expect(referentRoleHint({ user_type: 'student' }, terms)).toBe('élève');
    expect(referentRoleHint({ user_type: 'student' }, null)).toBe('n3beur');
    expect(referentRoleHint({ user_type: 'teacher', primary_role_slug: 'prof' }, null)).toBe(
      'n3boss',
    );
  });
});

describe('initialTaskFormMapId', () => {
  test('édition : cascade de clés de carte', () => {
    expect(initialTaskFormMapId({ zone_map_id: 'z1' }, null, 'foret')).toBe('z1');
    expect(initialTaskFormMapId({ map_id_resolved: 'r1', map_id: 'm1' }, null, 'foret')).toBe('r1');
  });
  test('création : projet par défaut sinon carte active', () => {
    expect(initialTaskFormMapId(null, { map_id: 'pmap' }, 'foret')).toBe('pmap');
    expect(initialTaskFormMapId(null, null, 'foret')).toBe('foret');
  });
});

describe('buildInitialTaskForm', () => {
  test('création : valeurs vierges + projet par défaut', () => {
    const form = buildInitialTaskForm({ initialMapId: 'foret', defaultProjectForNew: { id: 42 } });
    expect(form.title).toBe('');
    expect(form.map_id).toBe('foret');
    expect(form.project_id).toBe('42');
    expect(form.completion_mode).toBe('single_done');
    expect(form.required_students).toBe(1);
    expect(form.zone_ids).toEqual([]);
  });
  test('édition : reprend les champs de la tâche', () => {
    const form = buildInitialTaskForm({
      editTask: {
        title: 'Arroser',
        description: 'Bien',
        project_id: 'p9',
        required_students: 3,
        danger_level: 'safe',
        recurrence: 'weekly',
        referent_user_ids: [' u1 ', 'u1', 'u2'],
      },
      initialMapId: 'm1',
      initialZoneIds: ['z1'],
      initialMarkerIds: ['mk1'],
    });
    expect(form.title).toBe('Arroser');
    expect(form.zone_ids).toEqual(['z1']);
    expect(form.marker_ids).toEqual(['mk1']);
    expect(form.required_students).toBe(3);
    expect(form.danger_level).toBe('safe');
    expect(form.referent_user_ids).toEqual(['u1', 'u2']);
    expect(form.assign_student_ids).toEqual([]);
  });
  test('duplication : titre suffixé (copie)', () => {
    const form = buildInitialTaskForm({
      editTask: { title: 'Tailler' },
      isDuplicate: true,
      initialMapId: 'm1',
    });
    expect(form.title).toBe('Tailler (copie)');
  });
});

describe('buildTaskSavePayload', () => {
  const baseForm = {
    title: '  Arroser  ',
    description: 'Détail',
    map_id: '',
    zone_ids: [' z1 ', 'z1'],
    marker_ids: [],
    tutorial_ids: [],
    referent_user_ids: [' u1 ', 'u1'],
    project_id: '',
    start_date: '',
    due_date: '',
    required_students: 2,
    completion_mode: '',
    danger_level: '',
    difficulty_level: '',
    importance_level: '',
    recurrence: '',
    living_beings: [' Pommier ', 'Pommier'],
    assign_student_ids: [],
  };
  test('dédup + trim des ids et titre, valeurs vides → null', () => {
    const payload = buildTaskSavePayload({ form: baseForm, normalizedTutorialIds: [5] });
    expect(payload.title).toBe('Arroser');
    expect(payload.zone_ids).toEqual(['z1']);
    expect(payload.referent_user_ids).toEqual(['u1']);
    expect(payload.living_beings).toEqual(['Pommier']);
    expect(payload.tutorial_ids).toEqual([5]);
    expect(payload.completion_mode).toBe('single_done');
    expect(payload.project_id).toBeNull();
    expect(payload.start_date).toBeNull();
  });
  test('repli de carte sur les zones liées si map_id vide', () => {
    const payload = buildTaskSavePayload({
      form: { ...baseForm, zone_ids: ['z1'] },
      zones: [{ id: 'z1', map_id: 'forest' }],
    });
    expect(payload.map_id).toBe('forest');
  });
  test('image : ajout imageData ou drapeau de suppression', () => {
    const withImg = buildTaskSavePayload({ form: baseForm, taskImageData: 'data:img' });
    expect(withImg.imageData).toBe('data:img');
    const removed = buildTaskSavePayload({
      form: baseForm,
      editTask: { id: 't1' },
      taskImageRemoved: true,
    });
    expect(removed.remove_task_image).toBe(true);
  });
});
