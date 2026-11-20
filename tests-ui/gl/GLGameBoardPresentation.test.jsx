// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Les trois présentations du plateau (chantier « écrans de séance », étape 2) :
 * `standard` (rien ne change), `tenir` (la scène de l'écran d'équipe) et `projection` (la scène
 * du tableau). Montage réel : moteur de carte, en-tête, outils et panneau « Équipes » ne sont
 * pas simulés — c'est leur présence ou leur absence que l'on vérifie.
 */

vi.mock('../../src/gl/assets/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    plateauBoardImg: () => '/uploads/media-library/image/2026/06/plateau-2.jpg',
    loadGlAssetRuntime: vi.fn(() => Promise.resolve({ keys: {}, images: {}, audio: {} })),
  };
});

const stubs = vi.hoisted(() => {
  const noop = () => {};
  return {
    arrival: {
      popover: null,
      effectPopover: null,
      closePopover: noop,
      closeEffectPopover: noop,
      reshuffle: noop,
      setResult: noop,
      schedulePresentOnArrival: noop,
    },
    motion: {
      getPositionForTeam: () => ({ xp: 50, yp: 50 }),
      getMotionForTeam: () => ({}),
      moveTeamTo: noop,
    },
  };
});

vi.mock('../../src/gl/hooks/useGLMarkerArrival.js', () => ({
  useGLMarkerArrival: () => stubs.arrival,
}));
vi.mock('../../src/gl/hooks/useGLBoardMascotMotion.js', () => ({
  useGLBoardMascotMotion: () => stubs.motion,
}));
vi.mock('../../src/gl/components/GLBoardMarkers.jsx', () => ({
  GLBoardMarkers: () => <div data-testid="board-markers" />,
}));
vi.mock('../../src/gl/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: () => false,
}));

const { GLGameBoard, GL_BOARD_PRESENTATIONS, resolveBoardPresentation } =
  await import('../../src/gl/components/GLGameBoard.jsx');
const { GLMapView } = await import('../../src/gl/components/GLMapView.jsx');

const TEAMS = [
  { id: 1, name: 'Les Racines', type: 'gnome', color: '#65a30d' },
  { id: 2, name: 'Les Crinières', type: 'unicorn', color: '#7c3aed' },
];
const ROSTER = [
  { playerId: 11, teamId: 1, pseudo: 'joueur-a' },
  { playerId: 12, teamId: 2, pseudo: 'joueur-b' },
];

const baseProps = {
  chapter: { title: 'Plateau 1', map_image_url: '/maps/map-foret.svg' },
  markers: [],
  teams: TEAMS,
  roster: ROSTER,
  gameId: 10,
  watchTeamId: 1,
  onSelectTeam: () => {},
  canMoveMascot: false,
  canRequestAction: false,
  markerArrivalEnabled: true,
  selectedTeamId: null,
  currentTeamId: null,
  // Outils du plateau classique : ils doivent disparaître des scènes épurées.
  canSpellCast: true,
  onLaunchSpell: () => {},
};

const scene = (container) => container.querySelector('[data-presentation]');
const boutons = (container) => [...container.querySelectorAll('button')];
const nomsDesBoutons = (container) =>
  boutons(container).map((b) => b.getAttribute('aria-label') || b.textContent.trim());

beforeEach(() => {
  document.body.className = '';
});

describe('GLGameBoard — prop `presentation`', () => {
  test('les trois présentations sont déclarées ; une valeur inconnue vaut « standard »', () => {
    expect(GL_BOARD_PRESENTATIONS).toEqual(['standard', 'tenir', 'projection']);
    expect(resolveBoardPresentation('tenir')).toBe('tenir');
    expect(resolveBoardPresentation('projection')).toBe('projection');
    expect(resolveBoardPresentation(undefined)).toBe('standard');
    expect(resolveBoardPresentation('plein-ecran')).toBe('standard');
  });

  test('standard (défaut) : en-tête, outils, trois boutons de zoom et panneau « Équipes »', () => {
    const { container } = render(<GLGameBoard {...baseProps} />);
    const racine = scene(container);
    expect(racine.dataset.presentation).toBe('standard');
    expect(racine.classList.contains('gl-panel')).toBe(true);
    expect(racine.classList.contains('gl-board-scene')).toBe(false);
    // En-tête : titre et plein écran.
    expect(screen.getByRole('heading', { level: 2, name: 'Plateau 1' })).toBeTruthy();
    expect(screen.getByTestId('gl-map-fullscreen-open')).toBeTruthy();
    expect(screen.getByTestId('gl-board-header-spell')).toBeTruthy();
    // Outils superposés et zoom complet.
    expect(screen.getByTestId('gl-board-hud-fullscreen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoomer le plateau' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dézoomer le plateau' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recentrer le plateau' })).toBeTruthy();
    // Panneau « Équipes ».
    expect(container.querySelector('.gl-map-roster')).not.toBeNull();
    // Les pions d'équipe restent des boutons, et le plateau garde ses gestes.
    expect(container.querySelector('button.gl-board-team-pin')).not.toBeNull();
    expect(container.querySelector('.gl-board').style.touchAction).toBe('none');
  });

  test('tenir : ni en-tête, ni panneau, ni outils ; un seul bouton « Recentrer », gestes gardés', () => {
    const { container } = render(<GLGameBoard {...baseProps} presentation="tenir" />);
    const racine = scene(container);
    expect(racine.dataset.presentation).toBe('tenir');
    expect(racine.className).toBe('gl-board-scene gl-board-scene--tenir');
    // Ni en-tête (titre, plein écran, sortilège), ni panneau « Équipes », ni outils superposés.
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.queryByText('Carte de jeu')).toBeNull();
    expect(screen.queryByTestId('gl-map-fullscreen-open')).toBeNull();
    expect(screen.queryByTestId('gl-board-header-spell')).toBeNull();
    expect(screen.queryByTestId('gl-board-hud-fullscreen')).toBeNull();
    expect(screen.queryByTestId('gl-board-hud-spell')).toBeNull();
    expect(container.querySelector('.gl-map-roster')).toBeNull();
    expect(container.querySelector('.gl-board-chrome-bar')).toBeNull();
    // Un seul bouton de plateau : « Recentrer », nommé.
    const zoom = [...container.querySelectorAll('.gl-board-zoom-controls button')];
    expect(zoom).toHaveLength(1);
    expect(zoom[0].getAttribute('aria-label')).toBe('Recentrer le plateau');
    expect(zoom[0].textContent).toContain('Recentrer');
    expect(screen.queryByRole('button', { name: 'Zoomer le plateau' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dézoomer le plateau' })).toBeNull();
    // Pincement et molette conservés : le moteur garde la main sur les gestes.
    expect(container.querySelector('.gl-board').style.touchAction).toBe('none');
    // Le plateau lui-même est là, avec ses pions.
    expect(container.querySelector('.gl-board-world .gl-board-fit-layer img')).not.toBeNull();
    expect(container.querySelectorAll('.gl-board-team-pin')).toHaveLength(2);
  });

  test('projection : aucun bouton, ni pan ni zoom ; les noms des équipes se lisent', () => {
    const { container } = render(<GLGameBoard {...baseProps} presentation="projection" />);
    const racine = scene(container);
    expect(racine.dataset.presentation).toBe('projection');
    expect(racine.className).toBe('gl-board-scene gl-board-scene--projection');
    expect(nomsDesBoutons(container)).toEqual([]);
    expect(container.querySelector('.gl-board-zoom-controls')).toBeNull();
    expect(container.querySelector('.gl-map-roster')).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    // Gestes coupés : le moteur rend la page à son défilement naturel.
    expect(container.querySelector('.gl-board').style.touchAction).toBe('auto');
    // Les pions ne sont plus des boutons, mais leur nom reste à l'écran.
    const pions = [...container.querySelectorAll('.gl-board-team-pin')];
    expect(pions.map((p) => p.tagName)).toEqual(['SPAN', 'SPAN']);
    expect(pions.map((p) => p.textContent)).toEqual(['Les Racines', 'Les Crinières']);
    expect(container.querySelector('.gl-board-world .gl-board-fit-layer img')).not.toBeNull();
  });

  test('une présentation inconnue ne change rien au plateau', () => {
    const { container } = render(<GLGameBoard {...baseProps} presentation="mystere" />);
    expect(scene(container).dataset.presentation).toBe('standard');
    expect(screen.getByTestId('gl-map-fullscreen-open')).toBeTruthy();
    expect(container.querySelector('.gl-map-roster')).not.toBeNull();
  });
});

describe('GLMapView — transmet la présentation au plateau', () => {
  const gameState = {
    game: { id: 10, title: 'Plateau 1', map_image_url: '/maps/map-foret.svg' },
    markers: [],
    teams: TEAMS,
  };

  test('sans prop : plateau standard', () => {
    const { container } = render(<GLMapView gameState={gameState} roster={ROSTER} />);
    expect(scene(container).dataset.presentation).toBe('standard');
    expect(screen.getByTestId('gl-map-fullscreen-open')).toBeTruthy();
  });

  test('presentation="tenir" : la scène épurée de l’écran d’équipe', () => {
    const { container } = render(
      <GLMapView gameState={gameState} roster={ROSTER} playerTeamId={1} presentation="tenir" />,
    );
    expect(scene(container).dataset.presentation).toBe('tenir');
    expect(screen.queryByTestId('gl-map-fullscreen-open')).toBeNull();
    expect(nomsDesBoutons(container).filter((n) => /plateau/i.test(n))).toEqual([
      'Recentrer le plateau',
    ]);
  });
});
