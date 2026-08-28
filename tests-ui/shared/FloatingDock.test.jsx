import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FloatingDock } from '../../src/shared/components/FloatingDock.jsx';

/**
 * L'empilement des commandes flottantes. Ce que ces cas protègent, c'est la propriété qui
 * supprime le chevauchement : les enfants **ne se positionnent pas**, l'ordre vient du flex.
 */
describe('FloatingDock', () => {
  test('empile ses enfants dans l’ordre déclaré, sans les positionner', () => {
    const { container } = render(
      <FloatingDock>
        <button type="button">cloche</button>
        <button type="button">musique</button>
      </FloatingDock>,
    );
    const dock = container.querySelector('.fm-floating-dock');
    expect(dock).not.toBeNull();
    expect([...dock.children].map((el) => el.textContent)).toEqual(['cloche', 'musique']);
    // Aucun style en ligne : c'est la feuille partagée qui place, pas l'appelant.
    for (const child of dock.children) expect(child.getAttribute('style')).toBeNull();
  });

  test('ne rend rien quand aucune commande n’est active', () => {
    /*
     * Le point du test : un conteneur fixe vide couvrirait une colonne entière de l'écran.
     * Les commandes sont toutes conditionnelles (module éteint, invité, onglet), donc le cas
     * « zéro enfant » est un état normal, pas un accident.
     */
    const { container } = render(
      <FloatingDock>
        {false}
        {null}
      </FloatingDock>,
    );
    expect(container.querySelector('.fm-floating-dock')).toBeNull();
  });

  test('se présente comme un groupe nommé', () => {
    render(
      <FloatingDock label="Commandes rapides">
        <button type="button">?</button>
      </FloatingDock>,
    );
    expect(screen.getByRole('group', { name: 'Commandes rapides' })).toBeInTheDocument();
  });
});
