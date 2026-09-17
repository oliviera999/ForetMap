import { describe, expect, test } from 'vitest';

import {
  GEO_FILTER_DEFAULTS,
  destinationLatLng,
  distanceMetersBetweenLatLng,
  nextFilteredGeoFix,
} from '../../src/shared/pct-map/geoPositionFilter.js';

/**
 * Le filtre est la première des raisons pour lesquelles le point de position ne tremble plus :
 * il vaut donc d'être tenu par des assertions, et pas seulement par l'impression qu'on en a en
 * marchant dans la cour.
 */
describe('distanceMetersBetweenLatLng', () => {
  test('un millième de degré de latitude vaut environ 111 m', () => {
    const d = distanceMetersBetweenLatLng({ lat: 48.85, lng: 2.3 }, { lat: 48.851, lng: 2.3 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  test('un point inexploitable ne donne pas une distance inventée', () => {
    expect(distanceMetersBetweenLatLng(null, { lat: 48.85, lng: 2.3 })).toBe(null);
    expect(distanceMetersBetweenLatLng({ lat: 'x', lng: 2.3 }, { lat: 48.85, lng: 2.3 })).toBe(
      null,
    );
  });
});

describe('nextFilteredGeoFix', () => {
  const first = { lat: 48.85, lng: 2.3, accuracy: 8, timestamp: 1000 };

  test('la première mesure passe telle quelle : rien à lisser encore', () => {
    const fix = nextFilteredGeoFix(null, first);
    expect(fix.lat).toBe(48.85);
    expect(fix.lng).toBe(2.3);
    expect(fix.rejected).toBe(false);
    expect(fix.variance).toBe(64);
  });

  test('à l’arrêt, le tremblement du capteur est très largement amorti', () => {
    let fix = nextFilteredGeoFix(null, first);
    // Dix mesures qui sautillent d'environ 5 m autour du même point, une par seconde.
    for (let i = 1; i <= 10; i += 1) {
      fix = nextFilteredGeoFix(fix, {
        lat: 48.85 + (i % 2 === 0 ? 0.00005 : -0.00005),
        lng: 2.3,
        accuracy: 8,
        timestamp: 1000 + i * 1000,
      });
    }
    const drift = distanceMetersBetweenLatLng({ lat: 48.85, lng: 2.3 }, fix);
    expect(drift).toBeLessThan(2);
  });

  test('un vrai déplacement est suivi de près : le repère ne traîne pas derrière', () => {
    let fix = nextFilteredGeoFix(null, first);
    // Vingt secondes de marche vers le nord, ~1,1 m/s, vitesse annoncée par le capteur.
    for (let i = 1; i <= 20; i += 1) {
      fix = nextFilteredGeoFix(fix, {
        lat: 48.85 + i * 0.00001,
        lng: 2.3,
        accuracy: 8,
        speed: 1.11,
        timestamp: 1000 + i * 1000,
      });
    }
    const lag = distanceMetersBetweenLatLng(fix, { lat: 48.85 + 0.0002, lng: 2.3 });
    expect(lag).toBeLessThan(2.5);
  });

  /**
   * La contrepartie du point précédent : c'est bien la vitesse annoncée qui ouvre le gain, et
   * le même trajet sans vitesse traîne davantage. Un capteur muet n'est pas un cas d'école —
   * autant que le comportement soit su et mesuré plutôt que découvert sur le terrain.
   */
  test('sans vitesse annoncée, le même trajet est suivi de plus loin', () => {
    const walk = (withSpeed) => {
      let fix = nextFilteredGeoFix(null, first);
      for (let i = 1; i <= 20; i += 1) {
        fix = nextFilteredGeoFix(fix, {
          lat: 48.85 + i * 0.00001,
          lng: 2.3,
          accuracy: 8,
          speed: withSpeed ? 1.11 : null,
          timestamp: 1000 + i * 1000,
        });
      }
      return distanceMetersBetweenLatLng(fix, { lat: 48.85 + 0.0002, lng: 2.3 });
    };
    expect(walk(false)).toBeGreaterThan(walk(true));
  });

  test('un saut invraisemblable est écarté — le point ne se téléporte pas', () => {
    const fix = nextFilteredGeoFix(null, first);
    const jumped = nextFilteredGeoFix(fix, {
      lat: 48.86,
      lng: 2.3,
      accuracy: 8,
      timestamp: 2000,
    });
    expect(jumped.rejected).toBe(true);
    expect(jumped.lat).toBe(fix.lat);
    expect(jumped.rejectedStreak).toBe(1);
  });

  test('mais pas indéfiniment : après quelques rejets, on se rend à l’évidence', () => {
    let fix = nextFilteredGeoFix(null, first);
    let accepted = null;
    for (let i = 1; i <= GEO_FILTER_DEFAULTS.maxRejectStreak + 1; i += 1) {
      fix = nextFilteredGeoFix(fix, {
        lat: 48.86,
        lng: 2.3,
        accuracy: 8,
        timestamp: 1000 + i * 1000,
      });
      if (!fix.rejected) accepted = fix;
    }
    expect(accepted).not.toBe(null);
    expect(accepted.rejectedStreak).toBe(0);
  });

  test('une mesure imprécise pèse moins qu’une mesure précise', () => {
    const base = nextFilteredGeoFix(null, first);
    const vague = nextFilteredGeoFix(base, {
      lat: 48.8501,
      lng: 2.3,
      accuracy: 60,
      timestamp: 2000,
    });
    const nette = nextFilteredGeoFix(base, {
      lat: 48.8501,
      lng: 2.3,
      accuracy: 4,
      timestamp: 2000,
    });
    expect(vague.lat - base.lat).toBeLessThan(nette.lat - base.lat);
  });

  test('la précision renvoyée reste celle du capteur : le halo ne doit pas mentir', () => {
    const base = nextFilteredGeoFix(null, first);
    const next = nextFilteredGeoFix(base, { ...first, accuracy: 42, timestamp: 2000 });
    expect(next.accuracy).toBe(42);
  });

  test('sans coordonnées exploitables, l’état précédent est conservé', () => {
    const base = nextFilteredGeoFix(null, first);
    expect(nextFilteredGeoFix(base, { lat: null, lng: null }).lat).toBe(base.lat);
    expect(nextFilteredGeoFix(null, { lat: null, lng: null })).toBe(null);
  });
});

/**
 * Sert à projeter une vitesse : le point atteint en une seconde, passé par le calage, donne le
 * déplacement par seconde sur le plan.
 */
describe('destinationLatLng', () => {
  const from = { lat: 48.85, lng: 2.3 };

  test('cap nord : la latitude monte, la longitude ne bouge pas', () => {
    const to = destinationLatLng(from, 0, 111);
    expect(to.lat).toBeGreaterThan(from.lat);
    expect(to.lng).toBeCloseTo(from.lng, 9);
    expect(distanceMetersBetweenLatLng(from, to)).toBeCloseTo(111, 1);
  });

  test('cap est : la longitude monte, la latitude ne bouge pas', () => {
    const to = destinationLatLng(from, 90, 50);
    expect(to.lng).toBeGreaterThan(from.lng);
    expect(to.lat).toBeCloseTo(from.lat, 9);
    expect(distanceMetersBetweenLatLng(from, to)).toBeCloseTo(50, 1);
  });

  test('cap sud-ouest : la distance parcourue est bien celle demandée', () => {
    const to = destinationLatLng(from, 225, 80);
    expect(to.lat).toBeLessThan(from.lat);
    expect(to.lng).toBeLessThan(from.lng);
    expect(distanceMetersBetweenLatLng(from, to)).toBeCloseTo(80, 1);
  });

  test('une entrée inexploitable ne produit pas de point inventé', () => {
    expect(destinationLatLng(null, 0, 10)).toBe(null);
    expect(destinationLatLng(from, null, 10)).toBe(null);
    expect(destinationLatLng(from, 0, null)).toBe(null);
  });
});
