const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/**
 * Durée du déplacement de la mascotte, lue dans sa source unique
 * (`src/utils/mapViewMascotMotion.js`) plutôt que recopiée dans chaque scénario.
 */
function readMascotMoveMs() {
  const src = readFileSync(join(__dirname, '../../src/utils/mapViewMascotMotion.js'), 'utf8');
  const m = /export const MAP_VIEW_MASCOT_MOVE_MS = (\d+);/.exec(src);
  if (!m) throw new Error('MAP_VIEW_MASCOT_MOVE_MS introuvable dans mapViewMascotMotion.js');
  return Number(m[1]);
}

const MAP_VIEW_MASCOT_MOVE_MS = readMascotMoveMs();

/**
 * Position en % d'une mascotte de carte. Elle se déplace par `transform` (pixels) : la
 * position en % est exposée par `data-pct-x` / `data-pct-y`.
 * @param {import('@playwright/test').Locator} mascot élément `.visit-map-mascot`
 * @returns {Promise<{ xp: number, yp: number }>}
 */
async function readMascotPct(mascot) {
  return mascot.evaluate((el) => ({
    xp: Number.parseFloat(el.getAttribute('data-pct-x') ?? 'NaN'),
    yp: Number.parseFloat(el.getAttribute('data-pct-y') ?? 'NaN'),
  }));
}

module.exports = { MAP_VIEW_MASCOT_MOVE_MS, readMascotPct };
