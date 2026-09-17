// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMapPosition } from '../../src/shared/pct-map/useMapPosition.js';

/** Calage cohérent, nord en haut : le plan couvre ~[48,85 ; 48,86] × [2,30 ; 2,31]. */
const GEO_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.86, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.86, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.85, lng: 2.3 },
];

/** Centre du plan. */
const CENTER = { lat: 48.855, lng: 2.305 };

function compass(headingDeg) {
  const event = new Event('deviceorientation');
  // `alpha` est un angle anti-horaire depuis le nord sur un événement absolu.
  Object.defineProperty(event, 'alpha', { value: (360 - headingDeg) % 360 });
  Object.defineProperty(event, 'absolute', { value: true });
  window.dispatchEvent(event);
}

describe('useMapPosition', () => {
  let emit;

  beforeEach(() => {
    vi.useFakeTimers();
    emit = null;
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (onSuccess) => {
          emit = (coords, timestamp) =>
            act(() => {
              onSuccess({ coords, timestamp: timestamp ?? Date.now() });
            });
          return 1;
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const start = () => {
    const hook = renderHook(() => useMapPosition({ georef: GEO_ANCHORS, gpsEnabled: true }));
    act(() => hook.result.current.toggle());
    return hook;
  };

  /**
   * Le cap converge vers sa cible sans jamais la coller exactement : la publication s'arrête
   * sous le degré (bande morte), et c'est voulu — republier pour un dixième de degré ferait
   * re-rendre la carte pour rien.
   */
  const expectHeadingNear = (actual, expected) =>
    expect(Math.abs(Number(actual) - expected)).toBeLessThan(1.5);

  const settleHeading = (ms = 3000) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it('place la première mesure au centre du plan', () => {
    const { result } = start();
    expect(result.current.mode).toBe('acquiring');
    emit({ latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 8 });
    expect(result.current.mode).toBe('on');
    expect(result.current.displayPct.xp).toBeCloseTo(50, 1);
    expect(result.current.displayPct.yp).toBeCloseTo(50, 1);
    expect(result.current.feedback).toBe('ok');
  });

  /**
   * Le « téléport » du capteur (réflexion de signal) est ce qui, en mode suivi, emportait la
   * carte à l'autre bout du plan avant de revenir : il ne doit jamais atteindre l'affichage.
   */
  it('écarte un saut invraisemblable au lieu de déplacer le repère', () => {
    const { result } = start();
    emit({ latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 8 }, 1000);
    const placed = result.current.displayPct;
    emit({ latitude: 48.9, longitude: 2.305, accuracy: 8 }, 2000);
    expect(result.current.displayPct.xp).toBeCloseTo(placed.xp, 3);
    expect(result.current.displayPct.yp).toBeCloseTo(placed.yp, 3);
  });

  it('à l’arrêt, le cap vient de la boussole', () => {
    const { result } = start();
    emit({ latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 8, speed: 0 });
    act(() => compass(90));
    settleHeading();
    expect(result.current.headingSource).toBe('compass');
    expectHeadingNear(result.current.screenHeadingDeg, 90);
    expect(result.current.headingAvailable).toBe(true);
  });

  it('en marche, le cap vient du GPS : c’est la direction suivie, pas l’orientation du téléphone', () => {
    const { result } = start();
    act(() => compass(90));
    emit({ latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 8, speed: 1.6, heading: 200 });
    settleHeading();
    expect(result.current.headingSource).toBe('gps');
    expectHeadingNear(result.current.screenHeadingDeg, 200);
  });

  /**
   * La rotation de la carte et la flèche du repère sont animées en CSS : l'angle publié doit
   * être continu, sinon le passage du nord leur ferait faire un tour complet à l'envers.
   */
  it('publie un angle continu, jamais replié sur [0, 360[', () => {
    const { result } = start();
    emit({ latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 8, speed: 0 });
    act(() => compass(350));
    settleHeading();
    act(() => compass(10));
    settleHeading();
    expectHeadingNear(result.current.screenHeadingDeg, 10);
    expect(result.current.screenHeadingUnwrappedDeg).toBeGreaterThan(355);
  });

  /**
   * Entre deux mesures, le repère ne reste pas figé : il prolonge le déplacement annoncé par le
   * capteur. C'est ce qui sépare un point qui avance à la vitesse de la marche d'un point qui
   * saute une fois par seconde — et, en mode suivi, une carte qui glisse d'une carte qui tressaute.
   */
  it('prolonge le déplacement entre deux mesures, le long de la route suivie', () => {
    const { result } = start();
    emit({
      latitude: CENTER.lat,
      longitude: CENTER.lng,
      accuracy: 8,
      speed: 2,
      heading: 90, // plein est : le plan étant calé nord en haut, xp doit croître
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const posé = result.current.displayPct.xp;

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayPct.xp).toBeGreaterThan(posé);
    expect(result.current.displayPct.yp).toBeCloseTo(50, 1);
  });

  it('cesse de prolonger quand le capteur se tait : on n’invente pas un trajet', () => {
    const { result } = start();
    emit({ latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 8, speed: 2, heading: 90 });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    const arrêté = result.current.displayPct.xp;
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.displayPct.xp).toBeCloseTo(arrêté, 3);
  });

  /**
   * L'arrivée d'une mesure déplace une **cible**, elle ne téléporte pas le repère : sans cela,
   * chaque mesure produirait un saut d'un mètre, une fois par seconde, sous les yeux de la
   * personne qui marche.
   */
  it('rejoint une nouvelle mesure en glissant, sans saut', () => {
    const { result } = start();
    emit({ latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 8, speed: 0 }, 1000);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const départ = result.current.displayPct.xp;

    // ~40 m à l'est : plausible pour le filtre (dix secondes plus tard), franc à l'écran.
    emit({ latitude: CENTER.lat, longitude: CENTER.lng + 0.0005, accuracy: 8, speed: 0 }, 11_000);
    act(() => {
      vi.advanceTimersByTime(80);
    });
    const juste = result.current.displayPct.xp;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const arrivé = result.current.displayPct.xp;

    expect(arrivé).toBeGreaterThan(départ);
    // Un pas après la mesure, le repère est en route mais pas encore arrivé.
    expect(juste).toBeGreaterThan(départ);
    expect(juste).toBeLessThan(arrivé - (arrivé - départ) * 0.5);
  });

  it('couper la position remet tout à zéro : rien ne survit d’une session à l’autre', () => {
    const { result } = start();
    emit({ latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 8 });
    act(() => compass(90));
    settleHeading();
    act(() => result.current.stop());
    expect(result.current.mode).toBe('off');
    expect(result.current.displayPct).toBe(null);
    expect(result.current.screenHeadingDeg).toBe(null);
    expect(result.current.headingSource).toBe(null);
  });
});
