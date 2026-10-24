'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let geo;
let transform;
let settings;
let steps;

function importSrc(rel) {
  return import(pathToFileURL(join(__dirname, '../src', rel)).href);
}

function marker(id, xp, yp) {
  return { kind: 'marker', id, name: `Repère ${id}`, x_pct: xp, y_pct: yp };
}

function entries(...places) {
  return places.map((place, index) => ({ index, number: index + 1, place }));
}

describe('route geometry (mode parcours)', () => {
  before(async () => {
    geo = await importSrc('shared/map-routes/routeGeometry.js');
    transform = await importSrc('shared/pct-map/pctMapTransform.js');
    settings = await importSrc('shared/map-routes/routeSettings.js');
    steps = await importSrc('shared/map-routes/mapRouteSteps.js');
  });

  it('routeStepPoints garde les numéros et saute une étape sans coordonnées', () => {
    const points = geo.routeStepPoints(
      entries(marker(1, 10, 20), { kind: 'zone', id: 'z', points: '[]' }, marker(3, 50, 60)),
    );
    assert.deepEqual(
      points.map((p) => [p.xp, p.yp, p.number]),
      [
        [10, 20, 1],
        [50, 60, 3],
      ],
    );
  });

  it('routeStepState et routeSegments distinguent passé, courant, à venir et vue d’ensemble', () => {
    assert.equal(geo.routeStepState(0, { phase: 'overview', currentIndex: 2 }), 'overview');
    assert.equal(geo.routeStepState(0, { phase: 'steps', currentIndex: 1 }), 'done');
    assert.equal(geo.routeStepState(1, { phase: 'steps', currentIndex: 1 }), 'current');
    assert.equal(geo.routeStepState(2, { phase: 'steps', currentIndex: 1 }), 'upcoming');

    const points = geo.routeStepPoints(
      entries(marker(1, 0, 0), marker(2, 10, 0), marker(3, 20, 0), marker(4, 30, 0)),
    );
    const segs = geo.routeSegments(points, { phase: 'steps', currentIndex: 2 });
    assert.deepEqual(
      segs.map((s) => s.state),
      ['done', 'current', 'upcoming'],
    );
  });

  it('segmentChevrons répartit les flèches dans le sens du trajet', () => {
    const chevrons = geo.segmentChevrons({ x: 0, y: 0 }, { x: 100, y: 0 }, { spacingPx: 40 });
    assert.equal(chevrons.length, 2);
    assert.deepEqual(
      chevrons.map((c) => c.x),
      [25, 75],
    );
    assert.equal(chevrons[0].angleDeg, 0);

    const up = geo.segmentChevrons({ x: 0, y: 100 }, { x: 0, y: 0 }, { spacingPx: 500 });
    assert.equal(up.length, 1, 'un segment court porte quand même une flèche');
    assert.equal(up[0].angleDeg, -90);

    assert.deepEqual(
      geo.segmentChevrons({ x: 0, y: 0 }, { x: 10, y: 0 }, { spacingPx: 40, minLengthPx: 20 }),
      [],
    );
    assert.deepEqual(geo.segmentChevrons({ x: 1, y: 1 }, { x: 1, y: 1 }, { spacingPx: 40 }), []);
  });

  it('hasWalkedFrom mesure en mètres si le plan est calé, en % sinon', () => {
    const planSize = { widthM: 100, heightM: 100 };
    assert.equal(geo.hasWalkedFrom({ xp: 0, yp: 0 }, { xp: 5, yp: 0 }, planSize, 8), false);
    assert.equal(geo.hasWalkedFrom({ xp: 0, yp: 0 }, { xp: 9, yp: 0 }, planSize, 8), true);
    assert.equal(geo.hasWalkedFrom({ xp: 0, yp: 0 }, { xp: 1, yp: 0 }, null, 8), false);
    assert.equal(geo.hasWalkedFrom({ xp: 0, yp: 0 }, { xp: 2, yp: 0 }, null, 8), true);
    assert.equal(geo.hasWalkedFrom(null, { xp: 2, yp: 0 }, null, 8), false);
  });

  it('routeCameraPlan : vue d’ensemble, position + étape, puis marche', () => {
    const stepPoints = [
      { xp: 10, yp: 10, index: 0, number: 1 },
      { xp: 50, yp: 50, index: 1, number: 2 },
    ];
    const overview = geo.routeCameraPlan({ phase: 'overview', stepPoints });
    assert.equal(overview.mode, 'bounds');
    assert.equal(overview.points.length, 2);

    const pos = { xp: 30, yp: 30 };
    const target = { xp: 50, yp: 50 };
    const before = geo.routeCameraPlan({
      phase: 'steps',
      stepPoints,
      currentIndex: 1,
      positionPct: pos,
      targetPct: target,
    });
    assert.deepEqual(before, { mode: 'bounds', points: [pos, target] });

    const walking = geo.routeCameraPlan({
      phase: 'steps',
      stepPoints,
      currentIndex: 1,
      positionPct: pos,
      targetPct: target,
      walking: true,
    });
    assert.equal(walking.mode, 'walk');

    const noPos = geo.routeCameraPlan({
      phase: 'steps',
      stepPoints,
      currentIndex: 1,
      targetPct: target,
    });
    assert.deepEqual(
      noPos.points.map((p) => [p.xp, p.yp]),
      [
        [10, 10],
        [50, 50],
      ],
      'sans position, le cadrage montre l’étape précédente et la courante (le sens)',
    );
    assert.equal(geo.routeCameraPlan({ phase: 'steps', stepPoints: [] }), null);
  });

  it('walkingCenterPct ouvre la vue vers l’étape sans éloigner la personne du champ', () => {
    const near = geo.walkingCenterPct({
      positionPct: { xp: 50, yp: 50 },
      targetPct: { xp: 54, yp: 50 },
      spanPct: { w: 20, h: 20 },
      lookahead: 0.6,
    });
    assert.deepEqual(near, { xp: 52, yp: 50 }, 'étape proche : mi-chemin');

    const far = geo.walkingCenterPct({
      positionPct: { xp: 50, yp: 50 },
      targetPct: { xp: 90, yp: 10 },
      spanPct: { w: 20, h: 20 },
      lookahead: 0.6,
    });
    assert.equal(far.xp, 56, 'décalage borné à 60 % de la demi-vue');
    assert.equal(far.yp, 44);

    assert.deepEqual(
      geo.walkingCenterPct({ positionPct: { xp: 5, yp: 6 }, targetPct: null, spanPct: {} }),
      { xp: 5, yp: 6 },
    );
  });

  it('routeCameraView : zoom de marche et cadrage borné entre carte entière et zoom de marche', () => {
    const view = {
      stage: { w: 400, h: 800 },
      fitRect: { width: 400, height: 400 },
      fitScale: 1,
      walkingZoom: 3,
      lookahead: 0.6,
    };
    const walk = geo.routeCameraView(
      { mode: 'walk', positionPct: { xp: 50, yp: 50 }, targetPct: null },
      view,
    );
    assert.equal(walk.scale, 3);
    assert.deepEqual(walk.centerPct, { xp: 50, yp: 50 });

    const wide = geo.routeCameraView(
      {
        mode: 'bounds',
        points: [
          { xp: 0, yp: 0 },
          { xp: 100, yp: 100 },
        ],
      },
      view,
    );
    assert.equal(wide.scale, 1, 'jamais moins que la carte entière');

    const single = geo.routeCameraView({ mode: 'bounds', points: [{ xp: 20, yp: 30 }] }, view);
    assert.equal(single.scale, 3, 'un point seul : zoom de marche');
    assert.deepEqual(single.centerPct, { xp: 20, yp: 30 });

    assert.equal(geo.routeCameraView(null, view), null);
    assert.equal(geo.routeCameraView({ mode: 'walk' }, { ...view, stage: { w: 0, h: 0 } }), null);
  });

  it('fitPctBoundsView centre la boîte englobante et respecte les bornes d’échelle', () => {
    const out = transform.fitPctBoundsView(
      [
        { xp: 40, yp: 40 },
        { xp: 60, yp: 50 },
      ],
      { visibleW: 300, visibleH: 300, fitRect: { width: 1000, height: 1000 }, paddingPx: 50 },
    );
    assert.deepEqual(out.centerPct, { xp: 50, yp: 45 });
    // 200 px disponibles pour 200 px de boîte (20 % de 1000) → échelle 1.
    assert.equal(out.scale, 1);
    assert.equal(transform.fitPctBoundsView([], { visibleW: 1, visibleH: 1, fitRect: {} }), null);
    const capped = transform.fitPctBoundsView([{ xp: 1, yp: 1 }], {
      visibleW: 300,
      visibleH: 300,
      fitRect: { width: 100, height: 100 },
      maxScale: 4,
    });
    assert.equal(capped.scale, 4);
  });

  it('resolveRouteSettings borne les réglages et retombe sur les défauts', () => {
    const d = settings.resolveRouteSettings(null);
    assert.deepEqual(d, { ...settings.ROUTE_SETTINGS_DEFAULTS });
    const custom = settings.resolveRouteSettings({
      overview_enabled: false,
      auto_locate: '0',
      camera_enabled: 'true',
      walking_zoom_percent: 9999,
      walking_trigger_m: 1,
      lookahead_percent: 45,
      line_animated: 'n’importe quoi',
    });
    assert.equal(custom.overviewEnabled, false);
    assert.equal(custom.autoLocate, false);
    assert.equal(custom.cameraEnabled, true);
    assert.equal(custom.walkingZoom, 8);
    assert.equal(custom.walkingTriggerM, 2);
    assert.equal(custom.lookahead, 0.45);
    assert.equal(custom.lineAnimated, true);
  });

  it('buildStageRoute décrit le parcours pour la scène, null hors parcours', () => {
    assert.equal(steps.buildStageRoute({ route: null }), null);
    const list = entries(marker(7, 10, 10));
    const out = steps.buildStageRoute({
      route: { slug: 'tour' },
      phase: 'overview',
      steps: list,
      index: 0,
      entry: null,
      settings: settings.ROUTE_SETTINGS_DEFAULTS,
    });
    assert.equal(out.phase, 'overview');
    assert.equal(out.currentPlaceKey, '');
    const inStep = steps.buildStageRoute({
      route: { slug: 'tour' },
      phase: 'steps',
      steps: list,
      index: 0,
      entry: list[0],
    });
    assert.equal(inStep.currentPlaceKey, 'marker:7');
  });
});
