'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let computeVisitMascotStartPct;
let findVisitN3EntranceMarker;
let VISIT_MASCOT_BELOW_N3_ENTRANCE_YP;
let VISIT_N3_ENTRANCE_LABEL_RE;

before(async () => {
  const mod = await import(pathToFileURL(join(__dirname, '../src/utils/visitMascotPlacement.js')).href);
  computeVisitMascotStartPct = mod.computeVisitMascotStartPct;
  findVisitN3EntranceMarker = mod.findVisitN3EntranceMarker;
  VISIT_MASCOT_BELOW_N3_ENTRANCE_YP = mod.VISIT_MASCOT_BELOW_N3_ENTRANCE_YP;
  VISIT_N3_ENTRANCE_LABEL_RE = mod.VISIT_N3_ENTRANCE_LABEL_RE;
});

describe('visitMascotPlacement', () => {
  it('computeVisitMascotStartPct : carte foret → centre', () => {
    assert.deepEqual(computeVisitMascotStartPct('foret', []), { xp: 50, yp: 50 });
    assert.deepEqual(computeVisitMascotStartPct('foret', [{ label: 'Entrée N3', x_pct: 10, y_pct: 20 }]), {
      xp: 50,
      yp: 50,
    });
  });

  it('computeVisitMascotStartPct : n3 sans repère entrée → centre', () => {
    assert.deepEqual(computeVisitMascotStartPct('n3', []), { xp: 50, yp: 50 });
    assert.deepEqual(computeVisitMascotStartPct('n3', [{ label: 'Autre', x_pct: 10, y_pct: 20 }]), {
      xp: 50,
      yp: 50,
    });
  });

  it('computeVisitMascotStartPct : n3 + Entrée N3 → position repère + décalage vertical', () => {
    const r = computeVisitMascotStartPct('n3', [{ label: 'Entrée N3', x_pct: 40, y_pct: 30 }]);
    assert.equal(r.xp, 40);
    assert.ok(Math.abs(r.yp - (30 + VISIT_MASCOT_BELOW_N3_ENTRANCE_YP)) < 1e-9);
  });

  it('computeVisitMascotStartPct : clamp 0–100 sur n3', () => {
    const hi = computeVisitMascotStartPct('n3', [{ label: 'Portail N3', x_pct: 100, y_pct: 100 }]);
    assert.equal(hi.xp, 100);
    assert.equal(hi.yp, 100);
    const lo = computeVisitMascotStartPct('n3', [{ label: 'accès n3', x_pct: 0, y_pct: 0 }]);
    assert.equal(lo.xp, 0);
    assert.equal(lo.yp, Math.min(100, VISIT_MASCOT_BELOW_N3_ENTRANCE_YP));
  });

  it('computeVisitMascotStartPct : ignore x_pct / y_pct non numériques', () => {
    assert.deepEqual(computeVisitMascotStartPct('n3', [{ label: 'Entrée N3', x_pct: 'x', y_pct: 10 }]), {
      xp: 50,
      yp: 50,
    });
  });

  it('findVisitN3EntranceMarker : variantes de libellé reconnues', () => {
    const labels = [
      'Entrée N3',
      'entrée n3',
      '📍 Entrée N3',
      'Portail N3',
      'accès N3',
      'n3 entrée',
    ];
    for (const label of labels) {
      const m = findVisitN3EntranceMarker([{ label, x_pct: 1, y_pct: 2 }]);
      assert.ok(m, label);
      assert.equal(m.x_pct, 1);
    }
  });

  it('VISIT_N3_ENTRANCE_LABEL_RE : exemples documentés', () => {
    assert.match('Entrée N3', VISIT_N3_ENTRANCE_LABEL_RE);
    assert.match('n3 entrée', VISIT_N3_ENTRANCE_LABEL_RE);
    assert.match('Portail N3', VISIT_N3_ENTRANCE_LABEL_RE);
    assert.doesNotMatch('Parking', VISIT_N3_ENTRANCE_LABEL_RE);
  });
});
