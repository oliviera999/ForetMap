import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPaletteField } from '../../src/components/ColorPaletteField.jsx';
import { ZONE_COLORS } from '../../src/constants/garden.js';

function renderField(overrides = {}) {
  const onChange = vi.fn();
  render(
    <ColorPaletteField id="test-color" value={ZONE_COLORS[0]} onChange={onChange} {...overrides} />,
  );
  return { onChange };
}

describe('ColorPaletteField', () => {
  test('propose toute la palette prédéfinie et marque la couleur courante', () => {
    renderField();
    for (const c of ZONE_COLORS) {
      expect(screen.getByRole('button', { name: `Couleur ${c}` })).toBeTruthy();
    }
    expect(
      screen
        .getByRole('button', { name: `Couleur ${ZONE_COLORS[0]}` })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: `Couleur ${ZONE_COLORS[1]}` })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  test('un clic sur une pastille remonte la couleur de la palette', () => {
    const { onChange } = renderField();
    fireEvent.click(screen.getByRole('button', { name: `Couleur ${ZONE_COLORS[2]}` }));
    expect(onChange).toHaveBeenCalledWith(ZONE_COLORS[2]);
  });

  test('le sélecteur de teinte conserve la transparence courante', () => {
    const { onChange } = renderField({ value: '#86efac90' });
    fireEvent.change(screen.getByLabelText('Choisir la teinte'), {
      target: { value: '#fca5a5' },
    });
    expect(onChange).toHaveBeenCalledWith('#fca5a590');
  });

  test('la saisie hexadécimale libre reste possible', () => {
    const { onChange } = renderField();
    fireEvent.change(screen.getByLabelText('Couleur'), { target: { value: '#123456ff' } });
    expect(onChange).toHaveBeenCalledWith('#123456ff');
  });

  test('la sélection ignore la casse du code hexadécimal', () => {
    renderField({ value: ZONE_COLORS[3].toUpperCase() });
    expect(
      screen
        .getByRole('button', { name: `Couleur ${ZONE_COLORS[3]}` })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
