import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { GLTenirTiroir } from '../../src/gl/components/tenir/GLTenirTiroir.jsx';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));
vi.mock('../../src/gl/components/GLRewardsPanel.jsx', () => ({
  GLRewardsPanel: ({ title }) => <div data-testid="gl-rewards-simule">{title}</div>,
}));

const membres = [
  { playerId: 10, teamId: 2, pseudo: 'joueur-a', powerPoints: 4 },
  { playerId: 11, teamId: 2, pseudo: 'joueur-b', powerPoints: 1 },
];
const casesAVenir = [
  { index: 4, label: 'Le gué', eventType: 'question', tonalite: null },
  { index: 5, label: null, eventType: 'event', tonalite: 'trame' },
  { index: 6, label: null, eventType: 'souffle', tonalite: 'souffle' },
];
const chasse = {
  carnet: {
    total: 2,
    tenues: 0,
    trouvees: 1,
    pages: [
      { zoneKey: 'z1', etat: 'trouvee', titre: 'Le fennec', indice: 'Près des dunes.' },
      { zoneKey: 'z2', etat: 'endormie', indice: 'Sous les grands arbres.' },
    ],
  },
  page: null,
  busy: false,
  ouvrir: vi.fn(),
};

function tiroir(props = {}) {
  return (
    <GLTenirTiroir
      ouvert
      id="tiroir-1"
      gameId={7}
      casesAVenir={casesAVenir}
      reserve={{ teamId: 2, power: 3 }}
      chasse={chasse}
      presence={{ confirmee: false, absents: [] }}
      membres={membres}
      peutLire
      onFermer={vi.fn()}
      {...props}
    />
  );
}

describe('GLTenirTiroir', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({ defis: [], chimeres: [] });
    chasse.ouvrir.mockReset();
  });

  test('fermé par défaut : rien n’est rendu, rien n’est lu', () => {
    const { container } = render(tiroir({ ouvert: false }));
    expect(container).toBeEmptyDOMElement();
    expect(apiGlMock).not.toHaveBeenCalled();
  });

  test('ouvert : un panneau nommé « L’équipe », le focus sur « Fermer »', () => {
    render(tiroir());
    const panneau = screen.getByRole('dialog', { name: 'L’équipe' });
    expect(panneau).toHaveAttribute('id', 'tiroir-1');
    expect(screen.getByTestId('gl-tenir-tiroir-fermer')).toHaveFocus();
    expect(findForbiddenString(panneau.textContent)).toBeNull();
  });

  test('les cases à venir en pastilles : numéro, pictogramme, libellé court', () => {
    render(tiroir());
    const bloc = screen.getByTestId('gl-tenir-cases-a-venir');
    expect(within(bloc).getByRole('heading', { name: 'Les 3 cases à venir' })).toBeInTheDocument();
    const pastilles = within(bloc).getAllByRole('listitem');
    expect(pastilles.map((p) => p.textContent)).toEqual(['5❓Le gué', '6🧵Trame', '7🌫️Souffle']);
    // Le pictogramme est un décor : il n'est pas lu.
    expect(pastilles[0].querySelector('.gl-tenir-case__icone')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  test('après le jet, plus de cases à venir : le bloc disparaît', () => {
    render(tiroir({ casesAVenir: [] }));
    expect(screen.queryByTestId('gl-tenir-cases-a-venir')).toBeNull();
  });

  test('la réserve de la caravane, seulement quand le réglage la sert', () => {
    const { rerender } = render(tiroir());
    expect(screen.getByTestId('gl-tenir-reserve')).toHaveTextContent(
      'Réserve de la caravane : 💎 3',
    );
    rerender(tiroir({ reserve: null }));
    expect(screen.queryByTestId('gl-tenir-reserve')).toBeNull();
  });

  test('le défi à préparer, en rappel', async () => {
    apiGlMock.mockImplementation(async (url) =>
      String(url).endsWith('/defis-case')
        ? {
            defis: [
              {
                id: 1,
                code: 'd-1',
                statut: 'a_preparer',
                titre: 'Le nid',
                consigne: 'Dessinez un nid.',
              },
            ],
          }
        : { chimeres: [] },
    );
    render(tiroir());
    await waitFor(() => expect(screen.getByTestId('gl-defis-case')).toHaveTextContent('Le nid'));
  });

  test('le carnet de la classe et le Bestiaire ; « Lire » ouvre une page', async () => {
    render(tiroir());
    const carnet = screen.getByTestId('gl-tenir-tiroir-carnet');
    expect(within(carnet).getByTestId('gl-carnet-classe')).toHaveTextContent('Le fennec');
    expect(within(carnet).getByText('C’est le moment de la ou du Secrétaire.')).toBeInTheDocument();
    await waitFor(() => expect(within(carnet).getByTestId('gl-bestiaire')).toBeInTheDocument());
    fireEvent.click(within(carnet).getByRole('button', { name: 'Lire' }));
    expect(chasse.ouvrir).toHaveBeenCalledWith('z1', null);
  });

  test('geste « Lire » : le tiroir s’ouvre sur le carnet', () => {
    render(tiroir({ section: 'carnet' }));
    expect(screen.getByTestId('gl-tenir-tiroir')).toHaveAttribute('data-section', 'carnet');
    expect(screen.getByTestId('gl-tenir-tiroir-carnet')).toHaveFocus();
  });

  test('sans le droit de lire (défaut) : le carnet se consulte, ni « Lire » ni appel du rôle', () => {
    render(tiroir({ peutLire: undefined }));
    const carnet = screen.getByTestId('gl-tenir-tiroir-carnet');
    expect(within(carnet).queryByRole('button', { name: 'Lire' })).toBeNull();
    expect(within(carnet).queryByText(/Secrétaire/)).toBeNull();
  });

  test('les présences vivent ici : « Il manque quelqu’un ? »', () => {
    const onPresences = vi.fn();
    render(tiroir({ onPresences }));
    fireEvent.click(screen.getByRole('button', { name: 'Il manque quelqu’un ?' }));
    fireEvent.click(screen.getByRole('button', { name: /joueur-a/ }));
    fireEvent.click(screen.getByTestId('gl-presence-ok'));
    expect(onPresences).toHaveBeenCalledWith([10]);
  });

  test('compte d’un élève : « Mes badges », pas « Changer d’équipe »', () => {
    render(tiroir({ onChangerEquipe: vi.fn() }));
    expect(screen.queryByTestId('gl-tenir-changer-equipe')).toBeNull();
    const badges = screen.getByRole('button', { name: 'Mes badges' });
    expect(badges).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(badges);
    expect(screen.getByTestId('gl-rewards-simule')).toHaveTextContent('Mes badges');
    expect(screen.getByRole('button', { name: 'Fermer mes badges' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  test('tablette d’équipe : « Changer d’équipe », ni badges ni proposition de chimère', async () => {
    const onChangerEquipe = vi.fn();
    render(tiroir({ tablette: true, onChangerEquipe }));
    expect(screen.queryByRole('button', { name: 'Mes badges' })).toBeNull();
    await waitFor(() => expect(screen.getByTestId('gl-bestiaire')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Proposer/ })).toBeNull();
    fireEvent.click(screen.getByTestId('gl-tenir-changer-equipe'));
    expect(onChangerEquipe).toHaveBeenCalledTimes(1);
  });

  test('les bourses y sont aussi (le téléphone n’a pas la place dans le bandeau)', () => {
    render(tiroir());
    const bourses = within(screen.getByTestId('gl-tenir-tiroir-bourses')).getAllByRole('listitem');
    expect(bourses.map((b) => b.textContent)).toEqual(['joueur-a💎 4', 'joueur-b💎 1']);
  });

  test('l’élève qui regarde ce tour le lit ici aussi ; aucune demande d’appareil en double', () => {
    render(tiroir({ spectateur: true }));
    expect(screen.getByTestId('gl-tenir-spectateur')).toBeInTheDocument();
    expect(screen.queryByTestId('gl-tenir-appareils')).toBeNull();
  });

  test('« Fermer » et Échap referment ; le focus revient d’où il venait', () => {
    const onFermer = vi.fn();
    function Ecran({ ouvert }) {
      return (
        <>
          <button type="button">L’équipe</button>
          {tiroir({ ouvert, onFermer })}
        </>
      );
    }
    const { rerender } = render(<Ecran ouvert={false} />);
    const bouton = screen.getByRole('button', { name: 'L’équipe' });
    bouton.focus();
    rerender(<Ecran ouvert />);
    expect(screen.getByTestId('gl-tenir-tiroir-fermer')).toHaveFocus();
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-fermer'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onFermer).toHaveBeenCalledTimes(2);
    rerender(<Ecran ouvert={false} />);
    expect(bouton).toHaveFocus();
  });
});
