import { describe, test, expect } from 'vitest';

import { resolveNavPoles } from '../../../src/components/app/NavPoles.jsx';
import {
  STUDENT_NAV_POLES,
  buildStudentNavItems,
} from '../../../src/components/app/StudentBottomNav.jsx';
import {
  KNOWN_TAB_VALUES,
  STUDENT_NAV_POLE_BY_TAB,
  STUDENT_NAV_POLE_IDS,
} from '../../../src/constants/app-runtime.js';

/**
 * Copie FIGÉE de `buildStudentNavItems` avant le passage en pôles (lot 6, U10 de l'audit
 * UI/UX du 19/11/2026) : ids et libellés seulement. Sert de référence pour vérifier qu'aucun
 * onglet n'a été perdu ni renommé, quelle que soit la combinaison de modules et de droits.
 * Ne pas la faire évoluer avec le code : c'est l'état d'avant.
 */
function legacyStudentNavItems({
  canAccessStudentMapTasks,
  isVisitor,
  shouldUseDesktopSplit,
  tutorialsModuleEnabled,
  canAccessTutorials,
  studentActiveAssignedTasksCount,
  canViewGeneralStats,
  canAccessProfiles,
  profilesLabel,
  observationsEnabled,
  visitEnabled,
  canAccessForum,
  showNestedGroups,
  showIndividuals,
  idKeysEnabled,
  pedagoSessionsEnabled,
  individualsEnabled,
  fresqueEnabled,
}) {
  const s = studentActiveAssignedTasksCount > 0 ? ` (${studentActiveAssignedTasksCount})` : '';
  const items = [];
  const push = (id, label) => items.push({ id, label });
  if (isVisitor && visitEnabled) push('visit', 'Visite');
  if (canAccessStudentMapTasks && shouldUseDesktopSplit) {
    push(
      'maptasks',
      `${tutorialsModuleEnabled ? 'Cartes & tâches · tuto' : 'Cartes & tâches'}${s}`,
    );
  }
  if (canAccessStudentMapTasks) {
    push('map', 'Carte');
    push('tasks', `${tutorialsModuleEnabled ? 'Tâches · tuto' : 'Tâches'}${s}`);
  }
  push('plants', 'Biodiversité');
  push('quiz', 'Quiz');
  push('glossary', 'Glossaire');
  push('foodweb', 'Réseau');
  if (showNestedGroups) push('nested-groups', 'Groupes');
  if (idKeysEnabled) push('id-keys', 'Clés');
  if (pedagoSessionsEnabled) push('sessions', 'Séances');
  if (fresqueEnabled) push('fresque', 'Fresque');
  if (showIndividuals && individualsEnabled) push('individuals', 'Individus');
  if (tutorialsModuleEnabled && canAccessTutorials) push('tuto', 'Tuto');
  if (canViewGeneralStats) push('stats', 'Stats');
  if (canAccessProfiles) push('profiles', profilesLabel);
  if (observationsEnabled) push('notebook', 'Carnet');
  if (!isVisitor && visitEnabled) push('visit', 'Visite');
  if (canAccessForum) push('forum', 'Forum');
  push('about', 'À propos');
  return items;
}

const FLAGS = [
  'canAccessStudentMapTasks',
  'isVisitor',
  'shouldUseDesktopSplit',
  'tutorialsModuleEnabled',
  'canAccessTutorials',
  'canViewGeneralStats',
  'canAccessProfiles',
  'observationsEnabled',
  'visitEnabled',
  'canAccessForum',
  'showNestedGroups',
  'showIndividuals',
  'idKeysEnabled',
  'pedagoSessionsEnabled',
  'individualsEnabled',
  'fresqueEnabled',
];

function* allCombinations() {
  for (let mask = 0; mask < 2 ** FLAGS.length; mask += 1) {
    const props = { profilesLabel: mask % 3 ? 'Classe' : 'Profils' };
    FLAGS.forEach((flag, i) => {
      props[flag] = Boolean(mask & (1 << i));
    });
    props.studentActiveAssignedTasksCount = mask % 5 === 0 ? 3 : 0;
    yield props;
  }
}

const key = (items) =>
  items
    .map(({ id, label }) => `${id}=${label}`)
    .sort()
    .join('|');

describe('navigation élève en pôles — aucun onglet perdu', () => {
  test('mêmes onglets (ids et libellés) qu’avant, pour chaque combinaison de modules', () => {
    let checked = 0;
    const mismatches = [];
    for (const props of allCombinations()) {
      const before = legacyStudentNavItems(props);
      const after = buildStudentNavItems(props);
      if (key(before) !== key(after)) mismatches.push(props);
      // Aucun doublon d'id (la Visite n'apparaît qu'une fois, visiteur ou non).
      if (new Set(after.map((t) => t.id)).size !== after.length) mismatches.push(props);
      checked += 1;
    }
    expect(mismatches.slice(0, 3)).toEqual([]);
    expect(checked).toBe(2 ** FLAGS.length);
  });

  test('chaque onglet appartient à un pôle élève, et chaque pôle affiché a des onglets', () => {
    const poleIds = new Set(STUDENT_NAV_POLE_IDS);
    const failures = [];
    for (const props of allCombinations()) {
      const items = buildStudentNavItems(props);
      if (items.some((item) => !poleIds.has(item.pole))) failures.push(props);
      const { polesWithTabs } = resolveNavPoles({ poles: STUDENT_NAV_POLES, tabs: items, tab: '' });
      // Les onglets des pôles affichés couvrent toute la liste.
      if (polesWithTabs.reduce((n, p) => n + p.tabs.length, 0) !== items.length) {
        failures.push(props);
      }
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });

  test('la table onglet → pôle ne référence que des onglets connus, dans l’ordre des pôles', () => {
    expect(STUDENT_NAV_POLES.map((p) => p.id)).toEqual(STUDENT_NAV_POLE_IDS);
    for (const [tab, pole] of Object.entries(STUDENT_NAV_POLE_BY_TAB)) {
      expect(KNOWN_TAB_VALUES.has(tab)).toBe(true);
      expect(STUDENT_NAV_POLE_IDS).toContain(pole);
    }
  });

  test('la liste est rangée par pôle (Terrain, Vivant, Apprendre, Moi)', () => {
    const all = Object.fromEntries(FLAGS.map((f) => [f, true]));
    const poles = buildStudentNavItems({ ...all, isVisitor: false }).map((t) => t.pole);
    const order = poles.map((p) => STUDENT_NAV_POLE_IDS.indexOf(p));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('resolveNavPoles', () => {
  const POLES = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];
  const TABS = [
    { id: 't1', pole: 'a' },
    { id: 't2', pole: 'c' },
    { id: 't3', pole: 'c' },
  ];

  test('pôle actif dérivé de l’onglet, pôle vide masqué, premier onglet du pôle', () => {
    const r = resolveNavPoles({ poles: POLES, tabs: TABS, tab: 't3' });
    expect(r.activePoleId).toBe('c');
    expect(r.polesWithTabs.map((p) => p.id)).toEqual(['a', 'c']);
    expect(r.firstTabOfPole('c')).toBe('t2');
    expect(r.firstTabOfPole('b')).toBeUndefined();
    expect(r.tabsOfPole('c').map((t) => t.id)).toEqual(['t2', 't3']);
  });

  test('onglet absent : premier pôle qui a des onglets', () => {
    expect(resolveNavPoles({ poles: POLES, tabs: TABS.slice(1), tab: 'zz' }).activePoleId).toBe(
      'c',
    );
    expect(resolveNavPoles({ poles: POLES, tabs: [], tab: 'zz' }).activePoleId).toBeNull();
  });
});
