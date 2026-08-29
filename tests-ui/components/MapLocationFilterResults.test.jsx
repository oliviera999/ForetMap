import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapLocationFilterResults } from '../../src/components/map/MapLocationFilterResults.jsx';

const ITEMS = [
  {
    kind: 'zone',
    id: 'z1',
    title: 'Butte nord',
    emoji: '🌿',
    subtitle: 'En croissance',
    item: { id: 'z1', name: 'Butte nord' },
  },
  {
    kind: 'marker',
    id: 'm1',
    title: 'Olivier',
    emoji: '🌳',
    subtitle: 'Arbre remarquable',
    item: { id: 'm1', label: 'Olivier' },
  },
];

describe('MapLocationFilterResults', () => {
  test('n’affiche rien sans résultat', () => {
    const { container } = render(<MapLocationFilterResults items={[]} onSelectItem={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  test('liste les résultats et appelle onSelectItem au clic', () => {
    const onSelectItem = vi.fn();
    render(<MapLocationFilterResults items={ITEMS} onSelectItem={onSelectItem} />);
    expect(screen.getByText('Résultats (2)')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /Butte nord/ }));
    expect(onSelectItem).toHaveBeenCalledWith(ITEMS[0]);
  });

  test('replie et déplie la liste', () => {
    render(<MapLocationFilterResults items={ITEMS} onSelectItem={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /Résultats \(2\)/ });
    fireEvent.click(toggle);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });
});
