import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GLTenirBandeau } from '../../src/gl/components/tenir/GLTenirBandeau.jsx';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

const team = { id: 2, name: 'Licornes A', type: 'unicorn' };
const membres = [
  { playerId: 10, teamId: 2, pseudo: 'joueur-a', powerPoints: 4 },
  { playerId: 11, teamId: 2, pseudo: 'joueur-au-nom-long', powerPoints: 0 },
  { playerId: 12, teamId: 2, pseudo: 'joueur-c' },
];

describe('GLTenirBandeau', () => {
  test('nom de l’équipe, mascotte et phase en mots d’élève — plus de mot de surface', () => {
    render(<GLTenirBandeau team={team} round={{ number: 3, phase: 'jeu' }} membres={membres} />);
    const bandeau = screen.getByTestId('gl-tenir-bandeau');
    expect(within(bandeau).getByRole('heading', { name: 'Licornes A' })).toBeInTheDocument();
    expect(bandeau.querySelector('[data-gl-mascot-type="unicorn"]')).not.toBeNull();
    expect(screen.getByTestId('gl-tenir-phase')).toHaveTextContent('Tour 3 — À vous de jouer');
    expect(bandeau.textContent).not.toMatch(/tablette|hybride|licornes ·|Actualiser/);
    expect(findForbiddenString(bandeau.textContent)).toBeNull();
  });

  test('sans tour ouvert : « Le prof ouvre bientôt le tour. »', () => {
    render(<GLTenirBandeau team={team} round={null} />);
    expect(screen.getByTestId('gl-tenir-phase')).toHaveTextContent(
      'Le prof ouvre bientôt le tour.',
    );
  });

  test('les bourses restent visibles : une pastille par membre, pseudo coupé', () => {
    render(<GLTenirBandeau team={team} round={{ number: 1, phase: 'jeu' }} membres={membres} />);
    const bourses = within(screen.getByTestId('gl-tenir-bourses')).getAllByRole('listitem');
    expect(bourses).toHaveLength(3);
    expect(bourses[0]).toHaveTextContent('joueur-a');
    expect(bourses[0]).toHaveTextContent('💎 4');
    // Douze caractères au plus à l'écran ; le pseudo entier reste en infobulle.
    expect(
      bourses[1].querySelector('.gl-tenir-bourse__nom').textContent.length,
    ).toBeLessThanOrEqual(12);
    expect(bourses[1]).toHaveAttribute('title', 'joueur-au-nom-long');
    expect(bourses[1]).toHaveTextContent('💎 0');
    // Solde tu par le serveur (tablette hors tour) : le nom seul, jamais un zéro inventé.
    expect(bourses[2].textContent).toBe('joueur-c');
  });

  test('le sablier ne se montre qu’en phase de jeu, s’il tourne', () => {
    const sablier = { phase: { secondes: 180, restantSecondes: 95, enPause: false } };
    const { rerender } = render(
      <GLTenirBandeau team={team} round={{ number: 1, phase: 'jeu' }} sablier={sablier} />,
    );
    expect(screen.getByTestId('gl-sablier-phase')).toBeInTheDocument();
    rerender(
      <GLTenirBandeau team={team} round={{ number: 1, phase: 'souffle' }} sablier={sablier} />,
    );
    expect(screen.queryByTestId('gl-sablier-phase')).toBeNull();
    rerender(<GLTenirBandeau team={team} round={{ number: 1, phase: 'jeu' }} sablier={null} />);
    expect(screen.queryByTestId('gl-sablier-phase')).toBeNull();
  });

  test('bouton « L’équipe » : ouvre le tiroir, et porte la pastille de nouveauté', () => {
    const onTiroir = vi.fn();
    const { rerender } = render(
      <GLTenirBandeau team={team} onTiroir={onTiroir} tiroirId="tiroir-1" />,
    );
    const bouton = screen.getByRole('button', { name: /L’équipe/ });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(bouton).toHaveAttribute('aria-controls', 'tiroir-1');
    expect(screen.queryByTestId('gl-tenir-tiroir-nouveau')).toBeNull();
    fireEvent.click(bouton);
    expect(onTiroir).toHaveBeenCalledTimes(1);

    rerender(<GLTenirBandeau team={team} onTiroir={onTiroir} nouveaute />);
    expect(screen.getByTestId('gl-tenir-tiroir-nouveau')).toBeInTheDocument();
    // La nouveauté se dit aussi à un lecteur d'écran.
    expect(screen.getByRole('button', { name: /L’équipe\s*\(du nouveau\)/ })).toBeInTheDocument();

    rerender(<GLTenirBandeau team={team} onTiroir={onTiroir} tiroirOuvert />);
    expect(screen.getByRole('button', { name: /L’équipe/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  test('l’icône de reconnexion n’existe que si la connexion ou l’état le demandent', () => {
    const onReconnecter = vi.fn();
    const { rerender } = render(<GLTenirBandeau team={team} onReconnecter={onReconnecter} />);
    expect(screen.queryByTestId('gl-tenir-reconnexion')).toBeNull();
    rerender(<GLTenirBandeau team={team} onReconnecter={onReconnecter} reconnexion />);
    fireEvent.click(screen.getByRole('button', { name: 'Relire l’écran' }));
    expect(onReconnecter).toHaveBeenCalledTimes(1);
  });

  test('sans équipe : rien', () => {
    const { container } = render(<GLTenirBandeau team={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
