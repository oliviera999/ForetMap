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
  test('rend des têtes de flèche orientées (markers)', () => {
    const { container } = render(<FoodWebGraph items={ITEMS} />);
    expect(container.querySelector('marker#fw-arrow')).toBeTruthy();
    const lines = container.querySelectorAll('.pedago-foodweb-graph__line');
    expect(lines.length).toBe(2);
    expect(lines[0].getAttribute('marker-end')).toContain('fw-arrow');
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
});
