import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FoodWebGraph } from '../../../src/components/pedago/FoodWebGraph.jsx';

const ENV_ITEM = {
  id: 3,
  interaction_type: 'nitrification',
  from_id: 30,
  from_name: 'Trèfle',
  from_emoji: '🍀',
  from_role: 'producteur',
  to_id: null,
  to_name: null,
  to_emoji: null,
  to_role: null,
  description: 'fixe l’azote dans le sol',
};

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

  test('rend un nœud « environnement » pour une interaction sans espèce cible', () => {
    const { container, getByLabelText } = render(<FoodWebGraph items={[...ITEMS, ENV_ITEM]} />);
    expect(container.querySelector('.pedago-foodweb-graph__node--env')).toBeTruthy();
    expect(getByLabelText(/^Environnement —/)).toBeTruthy();
  });

  test('les libellés trop longs sont coupés avec une ellipse', () => {
    const long = [
      {
        ...ITEMS[0],
        from_name: 'Consoude officinale de Russie',
      },
    ];
    const { container } = render(<FoodWebGraph items={long} />);
    const labels = [...container.querySelectorAll('.pedago-foodweb-graph__label')].map(
      (n) => n.textContent,
    );
    expect(labels).toContain('Consoude offici…');
  });

  test('nœuds et arêtes sont atteignables au clavier', () => {
    const { container } = render(<FoodWebGraph items={ITEMS} />);
    const node = container.querySelector('.pedago-foodweb-graph__node-group');
    const edge = container.querySelector('.pedago-foodweb-graph__edge-hit');
    expect(node.getAttribute('tabindex')).toBe('0');
    expect(node.getAttribute('role')).toBe('button');
    expect(edge.getAttribute('tabindex')).toBe('0');
    expect(edge.getAttribute('aria-label')).toMatch(/Prédation : Lapin est mangée par Renard/);
  });

  test('le SVG n’est plus un role="img" (son contenu resterait masqué)', () => {
    const { container } = render(<FoodWebGraph items={ITEMS} />);
    expect(container.querySelector('svg.pedago-foodweb-graph').getAttribute('role')).toBe('group');
  });

  test('Entrée sur un nœud isole son réseau, Maj+Entrée ouvre sa fiche', () => {
    const onOpenPlant = vi.fn();
    const { container, getByText, queryByText } = render(
      <FoodWebGraph items={ITEMS} onOpenPlant={onOpenPlant} />,
    );
    const node = container.querySelector('.pedago-foodweb-graph__node-group');
    expect(queryByText(/Tout afficher/)).toBeNull();
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(getByText(/Tout afficher/)).toBeTruthy();
    fireEvent.keyDown(node, { key: 'Enter', shiftKey: true });
    expect(onOpenPlant).toHaveBeenCalledWith(10);
  });

  test('Entrée sur une arête la sélectionne', () => {
    const onSelectEdge = vi.fn();
    const { container } = render(<FoodWebGraph items={ITEMS} onSelectEdge={onSelectEdge} />);
    fireEvent.keyDown(container.querySelector('.pedago-foodweb-graph__edge-hit'), { key: 'Enter' });
    expect(onSelectEdge).toHaveBeenCalledWith(1);
  });

  test('le nœud environnement n’ouvre aucune fiche espèce', () => {
    const onOpenPlant = vi.fn();
    const { getByLabelText } = render(
      <FoodWebGraph items={[...ITEMS, ENV_ITEM]} onOpenPlant={onOpenPlant} />,
    );
    fireEvent.doubleClick(getByLabelText(/^Environnement —/));
    expect(onOpenPlant).not.toHaveBeenCalled();
  });

  test('l’espèce mise en avant est isolée d’emblée', () => {
    const { getByText } = render(<FoodWebGraph items={ITEMS} highlightPlantId={10} />);
    expect(getByText(/Tout afficher/)).toBeTruthy();
  });

  test('un focus devenu absent du jeu de données est abandonné', () => {
    const { container, rerender, queryByText, getByText } = render(<FoodWebGraph items={ITEMS} />);
    fireEvent.pointerUp(container.querySelector('.pedago-foodweb-graph__node-group'));
    expect(getByText(/Tout afficher/)).toBeTruthy();
    rerender(<FoodWebGraph items={[ENV_ITEM]} />);
    expect(queryByText(/Tout afficher/)).toBeNull();
  });

  test('la molette est écoutée en non passif (sinon la page défile au zoom)', () => {
    const addSpy = vi.spyOn(SVGElement.prototype, 'addEventListener');
    render(<FoodWebGraph items={ITEMS} />);
    const wheelCall = addSpy.mock.calls.find(([type]) => type === 'wheel');
    expect(wheelCall).toBeTruthy();
    expect(wheelCall[2]).toEqual({ passive: false });
    addSpy.mockRestore();
  });

  test('changer de disposition abandonne les positions déplacées à la main', () => {
    const { container, getByText } = render(<FoodWebGraph items={ITEMS} />);
    const svg = container.querySelector('svg.pedago-foodweb-graph');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 880, height: 560 });
    const node = container.querySelector('.pedago-foodweb-graph__node-group');
    const before = node.getAttribute('transform');

    fireEvent.pointerDown(node, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 300 });
    fireEvent.pointerUp(node, { clientX: 100, clientY: 300 });
    const moved = container.querySelector('.pedago-foodweb-graph__node-group');
    expect(moved.getAttribute('transform')).not.toBe(before);

    fireEvent.click(getByText(/Niveaux/));
    fireEvent.click(getByText(/Cercle/));
    expect(
      container.querySelector('.pedago-foodweb-graph__node-group').getAttribute('transform'),
    ).toBe(before);
  });

  test('un glissement purement vertical n’est pas pris pour un clic', () => {
    const { container, queryByText } = render(<FoodWebGraph items={ITEMS} />);
    const svg = container.querySelector('svg.pedago-foodweb-graph');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 880, height: 560 });
    const node = container.querySelector('.pedago-foodweb-graph__node-group');
    fireEvent.pointerDown(node, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(node, { clientX: 100, clientY: 260 });
    expect(queryByText(/Tout afficher/)).toBeNull();
  });
});
