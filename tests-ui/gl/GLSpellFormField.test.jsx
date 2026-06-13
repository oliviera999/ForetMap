import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLSpellFormField } from '../../src/gl/components/admin/GLSpellFormField.jsx';

function renderField(props = {}) {
  return render(
    <GLSpellFormField fieldKey="nom" value="" onChange={vi.fn()} disabled={false} {...props} />,
  );
}

describe('GLSpellFormField', () => {
  test('champ texte : rend un libellé et propage la saisie via onChange(fieldKey, value)', () => {
    const onChange = vi.fn();
    renderField({ fieldKey: 'portee', value: 'courte', onChange });
    const input = screen.getByDisplayValue('courte');
    fireEvent.change(input, { target: { value: 'longue' } });
    expect(onChange).toHaveBeenCalledWith('portee', 'longue');
  });

  test('catégorie : select avec option vide + options du catalogue', () => {
    renderField({ fieldKey: 'category_slug', value: 'vie' });
    expect(screen.getByRole('option', { name: 'Vie' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mouvement' })).toBeInTheDocument();
    // option vide « — »
    expect(screen.getByRole('option', { name: '—' })).toBeInTheDocument();
  });

  test('statut : select avec les statuts officiels/proposé', () => {
    const onChange = vi.fn();
    renderField({ fieldKey: 'statut', value: 'officiel', onChange });
    const select = screen.getByDisplayValue('Officiel');
    fireEvent.change(select, { target: { value: 'propose' } });
    expect(onChange).toHaveBeenCalledWith('statut', 'propose');
  });

  test('champ long : rend un textarea', () => {
    renderField({ fieldKey: 'effet_detaille', value: 'texte' });
    const ta = screen.getByDisplayValue('texte');
    expect(ta.tagName).toBe('TEXTAREA');
  });

  test('coût : input numérique avec min 0', () => {
    renderField({ fieldKey: 'cout_gemmes', value: '3' });
    const input = screen.getByDisplayValue('3');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
  });

  test('disabled propagé au contrôle', () => {
    renderField({ fieldKey: 'nom', value: 'X', disabled: true });
    expect(screen.getByDisplayValue('X')).toBeDisabled();
  });
});
