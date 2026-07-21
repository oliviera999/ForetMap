import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLFeuilletSpeciesPicker } from '../../src/gl/components/admin/GLFeuilletSpeciesPicker.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

describe('GLFeuilletSpeciesPicker', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({
      items: [
        { species_code: 'SP0001', nom_commun: 'Fennec' },
        { species_code: 'SP0002', nom_commun: 'Addax' },
      ],
    });
  });

  test('sans biome : repli manuel (canal + référence), pas d’appel espèces', async () => {
    const onChange = vi.fn();
    render(<GLFeuilletSpeciesPicker biomeSlug="" canal="" reference="" onChange={onChange} />);

    expect(screen.getByLabelText('Canal du lien')).toBeInTheDocument();
    expect(screen.getByLabelText('Référence du lien')).toBeInTheDocument();
    expect(apiGlMock).not.toHaveBeenCalled();
  });

  test('avec biome : liste les espèces et écrit canal=espece + ref au choix', async () => {
    const onChange = vi.fn();
    render(
      <GLFeuilletSpeciesPicker biomeSlug="sahara" canal="" reference="" onChange={onChange} />,
    );

    await waitFor(() => expect(apiGlMock).toHaveBeenCalledWith('/api/gl/species?biomeSlug=sahara'));
    const select = await screen.findByLabelText('Espèce liée');
    fireEvent.change(select, { target: { value: 'SP0002' } });
    expect(onChange).toHaveBeenCalledWith({ canal: 'espece', ref: 'SP0002' });
  });

  test('sélection vide : efface le lien (canal + ref vides)', async () => {
    const onChange = vi.fn();
    render(
      <GLFeuilletSpeciesPicker
        biomeSlug="sahara"
        canal="espece"
        reference="SP0001"
        onChange={onChange}
      />,
    );
    const select = await screen.findByLabelText('Espèce liée');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ canal: '', ref: '' });
  });
});
