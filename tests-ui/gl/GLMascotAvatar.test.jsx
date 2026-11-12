import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const catalog = { mascots: [] };
vi.mock('../../src/gl/context/GLMascotCatalogContext.jsx', () => ({
  useGLMascotCatalog: () => ({ mascots: catalog.mascots, extraCatalogEntries: [] }),
}));

const { GLMascotAvatar, firstMascotPackFrame } =
  await import('../../src/gl/components/GLMascotAvatar.jsx');

const PACK = {
  id: 'srv-licorne-marine',
  label: 'Licorne marine',
  type: 'unicorn',
  renderer: 'sprite_cut',
  spriteCut: {
    pixelated: true,
    stateFrames: {
      walking: { srcs: ['/uploads/p/walk_0.png'], fps: 8 },
      idle: { srcs: ['/uploads/p/idle_0.png', '/uploads/p/idle_1.png'], fps: 8 },
    },
  },
};

describe('GLMascotAvatar', () => {
  beforeEach(() => {
    catalog.mascots = [PACK];
  });

  test('pack publié du catalogue : première image idle', () => {
    const { container } = render(<GLMascotAvatar mascotId={PACK.id} fallbackType="gnome" />);
    const node = container.querySelector('.gl-mascot-avatar');
    expect(node).toHaveAttribute('data-gl-mascot-id', PACK.id);
    expect(node).toHaveAttribute('data-gl-mascot-type', 'unicorn');
    expect(node).toHaveAttribute('data-gl-mascot-render', 'pack');
    expect(screen.getByAltText('Licorne marine')).toHaveAttribute('src', '/uploads/p/idle_0.png');
  });

  test('image en erreur : repli SVG sans exception', () => {
    const { container } = render(<GLMascotAvatar mascotId={PACK.id} />);
    fireEvent.error(screen.getByAltText('Licorne marine'));
    expect(container.querySelector('.gl-mascot-avatar')).toHaveAttribute(
      'data-gl-mascot-render',
      'fallback',
    );
    expect(container.querySelector('.gl-mascot-svg')).toBeTruthy();
  });

  test('pack dépublié / ancien id : repli SVG au type de l’équipe', () => {
    const { container } = render(
      <GLMascotAvatar mascotId="srv-retire" fallbackType="unicorn" fallbackLabel="Licorne test" />,
    );
    expect(screen.getByLabelText('Licorne test')).toBeInTheDocument();
    const node = container.querySelector('.gl-mascot-avatar');
    expect(node).toHaveAttribute('data-gl-mascot-render', 'fallback');
    expect(node).toHaveAttribute('data-gl-mascot-type', 'unicorn');
  });

  test('firstMascotPackFrame : idle, sinon premier état illustré, sinon null', () => {
    expect(firstMascotPackFrame(PACK)).toBe('/uploads/p/idle_0.png');
    expect(
      firstMascotPackFrame({ spriteCut: { stateFrames: { talking: { srcs: ['/t.png'] } } } }),
    ).toBe('/t.png');
    expect(firstMascotPackFrame({ spriteCut: { stateFrames: {} } })).toBeNull();
    expect(firstMascotPackFrame(null)).toBeNull();
  });
});
