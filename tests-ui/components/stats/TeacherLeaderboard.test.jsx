import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeacherLeaderboard } from '../../../src/components/stats/TeacherLeaderboard.jsx';

const ROLE_TERMS = { studentSingular: 'n3beur', studentPlural: 'n3beurs' };

function student(id, firstName, lastName, stats = {}, extra = {}) {
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    stats: { done: 0, pending: 0, submitted: 0, total: 0, ...stats },
    ...extra,
  };
}

describe('TeacherLeaderboard', () => {
  test('classement vide sans recherche → message dédié', () => {
    render(<TeacherLeaderboard students={[]} search="" roleTerms={ROLE_TERMS} />);
    expect(screen.getByText('Aucun n3beur dans le classement pour l’instant')).toBeTruthy();
  });

  test('recherche sans résultat → message de recherche', () => {
    render(
      <TeacherLeaderboard
        students={[student(1, 'Léa', 'Martin')]}
        search="zzz"
        roleTerms={ROLE_TERMS}
      />
    );
    expect(screen.getByText('Aucun n3beur ne correspond à ta recherche')).toBeTruthy();
    expect(screen.queryByText('Léa Martin')).toBeNull();
  });

  test('médailles 🥇🥈🥉 puis rang numérique sur le classement complet', () => {
    const students = [
      student(1, 'Léa', 'Martin', { done: 9 }),
      student(2, 'Tom', 'Roy', { done: 7 }),
      student(3, 'Zoé', 'Petit', { done: 4 }),
      student(4, 'Ali', 'Ben', { done: 1 }),
    ];
    const { container } = render(<TeacherLeaderboard students={students} search="" roleTerms={ROLE_TERMS} />);
    const ranks = [...container.querySelectorAll('.lb-rank')];
    expect(ranks.map((el) => el.textContent)).toEqual(['🥇', '🥈', '🥉', '4.']);
    expect(ranks[0].className).toContain('gold');
    expect(ranks[1].className).toContain('silver');
    expect(ranks[2].className).toContain('bronze');
  });

  test('le filtre de recherche conserve le rang réel du classement complet', () => {
    const students = [
      student(1, 'Léa', 'Martin', { done: 9 }),
      student(2, 'Tom', 'Roy', { done: 7 }),
    ];
    const { container } = render(<TeacherLeaderboard students={students} search="tom" roleTerms={ROLE_TERMS} />);
    const ranks = [...container.querySelectorAll('.lb-rank')];
    expect(ranks).toHaveLength(1);
    expect(ranks[0].textContent).toBe('🥈');
  });

  test('compteurs, taux de complétion et badge de profil', () => {
    const students = [
      student(
        1,
        'Léa',
        'Martin',
        { done: 3, pending: 1, submitted: 2, total: 4, plant_species_observed: 5, plant_observation_events: 8, tutorials_read: 2 },
        {
          pseudo: 'lea_m',
          description: 'J’arrose souvent.',
          progression: { roleDisplayName: 'n3beur avancé', roleEmoji: '🌿' },
        }
      ),
    ];
    const { container } = render(<TeacherLeaderboard students={students} search="" roleTerms={ROLE_TERMS} />);
    expect(screen.getByText('@lea_m')).toBeTruthy();
    expect(screen.getByText('J’arrose souvent.')).toBeTruthy();
    expect(screen.getByText('Profil : 🌿 n3beur avancé')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy(); // 3 validées / 4 prises
    expect(screen.getByText('Jamais connecté')).toBeTruthy();
    const nums = [...container.querySelectorAll('.lb-stat .lb-stat-num')].map((el) => el.textContent);
    expect(nums).toEqual(['3', '2', '1', '4', '75%', '5', '8', '2']);
  });

  test('total à 0 → taux de complétion 0%', () => {
    render(
      <TeacherLeaderboard
        students={[student(1, 'Léa', 'Martin', { done: 0, total: 0 })]}
        search=""
        roleTerms={ROLE_TERMS}
      />
    );
    expect(screen.getByText('0%')).toBeTruthy();
  });
});
