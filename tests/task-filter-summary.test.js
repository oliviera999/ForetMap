'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let activeTaskFilterChips;
let countActiveTaskFilters;
let taskLocationFilterLabel;
let taskStatusFilterLabel;

const MAPS = [
  { id: 'foret', label: 'Forêt' },
  { id: 'jardin', label: 'Jardin' },
];
const ZONES = [{ id: 'z1', name: 'Mare' }];
const MARKERS = [{ id: 'm1', label: 'Ruche', emoji: '🐝' }];
const PROJECTS = [{ id: 'p1', title: 'Verger', status: 'on_hold' }];
const GROUPS = [{ id: 'g1', name: 'Groupe A' }];

describe('taskFilterSummary', () => {
  before(async () => {
    const mod = await import(
      pathToFileURL(join(__dirname, '../src/utils/taskFilterSummary.js')).href
    );
    activeTaskFilterChips = mod.activeTaskFilterChips;
    countActiveTaskFilters = mod.countActiveTaskFilters;
    taskLocationFilterLabel = mod.taskLocationFilterLabel;
    taskStatusFilterLabel = mod.taskStatusFilterLabel;
  });

  it('aucun chip quand seuls les filtres par défaut sont posés', () => {
    assert.deepStrictEqual(activeTaskFilterChips({ filterMap: 'active' }), []);
    assert.strictEqual(countActiveTaskFilters({ filterMap: 'active' }), 0);
  });

  it('la recherche texte ne compte pas comme filtre (son champ reste visible)', () => {
    assert.strictEqual(countActiveTaskFilters({ filterMap: 'active', filterText: 'paillage' }), 0);
  });

  it('décrit la carte choisie, « Toutes cartes » comprise', () => {
    const [chip] = activeTaskFilterChips({ filterMap: 'jardin', maps: MAPS });
    assert.strictEqual(chip.key, 'map');
    assert.strictEqual(chip.label, 'Carte : Jardin');
    const [allChip] = activeTaskFilterChips({ filterMap: 'all', maps: MAPS });
    assert.strictEqual(allChip.label, 'Carte : Toutes cartes');
  });

  it('décrit le lieu, zone comme repère (emoji conservé)', () => {
    assert.strictEqual(taskLocationFilterLabel('zone:z1', ZONES, MARKERS), 'Mare');
    assert.strictEqual(taskLocationFilterLabel('marker:m1', ZONES, MARKERS), '🐝 Ruche');
    assert.strictEqual(taskLocationFilterLabel('marker:inconnu', ZONES, MARKERS), '📍 inconnu');
    assert.strictEqual(taskLocationFilterLabel('', ZONES, MARKERS), '');
  });

  it('décrit le statut, y compris la vue archivée du n3boss', () => {
    assert.strictEqual(taskStatusFilterLabel('in_progress'), 'En cours');
    assert.strictEqual(taskStatusFilterLabel('archived'), '📦 Archivés');
    assert.strictEqual(taskStatusFilterLabel(''), '');
  });

  it('le filtre groupe n’apparaît que côté n3boss', () => {
    const asStudent = activeTaskFilterChips({ filterGroupId: 'g1', groupOptions: GROUPS });
    assert.deepStrictEqual(asStudent, []);
    const asTeacher = activeTaskFilterChips({
      isTeacher: true,
      filterGroupId: 'g1',
      groupOptions: GROUPS,
    });
    assert.strictEqual(asTeacher.length, 1);
    assert.strictEqual(asTeacher[0].label, 'Groupe : Groupe A');
  });

  it('cumule les filtres posés dans l’ordre de la barre', () => {
    const chips = activeTaskFilterChips({
      filterMap: 'all',
      maps: MAPS,
      filterZone: 'zone:z1',
      zones: ZONES,
      markers: MARKERS,
      filterProject: 'p1',
      taskProjects: PROJECTS,
      isTeacher: true,
      filterGroupId: 'g1',
      groupOptions: GROUPS,
      filterUrgentCategory: 'urgent',
      filterStatus: 'done',
    });
    assert.deepStrictEqual(
      chips.map((c) => c.key),
      ['map', 'zone', 'project', 'group', 'urgent', 'status'],
    );
    assert.strictEqual(chips[2].label, 'Projet : Verger');
    assert.strictEqual(chips[4].label, 'Urgent ! uniquement');
    assert.strictEqual(chips[5].label, 'Statut : Terminée');
    assert.ok(chips.every((c) => c.removeLabel));
  });

  it('retombe sur l’identifiant quand le libellé est introuvable', () => {
    const chips = activeTaskFilterChips({ filterProject: 'p-inconnu', taskProjects: [] });
    assert.strictEqual(chips[0].label, 'Projet : p-inconnu');
  });
});
