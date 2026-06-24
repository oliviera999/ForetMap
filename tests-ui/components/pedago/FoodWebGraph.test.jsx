import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FoodWebGraph } from '../../../src/components/pedago/FoodWebGraph.jsx';

const ITEMS = [
  {
    id: 1,
    interaction_type: 'predation',
    from_id: 10,
    from_name: 'Renard',
    from_emoji: '🦊',
    from_role: 'consommateur',
    to_id: 20,
    to_name: 'Lapin',
    to_emoji: '🐰',
    to_role: 'consommateur',
    description: '',
  },
  {
    id: 2,
    interaction_type: 'herbivorie',
    from_id: 20,
    from_name: 'Lapin',
    from_emoji: '🐰',
    from_role: 'consommateur',
    to_id: 30,
    to_name: 'Trèfle',
    to_emoji: '🍀',
    to_role: 'producteur',
    description: '',
  },
];

describe('FoodWebGraph', () => {
  test('rend des têtes de flèche orientées (markers par type)', () => {
    const { container } = render(<FoodWebGraph items={ITEMS} />);
    expect(container.querySelector('marker#fw-arrow-predation')).toBeTruthy();
    const lines = container.querySelectorAll('.pedago-foodweb-graph__line');
    expect(lines.length).toBe(2);
    expect(lines[0].getAttribute('marker-end')).toContain('fw-arrow-predation');
    expect(lines[0].classList.contains('pedago-foodweb-graph__line--predation')).toBe(true);
  });

  test('affiche la légende des types de relations', () => {
    const { getByLabelText } = render(<FoodWebGraph items={ITEMS} />);
    expect(getByLabelText(/Légende des types de relations/i)).toBeTruthy();
    expect(getByLabelText(/Légende des types de relations/i).textContent).toMatch(/Prédation/);
  });

  test('affiche un message si aucun nœud', () => {
    const { getByText } = render(<FoodWebGraph items={[]} />);
    expect(getByText(/Aucun nœud/i)).toBeTruthy();
  });

  test('basculer la disposition ne casse pas le rendu', () => {
    const { getByText, container } = render(<FoodWebGraph items={ITEMS} />);
    fireEvent.click(getByText(/Niveaux/));
    expect(container.querySelectorAll('.pedago-foodweb-graph__node').length).toBe(3);
  });

  test('clic sur une espèce active le mode focus (bouton « Tout afficher »)', () => {
    const { container, queryByText, getByText } = render(<FoodWebGraph items={ITEMS} />);
    expect(queryByText(/Tout afficher/)).toBeNull();
    const nodeGroup = container.querySelector('.pedago-foodweb-graph__node-group');
    fireEvent.pointerUp(nodeGroup);
    expect(getByText(/Tout afficher/)).toBeTruthy();
  });

  test('clic sur une arête appelle onSelectEdge', () => {
    const onSelectEdge = vi.fn();
    const { container } = render(<FoodWebGraph items={ITEMS} onSelectEdge={onSelectEdge} />);
    const hit = container.querySelector('.pedago-foodweb-graph__edge-hit');
    fireEvent.click(hit);
    expect(onSelectEdge).toHaveBeenCalledWith(1);
  });

  test('masque les flux trophiques au clic sur le bouton dédié', () => {
    const { getByRole, container } = render(<FoodWebGraph items={ITEMS} />);
    const btn = getByRole('button', { name: /Flux trophiques/i });
    expect(container.querySelectorAll('.pedago-foodweb-graph__line').length).toBe(2);
    fireEvent.click(btn);
    expect(container.querySelectorAll('.pedago-foodweb-graph__line').length).toBe(0);
    fireEvent.click(btn);
    expect(container.querySelectorAll('.pedago-foodweb-graph__line').length).toBe(2);
  });

  test('masque un type via la légende cliquable', () => {
    const { getByRole, container } = render(<FoodWebGraph items={ITEMS} />);
    fireEvent.click(getByRole('button', { name: /Masquer : Prédation/i }));
    expect(container.querySelectorAll('.pedago-foodweb-graph__line').length).toBe(1);
    expect(container.querySelector('.pedago-foodweb-graph__line--herbivorie')).toBeTruthy();
  });
});
