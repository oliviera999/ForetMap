import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  ALL_SURFACES,
  SurfaceVisibilityField,
  normalizeSurfaceList,
} from '../../src/shared/ui/SurfaceVisibilityField.jsx';

describe('normalizeSurfaceList', () => {
  test('accepte une chaîne SET, un tableau, une valeur vide, et garde l’ordre canonique', () => {
    expect(normalizeSurfaceList('plan,map')).toEqual(['map', 'plan']);
    expect(normalizeSurfaceList([' VISIT ', 'plan', 'inconnu'])).toEqual(['visit', 'plan']);
    expect(normalizeSurfaceList(null)).toEqual([]);
    expect(normalizeSurfaceList('')).toEqual([]);
    expect(normalizeSurfaceList(ALL_SURFACES)).toEqual(['map', 'visit', 'plan']);
  });
});

describe('SurfaceVisibilityField', () => {
  test('mode « hidden » : coche = masqué, et avertit quand tout est masqué', () => {
    const onChange = vi.fn();
    render(<SurfaceVisibilityField value={['map', 'visit']} onChange={onChange} idPrefix="lieu" />);
    expect(screen.getByText('Masquer sur')).toBeTruthy();
    expect(screen.getByLabelText(/Carte/).checked).toBe(true);
    expect(screen.getByLabelText(/Plan/).checked).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByLabelText(/Plan/));
    expect(onChange).toHaveBeenCalledWith(['map', 'visit', 'plan']);
  });

  test('mode « hidden » : tout masqué → message d’avertissement', () => {
    render(<SurfaceVisibilityField value={ALL_SURFACES} onChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toMatch(/visible nulle part/);
  });

  test('mode « visible » : décocher retire la surface, légende personnalisable', () => {
    const onChange = vi.fn();
    render(
      <SurfaceVisibilityField
        mode="visible"
        legend="Visible sur"
        value="map,visit,plan"
        onChange={onChange}
        idPrefix="cat"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Visite/));
    expect(onChange).toHaveBeenCalledWith(['map', 'plan']);
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('disabled : le groupe est inerte', () => {
    render(<SurfaceVisibilityField value={[]} onChange={() => {}} disabled />);
    expect(screen.getByLabelText(/Carte/).disabled).toBe(true);
  });
});
