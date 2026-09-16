import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FoodWebGraph } from '../../../src/components/pedago/FoodWebGraph.jsx';

const ENV_ITEM = {
  id: 3,
  interaction_type: 'decomposition',
  from_id: 40,
  from_name: 'Champignon',
  from_emoji: '🍄',
  from_role: 'decomposeur',
  to_id: null,
  to_name: null,
  to_emoji: null,
  to_role: null,
  description: 'litière',
};

const NITRI_ITEM = {
  id: 4,
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
  // La disposition choisie est mémorisée d'une session à l'autre : sans remise à
  // zéro, un test hériterait du choix du précédent.
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch (_) {
      /* stockage indisponible */
    }
  });

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

  test('le mode par défaut masque les relations non alimentaires', () => {
    const { queryByLabelText, getByRole, getByLabelText } = render(
      <FoodWebGraph items={[...ITEMS, NITRI_ITEM]} />,
    );
    expect(queryByLabelText(/^Environnement —/)).toBeNull();
    fireEvent.click(getByRole('button', { name: /^Autres relations$/ }));
    expect(getByLabelText(/^Environnement —/)).toBeTruthy();
    fireEvent.click(getByRole('button', { name: /^Tout$/ }));
    expect(getByLabelText(/^Environnement —/)).toBeTruthy();
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

  test('les niveaux sont la disposition par défaut d’un réseau alimentaire, et sont nommés', () => {
    // Renard → Lapin → Trèfle : trois niveaux calculés depuis le graphe.
    const { getByText, queryByText } = render(<FoodWebGraph items={ITEMS} />);
    expect(getByText('Producteurs')).toBeTruthy();
    expect(getByText('Consommateurs primaires')).toBeTruthy();
    expect(getByText('Consommateurs secondaires')).toBeTruthy();
    fireEvent.click(getByText(/Cercle/));
    expect(queryByText('Producteurs')).toBeNull();
  });

  test('sans flux de matière, « Niveaux » retombe sur les colonnes de rôles', () => {
    // Cadrage « Autres relations » : aucun niveau trophique n'a de sens.
    const { getByText } = render(<FoodWebGraph items={[NITRI_ITEM, ENV_ITEM]} />);
    fireEvent.click(getByText(/^Autres relations$/));
    fireEvent.click(getByText(/Niveaux/));
    expect(getByText('Producteurs')).toBeTruthy();
    expect(getByText('Consommateurs')).toBeTruthy();
    expect(getByText('Décomposeurs')).toBeTruthy();
  });

  test('l’infobulle d’une espèce porte son niveau, situé dans ce réseau', () => {
    const { getByLabelText } = render(<FoodWebGraph items={ITEMS} />);
    expect(getByLabelText(/Renard.*niveau 3 dans ce réseau/)).toBeTruthy();
    expect(getByLabelText(/Trèfle.*niveau 1 dans ce réseau/)).toBeTruthy();
  });

  test('bouton Voir la fiche ouvre l’espèce isolée', () => {
    const onOpenPlant = vi.fn();
    const { container, getByRole } = render(
      <FoodWebGraph items={ITEMS} onOpenPlant={onOpenPlant} />,
    );
    fireEvent.pointerUp(container.querySelector('.pedago-foodweb-graph__node-group'));
    fireEvent.click(getByRole('button', { name: /Voir la fiche/i }));
    expect(onOpenPlant).toHaveBeenCalledWith(10);
  });

  test('halo vert sur l’arête sélectionnée sans écraser sa couleur', () => {
    const { container } = render(<FoodWebGraph items={ITEMS} selectedEdgeId={1} />);
    expect(container.querySelector('.pedago-foodweb-graph__line-halo')).toBeTruthy();
    const line = container.querySelector('.pedago-foodweb-graph__line--predation');
    expect(line.getAttribute('stroke')).toBe('#d55e00');
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
    fireEvent.click(getByText(/Cercle/));
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

  test('deux relations entre les mêmes espèces ne sont plus confondues', () => {
    const parallel = [ITEMS[0], { ...ITEMS[0], id: 99, interaction_type: 'herbivorie' }];
    const { container } = render(<FoodWebGraph items={parallel} />);
    const paths = [...container.querySelectorAll('.pedago-foodweb-graph__line')].map((n) =>
      n.getAttribute('d'),
    );
    expect(paths.length).toBe(2);
    expect(paths[0]).not.toBe(paths[1]);
    // Chacune est courbée d'un côté : le tracé passe par un point de contrôle.
    expect(paths.every((d) => d.includes('Q'))).toBe(true);
  });

  test('une relation isolée reste un trait droit', () => {
    const { container } = render(<FoodWebGraph items={[ITEMS[0]]} />);
    expect(container.querySelector('.pedago-foodweb-graph__line').getAttribute('d')).toContain('L');
  });

  test('la recherche isole l’espèce trouvée', () => {
    const { getByLabelText, getByText, queryByText } = render(<FoodWebGraph items={ITEMS} />);
    expect(queryByText(/Tout afficher/)).toBeNull();
    fireEvent.change(getByLabelText('Rechercher une espèce'), { target: { value: 'trèf' } });
    fireEvent.click(getByText(/Isoler/));
    expect(getByText(/Tout afficher/)).toBeTruthy();
  });

  test('la profondeur de focus n’apparaît qu’une fois une espèce isolée', () => {
    const { container, queryByText, getByText } = render(<FoodWebGraph items={ITEMS} />);
    expect(queryByText('Chaîne')).toBeNull();
    fireEvent.pointerUp(container.querySelector('.pedago-foodweb-graph__node-group'));
    expect(getByText('Chaîne')).toBeTruthy();
    expect(getByText('Voisins')).toBeTruthy();
  });

  test('« Chaîne » élargit le sous-réseau isolé', () => {
    // Renard → Lapin → Trèfle : isoler Trèfle en profondeur 2 doit ramener le Renard.
    const { container, getByText } = render(<FoodWebGraph items={ITEMS} highlightPlantId={30} />);
    const atDepth1 = container.querySelectorAll('.pedago-foodweb-graph__node').length;
    fireEvent.click(getByText('Chaîne'));
    const atDepth2 = container.querySelectorAll('.pedago-foodweb-graph__node').length;
    expect(atDepth2).toBeGreaterThan(atDepth1);
  });

  test('isoler recompose la scène : le hors-sujet est retiré, pas seulement estompé', () => {
    const { container } = render(<FoodWebGraph items={ITEMS} highlightPlantId={30} />);
    // Trèfle + son voisin Lapin : le Renard n'est plus dessiné du tout.
    expect(container.querySelectorAll('.pedago-foodweb-graph__node').length).toBe(2);
    expect(container.querySelectorAll('.pedago-foodweb-graph__node.dim').length).toBe(0);
  });

  test('« Reste en fond » rétablit le contexte estompé', () => {
    const { container, getByText } = render(<FoodWebGraph items={ITEMS} highlightPlantId={30} />);
    fireEvent.click(getByText(/Reste en fond/));
    expect(container.querySelectorAll('.pedago-foodweb-graph__node').length).toBe(3);
    expect(container.querySelectorAll('.pedago-foodweb-graph__node.dim').length).toBe(1);
  });

  test('⌘/Ctrl + clic compose une sélection de plusieurs espèces', () => {
    const { container, getByText, getByRole } = render(<FoodWebGraph items={ITEMS} />);
    const groups = () => [...container.querySelectorAll('.pedago-foodweb-graph__node-group')];
    fireEvent.pointerUp(groups()[0]); // Renard
    expect(getByText('Espèce isolée')).toBeTruthy();
    const lapin = groups().find((g) => /Lapin/.test(g.getAttribute('aria-label')));
    fireEvent.pointerUp(lapin, { ctrlKey: true });
    expect(getByText('2 espèces isolées')).toBeTruthy();
    // La profondeur « Sélection » n'apparaît qu'à partir de deux espèces.
    expect(getByRole('button', { name: 'Sélection' })).toBeTruthy();
  });

  test('« Sélection » ne garde que les espèces choisies et leurs relations', () => {
    const { container, getByRole, getByLabelText } = render(<FoodWebGraph items={ITEMS} />);
    fireEvent.click(getByRole('button', { name: /Ajouter à la sélection/ }));
    fireEvent.change(getByLabelText('Rechercher une espèce'), { target: { value: 'renard' } });
    fireEvent.click(getByRole('button', { name: /^Ajouter$/ }));
    fireEvent.change(getByLabelText('Rechercher une espèce'), { target: { value: 'lapin' } });
    fireEvent.click(getByRole('button', { name: /^Ajouter$/ }));
    fireEvent.click(getByRole('button', { name: 'Sélection' }));
    expect(container.querySelectorAll('.pedago-foodweb-graph__node').length).toBe(2);
    expect(container.querySelectorAll('.pedago-foodweb-graph__line').length).toBe(1);
  });

  test('une puce retire l’espèce de la sélection', () => {
    const { container, getByText, getByLabelText } = render(<FoodWebGraph items={ITEMS} />);
    fireEvent.pointerUp(container.querySelector('.pedago-foodweb-graph__node-group'));
    fireEvent.click(getByLabelText(/Retirer Renard de la sélection/));
    expect(() => getByText(/Tout afficher/)).toThrow();
  });

  test('l’espèce isolée est résumée en toutes lettres', () => {
    const { getByText } = render(<FoodWebGraph items={ITEMS} highlightPlantId={20} />);
    // Lapin : mange le trèfle, est mangé par le renard.
    expect(getByText(/mange\s*:\s*Trèfle/)).toBeTruthy();
    expect(getByText(/est mangée par\s*:\s*Renard/)).toBeTruthy();
  });

  test('la disposition « Fiche » n’est proposée qu’une fois une espèce isolée', () => {
    // Lapin : il mange (le trèfle) et il est mangé (par le renard) — les deux colonnes.
    const { queryByText, getByText } = render(<FoodWebGraph items={ITEMS} highlightPlantId={20} />);
    fireEvent.click(getByText('Fiche'));
    expect(getByText('Ce qu’elle mange')).toBeTruthy();
    expect(getByText('Ce qui la mange')).toBeTruthy();
    fireEvent.click(getByText(/Tout afficher/));
    expect(queryByText('Fiche')).toBeNull();
  });

  test('une espèce hors périmètre est marquée', () => {
    const outside = [{ ...ITEMS[0], from_in_scope: 0, to_in_scope: 1 }];
    const { container, getByLabelText } = render(<FoodWebGraph items={outside} />);
    expect(container.querySelector('.pedago-foodweb-graph__node--outside')).toBeTruthy();
    expect(getByLabelText(/Renard.*hors du périmètre filtré/)).toBeTruthy();
  });

  test('le pincement zoome sans être pris pour un clic', () => {
    const { container, queryByText } = render(<FoodWebGraph items={ITEMS} />);
    const svg = container.querySelector('svg.pedago-foodweb-graph');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 880, height: 560 });
    const viewport = () => container.querySelector('[data-fw-viewport]').getAttribute('transform');
    const before = viewport();

    const node = container.querySelector('.pedago-foodweb-graph__node-group');
    fireEvent.pointerDown(node, { pointerId: 1, clientX: 400, clientY: 280 });
    fireEvent.pointerDown(svg, { pointerId: 2, clientX: 440, clientY: 280 });
    // Les deux doigts s'écartent : la vue doit grossir.
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 600, clientY: 280 });
    expect(viewport()).not.toBe(before);

    fireEvent.pointerUp(node, { pointerId: 1, clientX: 400, clientY: 280 });
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 600, clientY: 280 });
    // Lever les doigts d'un pincement ne doit pas enclencher le mode focus.
    expect(queryByText(/Tout afficher/)).toBeNull();
  });
});
