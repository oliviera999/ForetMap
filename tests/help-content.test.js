'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  loadDefaultHelpConfig,
  normalizeHelpConfig,
  PANEL_IDS,
} = require('../lib/helpContent');

test('loadDefaultHelpConfig contient tooltips, panneaux et hints carte', () => {
  const defaults = loadDefaultHelpConfig();
  assert.ok(defaults.tooltips['header.userBadge']?.text);
  assert.ok(defaults.panels.map?.title);
  assert.equal(typeof defaults.mapCanvasHints.drawZoneMin, 'string');
  assert.ok(defaults.realtime.live);
});

test('normalizeHelpConfig fusionne avec les défauts', () => {
  const normalized = normalizeHelpConfig({
    quickTips: { map: 'Astuce carte custom' },
  });
  assert.equal(normalized.quickTips.map, 'Astuce carte custom');
  assert.ok(normalized.tooltips['map.zoomIn']?.text);
  assert.ok(PANEL_IDS.includes('tasks'));
});

test('normalizeHelpConfig garde les items de panneau', () => {
  const normalized = normalizeHelpConfig({
    panels: {
      visit: {
        title: 'Visite perso',
        items: [{ text: 'Ligne 1' }],
      },
    },
  });
  assert.equal(normalized.panels.visit.title, 'Visite perso');
  assert.equal(normalized.panels.visit.items[0].text, 'Ligne 1');
});
