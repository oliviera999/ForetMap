import { describe, expect, test } from 'vitest';

import {
  PCT_MAP_BACKGROUND_CLICK_IGNORE_SELECTOR,
  shouldIgnorePctMapBackgroundClick,
} from '../../src/shared/pct-map/pctMapBackgroundClick.js';

describe('shouldIgnorePctMapBackgroundClick', () => {
  test('le sélecteur cible la zone (groupe), pas le calque SVG plein cadre', () => {
    expect(PCT_MAP_BACKGROUND_CLICK_IGNORE_SELECTOR).toContain('.fm-pct-zone');
    expect(PCT_MAP_BACKGROUND_CLICK_IGNORE_SELECTOR).not.toContain('.fm-pct-zones');
  });

  test('ignore une vraie zone / repère / cluster / étiquette', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <svg class="fm-pct-zones">
        <g class="fm-pct-zone"><polygon class="fm-pct-zone__poly"></polygon></g>
      </svg>
      <button class="fm-pct-marker" type="button"></button>
      <button class="fm-pct-cluster" type="button"></button>
      <button class="fm-pct-label is-clickable" type="button"></button>
    `;
    expect(shouldIgnorePctMapBackgroundClick(root.querySelector('.fm-pct-zone__poly'))).toBe(true);
    expect(shouldIgnorePctMapBackgroundClick(root.querySelector('.fm-pct-marker'))).toBe(true);
    expect(shouldIgnorePctMapBackgroundClick(root.querySelector('.fm-pct-cluster'))).toBe(true);
    expect(shouldIgnorePctMapBackgroundClick(root.querySelector('.fm-pct-label'))).toBe(true);
  });

  test('laisse passer le fond du calque zones (hors polygone) et l’image', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="visit-map-fit-layer">
        <img class="visit-map-img" alt="" />
        <svg class="fm-pct-zones"></svg>
      </div>
    `;
    expect(shouldIgnorePctMapBackgroundClick(root.querySelector('.fm-pct-zones'))).toBe(false);
    expect(shouldIgnorePctMapBackgroundClick(root.querySelector('.visit-map-img'))).toBe(false);
    expect(shouldIgnorePctMapBackgroundClick(root.querySelector('.visit-map-fit-layer'))).toBe(
      false,
    );
  });

  test('cible absente ou sans closest → ne bloque pas', () => {
    expect(shouldIgnorePctMapBackgroundClick(null)).toBe(false);
    expect(shouldIgnorePctMapBackgroundClick({})).toBe(false);
  });
});
