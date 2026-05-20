import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLMascotFallbackSvg } from '../../src/gl/components/GLMascotFallbackSvg.jsx';

describe('GLMascotFallbackSvg', () => {
  test('rend le variant gnome par défaut', () => {
    render(<GLMascotFallbackSvg label="Gnome icon" />);
    expect(screen.getByLabelText('Gnome icon')).toBeInTheDocument();
  });

  test('rend le variant licorne quand type=unicorn', () => {
    render(<GLMascotFallbackSvg type="unicorn" label="Licorne icon" />);
    expect(screen.getByLabelText('Licorne icon')).toBeInTheDocument();
  });
});
