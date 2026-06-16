import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('../../../src/utils/fileToDataUrl.js', () => ({
  fileToDataUrl: vi.fn(async () => 'data:text/csv;base64,QQ=='),
}));

import { PlantImportPanel } from '../../../src/components/biodiv/PlantImportPanel.jsx';

function setup(overrides = {}) {
  const props = {
    setToast: vi.fn(),
    onRefresh: vi.fn(async () => {}),
    ...overrides,
  };
  render(<PlantImportPanel {...props} />);
  return props;
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

describe('PlantImportPanel', () => {
  test('rend le panneau repliable avec sources, stratégies et boutons', () => {
    setup();
    expect(screen.getByText('Import biodiversité (CSV, Excel, Google Sheet)')).toBeInTheDocument();
    expect(screen.getByText('Fichier CSV/XLSX')).toBeInTheDocument();
    expect(screen.getByText('Remplacer entièrement le catalogue')).toBeInTheDocument();
    expect(screen.getByText('Télécharger template vierge')).toBeInTheDocument();
    expect(screen.getByText("Lancer l'import")).toBeInTheDocument();
  });

  test('source fichier sans fichier choisi → toast de garde, aucun appel serveur', () => {
    const { setToast } = setup();
    fireEvent.click(screen.getByText('Analyser (prévisualisation)'));
    expect(setToast).toHaveBeenCalledWith('Choisis un fichier CSV/XLSX.');
    expect(api).not.toHaveBeenCalled();
  });

  test('source Google Sheet sans URL → toast de garde dédié', () => {
    const { setToast } = setup();
    const [sourceSelect] = screen.getAllByRole('combobox');
    fireEvent.change(sourceSelect, { target: { value: 'gsheet' } });
    expect(
      screen.getByPlaceholderText('https://docs.google.com/spreadsheets/d/.../edit#gid=0'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Lancer l'import"));
    expect(setToast).toHaveBeenCalledWith('Saisis une URL Google Sheet.');
    expect(api).not.toHaveBeenCalled();
  });

  test('replace_all non confirmé → import réel bloqué, mais analyse permise', async () => {
    api.mockResolvedValue({ report: { totals: {} } });
    const { setToast } = setup();
    const [sourceSelect, strategySelect] = screen.getAllByRole('combobox');
    fireEvent.change(sourceSelect, { target: { value: 'gsheet' } });
    fireEvent.change(strategySelect, { target: { value: 'replace_all' } });
    fireEvent.change(
      screen.getByPlaceholderText('https://docs.google.com/spreadsheets/d/.../edit#gid=0'),
      { target: { value: 'https://docs.google.com/spreadsheets/d/abc/edit' } },
    );
    expect(
      screen.getByText('Je confirme le remplacement complet de la base biodiversité.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Lancer l'import"));
    expect(setToast).toHaveBeenCalledWith('Confirme le remplacement complet avant import.');
    expect(api).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Analyser (prévisualisation)'));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/plants/import', 'POST', {
        sourceType: 'gsheet',
        strategy: 'replace_all',
        dryRun: true,
        gsheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
      });
    });
  });

  test('import fichier réel → POST avec fileDataBase64, onRefresh puis toast et rapport affiché', async () => {
    api.mockResolvedValue({
      report: {
        totals: {
          received: 3,
          valid: 3,
          created: 2,
          updated: 1,
          skipped_existing: 0,
          skipped_invalid: 0,
        },
      },
    });
    const { setToast, onRefresh } = setup();
    const fileInput = document.querySelector('input[type=file]');
    fireEvent.change(fileInput, {
      target: { files: [new File(['a,b'], 'plantes.csv', { type: 'text/csv' })] },
    });
    await screen.findByText('plantes.csv');

    fireEvent.click(screen.getByText("Lancer l'import"));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/plants/import', 'POST', {
        sourceType: 'file',
        strategy: 'upsert_name',
        dryRun: false,
        fileName: 'plantes.csv',
        fileDataBase64: 'data:text/csv;base64,QQ==',
      });
    });
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('Import biodiversité terminé ✓'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Rapport d'import")).toBeInTheDocument();
    expect(screen.getByText(/Créées: 2/)).toBeInTheDocument();
  });

  test("erreur serveur → toast d'erreur, pas de rafraîchissement", async () => {
    api.mockRejectedValue(new Error('boom'));
    const { setToast, onRefresh } = setup();
    const fileInput = document.querySelector('input[type=file]');
    fireEvent.change(fileInput, {
      target: { files: [new File(['a'], 'p.csv', { type: 'text/csv' })] },
    });
    await screen.findByText('p.csv');
    fireEvent.click(screen.getByText("Lancer l'import"));
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('Erreur import : boom'));
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
