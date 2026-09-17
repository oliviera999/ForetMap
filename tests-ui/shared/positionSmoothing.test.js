import { describe, expect, test } from 'vitest';

import {
  POSITION_EXTRAPOLATION_MAX_MS,
  easePctToward,
  extrapolatedPct,
  pctDistance,
} from '../../src/shared/pct-map/positionSmoothing.js';

/**
 * Prolonger un déplacement est une affirmation sur le présent à partir du passé : elle n'est
 * vraie qu'un court instant. Ces cas tiennent surtout les **bornes** — c'est là que la
 * différence se joue entre « fluide » et « inventé ».
 */
describe('extrapolatedPct', () => {
  const anchor = {
    pct: { xp: 50, yp: 50 },
    velocityPct: { xp: 2, yp: 0 }, // 2 % de plan par seconde, vers la droite
    at: 1000,
  };

  test('prolonge le long de la route suivie, proportionnellement au temps écoulé', () => {
    expect(extrapolatedPct(anchor, 1500)).toEqual({ xp: 51, yp: 50 });
    expect(extrapolatedPct(anchor, 2000)).toEqual({ xp: 52, yp: 50 });
  });

  test('sans vitesse connue, il n’y a rien à prolonger', () => {
    const still = { ...anchor, velocityPct: null };
    expect(extrapolatedPct(still, 5000)).toEqual({ xp: 50, yp: 50 });
  });

  test('cesse de prolonger au-delà de la durée admise : un capteur muet ne dit rien', () => {
    const late = extrapolatedPct(anchor, 1000 + POSITION_EXTRAPOLATION_MAX_MS + 10_000);
    const atLimit = extrapolatedPct(anchor, 1000 + POSITION_EXTRAPOLATION_MAX_MS);
    expect(late).toEqual(atLimit);
  });

  test('ne dépasse jamais la distance admise, quelle que soit la vitesse annoncée', () => {
    const fast = { ...anchor, velocityPct: { xp: 40, yp: 0 } };
    const far = extrapolatedPct(fast, 3000, { maxPct: 3 });
    expect(far.xp).toBeCloseTo(53, 6);
  });

  test('une mesure inexploitable ne produit pas de position', () => {
    expect(extrapolatedPct(null, 1000)).toBe(null);
    expect(extrapolatedPct({ pct: { xp: 'x', yp: 1 }, at: 0 }, 1000)).toBe(null);
  });

  test('un temps antérieur à la mesure ne fait pas reculer le repère', () => {
    expect(extrapolatedPct(anchor, 500)).toEqual({ xp: 50, yp: 50 });
  });
});

describe('easePctToward', () => {
  test('rejoint la cible sans jamais la dépasser', () => {
    let p = { xp: 0, yp: 0 };
    for (let i = 0; i < 40; i += 1) p = easePctToward(p, { xp: 10, yp: 0 }, 50);
    expect(p.xp).toBeGreaterThan(9.9);
    expect(p.xp).toBeLessThanOrEqual(10);
  });

  test('le même réglage donne le même mouvement quelle que soit la cadence', () => {
    const unPas = easePctToward({ xp: 0, yp: 0 }, { xp: 10, yp: 0 }, 300, 300);
    let dixPas = { xp: 0, yp: 0 };
    for (let i = 0; i < 10; i += 1) dixPas = easePctToward(dixPas, { xp: 10, yp: 0 }, 30, 300);
    expect(Math.abs(dixPas.xp - unPas.xp)).toBeLessThan(0.2);
  });

  test('la première position est adoptée telle quelle', () => {
    expect(easePctToward(null, { xp: 4, yp: 5 }, 100)).toEqual({ xp: 4, yp: 5 });
  });

  test('sans cible, la position courante est conservée', () => {
    expect(easePctToward({ xp: 4, yp: 5 }, null, 100)).toEqual({ xp: 4, yp: 5 });
    expect(easePctToward(null, null, 100)).toBe(null);
  });
});

describe('pctDistance', () => {
  test('mesure l’écart entre deux points', () => {
    expect(pctDistance({ xp: 0, yp: 0 }, { xp: 3, yp: 4 })).toBe(5);
  });

  test('un point manquant vaut « à publier »', () => {
    expect(pctDistance(null, { xp: 3, yp: 4 })).toBe(Number.POSITIVE_INFINITY);
  });
});
