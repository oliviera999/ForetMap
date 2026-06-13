import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLGlossaryTermForm } from '../../src/gl/components/admin/GLGlossaryTermForm.jsx';
import { EMPTY_FORM } from '../../src/gl/utils/glGlossaryEditorForm.js';

function renderForm(props = {}) {
  return render(
    <GLGlossaryTermForm
      form={{ ...EMPTY_FORM }}
      onField={vi.fn()}
      onSubmit={vi.fn()}
      onArchive={vi.fn()}
      selectedCode={null}
      loading={false}
      categories={[{ id: 'ecologie', label: 'Écologie' }]}
      niveaux={[{ id: 'base', label: 'Base' }]}
      biomeOptions={[{ value: 'foret', label: 'Forêt' }]}
      {...props}
    />,
  );
}

describe('GLGlossaryTermForm', () => {
  test('remonte la saisie du code via onField', () => {
    const onField = vi.fn();
    const { container } = renderForm({ onField });
    const codeInput = container.querySelector('input.gl-input');
    fireEvent.change(codeInput, { target: { value: 'GL0009' } });
    expect(onField).toHaveBeenCalledWith('glossary_code', 'GL0009');
  });

  test('appelle onSubmit à la soumission du formulaire', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const { container } = renderForm({ onSubmit });
    fireEvent.submit(container.querySelector('form'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('désactive le code et affiche Archiver en édition', () => {
    renderForm({ selectedCode: 'GL0001', form: { ...EMPTY_FORM, glossary_code: 'GL0001' } });
    expect(screen.getByDisplayValue('GL0001')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archiver' })).toBeInTheDocument();
  });

  test('masque Archiver à la création', () => {
    renderForm({ selectedCode: null });
    expect(screen.queryByRole('button', { name: 'Archiver' })).not.toBeInTheDocument();
  });

  test('appelle onArchive au clic sur Archiver', () => {
    const onArchive = vi.fn();
    renderForm({ selectedCode: 'GL0001', onArchive });
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  test('libellé Enregistrer reflète l’état loading', () => {
    const { rerender } = renderForm({ loading: false });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).not.toBeDisabled();
    rerender(
      <GLGlossaryTermForm
        form={{ ...EMPTY_FORM }}
        onField={vi.fn()}
        onSubmit={vi.fn()}
        onArchive={vi.fn()}
        selectedCode={null}
        loading
        categories={[]}
        niveaux={[]}
        biomeOptions={[]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
  });

  test('affiche le sélecteur de biomes quand all_biomes est faux', () => {
    renderForm({ form: { ...EMPTY_FORM, all_biomes: false } });
    expect(screen.getByText('Biomes concernés')).toBeInTheDocument();
  });

  test('masque le sélecteur de biomes quand all_biomes est vrai', () => {
    renderForm({ form: { ...EMPTY_FORM, all_biomes: true } });
    expect(screen.queryByText('Biomes concernés')).not.toBeInTheDocument();
  });

  test('remonte le basculement de portée via onField', () => {
    const onField = vi.fn();
    renderForm({ onField });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onField).toHaveBeenCalledWith('all_biomes', false);
  });
});
