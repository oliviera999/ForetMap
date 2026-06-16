import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PublicSettingsProvider,
  usePublicSettings,
} from '../../src/contexts/PublicSettingsContext.jsx';

function Probe({ fallback }) {
  const settings = usePublicSettings(fallback);
  return <span data-testid="v">{settings?.map?.default_map_student ?? 'none'}</span>;
}

describe('PublicSettingsContext', () => {
  test('fournit la valeur aux consommateurs', () => {
    render(
      <PublicSettingsProvider value={{ map: { default_map_student: 'foret' } }}>
        <Probe />
      </PublicSettingsProvider>,
    );
    expect(screen.getByTestId('v').textContent).toBe('foret');
  });

  test('hors Provider : renvoie le fallback', () => {
    render(<Probe fallback={{ map: { default_map_student: 'repli' } }} />);
    expect(screen.getByTestId('v').textContent).toBe('repli');
  });

  test('hors Provider sans fallback : null', () => {
    render(<Probe />);
    expect(screen.getByTestId('v').textContent).toBe('none');
  });
});
