import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// MarkdownTextarea est un éditeur riche (contentEditable) : réduit à un textarea simple
// pour isoler le câblage du formulaire (l'éditeur riche est testé ailleurs).
vi.mock('../../src/components/MarkdownTextarea.jsx', () => ({
  MarkdownTextarea: ({ value, onChange, placeholder }) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} />
  ),
}));

// AttachmentImagesPicker dépend de services réseau : réduit à un marqueur inerte.
vi.mock('../../src/components/attachment-images-picker', () => ({
  AttachmentImagesPicker: () => <div data-testid="images-picker" />,
}));

import { ContextCommentForm } from '../../src/components/context-comments/ContextCommentForm.jsx';

function renderForm(overrides = {}) {
  const props = {
    body: '',
    onBodyChange: vi.fn(),
    pendingImages: [],
    onPendingImagesChange: vi.fn(),
    placeholder: 'Ajouter un commentaire...',
    submitting: false,
    onSubmit: vi.fn((e) => e.preventDefault()),
    onNotify: vi.fn(),
    ...overrides,
  };
  render(<ContextCommentForm {...props} />);
  return props;
}

describe('ContextCommentForm', () => {
  test('affiche le placeholder, le picker et le bouton Publier', () => {
    renderForm();
    expect(screen.getByPlaceholderText('Ajouter un commentaire...')).toBeTruthy();
    expect(screen.getByTestId('images-picker')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publier' })).toBeTruthy();
  });

  test('remonte la saisie via onBodyChange', () => {
    const { onBodyChange } = renderForm();
    fireEvent.change(screen.getByPlaceholderText('Ajouter un commentaire...'), {
      target: { value: 'coucou' },
    });
    expect(onBodyChange).toHaveBeenCalledWith('coucou');
  });

  test('soumet le formulaire via onSubmit', () => {
    const { onSubmit } = renderForm({ body: 'salut' });
    fireEvent.submit(screen.getByRole('button', { name: 'Publier' }).closest('form'));
    expect(onSubmit).toHaveBeenCalled();
  });

  test('en cours de soumission : bouton désactivé et libellé Envoi', () => {
    renderForm({ submitting: true });
    const btn = screen.getByRole('button', { name: 'Envoi...' });
    expect(btn.disabled).toBe(true);
  });
});
