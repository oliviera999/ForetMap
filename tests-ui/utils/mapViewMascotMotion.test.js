import { describe, test, expect } from 'vitest';
import {
  pickMapMascotMoveInteraction,
  MAP_VIEW_MASCOT_RUN_DIST_PCT,
  MAP_VIEW_MASCOT_SURPRISE_DIST_PCT,
} from '../../src/utils/mapViewMascotMotion.js';
import { VISIT_MASCOT_INTERACTION_EVENT } from '../../src/utils/visitMascotInteractionEvents.js';

// Le plan carte émet désormais un **événement d'interaction** (résolu par le profil du pack)
// au lieu d'un état d'animation câblé en dur — mêmes seuils que le plan de visite.
describe('pickMapMascotMoveInteraction', () => {
  test('déplacement court : aucun événement', () => {
    expect(pickMapMascotMoveInteraction(0)).toBeNull();
    expect(pickMapMascotMoveInteraction(MAP_VIEW_MASCOT_SURPRISE_DIST_PCT)).toBeNull();
    expect(pickMapMascotMoveInteraction(NaN)).toBeNull();
  });

  test('déplacement long → événement « drag long » + bulle surprise', () => {
    const res = pickMapMascotMoveInteraction(MAP_VIEW_MASCOT_SURPRISE_DIST_PCT + 1);
    expect(res).toEqual({
      event: VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_LARGE,
      dialog: 'surprise',
    });
  });

  test('déplacement très long → événement « drag très long » + bulle course', () => {
    const res = pickMapMascotMoveInteraction(MAP_VIEW_MASCOT_RUN_DIST_PCT + 1);
    expect(res).toEqual({
      event: VISIT_MASCOT_INTERACTION_EVENT.MASCOT_DRAG_VERY_LARGE,
      dialog: 'running',
    });
  });
});
