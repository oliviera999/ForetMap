import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiGlMock = vi.fn();
const boardMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));
vi.mock('../../src/gl/components/GLGameBoard.jsx', () => ({
  GLGameBoard: (props) => {
    boardMock(props);
    return <div data-testid="stub-board" />;
  },
}));
vi.mock('../../src/gl/components/mj/GLTourJournal.jsx', () => ({
  GLTourJournal: () => <div data-testid="stub-journal" />,
}));

import {
  GLProjectionView,
  pageEtatLabel,
} from '../../src/gl/components/tenir/GLProjectionView.jsx';

/**
 * Projection « Tenir à deux » : le plateau (composant de l'onglet Cartes) en lecture seule avec
 * les calques chasse + voile ; aucun état brut (« endormie » → « dort encore », « palie » →
 * « pâlie »…) ; numéro de case humain (rang + 1) identique au journal.
 */
describe('GLProjectionView', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    boardMock.mockReset();
    apiGlMock.mockImplementation((path) => {
      if (path === '/api/gl/games/9') {
        return Promise.resolve({
          game: { id: 9, name: 'Classe 6e — plateau 1', plateau_number: 1 },
          markers: [
            { id: 1, x_pct: 5, y_pct: 20, order_index: 0 },
            { id: 2, x_pct: 15, y_pct: 20, order_index: 1 },
          ],
          teams: [{ id: 7, name: 'Les Racines', type: 'gnome', position_marker_id: 2 }],
          tenir: { state: { voilePosition: 8 } },
        });
      }
      if (path === '/api/gl/games/9/tenir/tour') {
        return Promise.resolve({
          round: { number: 2, phase: 'jeu', equipeActiveId: null },
          teams: [{ id: 7, name: 'Les Racines', type: 'gnome', pathIndex: 1, auCamp: false }],
        });
      }
      if (path === '/api/gl/games/9/chasse') {
        return Promise.resolve({
          tenues: 1,
          total: 3,
          pages: [
            { zoneKey: 'cz-p1-01', indice: 'Là où…', etat: 'endormie' },
            { zoneKey: 'cz-p1-02', indice: 'Là où…', etat: 'palie' },
            {
              zoneKey: 'cz-p1-03',
              indice: 'Là où…',
              etat: 'tenue',
              tenuePar: { name: 'Les Lucioles' },
            },
          ],
          empreintes: [],
          kraa: null,
        });
      }
      return Promise.resolve(null);
    });
  });

  test('affiche le plateau en lecture seule avec les calques tenir, et les libellés d’état', async () => {
    render(<GLProjectionView gameId={9} token="t" />);
    await waitFor(() => expect(screen.getByTestId('stub-board')).toBeTruthy());
    const props = boardMock.mock.calls.at(-1)[0];
    expect(props.canMoveMascot).toBe(false);
    expect(props.canRequestAction).toBe(false);
    expect(props.canSpellCast).toBe(false);
    expect(props.tenirLayers.voilePosition).toBe(8);
    expect(props.tenirLayers.carnet.total).toBe(3);
    expect(props.markers).toHaveLength(2);
    expect(screen.getByText(/le voile est à la case 9/)).toBeTruthy();
    expect(screen.getByText(/case 2/)).toBeTruthy();
    expect(screen.getByText('dort encore')).toBeTruthy();
    expect(screen.getByText('pâlie')).toBeTruthy();
    expect(screen.getByText(/^tenue/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/endormie|palie\b|revelee|trouvee|reparee/);
  });

  test('pageEtatLabel : tous les états ont un libellé', () => {
    for (const [etat, libelle] of [
      ['endormie', 'dort encore'],
      ['revelee', 'révélée'],
      ['palie', 'pâlie'],
      ['trouvee', 'trouvée'],
      ['tenue', 'tenue'],
      ['reparee', 'réparée'],
    ]) {
      expect(pageEtatLabel(etat)).toBe(libelle);
    }
  });
});
