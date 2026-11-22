// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { FoodWebGraph } from '../../../src/components/pedago/FoodWebGraph.jsx';

/**
 * `nodeClickMode="panel"` (collège, décision 3 du 22/11/2026) : un clic sur une espèce ouvre
 * un petit panneau ; le mode par défaut (`'isolate'`, lycée et G&L) ne change pas.
 */

const ITEMS = [
  {
    id: 1,
    interaction_type: 'predation',
    from_id: 10,
    from_name: 'Renard',
    from_emoji: '🦊',
    to_id: 20,
    to_name: 'Poule',
    to_emoji: '🐔',
    from_in_scope: 1,
    to_in_scope: 0,
    from_elsewhere: [],
    to_elsewhere: [{ id: 'sablettes', label: 'Sablettes' }],
  },
];

function nodeFor(container, id) {
  return container.querySelector(`[data-fw-node="${id}"]`);
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch (_) {
    /* stockage indisponible */
  }
});

describe('FoodWebGraph — mode panneau', () => {
  test('clic : panneau avec étiquette, mention « vit ailleurs », ajouter / voir la fiche', () => {
    const onToggle = vi.fn();
    const onOpenPlant = vi.fn();
    const { container } = render(
      <FoodWebGraph
        items={ITEMS}
        nodeClickMode="panel"
        selectedPlantIds={[]}
        onToggleSelection={onToggle}
        onOpenPlant={onOpenPlant}
        usageLabelOf={(id) => (id === 20 ? 'oiseau de la basse-cour' : '')}
      />,
    );
    fireEvent.pointerUp(nodeFor(container, 20));
    const dialog = screen.getByRole('dialog', { name: /Poule/ });
    expect(dialog.textContent).toContain('oiseau de la basse-cour');
    expect(dialog.textContent).toContain('vit ailleurs : Sablettes');
    expect(screen.queryByText(/Tout afficher/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à la sélection' }));
    expect(onToggle).toHaveBeenCalledWith(20);
    fireEvent.click(screen.getByRole('button', { name: 'Voir la fiche' }));
    expect(onOpenPlant).toHaveBeenCalledWith(20);
  });

  test('espèce déjà choisie : « Retirer de la sélection » ; Échap ferme et rend le focus', () => {
    const { container } = render(
      <FoodWebGraph
        items={ITEMS}
        nodeClickMode="panel"
        selectedPlantIds={[10]}
        onToggleSelection={vi.fn()}
      />,
    );
    const node = nodeFor(container, 10);
    fireEvent.keyDown(node, { key: 'Enter' });
    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('button', { name: 'Retirer de la sélection' })).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(node);
  });

  test('nom accessible : mention hors carte et consigne du panneau', () => {
    const { container } = render(<FoodWebGraph items={ITEMS} nodeClickMode="panel" />);
    expect(nodeFor(container, 20).getAttribute('aria-label')).toContain('vit ailleurs : Sablettes');
    expect(nodeFor(container, 20).getAttribute('aria-label')).toContain('ajouter ou retirer');
    expect(screen.queryByRole('button', { name: /Ajouter à la sélection/ })).toBeNull();
  });

  test('mode par défaut inchangé : le clic isole, pas de panneau', () => {
    const { container } = render(<FoodWebGraph items={ITEMS} />);
    fireEvent.pointerUp(nodeFor(container, 10));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Tout afficher/)).toBeTruthy();
  });
});
