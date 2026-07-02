import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentImportPanel } from '../../../src/components/profiles/StudentImportPanel.jsx';
import { api } from '../../../src/services/api.js';
import { downloadApiFile } from '../../../src/utils/downloadApiFile.js';

vi.mock('../../../src/services/api.js', () => ({
  api: vi.fn(async () => ({})),
  API: '',
  getAuthToken: () => null,
}));

vi.mock('../../../src/utils/downloadApiFile.js', () => ({
  downloadApiFile: vi.fn(async () => {}),
}));

const ROLE_TERMS = { studentSingular: 'n3beur', studentPlural: 'n3beurs' };

function renderPanel(overrides = {}) {
  const callbacks = {
    setErr: vi.fn(),
    setMsg: vi.fn(),
    onImported: vi.fn(async () => {}),
  };
  const props = {
    roleTerms: ROLE_TERMS,
    canImport: true,
    ...callbacks,
    ...overrides,
  };
  render(<StudentImportPanel {...props} />);
  return { ...callbacks, ...props };
}

function pickFile() {
  const file = new File(['prenom;nom\nLéa;Martin'], 'classe.csv', { type: 'text/csv' });
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('StudentImportPanel', () => {
  beforeEach(() => {
    api.mockClear();
    api.mockResolvedValue({});
    downloadApiFile.mockClear();
  });

  test('affiche le titre avec le pluriel de rôle et les boutons modèles', () => {
    renderPanel();
    expect(screen.getByText('Import n3beurs (CSV / XLSX)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '📄 Modèle CSV' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '📗 Modèle XLSX' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importer' })).toBeTruthy();
  });

  test('le bouton Modèle CSV télécharge le modèle CSV', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '📄 Modèle CSV' }));
    await waitFor(() =>
      expect(downloadApiFile).toHaveBeenCalledWith(
        '/api/students/import/template?format=csv',
        'foretmap-modele-n3beurs.csv',
      ),
    );
  });

  test('le bouton Modèle XLSX télécharge le modèle XLSX', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '📗 Modèle XLSX' }));
    await waitFor(() =>
      expect(downloadApiFile).toHaveBeenCalledWith(
        '/api/students/import/template?format=xlsx',
        'foretmap-modele-n3beurs.xlsx',
      ),
    );
  });

  test('« Importer » sans fichier : erreur d’aide, aucun appel API', () => {
    const { setErr, onImported } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    expect(setErr).toHaveBeenCalledWith('Choisissez un fichier CSV ou XLSX');
    expect(api).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  test('fichier choisi : nom affiché, puis import réel → POST + message + onImported', async () => {
    api.mockResolvedValue({ report: { totals: { created: 3 } } });
    const { setMsg, onImported } = renderPanel();
    pickFile();
    expect(screen.getByText('classe.csv')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const [path, method, body] = api.mock.calls[0];
    expect(path).toBe('/api/students/import');
    expect(method).toBe('POST');
    expect(body.fileName).toBe('classe.csv');
    expect(body.dryRun).toBe(false);
    expect(String(body.fileDataBase64)).toContain('base64');
    await waitFor(() => expect(setMsg).toHaveBeenCalledWith('3 n3beur(s) créé(s)'));
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  test('simulation : dryRun envoyé, message « Simulation terminée », rapport affiché', async () => {
    api.mockResolvedValue({
      report: {
        totals: { received: 5, valid: 4, created: 0, skipped_existing: 1, skipped_invalid: 1 },
        errors: [{ row: 2, field: 'email', error: 'invalide' }],
      },
    });
    const { setMsg } = renderPanel();
    pickFile();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0][2].dryRun).toBe(true);
    await waitFor(() => expect(setMsg).toHaveBeenCalledWith('Simulation terminée'));
    expect(screen.getByText(/Ligne 2 \(email\): invalide/)).toBeTruthy();
  });

  test('échec API : setErr « Erreur import: … », pas de onImported', async () => {
    api.mockRejectedValue(new Error('fichier illisible'));
    const { setErr, onImported } = renderPanel();
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(setErr).toHaveBeenCalledWith('Erreur import: fichier illisible'));
    expect(onImported).not.toHaveBeenCalled();
  });

  test('pendant l’import : libellé « Import… » et bouton désactivé', async () => {
    let resolveApi;
    api.mockImplementation(() => new Promise((resolve) => (resolveApi = resolve)));
    renderPanel();
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    expect(screen.getByRole('button', { name: 'Import…' }).disabled).toBe(true);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    resolveApi({ report: null });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importer' })).toBeTruthy());
  });

  test('sans permission : bouton Importer désactivé', () => {
    renderPanel({ canImport: false });
    expect(screen.getByRole('button', { name: 'Importer' }).disabled).toBe(true);
  });
});
