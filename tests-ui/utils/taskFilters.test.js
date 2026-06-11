import { describe, test, expect } from 'vitest';
import { taskEffectiveMapId, taskMatchesFilters } from '../../src/utils/taskFilters.js';

describe('taskEffectiveMapId', () => {
  test('priorité map_id_resolved > map_id > zone > marker > null', () => {
    expect(taskEffectiveMapId({ map_id_resolved: 'a', map_id: 'b' })).toBe('a');
    expect(taskEffectiveMapId({ map_id: 'b', zone_map_id: 'c' })).toBe('b');
    expect(taskEffectiveMapId({ zone_map_id: 'c' })).toBe('c');
    expect(taskEffectiveMapId({ marker_map_id: 'd' })).toBe('d');
    expect(taskEffectiveMapId({})).toBe(null);
  });
});

const T = (over = {}) => ({ id: 't', title: 'Arroser les tomates', description: 'au potager', status: 'available', map_id: 'foret', ...over });

describe('taskMatchesFilters — carte', () => {
  test('filterMap=active : garde la carte active + les tâches sans carte', () => {
    expect(taskMatchesFilters(T({ map_id: 'foret' }), { filterMap: 'active' }, 'foret')).toBe(true);
    expect(taskMatchesFilters(T({ map_id: 'autre' }), { filterMap: 'active' }, 'foret')).toBe(false);
    expect(taskMatchesFilters(T({ map_id: null }), { filterMap: 'active' }, 'foret')).toBe(true);
  });
  test('filterMap=all → toutes ; filterMap=id → cette carte (ou sans carte)', () => {
    expect(taskMatchesFilters(T({ map_id: 'x' }), { filterMap: 'all' }, 'foret')).toBe(true);
    expect(taskMatchesFilters(T({ map_id: 'x' }), { filterMap: 'x' }, 'foret')).toBe(true);
    expect(taskMatchesFilters(T({ map_id: 'y' }), { filterMap: 'x' }, 'foret')).toBe(false);
  });
});

describe('taskMatchesFilters — texte / projet / groupe', () => {
  test('texte cherche titre + description (insensible casse)', () => {
    expect(taskMatchesFilters(T(), { filterMap: 'all', filterText: 'TOMATE' }, 'foret')).toBe(true);
    expect(taskMatchesFilters(T(), { filterMap: 'all', filterText: 'potager' }, 'foret')).toBe(true);
    expect(taskMatchesFilters(T(), { filterMap: 'all', filterText: 'zzz' }, 'foret')).toBe(false);
  });
  test('projet et groupe (comparaison souple)', () => {
    expect(taskMatchesFilters(T({ project_id: 'p1' }), { filterMap: 'all', filterProject: 'p1' }, 'foret')).toBe(true);
    expect(taskMatchesFilters(T({ project_id: 'p1' }), { filterMap: 'all', filterProject: 'p2' }, 'foret')).toBe(false);
    expect(taskMatchesFilters(T({ group_id: 5 }), { filterMap: 'all', filterGroupId: '5' }, 'foret')).toBe(true);
    expect(taskMatchesFilters(T({ group_id: 5 }), { filterMap: 'all', filterGroupId: '6' }, 'foret')).toBe(false);
  });
});

describe('taskMatchesFilters — statut', () => {
  test('statut direct ; « validated » englobe project_validated', () => {
    expect(taskMatchesFilters(T({ status: 'done' }), { filterMap: 'all', filterStatus: 'done' }, 'foret')).toBe(true);
    expect(taskMatchesFilters(T({ status: 'available' }), { filterMap: 'all', filterStatus: 'done' }, 'foret')).toBe(false);
    expect(taskMatchesFilters(T({ status: 'validated' }), { filterMap: 'all', filterStatus: 'validated' }, 'foret')).toBe(true);
  });
});

describe('taskMatchesFilters — aucun filtre', () => {
  test('filterMap=all sans autre filtre → toujours vrai (filterMap est toujours défini côté composant)', () => {
    expect(taskMatchesFilters(T({ map_id: 'x' }), { filterMap: 'all' }, 'foret')).toBe(true);
  });
});
