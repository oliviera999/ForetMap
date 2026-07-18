import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLContentLibraryFileList } from '../../src/gl/components/admin/content-library/GLContentLibraryFileList.jsx';

function makeRow(overrides = {}) {
  return {
    file: { name: 'photo.png', size: 1024 },
    status: 'idle',
    progress: 0,
    error: null,
    ...overrides,
  };
}

describe('GLContentLibraryFileList', () => {
  test('affiche un indice quand aucun fichier n’est sélectionné', () => {
    render(<GLContentLibraryFileList rows={[]} />);
    expect(screen.getByText('Aucun fichier sélectionné.')).toBeInTheDocument();
  });

  test('liste les fichiers avec leur statut', () => {
    render(<GLContentLibraryFileList rows={[makeRow()]} />);
    expect(screen.getByText('photo.png')).toBeInTheDocument();
  });

  test('affiche une barre de progression pendant l’envoi', () => {
    render(<GLContentLibraryFileList rows={[makeRow({ status: 'uploading', progress: 42 })]} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
  });

  test('affiche l’erreur d’une ligne', () => {
    render(<GLContentLibraryFileList rows={[makeRow({ status: 'error', error: 'Trop gros' })]} />);
    expect(screen.getByText('Trop gros')).toBeInTheDocument();
  });
});
