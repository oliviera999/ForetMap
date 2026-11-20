import { describe, test, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  declarerModeSeance,
  useDeclarerModeSeance,
  useGlModeSeance,
} from '../../src/gl/utils/glModeSeance.js';
import { GLTopBar } from '../../src/gl/components/GLTopBar.jsx';

const TABS = [
  { id: 'maps', label: 'Cartes', icon: '🗺️' },
  { id: 'mj', label: 'Console MJ', icon: '🎲' },
];

/** La barre telle qu'`AppGL` la monte : elle lit le mode séance déclaré par l'écran du tour. */
function Barre(props) {
  const seance = useGlModeSeance();
  return (
    <GLTopBar
      tabs={TABS}
      activeTab="mj"
      onTabChange={() => {}}
      auth={{ displayName: 'Prof Test', userType: 'gl_admin' }}
      onLogout={() => {}}
      onOpenProfile={() => {}}
      seance={seance}
      {...props}
    />
  );
}

function EcranDuTour({ partie = 'Sixième B', tour = 'Tour 2 — À vous de jouer', actif = true }) {
  useDeclarerModeSeance({ actif, partie, tour });
  return <p>écran du tour</p>;
}

describe('mode séance de la console (K7)', () => {
  afterEach(() => cleanup());

  test('hors séance : la barre garde ses onglets et son compte', () => {
    render(<Barre />);
    expect(screen.queryByTestId('gl-topbar-seance')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Console MJ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déconnexion' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  });

  test('écran du tour monté : une ligne — la partie, le tour, « Menu » ; ni onglets ni compte', () => {
    render(
      <>
        <Barre />
        <EcranDuTour />
      </>,
    );
    const barre = screen.getByTestId('gl-topbar-seance');
    expect(barre).toHaveTextContent('Sixième B');
    expect(barre).toHaveTextContent('Tour 2 — À vous de jouer');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Déconnexion' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('« Menu » redéplie les onglets ; « Réduire le menu » revient à une ligne', () => {
    render(
      <>
        <Barre />
        <EcranDuTour />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByTestId('gl-topbar-seance')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Cartes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déconnexion' })).toBeInTheDocument();
    const replier = screen.getByRole('button', { name: 'Réduire le menu' });
    expect(replier).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(replier);
    expect(screen.getByTestId('gl-topbar-seance')).toBeInTheDocument();
  });

  test('le titre du tour suit la phase sans quitter le mode séance', () => {
    const { rerender } = render(
      <>
        <Barre />
        <EcranDuTour tour="Tour 2 — À vous de jouer" />
      </>,
    );
    rerender(
      <>
        <Barre />
        <EcranDuTour tour="Tour 2 — Le voile avance" />
      </>,
    );
    expect(screen.getByTestId('gl-topbar-seance')).toHaveTextContent('Tour 2 — Le voile avance');
  });

  test('en quittant l’écran du tour, la barre revient ; le menu déplié ne survit pas à la séance', () => {
    const { rerender } = render(
      <>
        <Barre />
        <EcranDuTour />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    rerender(
      <>
        <Barre />
      </>,
    );
    expect(screen.queryByRole('button', { name: 'Réduire le menu' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Console MJ' })).toBeInTheDocument();
    // Séance suivante : de nouveau une ligne, menu replié.
    rerender(
      <>
        <Barre />
        <EcranDuTour />
      </>,
    );
    expect(screen.getByTestId('gl-topbar-seance')).toBeInTheDocument();
  });

  test('une partie qui ne joue pas « Tenir à deux » ne déclare rien', () => {
    render(
      <>
        <Barre />
        <EcranDuTour actif={false} />
      </>,
    );
    expect(screen.queryByTestId('gl-topbar-seance')).toBeNull();
  });

  test('une fermeture tardive ne referme pas la déclaration suivante', () => {
    const vu = vi.fn();
    function Temoin() {
      vu(useGlModeSeance());
      return null;
    }
    render(<Temoin />);
    let fermerA;
    let fermerB;
    act(() => {
      fermerA = declarerModeSeance({ partie: 'A', tour: 'Tour 1' });
    });
    act(() => {
      fermerB = declarerModeSeance({ partie: 'B', tour: 'Tour 1' });
    });
    act(() => fermerA());
    expect(vu.mock.lastCall[0]).toMatchObject({ partie: 'B' });
    act(() => fermerB());
    expect(vu.mock.lastCall[0]).toBeNull();
  });
});
