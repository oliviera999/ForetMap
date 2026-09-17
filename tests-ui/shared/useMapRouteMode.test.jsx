import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { mapRouteResumeStorageKey } from '../../src/shared/map-routes/mapRouteSteps.js';
import { useMapRouteMode } from '../../src/shared/map-routes/useMapRouteMode.js';

/**
 * Noyau du mode parcours, partagé depuis l'unification par les trois surfaces (Visite, carte
 * de travail, les deux plans). Il n'avait aucun test direct alors qu'il portait déjà deux
 * d'entre elles (`docs/AUDIT_PARCOURS_2026-09-17.md` §3).
 *
 * Le point vérifié ici est celui qui était faux partout : **« Reprendre » reprend**. Quitter
 * à l'étape 3 puis reprendre rendait la main à l'étape 1 (§2.2).
 */

const ROUTES = [
  {
    id: 'r1',
    slug: 'portes-ouvertes',
    title: 'Portes ouvertes',
    steps: [
      { target_type: 'zone', target_id: 'z1', step_title: 'Accueil' },
      { target_type: 'zone', target_id: 'z2', step_title: 'Serre' },
      { target_type: 'marker', target_id: 'm1', step_title: 'Infirmerie' },
    ],
  },
];

const PLACES = [
  { kind: 'zone', id: 'z1', name: 'Accueil' },
  { kind: 'zone', id: 'z2', name: 'Serre' },
  { kind: 'marker', id: 'm1', name: 'Infirmerie' },
];

function Harness({ storageKey = '', routes = ROUTES, places = PLACES }) {
  const mode = useMapRouteMode({ routes, places, storageKey });
  return (
    <div>
      <button type="button" onClick={() => mode.startRoute(routes[0])}>
        démarrer
      </button>
      <button type="button" onClick={() => mode.goToRouteIndex(mode.routeIndex + 1)}>
        suivant
      </button>
      <button type="button" onClick={mode.exitRoute}>
        quitter
      </button>
      <button type="button" onClick={mode.resumeRoute}>
        reprendre
      </button>
      <span data-testid="active">{mode.activeRoute ? mode.activeRoute.slug : 'aucun'}</span>
      <span data-testid="index">{mode.routeIndex}</span>
      <span data-testid="total">{mode.routeSteps.length}</span>
      <span data-testid="resumable">{mode.resumableRouteSlug || 'rien'}</span>
    </div>
  );
}

const click = (name) =>
  act(() => {
    screen.getByRole('button', { name }).click();
  });

const at = (id) => screen.getByTestId(id).textContent;

describe('useMapRouteMode — reprise d’un parcours quitté', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('« Reprendre » rend la main à l’étape quittée, pas à la première', () => {
    render(<Harness />);
    click('démarrer');
    click('suivant');
    click('suivant');
    expect(at('index')).toBe('2');

    click('quitter');
    expect(at('active')).toBe('aucun');
    expect(at('resumable')).toBe('portes-ouvertes');

    click('reprendre');
    expect(at('active')).toBe('portes-ouvertes');
    expect(at('index')).toBe('2');
  });

  test('démarrer depuis la puce repart de l’étape 1 et oublie la reprise', () => {
    render(<Harness />);
    click('démarrer');
    click('suivant');
    click('quitter');
    click('démarrer');
    expect(at('index')).toBe('0');
    expect(at('resumable')).toBe('rien');
  });

  test('la reprise survit à un rechargement quand une clé de stockage est fournie', () => {
    const storageKey = mapRouteResumeStorageKey('visit', 'carte-1');
    const first = render(<Harness storageKey={storageKey} />);
    click('démarrer');
    click('suivant');
    click('quitter');
    first.unmount();

    render(<Harness storageKey={storageKey} />);
    expect(at('resumable')).toBe('portes-ouvertes');
    click('reprendre');
    expect(at('index')).toBe('1');
  });

  test('sans clé de stockage, la reprise ne vit qu’en mémoire', () => {
    const first = render(<Harness />);
    click('démarrer');
    click('suivant');
    click('quitter');
    first.unmount();

    render(<Harness />);
    expect(at('resumable')).toBe('rien');
  });

  test('une reprise qui ne désigne plus aucun parcours s’efface', () => {
    const storageKey = mapRouteResumeStorageKey('visit', 'carte-1');
    const first = render(<Harness storageKey={storageKey} />);
    click('démarrer');
    click('quitter');
    first.unmount();

    // Le parcours a été dépublié entre-temps : le bouton ne doit pas rester à ne rien faire.
    render(<Harness storageKey={storageKey} routes={[{ ...ROUTES[0], slug: 'autre-chose' }]} />);
    expect(at('resumable')).toBe('rien');
    expect(localStorage.getItem(storageKey)).toBe(null);
  });

  test('l’étape courante reste bornée quand le parcours raccourcit', () => {
    const { rerender } = render(<Harness />);
    click('démarrer');
    click('suivant');
    click('suivant');
    expect(at('index')).toBe('2');

    // Deux lieux retirés du contenu : les étapes qui les visaient disparaissent.
    rerender(<Harness places={[PLACES[0]]} />);
    expect(at('total')).toBe('1');
    expect(at('index')).toBe('0');
  });

  test('la clé de reprise est propre à une surface et à une carte', () => {
    expect(mapRouteResumeStorageKey('visit', 'c1')).toBe('foretmap:visit:route-resume:c1');
    expect(mapRouteResumeStorageKey('map', 'c1')).not.toBe(mapRouteResumeStorageKey('visit', 'c1'));
    // Pas de carte : pas de reprise mémorisée (une clé partagée mélangerait deux cartes).
    expect(mapRouteResumeStorageKey('visit', '')).toBe('');
  });
});
