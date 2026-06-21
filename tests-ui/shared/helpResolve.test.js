import { describe, expect, test } from 'vitest';

import {
  resolveTooltipKey,
  resolveHelpPanelSection,
  resolveHelpChrome,
  resolveHelpQuickTip,
  resolveMapCanvasHint,
  resolveRealtimeTooltip,
} from '../../src/utils/helpResolve.js';

const registry = {
  tooltips: {
    'header.logout': { text: 'Custom logout' },
  },
  panels: {
    map: {
      title: 'Carte custom',
      items: [{ text: 'Point custom' }],
    },
  },
  quickTips: { map: 'Tip custom' },
  chrome: { hintPrefix: 'Hint: ' },
  mapCanvasHints: { drawZoneMin: 'Draw {count}' },
  realtime: { live: 'Live custom' },
};

const publicSettings = { content: { help: { registry } } };

describe('helpResolve', () => {
  test('resolveTooltipKey utilise le registre', () => {
    expect(resolveTooltipKey('header.logout', publicSettings, false)).toBe('Custom logout');
  });

  test('resolveTooltipKey retombe sur help.js', () => {
    expect(resolveTooltipKey('map.zoomIn', null, false)).toContain('Zoomer');
  });

  test('resolveHelpPanelSection', () => {
    const panel = resolveHelpPanelSection('map', publicSettings);
    expect(panel.title).toBe('Carte custom');
    expect(panel.items[0].text).toBe('Point custom');
  });

  test('resolveHelpChrome', () => {
    expect(resolveHelpChrome(publicSettings).hintPrefix).toBe('Hint: ');
  });

  test('resolveHelpQuickTip', () => {
    expect(resolveHelpQuickTip('map', publicSettings)).toBe('Tip custom');
  });

  test('resolveMapCanvasHint remplace les variables', () => {
    expect(resolveMapCanvasHint('drawZoneMin', publicSettings, { count: 4 })).toBe('Draw 4');
  });

  test('resolveRealtimeTooltip', () => {
    expect(resolveRealtimeTooltip('live', publicSettings)).toBe('Live custom');
    expect(resolveRealtimeTooltip('no-client', null)).toContain('indisponible');
  });
});
