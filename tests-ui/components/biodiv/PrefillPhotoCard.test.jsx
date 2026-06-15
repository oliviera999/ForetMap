import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrefillPhotoCard } from '../../../src/components/biodiv/PrefillPhotoCard.jsx';

const FIELD_OPTIONS = [
  { key: 'photo_species', label: 'Photo espèce' },
  { key: 'photo_leaf', label: 'Photo feuille' },
];

function setup(overrides = {}) {
  const props = {
    photo: {
      url: 'https://example.org/a.jpg',
      source_url: 'https://example.org/page',
      credit: 'Alice',
      license: 'CC-BY',
    },
    slotKey: 'photo_leaf:0',
    fieldLabel: 'Photo feuille',
    checked: false,
    assignTo: 'photo_leaf',
    broken: false,
    fieldOptions: FIELD_OPTIONS,
    onToggleChecked: vi.fn(),
    onAssignChange: vi.fn(),
    onThumbError: vi.fn(),
    ...overrides,
  };
  render(<PrefillPhotoCard {...props} />);
  return props;
}

describe('PrefillPhotoCard', () => {
  test('rend l’aperçu, le crédit/licence et le menu désactivé quand non coché', () => {
    setup();
    const check = document.querySelector('.plant-prefill-photo-check');
    expect(check.checked).toBe(false);
    const assign = document.querySelector('.plant-prefill-photo-assign');
    expect(assign.disabled).toBe(true);
    expect(assign.value).toBe('photo_leaf');
    expect(screen.getByText(/Crédit : Alice · Licence : CC-BY/)).toBeInTheDocument();
    expect(document.querySelector('.plant-prefill-photo-thumb')).toBeInTheDocument();
  });

  test('coché → menu actif + classe « selected »', () => {
    setup({ checked: true });
    expect(document.querySelector('.plant-prefill-photo-assign').disabled).toBe(false);
    expect(document.querySelector('.plant-prefill-photo-card--selected')).toBeInTheDocument();
  });

  test('clic sur la case → onToggleChecked(true)', () => {
    const { onToggleChecked } = setup();
    fireEvent.click(document.querySelector('.plant-prefill-photo-check'));
    expect(onToggleChecked).toHaveBeenCalledWith(true);
  });

  test('changement de champ cible → onAssignChange(valeur)', () => {
    const { onAssignChange } = setup({ checked: true });
    fireEvent.change(document.querySelector('.plant-prefill-photo-assign'), {
      target: { value: 'photo_species' },
    });
    expect(onAssignChange).toHaveBeenCalledWith('photo_species');
  });

  test('broken → repli « Aperçu indisponible » au lieu de l’image', () => {
    setup({ broken: true });
    expect(screen.getByLabelText('Aperçu non chargé')).toBeInTheDocument();
    expect(document.querySelector('.plant-prefill-photo-thumb')).toBeNull();
  });

  test('erreur de chargement de l’image → onThumbError', () => {
    const { onThumbError } = setup();
    fireEvent.error(document.querySelector('.plant-prefill-photo-thumb'));
    expect(onThumbError).toHaveBeenCalledTimes(1);
  });

  test('source_url absent → pas de lien « Page source »', () => {
    setup({ photo: { url: 'https://example.org/a.jpg', credit: '', license: '' } });
    expect(screen.queryByText('Page source')).toBeNull();
    expect(screen.getByText(/Crédit : inconnu · Licence : à vérifier/)).toBeInTheDocument();
  });
});
