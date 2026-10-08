const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

/** Garde-fous CSS des animations de carte (audit `docs/AUDIT_ANIMATIONS_CARTE_2026-10.md`). */

const read = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

function keyframesBody(css, name) {
  const start = css.indexOf(`@keyframes ${name}`);
  assert.notEqual(start, -1, `@keyframes ${name} introuvable`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return css.slice(start);
}

test('bulle de la mascotte : son apparition garde le redressement horizontal', () => {
  const body = keyframesBody(
    read('src/shared/styles/visit-map-mascot.css'),
    'visitMascotDialogPop',
  );
  const transforms = body.match(/transform:[^;]+;/g) || [];
  assert.ok(transforms.length >= 2);
  for (const t of transforms) assert.match(t, /scaleX\(var\(--visit-mascot-dialog-x/);
});

test('point de position : défini une seule fois, contre-échelonné', () => {
  assert.doesNotMatch(read('src/index.css'), /\.fm-pct-position/);
  assert.match(
    read('src/shared/styles/pct-map-layers.css'),
    /\.fm-pct-position__dot\s*\{[^}]*scale\(var\(--pct-inv, 1\)\)/,
  );
});

/** Valeur en millisecondes d'une variable CSS de `motion.css` (`150ms` ou `0.15s`). */
function motionTokenMs(name) {
  const m = new RegExp(`${name}:\\s*([\\d.]+)(ms|s);`).exec(read('src/shared/styles/motion.css'));
  assert.ok(m, `${name} introuvable dans motion.css`);
  return m[2] === 's' ? Math.round(Number(m[1]) * 1000) : Number(m[1]);
}

function ruleBody(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} introuvable`);
  return css.slice(start, css.indexOf('}', start) + 1);
}

test('ANIM-19/20/23 : durées de carte centralisées, JS et CSS d’accord', async () => {
  const motion = await import(
    pathToFileURL(join(__dirname, '../src/utils/mapViewMascotMotion.js')).href
  );
  const halo = await import(
    pathToFileURL(join(__dirname, '../src/utils/visitDiscoverHalo.js')).href
  );
  assert.equal(motionTokenMs('--motion-map-mascot-move'), motion.MAP_VIEW_MASCOT_MOVE_MS);
  assert.equal(motionTokenMs('--motion-map-discover-halo'), halo.DISCOVER_HALO_MS);
  const exitMs = /export const EXIT_ANIMATION_MS = (\d+);/.exec(
    read('src/shared/hooks/useExitAnimation.js'),
  );
  assert.equal(motionTokenMs('--motion-exit'), Number(exitMs[1]));

  // Joie : la classe `--happy` dure exactement les trois rebonds CSS.
  const bounce = /visitMascotHappyBounce ([\d.]+)s ease-in-out (\d+);/.exec(
    read('src/shared/styles/visit-map-mascot.css'),
  );
  assert.equal(
    Math.round(Number(bounce[1]) * 1000) * Number(bounce[2]),
    motion.MAP_VIEW_MASCOT_HAPPY_MS,
  );

  // Plus de durée recopiée dans le contrôleur de la Visite ni dans les scénarios e2e.
  assert.doesNotMatch(
    read('src/hooks/useVisitMapMascotController.js'),
    /export const VISIT_MAP_MASCOT_\w+ = \d+/,
  );
  assert.doesNotMatch(read('e2e/visit-mascot.spec.js'), /MOVE_MS = \d+/);
  assert.doesNotMatch(read('e2e/visit-mode.spec.js'), /MOVE_MS = \d+/);
  // Les animations de carte lisent les variables partagées.
  const pct = read('src/shared/styles/pct-map-layers.css');
  assert.match(pct, /fmPctDiscoverHalo var\(--motion-map-discover-halo/);
  assert.match(pct, /fmPctDiscoverMarkerHalo var\(--motion-map-discover-halo/);
});

test('ANIM-10 : onde de l’étape courante en transform / opacity, sans box-shadow animé', () => {
  const css = read('src/shared/styles/pct-map-layers.css');
  const body = keyframesBody(css, 'fm-route-badge-pulse');
  assert.doesNotMatch(body, /box-shadow/);
  assert.match(body, /transform:\s*scale/);
  assert.match(body, /opacity/);
  assert.match(css, /\.fm-pct-route-badge\.is-current \.fm-pct-route-badge__number::after\s*\{/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.fm-pct-route-badge\.is-current \.fm-pct-route-badge__number::after\s*\{\s*animation:\s*none/,
  );
});

test('ANIM-11 : point de position et mascotte déplacés par transform', () => {
  const position = ruleBody(read('src/shared/styles/pct-map-layers.css'), '.fm-pct-position');
  assert.match(position, /transition:\s*transform var\(--motion-map-position/);
  assert.doesNotMatch(position, /left \d|top \d/);
  assert.doesNotMatch(position, /compositeur, sans rendu supplémentaire/);

  const mascot = ruleBody(read('src/shared/styles/visit-map-mascot.css'), '.visit-map-mascot');
  assert.match(mascot, /transition:\s*transform var\(--motion-map-mascot-move/);
  assert.doesNotMatch(mascot, /\bleft \d|\btop \d/);
  assert.match(
    read('src/shared/styles/visit-map-mascot.css'),
    /\.visit-map-mascot--reduced-motion,\s*\.visit-map-mascot--settling\s*\{\s*transition:\s*none/,
  );
});

test('ANIM-13 : fermeture animée des fiches et popovers', () => {
  const motion = read('src/shared/styles/motion.css');
  const exit = keyframesBody(motion, 'fmExitFadeShrink');
  assert.match(exit, /opacity:\s*0/);
  assert.match(exit, /scale\(0\.96\)/);
  for (const selector of [
    '.log-modal.fm-is-exiting',
    '.gl-qcm-popover.fm-is-exiting',
    '.gl-zone-content-popover.fm-is-exiting',
    '.gl-dice-popover.fm-is-exiting',
    '.modal-overlay.fm-is-exiting',
  ]) {
    assert.ok(motion.includes(selector), `${selector} absent de motion.css`);
  }
  assert.match(
    motion,
    /animation: fmExitFadeShrink var\(--motion-exit\) var\(--ease-in\) forwards/,
  );
  const index = read('src/index.css');
  assert.match(index, /\.visit-detail-panel\.fm-is-exiting\s*\{\s*animation:visitDetailPanelOut/);
  // La fermeture garde le décalage de centrage du panneau sur grand écran.
  for (const t of keyframesBody(index, 'visitDetailPanelOut').match(/transform:[^;]+;/g)) {
    assert.match(t, /--visit-detail-panel-x/);
  }
});

test('repère ouvert : pastille en transform, voisins estompés, coupé en mouvement réduit', () => {
  const css = read('src/shared/styles/pct-map-layers.css');
  assert.match(css, /\.fm-pct-marker\.is-active::after\s*\{/);
  const pop = keyframesBody(css, 'fmPctMarkerActiveIn');
  assert.match(pop, /transform:\s*scale/);
  assert.match(css, /:has\(> \.fm-pct-marker\.is-active\) > \.fm-pct-marker:not\(\.is-active\)/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.fm-pct-marker\s*\{[^}]*\}\s*\.fm-pct-marker\.is-active::after\s*\{\s*animation:\s*none/,
  );
});

test('mouvement réduit : spritesheet de mascotte et popovers GL figés', () => {
  assert.match(
    read('src/shared/styles/visit-map-mascot.css'),
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.visit-map-mascot-spritesheet\s*\{\s*animation:\s*none/,
  );
  assert.match(
    read('src/gl/styles/gl-theme.css'),
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.gl-qcm-popover,\s*\.gl-zone-content-popover,\s*\.gl-dice-popover\s*\{\s*animation:\s*none/,
  );
});
