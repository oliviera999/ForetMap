import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLSpeciesField } from '../../src/gl/components/admin/GLSpeciesField.jsx';

describe('GLSpeciesField', () => {
  test('rend un select à deux options pour le champ type', () => {
    render(<GLSpeciesField fieldKey="type" value="faune" onChange={vi.fn()} />);
    expect(screen.getByText('Type')).toBeInTheDocument();
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('faune');
    expect(screen.getByRole('option', { name: 'Faune' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Flore' })).toBeInTheDocument();
  });

  test('rend un select actif/inactif pour le champ statut', () => {
    render(<GLSpeciesField fieldKey="statut" value="inactif" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveValue('inactif');
    expect(screen.getByRole('option', { name: 'Actif' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Inactif' })).toBeInTheDocument();
  });

  test('rend une zone de texte pour un champ multiligne', () => {
    render(<GLSpeciesField fieldKey="anecdote" value="Salut" onChange={vi.fn()} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveValue('Salut');
  });

  test('rend un input texte pour un champ standard', () => {
    render(<GLSpeciesField fieldKey="famille" value="Canidae" onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveValue('Canidae');
    expect(input).not.toBeRequired();
  });

  test('marque nom_commun comme requis', () => {
    render(<GLSpeciesField fieldKey="nom_commun" value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeRequired();
  });

  test('utilise la clé comme libellé si elle est inconnue', () => {
    render(<GLSpeciesField fieldKey="cle_inconnue" value="" onChange={vi.fn()} />);
    expect(screen.getByText('cle_inconnue')).toBeInTheDocument();
  });

  test('remonte la saisie via onChange(fieldKey, value) pour un input', () => {
    const onChange = vi.fn();
    render(<GLSpeciesField fieldKey="famille" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Felidae' } });
    expect(onChange).toHaveBeenCalledWith('famille', 'Felidae');
  });

  test('remonte la saisie via onChange pour un select', () => {
    const onChange = vi.fn();
    render(<GLSpeciesField fieldKey="type" value="faune" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'flore' } });
    expect(onChange).toHaveBeenCalledWith('type', 'flore');
  });

  test('désactive le contrôle quand disabled est vrai', () => {
    render(<GLSpeciesField fieldKey="species_code" value="SP1" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
