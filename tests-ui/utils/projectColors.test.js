import { describe, expect, test } from 'vitest';

import {
  PROJECT_COLOR_COUNT,
  assignProjectColors,
  preferredProjectColor,
  projectColorClass,
} from '../../src/utils/projectColors.js';

const makeProjects = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `projet-${i}`,
    created_at: `2026-0${1 + (i % 9)}-1${i % 10}T10:00:00`,
  }));

describe('assignProjectColors', () => {
  test('jusqu’à PROJECT_COLOR_COUNT projets : toutes les couleurs sont distinctes', () => {
    const colors = assignProjectColors(makeProjects(PROJECT_COLOR_COUNT));
    expect(new Set(colors.values()).size).toBe(PROJECT_COLOR_COUNT);
    for (const index of colors.values()) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PROJECT_COLOR_COUNT);
    }
  });

  test('stable : ne dépend ni de l’ordre reçu ni d’un filtrage qui retire un projet récent', () => {
    const projects = makeProjects(6);
    const a = assignProjectColors(projects);
    const b = assignProjectColors([...projects].reverse());
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
    // Le projet le plus ancien garde toujours sa couleur préférée.
    const oldest = [...projects].sort((x, y) => x.created_at.localeCompare(y.created_at))[0];
    expect(a.get(oldest.id)).toBe(preferredProjectColor(oldest.id));
  });

  test('collision : le projet le plus récent prend la couleur libre suivante', () => {
    // Deux ids de même couleur préférée.
    const ids = [];
    for (let i = 0; ids.length < 2 && i < 1000; i += 1) {
      const id = `p${i}`;
      if (preferredProjectColor(id) === preferredProjectColor('p0')) ids.push(id);
    }
    const colors = assignProjectColors([
      { id: ids[1], created_at: '2026-02-01' },
      { id: ids[0], created_at: '2026-01-01' },
    ]);
    expect(colors.get(ids[0])).toBe(preferredProjectColor(ids[0]));
    expect(colors.get(ids[1])).toBe((preferredProjectColor(ids[0]) + 1) % PROJECT_COLOR_COUNT);
  });

  test('au-delà de la palette, les couleurs se répètent sans planter', () => {
    const colors = assignProjectColors(makeProjects(PROJECT_COLOR_COUNT + 3));
    expect(colors.size).toBe(PROJECT_COLOR_COUNT + 3);
  });

  test('entrées vides ou invalides', () => {
    expect(assignProjectColors(null).size).toBe(0);
    expect(assignProjectColors([{ id: '' }, null]).size).toBe(0);
  });
});

describe('projectColorClass', () => {
  test('classe depuis la table, sinon couleur préférée ; vide sans projet', () => {
    const colors = new Map([['a', 7]]);
    expect(projectColorClass(colors, 'a')).toBe('project-color-7');
    expect(projectColorClass(colors, 'inconnu')).toBe(
      `project-color-${preferredProjectColor('inconnu')}`,
    );
    expect(projectColorClass(colors, '')).toBe('');
    expect(projectColorClass(null, null)).toBe('');
  });
});
