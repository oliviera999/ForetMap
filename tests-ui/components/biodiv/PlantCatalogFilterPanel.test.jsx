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
  test('options du règne dérivées des plantes (valeurs distinctes)', () => {
    setup();
    const regne = screen.getByLabelText('Règne');
    const opts = [...regne.querySelectorAll('option')].map((o) => o.textContent);
    expect(opts).toContain('Végétal');
    expect(opts).toContain('Fungi');
  });

  test('cascade : choisir le règne réinitialise groupe 2 et 3', () => {
    const { setGroup1, setGroup2, setGroup3 } = setup();
    fireEvent.change(screen.getByLabelText('Règne'), { target: { value: 'Végétal' } });
    expect(setGroup1).toHaveBeenCalledWith('Végétal');
    expect(setGroup2).toHaveBeenCalledWith('');
    expect(setGroup3).toHaveBeenCalledWith('');
  });

  test('groupe 2 dépend du règne sélectionné (dans avancés)', () => {
    setup({ group1: 'Végétal' });
    fireEvent.click(screen.getByText('Filtres avancés'));
    const selects = screen.getAllByRole('combobox');
    // Après ouverture : surface (règne ± présence) + avancés (groupe2, famille, …)
    const group2 = selects.find((s) =>
      [...s.querySelectorAll('option')].some((o) => o.textContent === 'Arbre'),
    );
    expect(group2).toBeTruthy();
    const opts = [...group2.querySelectorAll('option')].map((o) => o.textContent);
    expect(opts).toEqual(expect.arrayContaining(['Arbre', 'Herbacée']));
    expect(opts).not.toContain('Basidio');
  });

  test('recherche → setSearch', () => {
    const { setSearch } = setup();
    fireEvent.change(screen.getByPlaceholderText('Rechercher dans la biodiversité…'), {
      target: { value: 'pomm' },
    });
    expect(setSearch).toHaveBeenCalledWith('pomm');
  });

  test('« Réinitialiser les filtres » remet les setters', () => {
    const s = setup({ showZonePresence: true });
    fireEvent.click(screen.getByText('Filtres avancés'));
    fireEvent.click(screen.getByText('Réinitialiser les filtres'));
    expect(s.setGroup1).toHaveBeenCalledWith('');
    expect(s.setHabitat).toHaveBeenCalledWith('');
    expect(s.setSearch).toHaveBeenCalledWith('');
    expect(s.setZonePresence).toHaveBeenCalledWith('');
  });
});
