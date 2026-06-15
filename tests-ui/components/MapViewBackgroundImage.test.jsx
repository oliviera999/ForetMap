import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { MapViewBackgroundImage } from '../../src/components/MapViewBackgroundImage.jsx';

function makeProps(overrides = {}) {
  return {
    imgRef: undefined,
    src: 'https://example.test/plan.png',
    alt: 'Plan du jardin',
    width: 800,
    height: 600,
    onError: vi.fn(),
    ...overrides,
  };
}

describe('MapViewBackgroundImage', () => {
  test('rend l’image avec src, alt et dimensions', () => {
    const { container } = render(<MapViewBackgroundImage {...makeProps()} />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.test/plan.png');
    expect(img).toHaveAttribute('alt', 'Plan du jardin');
    expect(img).toHaveStyle({ width: '800px', height: '600px', position: 'absolute' });
  });

  test('l’image n’est pas déplaçable', () => {
    const { container } = render(<MapViewBackgroundImage {...makeProps()} />);
    expect(container.querySelector('img')).toHaveAttribute('draggable', 'false');
  });

  test('onError est déclenché quand l’image échoue', () => {
    const onError = vi.fn();
    const { container } = render(<MapViewBackgroundImage {...makeProps({ onError })} />);
    fireEvent.error(container.querySelector('img'));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test('imgRef est transmis à l’élément image', () => {
    const ref = React.createRef();
    const { container } = render(<MapViewBackgroundImage {...makeProps({ imgRef: ref })} />);
    expect(ref.current).toBe(container.querySelector('img'));
  });
});
