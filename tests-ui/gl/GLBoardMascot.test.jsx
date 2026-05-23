// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLBoardMascot } from '../../src/gl/components/GLBoardMascot.jsx';
import { VISIT_MASCOT_STATE } from '../../src/utils/visitMascotState.js';

describe('GLBoardMascot', () => {
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
  });
});
