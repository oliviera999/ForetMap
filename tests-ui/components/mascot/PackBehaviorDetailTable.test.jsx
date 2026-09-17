import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PackBehaviorDetailTable from '../../../src/components/mascot/PackBehaviorDetailTable.jsx';

const VALID_PACK = {
  mascotPackVersion: 1,
  id: 'demo',
  label: 'Demo',
  renderer: 'sprite_cut',
  framesBase: '/assets/mascots/demo/frames/',
  frameWidth: 32,
  frameHeight: 32,
  fallbackSilhouette: 'gnome',
  stateFrames: {
    idle: { files: ['a.png', 'b.png'], fps: 4 },
    walking: { files: ['c.png'], fps: 8 },
  },
};

describe('PackBehaviorDetailTable', () => {
  test('rend la fiche métadonnées et une ligne par état', () => {
    render(<PackBehaviorDetailTable pack={VALID_PACK} />);
    // En-tête métadonnées : framesBase + dimensions + silhouette
    expect(screen.getByText('framesBase')).toBeTruthy();
    expect(screen.getByText(/\/assets\/mascots\/demo\/frames/)).toBeTruthy();
    // Une ligne par état (libellé humain + clé entre parenthèses), triées alphabétiquement.
    expect(screen.getByText('(idle)')).toBeTruthy();
    expect(screen.getByText('(walking)')).toBeTruthy();
    // En-têtes du tableau présents.
    expect(screen.getByText('Durée estimée')).toBeTruthy();
    expect(screen.getByText('frameDwellMs')).toBeTruthy();
  });

  test('affiche le message d’erreur pour un pack invalide', () => {
    render(<PackBehaviorDetailTable pack={{ foo: 'bar' }} />);
    expect(screen.getByText(/Pack invalide pour la fiche/)).toBeTruthy();
    expect(screen.queryByText('idle')).toBeNull();
  });

  test('le nombre d’images reflète les frames de l’état', () => {
    render(<PackBehaviorDetailTable pack={VALID_PACK} />);
    const idleRow = screen.getByText('(idle)').closest('tr');
    expect(idleRow.textContent).toContain('2');
  });

  /*
   * Contrat du tableau commun (audit UI « homogénéité », §5 B2).
   *
   * Cinq habillages de tableau coexistaient côté ForetMap, dont deux qui n'existaient dans
   * aucune feuille : `.data-table` (stats) et `.visit-mascot-pack-detail-table`, celui-ci.
   * Il s'en tirait en réécrivant toute son apparence en **styles inline** — largeur, filets,
   * marges de cellule, taille de texte — donc à une spécificité qu'aucune feuille ne peut
   * reprendre. Ces deux tests figent le retour de l'apparence dans `.fm-table`
   * (`shared/styles/surfaces.css`), non chargée par jsdom : on vérifie le balisage.
   */
  test('porte `.fm-table` et son conteneur défilant', () => {
    const { container } = render(<PackBehaviorDetailTable pack={VALID_PACK} />);
    const table = container.querySelector('table');
    expect(table).toHaveClass('fm-table');
    expect(table).toHaveClass('fm-table--dense');
    expect(table.closest('.fm-table-wrap')).not.toBeNull();
  });

  test('ne réécrit plus l’apparence du tableau en style inline', () => {
    const { container } = render(<PackBehaviorDetailTable pack={VALID_PACK} />);
    const table = container.querySelector('table');
    for (const prop of ['width', 'borderCollapse', 'fontSize']) {
      expect(table.style[prop]).toBe('');
    }
    for (const cell of container.querySelectorAll('th, td')) {
      expect(cell.style.padding).toBe('');
      expect(cell.style.borderBottom).toBe('');
    }
    for (const row of container.querySelectorAll('tr')) {
      expect(row.style.borderBottom).toBe('');
    }
  });
});
