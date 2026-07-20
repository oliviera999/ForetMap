import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLLoreFeuilletsImportPanel } from '../../src/gl/components/admin/GLLoreFeuilletsImportPanel.jsx';

const downloadGlFileMock = vi.fn();
vi.mock('../../src/gl/utils/downloadGlFile.js', () => ({
  downloadGlFile: (...args) => downloadGlFileMock(...args),
}));
vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: vi.fn() }));

describe('GLLoreFeuilletsImportPanel — export/modèle XLSX', () => {
  beforeEach(() => {
    downloadGlFileMock.mockReset();
  });

  test('appelle downloadGlFile avec le bon chemin pour le modèle et l’export', async () => {
    downloadGlFileMock.mockResolvedValue(undefined);
    render(<GLLoreFeuilletsImportPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Modèle XLSX/i }));
    await waitFor(() =>
      expect(downloadGlFileMock).toHaveBeenCalledWith(
        '/api/gl/lore/admin/feuillets/import/template',
        'modele-feuillets-selene.xlsx',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Exporter le catalogue/i }));
    await waitFor(() =>
      expect(downloadGlFileMock).toHaveBeenCalledWith(
        '/api/gl/lore/admin/feuillets/export',
        'export-feuillets-selene.xlsx',
      ),
    );
  });

  test('affiche l’erreur de téléchargement (échec mobile visible, plus silencieux)', async () => {
    downloadGlFileMock.mockRejectedValue(new Error('Fichier reçu vide.'));
    render(<GLLoreFeuilletsImportPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Exporter le catalogue/i }));

    expect(await screen.findByText('Fichier reçu vide.')).toBeInTheDocument();
  });
});
