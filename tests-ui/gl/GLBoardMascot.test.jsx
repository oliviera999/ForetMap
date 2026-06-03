// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { GLBoardMascot } from '../../src/gl/components/GLBoardMascot.jsx';
import { VISIT_MASCOT_STATE } from '../../src/utils/visitMascotState.js';

describe('GLBoardMascot', () => {
  beforeAll(() => {
    if (document.getElementById('visit-map-mascot-test-css')) return;
    const style = document.createElement('style');
    style.id = 'visit-map-mascot-test-css';
    style.textContent = '.visit-map-mascot { position: absolute; width: 0; height: 0; }';
    document.head.appendChild(style);
  });

  it('rend la mascotte sans cadre blanc (classes visit-map-mascot)', () => {
    const { container } = render(
      <GLBoardMascot
        team={{ id: 1, mascot_id: 'gl-gnome-mousse', name: 'Équipe A' }}
        position={{ xp: 50, yp: 50 }}
        motion={{ walking: true, happy: false, faceRight: true }}
        mascotState={VISIT_MASCOT_STATE.IDLE}
      />,
    );
    const root = container.querySelector('[data-gl-board-mascot]');
    expect(root).toBeTruthy();
    expect(root.className).toMatch(/visit-map-mascot/);
    expect(root.className).toMatch(/visit-map-mascot--walking/);
    expect(root.className).not.toMatch(/gl-board-team/);
    expect(container.querySelector('.visit-map-mascot-inner')).toBeTruthy();
    expect(container.querySelector('.visit-map-mascot-rive-shell')).toBeTruthy();
    expect(container.querySelector('.gl-mascot-svg')).toBeTruthy();
    expect(window.getComputedStyle(root).position).toBe('absolute');
  });
});
