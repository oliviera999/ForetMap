import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';

import { MapViewWorldLayer } from '../../src/components/MapViewWorldLayer.jsx';

function makeProps(overrides = {}) {
  return {
    worldRef: undefined,
    width: 800,
    height: 600,
    children: <span data-testid="layer-child">contenu</span>,
    ...overrides,
  };
}

describe('MapViewWorldLayer', () => {
  test('rend un conteneur positionné aux dimensions du monde', () => {
    const { container } = render(<MapViewWorldLayer {...makeProps()} />);
    const world = container.firstChild;
    expect(world).toBeInTheDocument();
    expect(world).toHaveStyle({
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '800px',
      height: '600px',
    });
  });

  test('rend les enfants à l’intérieur du calque', () => {
    const { getByTestId } = render(<MapViewWorldLayer {...makeProps()} />);
    const child = getByTestId('layer-child');
    expect(child).toBeInTheDocument();
    expect(child).toHaveTextContent('contenu');
  });

  test('worldRef est transmis au conteneur', () => {
    const ref = React.createRef();
    const { container } = render(<MapViewWorldLayer {...makeProps({ worldRef: ref })} />);
    expect(ref.current).toBe(container.firstChild);
  });
});
