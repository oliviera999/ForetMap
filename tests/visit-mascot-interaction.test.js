const test = require('node:test');
const assert = require('node:assert/strict');

test('resolveVisitMascotInteraction utilise les défauts hors pack', async () => {
  const { resolveVisitMascotInteraction, VISIT_MASCOT_INTERACTION_EVENT } = await import('../src/utils/visitMascotInteractionApply.js');
  const { VISIT_MASCOT_STATE } = await import('../src/utils/visitMascotState.js');
  const r = resolveVisitMascotInteraction(VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_VERY_LARGE, {
    mascotId: 'sprout-rive',
    extraCatalogEntries: [],
  });
  assert.equal(r.kind, 'transient');
  assert.equal(r.state, VISIT_MASCOT_STATE.RUNNING);
});

test('resolveVisitMascotInteraction applique le profil pack v2', async () => {
  const { resolveVisitMascotInteraction, VISIT_MASCOT_INTERACTION_EVENT } = await import('../src/utils/visitMascotInteractionApply.js');
  const { VISIT_MASCOT_STATE } = await import('../src/utils/visitMascotState.js');
  const extras = [{
    id: 'srv-testpack',
    label: 'Test',
    renderer: 'sprite_cut',
    fallbackSilhouette: 'gnome',
    mascotPackVersion: 2,
    interactionProfile: {
      mascotDragVeryLarge: { mode: 'none' },
    },
    spriteCut: { frameWidth: 8, frameHeight: 8, stateFrames: { idle: { srcs: ['/x'], fps: 2 } } },
  }];
  const r = resolveVisitMascotInteraction(VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_VERY_LARGE, {
    mascotId: 'srv-testpack',
    extraCatalogEntries: extras,
  });
  assert.equal(r.kind, 'none');
  const r2 = resolveVisitMascotInteraction(VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_LARGE, {
    mascotId: 'srv-testpack',
    extraCatalogEntries: extras,
  });
  assert.equal(r2.kind, 'transient');
  assert.equal(r2.state, VISIT_MASCOT_STATE.SURPRISE);
});
