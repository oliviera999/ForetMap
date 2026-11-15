import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  GLTrameBoard,
  dispositionEnOvale,
  TRAME_CLASSEMENT_UI,
} from '../../src/gl/components/defis/GLTrameBoard.jsx';

const cartes = [
  { code: 'P', nom: 'Herbe', role: 'producteur' },
  { code: 'H', nom: 'Zèbre', role: 'consommateur', photoUrl: '/zebre.jpg', photoCredit: 'A. B.' },
  { code: 'C', nom: 'Lion', role: 'consommateur' },
  { code: 'DEC', nom: 'Décomposeurs du sol', role: 'decomposeur', precision: 'champignons, vers' },
];
const fleches = [
  { de: 'P', vers: 'H', classement: 'trouvee', message: 'Lien trouvé.' },
  { de: 'C', vers: 'H', classement: 'inversee', message: 'Regarde le sens : …' },
  { de: 'H', vers: 'P', classement: 'a_discuter', message: 'À discuter avec ton équipe.' },
];

describe('GLTrameBoard — plateau de cartes de la Trame', () => {
  test('plateau : une flèche se pose par appui sur le départ puis sur l’arrivée, au doigt comme au clavier', () => {
    const onAjouter = vi.fn();
    render(<GLTrameBoard cartes={cartes} fleches={[]} onAjouter={onAjouter} mode="plateau" />);
    expect(screen.getByTestId('gl-trame-board').getAttribute('data-mode')).toBe('plateau');
    const herbe = screen.getByTestId('gl-trame-carte-P');
    fireEvent.click(herbe);
    expect(herbe.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('gl-trame-annonce').textContent).toMatch(/choisis maintenant/);
    fireEvent.click(screen.getByTestId('gl-trame-carte-H'));
    expect(onAjouter).toHaveBeenCalledWith('P', 'H');
    expect(herbe.getAttribute('aria-pressed')).toBe('false');
    // Retoucher la carte de départ annule, sans rien poser.
    fireEvent.click(herbe);
    fireEvent.click(herbe);
    expect(onAjouter).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('gl-trame-annonce').textContent).toBe('Départ annulé.');
    // Ce sont de vrais boutons : utilisables au clavier.
    expect(herbe.tagName).toBe('BUTTON');
    expect(screen.getByAltText('')).toBeTruthy();
    // Sur le plateau, les crédits des photos sont réunis sous le réseau.
    expect(screen.getByTestId('gl-trame-credits').textContent).toBe('Photos : Zèbre — A. B.');
    expect(screen.getByText('champignons, vers')).toBeTruthy();
  });

  test('classement : pictogramme et message par flèche, compteur sans total, jamais de rouge porté seul', () => {
    const onRetirer = vi.fn();
    render(
      <GLTrameBoard
        cartes={cartes}
        fleches={fleches}
        onAjouter={vi.fn()}
        onRetirer={onRetirer}
        mode="plateau"
      />,
    );
    expect(screen.getByTestId('gl-trame-trouvees').textContent).toBe('Liens trouvés : 1');
    const legende = screen.getByRole('list', { name: 'Flèches posées' });
    const lignes = within(legende).getAllByRole('listitem');
    expect(lignes).toHaveLength(3);
    expect(lignes[0].textContent).toContain(TRAME_CLASSEMENT_UI.trouvee.picto);
    expect(lignes[1].textContent).toContain(TRAME_CLASSEMENT_UI.inversee.picto);
    expect(lignes[1].textContent).toContain('Regarde le sens');
    expect(lignes[2].textContent).toContain('À discuter');
    expect(lignes[2].className).toContain('is-a_discuter');
    // Le dernier classement reçu est dit à voix haute.
    expect(screen.getByTestId('gl-trame-annonce').textContent).toContain('Zèbre → Herbe');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la flèche de Lion vers Zèbre' }));
    expect(onRetirer).toHaveBeenCalledWith('C', 'H');
    expect(document.querySelectorAll('line.gl-trame-trait')).toHaveLength(3);
  });

  test('téléphone : mode liste « relier à… », mêmes gestes sans glisser', () => {
    const onAjouter = vi.fn();
    const onRetirer = vi.fn();
    render(
      <GLTrameBoard
        cartes={cartes}
        fleches={fleches}
        onAjouter={onAjouter}
        onRetirer={onRetirer}
        mode="liste"
      />,
    );
    expect(screen.getByTestId('gl-trame-board').getAttribute('data-mode')).toBe('liste');
    expect(document.querySelector('svg')).toBeNull();
    fireEvent.change(screen.getByTestId('gl-trame-relier-C'), { target: { value: 'DEC' } });
    expect(onAjouter).toHaveBeenCalledWith('C', 'DEC');
    expect(screen.getByText(/est mangé par/, { selector: '.is-trouvee' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la flèche de Herbe vers Zèbre' }));
    expect(onRetirer).toHaveBeenCalledWith('P', 'H');
  });

  test('trame altérée : réseau donné tissé, carte retirée grisée, lecture seule', () => {
    render(
      <GLTrameBoard
        cartes={cartes}
        liensFixes={[
          { de: 'P', vers: 'H' },
          { de: 'H', vers: 'C' },
        ]}
        grisee="C"
        mode="plateau"
        sousCarte={(carte) => <span data-testid={`sous-${carte.code}`}>sous</span>}
      />,
    );
    expect(screen.queryByTestId('gl-trame-trouvees')).toBeNull();
    expect(document.querySelectorAll('line.gl-trame-trait.is-fixe')).toHaveLength(2);
    expect(screen.getByTestId('gl-trame-carte-C').disabled).toBe(true);
    expect(screen.getByTestId('sous-P')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gl-trame-carte-P'));
    expect(screen.getByTestId('gl-trame-carte-P').getAttribute('aria-pressed')).toBe('false');
  });

  test('indice : le lien révélé est en pointillés, à tracer soi-même ; disposition en ovale stable', () => {
    render(
      <GLTrameBoard
        cartes={cartes}
        fleches={[]}
        onAjouter={vi.fn()}
        suggestion={{ de: 'H', vers: 'C' }}
        mode="plateau"
      />,
    );
    expect(document.querySelectorAll('line.is-suggestion')).toHaveLength(1);
    expect(screen.getByTestId('gl-trame-suggestion').textContent).toMatch(/de Zèbre vers Lion/);
    const pos = dispositionEnOvale(['A', 'B', 'C', 'D']);
    expect(pos).toEqual(dispositionEnOvale(['A', 'B', 'C', 'D']));
    for (const p of Object.values(pos)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
});
