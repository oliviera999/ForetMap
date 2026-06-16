import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLMascotAvatar } from '../../src/gl/components/GLMascotAvatar.jsx';

describe('GLMascotAvatar', () => {
  test('utilise le type du catalogue quand la mascotte existe', () => {
    const { container } = render(<GLMascotAvatar mascotId="gl-gnome-mousse" />);
    const node = container.querySelector('.gl-mascot-avatar');
    expect(node).toHaveAttribute('data-gl-mascot-id', 'gl-gnome-mousse');
    expect(node?.getAttribute('data-gl-mascot-type')).toBeTruthy();
  });

  test('retombe sur le fallback pour mascotte inconnue', () => {
    render(
      <GLMascotAvatar mascotId="unknown-id" fallbackType="unicorn" fallbackLabel="Licorne test" />,
    );
    expect(screen.getByLabelText('Licorne test')).toBeInTheDocument();
  });
});
