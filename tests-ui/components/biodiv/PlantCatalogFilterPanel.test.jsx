import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlantCatalogFilterPanel } from '../../../src/components/biodiv/PlantCatalogFilterPanel.jsx';

const PLANTS = [
  { id: 1, group_1: 'Végétal', group_2: 'Arbre', group_3: 'Rosacée', habitat: 'Verger' },
  { id: 2, group_1: 'Végétal', group_2: 'Herbacée', group_3: 'Fabacée', habitat: 'Prairie' },
  { id: 3, group_1: 'Fungi', group_2: 'Basidio', group_3: '', habitat: 'Sous-bois' },
];

function setup(overrides = {}) {
  const setters = Object.fromEntries(
    [
      'setSearch',
      'setGroup1',
      'setGroup2',
      'setGroup3',
      'setHabitat',
      'setAgro',
      'setZonePresence',
    ].map((k) => [k, vi.fn()]),
  );
  const props = {
    plants: PLANTS,
    search: '',
    group1: '',
    group2: '',
    group3: '',
    habitat: '',
    agro: '',
    zonePresence: 'all',
    ...setters,
    ...overrides,
  };
  render(<PlantCatalogFilterPanel {...props} />);
  return { ...setters, props };
}

describe('PlantCatalogFilterPanel', () => {
  // Ordre des <select> (labels non associés via htmlFor) : 0=groupe1, 1=groupe2, 2=groupe3, 3=habitat, 4=agro.
  const combos = () => screen.getAllByRole('combobox');

  test('options du groupe 1 dérivées des plantes (valeurs distinctes)', () => {
    setup();
    const opts = [...combos()[0].querySelectorAll('option')].map((o) => o.textContent);
    expect(opts).toContain('Végétal');
    expect(opts).toContain('Fungi');
  });

  test('cascade : choisir le groupe 1 réinitialise groupe 2 et 3', () => {
    const { setGroup1, setGroup2, setGroup3 } = setup();
    fireEvent.change(combos()[0], { target: { value: 'Végétal' } });
    expect(setGroup1).toHaveBeenCalledWith('Végétal');
    expect(setGroup2).toHaveBeenCalledWith('');
    expect(setGroup3).toHaveBeenCalledWith('');
  });

  test('groupe 2 dépend du groupe 1 sélectionné', () => {
    setup({ group1: 'Végétal' });
    const opts = [...combos()[1].querySelectorAll('option')].map((o) => o.textContent);
    expect(opts).toEqual(expect.arrayContaining(['Arbre', 'Herbacée']));
    expect(opts).not.toContain('Basidio'); // appartient à Fungi
  });

  test('recherche → setSearch', () => {
    const { setSearch } = setup();
    fireEvent.change(screen.getByPlaceholderText('🔍 Rechercher dans la biodiversité...'), {
      target: { value: 'pomm' },
    });
    expect(setSearch).toHaveBeenCalledWith('pomm');
  });

  test('« Réinitialiser les filtres » remet tous les setters à vide', () => {
    const s = setup({ showZonePresence: true });
    fireEvent.click(screen.getByText('Réinitialiser les filtres'));
    expect(s.setGroup1).toHaveBeenCalledWith('');
    expect(s.setHabitat).toHaveBeenCalledWith('');
    expect(s.setSearch).toHaveBeenCalledWith('');
    expect(s.setZonePresence).toHaveBeenCalledWith(''); // ZONE_PRESENCE_FILTER.ALL === ''
  });
});
