import { describe, expect, test } from 'vitest';

import {
  computeProjectStepInfo,
  computeStepInfoByTaskId,
  parseTaskStepNumber,
  sameStepBucket,
  sortProjectTasksBySteps,
  taskStepLabel,
} from '../../src/utils/taskProjectSteps.js';

describe('parseTaskStepNumber', () => {
  test.each([
    ['1 Récupérer la terre', { step: 1, sub: '' }],
    ['2. Transférer la matière', { step: 2, sub: '' }],
    ['3) fixation d’un écran', { step: 3, sub: '' }],
    ['4 - plateforme', { step: 4, sub: '' }],
    ['5: tests', { step: 5, sub: '' }],
    ['Étape 6 : semer', { step: 6, sub: '' }],
    ['etape 7 semer', { step: 7, sub: '' }],
    ['Tâche 8 - arroser', { step: 8, sub: '' }],
    ['n°9 récolter', { step: 9, sub: '' }],
    ['#10 ranger', { step: 10, sub: '' }],
    ['2a monter le cadre', { step: 2, sub: 'a' }],
    ['2b poser la bâche', { step: 2, sub: 'b' }],
    ['  12 avec espaces', { step: 12, sub: '' }],
    ['3', { step: 3, sub: '' }],
  ])('« %s » → %o', (title, expected) => {
    expect(parseTaskStepNumber(title)).toEqual(expected);
  });

  test.each([
    'Arrosage du compost',
    '2026 plantation des haies', // une année n'est pas une étape
    '3D : imprimer le boîtier', // majuscule : pas une sous-étape
    '123 trois chiffres',
    'Semer 2 rangs',
    '',
    null,
    undefined,
  ])('« %s » → null', (title) => {
    expect(parseTaskStepNumber(title)).toBeNull();
  });
});

describe('computeProjectStepInfo', () => {
  test('au moins deux tâches numérotées : étapes et mention « en parallèle »', () => {
    const info = computeProjectStepInfo([
      { id: 1, title: '1 préparer' },
      { id: 2, title: '2 semer les radis' },
      { id: 3, title: '2 semer les carottes' },
      { id: 4, title: 'ranger les outils' },
    ]);
    expect(info.get('1')).toEqual({ step: 1, sub: '', parallel: false });
    expect(info.get('2')).toEqual({ step: 2, sub: '', parallel: true });
    expect(info.get('3')).toEqual({ step: 2, sub: '', parallel: true });
    expect(info.has('4')).toBe(false);
  });

  test('2a / 2b : même étape, en parallèle', () => {
    const info = computeProjectStepInfo([
      { id: 'a', title: '2a monter' },
      { id: 'b', title: '2b poser' },
    ]);
    expect(info.get('a')).toEqual({ step: 2, sub: 'a', parallel: true });
    expect(info.get('b')).toEqual({ step: 2, sub: 'b', parallel: true });
  });

  test('une seule tâche numérotée : projet non numéroté (faux positif évité)', () => {
    const info = computeProjectStepInfo([
      { id: 1, title: '3 graines par godet' },
      { id: 2, title: 'arroser' },
    ]);
    expect(info.size).toBe(0);
  });
});

describe('computeStepInfoByTaskId', () => {
  test('regroupe par projet ; tâches hors projet ignorées', () => {
    const info = computeStepInfoByTaskId([
      { id: 1, title: '1 a', project_id: 'p1' },
      { id: 2, title: '2 b', project_id: 'p1' },
      { id: 3, title: '1 seule', project_id: 'p2' },
      { id: 4, title: '1 sans projet' },
      { id: 5, title: '2 sans projet', project_id: '' },
    ]);
    expect([...info.keys()].sort()).toEqual(['1', '2']);
  });
});

describe('sortProjectTasksBySteps', () => {
  test('étapes croissantes, sous-lettres, puis non numérotées ; ordre d’arrivée à égalité', () => {
    const tasks = [
      { id: 'x', title: 'ranger' },
      { id: 't3', title: '3 Récupérer la partie gauche' },
      { id: 't2b', title: '2b bâche' },
      { id: 't1', title: '1 Récupérer la partie droite' },
      { id: 'p2', title: '2 semer A' },
      { id: 't2a', title: '2a cadre' },
      { id: 'p2bis', title: '2 semer B' },
      { id: 'y', title: 'nettoyer' },
    ];
    const info = computeProjectStepInfo(tasks);
    expect(sortProjectTasksBySteps(tasks, info).map((t) => t.id)).toEqual([
      't1',
      'p2',
      'p2bis',
      't2a',
      't2b',
      't3',
      'x',
      'y',
    ]);
  });

  test('projet non numéroté : liste rendue telle quelle (même référence)', () => {
    const tasks = [
      { id: 1, title: 'b' },
      { id: 2, title: 'a' },
    ];
    expect(sortProjectTasksBySteps(tasks, new Map())).toBe(tasks);
  });

  test('ne mute pas l’entrée', () => {
    const tasks = [
      { id: 2, title: '2 b' },
      { id: 1, title: '1 a' },
    ];
    const copy = [...tasks];
    sortProjectTasksBySteps(tasks, computeProjectStepInfo(tasks));
    expect(tasks).toEqual(copy);
  });
});

describe('sameStepBucket / taskStepLabel', () => {
  const info = computeProjectStepInfo([
    { id: 1, title: '1 a' },
    { id: 2, title: '2 b' },
    { id: 3, title: '2 c' },
    { id: 4, title: '2a d' },
    { id: 5, title: 'libre' },
    { id: 6, title: 'libre aussi' },
  ]);

  test('même numéro ou deux tâches non numérotées : même compartiment', () => {
    expect(sameStepBucket(info, 2, 3)).toBe(true);
    expect(sameStepBucket(info, 5, 6)).toBe(true);
    expect(sameStepBucket(info, 1, 2)).toBe(false);
    expect(sameStepBucket(info, 2, 4)).toBe(false); // « 2 » vs « 2a »
    expect(sameStepBucket(info, 1, 5)).toBe(false);
    expect(sameStepBucket(new Map(), 'a', 'b')).toBe(true);
  });

  test('libellés de puce', () => {
    expect(taskStepLabel(info.get('1'))).toBe('Étape 1');
    expect(taskStepLabel(info.get('2'))).toBe('Étape 2 · en parallèle');
    expect(taskStepLabel(null)).toBe('');
  });
});
