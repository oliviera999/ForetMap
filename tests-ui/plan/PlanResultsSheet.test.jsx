import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PlanResultsSheet } from '../../src/plan/components/PlanResultsSheet.jsx';

/**
 * Liste de résultats du plan — distance à vol d'oiseau (audit du 13 septembre, N4).
 *
 * En production, cinq repères portent le libellé « WC », sans sous-titre ni catégorie
 * distinctive : la feuille de résultats affichait cinq lignes strictement identiques, et il
 * fallait ouvrir les cinq fiches l'une après l'autre pour savoir laquelle était la plus proche.
 */
describe('PlanResultsSheet — distance', () => {
  const WC = [
    { kind: 'marker', id: '1', name: 'WC' },
    { kind: 'marker', id: '2', name: 'WC' },
  ];
  const results = WC.map((place) => ({ place }));
  const props = {
    open: true,
    onClose: () => {},
    query: 'WC',
    results,
    onSelect: () => {},
    categoriesOf: () => [],
  };

  test('position active : chaque ligne porte sa distance, dans le nom accessible du bouton', () => {
    const distanceOf = (place) => (place.id === '1' ? '40 m' : '120 m');
    render(<PlanResultsSheet {...props} distanceOf={distanceOf} />);
    // Le nom accessible distingue les deux lignes : c'est vrai à l'œil comme au lecteur d'écran.
    expect(screen.getByRole('button', { name: /WC\s*40 m/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /WC\s*120 m/ })).toBeTruthy();
  });

  test('sans position, aucune distance inventée', () => {
    render(<PlanResultsSheet {...props} distanceOf={() => ''} />);
    const list = screen.getByRole('list');
    expect(within(list).queryByText(/\d+\s*m/)).toBe(null);
    // Les lignes restent présentes et cliquables : la distance est un complément, pas un filtre.
    expect(within(list).getAllByRole('button')).toHaveLength(2);
  });

  test('prop absente : comportement d’avant, sans erreur', () => {
    const onSelect = vi.fn();
    render(<PlanResultsSheet {...props} onSelect={onSelect} />);
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(2);
  });
});
