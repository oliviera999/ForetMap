import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskImportPanel } from '../../src/components/tasks/TaskImportPanel.jsx';
import { api } from '../../src/services/api.js';

vi.mock('../../src/services/api.js', () => ({
  api: vi.fn(async () => ({})),
  API: '',
  getAuthToken: () => null,
}));

function renderPanel() {
  const setToast = vi.fn();
  const onRefresh = vi.fn(async () => {});
  render(<TaskImportPanel setToast={setToast} onRefresh={onRefresh} />);
  return { setToast, onRefresh };
}

function pickFile() {
  const file = new File(['type;titre\ntask;Arroser'], 'import.csv', { type: 'text/csv' });
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('TaskImportPanel', () => {
  beforeEach(() => {
    api.mockClear();
    api.mockResolvedValue({});
  });

  test('affiche le panneau repliable et les boutons de modèles', () => {
    renderPanel();
    expect(screen.getByText('Import tâches/projets (CSV / XLSX)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '📄 Modèle CSV' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '📗 Modèle XLSX' })).toBeTruthy();
  });

  test('« Importer » sans fichier : toast d’aide, aucun appel API', () => {
    const { setToast } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    expect(setToast).toHaveBeenCalledWith('Choisis d’abord un fichier CSV ou XLSX, stp.');
    expect(api).not.toHaveBeenCalled();
  });

  test('fichier choisi : nom affiché, puis import réel → POST + toast + onRefresh', async () => {
    api.mockResolvedValue({ report: { totals: { created_projects: 2, created_tasks: 5 } } });
    const { setToast, onRefresh } = renderPanel();
    pickFile();
    expect(screen.getByText('import.csv')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const [path, method, body] = api.mock.calls[0];
    expect(path).toBe('/api/tasks/import');
    expect(method).toBe('POST');
    expect(body.fileName).toBe('import.csv');
    expect(body.dryRun).toBe(false);
    expect(String(body.fileDataBase64)).toContain('base64');
    await waitFor(() =>
      expect(setToast).toHaveBeenCalledWith(
        'Import OK : 2 projet(s), 5 tâche(s) — la forêt grossit !',
      ),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  test('simulation : dryRun envoyé, rapport affiché, pas de onRefresh', async () => {
    api.mockResolvedValue({
      report: {
        totals: {
          received: 3,
          valid: 2,
          created_projects: 0,
          created_tasks: 0,
          skipped_existing: 1,
          skipped_invalid: 1,
        },
        errors: [{ row: 3, field: 'titre', error: 'requis' }],
      },
    });
    const { setToast, onRefresh } = renderPanel();
    pickFile();
    fireEvent.click(screen.getByText('Simulation (sans création)'));
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0][2].dryRun).toBe(true);
    await waitFor(() =>
      expect(setToast).toHaveBeenCalledWith(
        'Simulation terminée — regarde le rapport ci-dessous ✓',
      ),
    );
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByText('Ligne 3 (titre): requis')).toBeTruthy();
  });

  test('échec API : toast « Import bloqué », pas de onRefresh', async () => {
    api.mockRejectedValue(new Error('fichier illisible'));
    const { setToast, onRefresh } = renderPanel();
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('Import bloqué : fichier illisible'));
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
