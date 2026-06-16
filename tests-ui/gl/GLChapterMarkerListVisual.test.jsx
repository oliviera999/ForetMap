import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GLChapterMarkerListVisual } from '../../src/gl/components/GLChapterMarkerListVisual.jsx';

describe('GLChapterMarkerListVisual', () => {
  test("rend l'emoji en mode emoji", () => {
    const { container } = render(
      <GLChapterMarkerListVisual marker={{ display_mode: 'emoji', emoji: '🌲' }} />,
    );
    const span = container.querySelector('span.gl-markers-list__visual');
    expect(span).not.toBeNull();
    expect(span.textContent).toContain('🌲');
  });

  test('rend une icône en mode icon', () => {
    const { container } = render(
      <GLChapterMarkerListVisual
        marker={{ display_mode: 'icon', icon_url: 'https://example.com/i.png' }}
      />,
    );
    const img = container.querySelector('img.gl-markers-list__visual--icon');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/i.png');
  });

  test('ne rend rien en mode label (ni emoji ni icône)', () => {
    const { container } = render(
      <GLChapterMarkerListVisual marker={{ display_mode: 'label', label: 'Repère' }} />,
    );
    expect(container.querySelector('.gl-markers-list__visual')).toBeNull();
  });
});
