'use strict';

/**
 * Lot C (audit 26/11) : lecture progression stats sans await sync sur GET /api/stats/all.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  progressionBlockFromResolved,
  shouldScheduleDetachedProgressionSync,
} = require('../lib/stats/statsProgressionRead');

const BASE_CONFIG = {
  autoProgressionEnabled: true,
  progressionSlugs: new Set(['eleve_novice', 'eleve_confirme', 'eleve_expert']),
  steps: [
    { roleSlug: 'eleve_novice', min: 0, emoji: '🌱' },
    { roleSlug: 'eleve_confirme', min: 5, emoji: '🌿' },
    { roleSlug: 'eleve_expert', min: 15, emoji: '🌳' },
  ],
};

function resolvedStudent({ currentSlug, assignedSlug, forced = false }) {
  return {
    userType: 'student',
    decision: {
      source: forced ? 'forced' : 'assigned',
      role: { slug: currentSlug, displayName: `Profil ${currentSlug}` },
    },
    assigned: assignedSlug ? { slug: assignedSlug, displayName: assignedSlug } : null,
    conferred: [],
  };
}

describe('progressionBlockFromResolved', () => {
  it('expose le profil effectif et emoji du palier', () => {
    const block = progressionBlockFromResolved(
      resolvedStudent({ currentSlug: 'eleve_novice', assignedSlug: 'eleve_novice' }),
      BASE_CONFIG,
    );
    assert.deepEqual(block, {
      roleSlug: 'eleve_novice',
      roleDisplayName: 'Profil eleve_novice',
      roleEmoji: '🌱',
      autoProgressionEnabled: true,
    });
  });
});

describe('shouldScheduleDetachedProgressionSync', () => {
  it('ne planifie pas si progression auto désactivée', () => {
    const cfg = { ...BASE_CONFIG, autoProgressionEnabled: false };
    assert.equal(
      shouldScheduleDetachedProgressionSync(
        resolvedStudent({ currentSlug: 'eleve_novice', assignedSlug: 'eleve_novice' }),
        10,
        cfg,
      ),
      false,
    );
  });

  it('ne planifie pas si profil imposé par groupe', () => {
    assert.equal(
      shouldScheduleDetachedProgressionSync(
        resolvedStudent({
          currentSlug: 'eleve_novice',
          assignedSlug: 'eleve_novice',
          forced: true,
        }),
        20,
        BASE_CONFIG,
      ),
      false,
    );
  });

  it('planifie une montée quand le compteur dépasse le palier attribué', () => {
    assert.equal(
      shouldScheduleDetachedProgressionSync(
        resolvedStudent({ currentSlug: 'eleve_novice', assignedSlug: 'eleve_novice' }),
        6,
        BASE_CONFIG,
      ),
      true,
    );
  });

  it('ne planifie pas si déjà aligné', () => {
    assert.equal(
      shouldScheduleDetachedProgressionSync(
        resolvedStudent({ currentSlug: 'eleve_confirme', assignedSlug: 'eleve_confirme' }),
        6,
        BASE_CONFIG,
      ),
      false,
    );
  });
});
