import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useTutorialSearch } from '../../../src/components/tasks/useTutorialSearch.js';

function Harness({ tutorials }) {
  const { search, setSearch, filteredTutorials } = useTutorialSearch(tutorials);
  return (
    <div>
      <input aria-label="recherche" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul>
        {filteredTutorials.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </div>
  );
}

const TUTORIALS = [
  { id: 2, title: 'Établir un paillage' },
  { id: 1, title: 'Bouturer un saule' },
  { id: 3, title: 'arroser malin' },
];

describe('useTutorialSearch', () => {
  test('sans recherche : catalogue trié alphabétiquement (locale fr)', () => {
    render(<Harness tutorials={TUTORIALS} />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['arroser malin', 'Bouturer un saule', 'Établir un paillage']);
  });

  test('filtre insensible à la casse sur le titre', () => {
    render(<Harness tutorials={TUTORIALS} />);
    fireEvent.change(screen.getByLabelText('recherche'), { target: { value: '  SAULE ' } });
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Bouturer un saule']);
  });

  test('aucun résultat : liste vide', () => {
    render(<Harness tutorials={TUTORIALS} />);
    fireEvent.change(screen.getByLabelText('recherche'), { target: { value: 'greffe' } });
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });

  test('titres manquants tolérés', () => {
    render(<Harness tutorials={[{ id: 1 }, { id: 2, title: 'Semer' }]} />);
    fireEvent.change(screen.getByLabelText('recherche'), { target: { value: 'semer' } });
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Semer']);
  });
});
