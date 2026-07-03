import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ImportPanel,
  ImportReportErrors,
  SPREADSHEET_IMPORT_ACCEPT,
} from '../../src/shared/components/ImportPanel.jsx';

function pickFile(name = 'import.csv') {
  const file = new File(['a;b'], name, { type: 'text/csv' });
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('ImportPanel (flux standard)', () => {
  function renderPanel(overrides = {}) {
    const onImport = vi.fn(async () => {});
    const onMissingFile = vi.fn();
    render(
      <ImportPanel
        title="Import test"
        templateButtons={[{ label: '📄 Modèle CSV', onClick: vi.fn() }]}
        selectedFileStyle={{ margin: 0 }}
        reportBoxStyle={{ padding: 10 }}
        totalsRenderer={(report) => <>Reçues: {report?.totals?.received || 0}</>}
        errorsMoreLabel={(n) => `... ${n} de plus`}
        onMissingFile={onMissingFile}
        onImport={onImport}
        {...overrides}
      />,
    );
    return { onImport, onMissingFile };
  }

  test('rend le panneau repliable, le modèle, la simulation et le bouton Importer', () => {
    renderPanel();
    expect(screen.getByText('Import test')).toBeTruthy();
    expect(screen.getByRole('button', { name: '📄 Modèle CSV' })).toBeTruthy();
    expect(screen.getByText('Simulation (sans création)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importer' })).toBeTruthy();
    expect(document.querySelector('input[type="file"]').getAttribute('accept')).toBe(
      SPREADSHEET_IMPORT_ACCEPT,
    );
  });

  test('Importer sans fichier : onMissingFile, pas de onImport', () => {
    const { onImport, onMissingFile } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    expect(onMissingFile).toHaveBeenCalledTimes(1);
    expect(onImport).not.toHaveBeenCalled();
  });

  test('fichier + simulation : nom affiché, onImport reçoit file/dryRun/setReport', async () => {
    const { onImport } = renderPanel();
    pickFile('classe.csv');
    expect(screen.getByText('classe.csv')).toBeTruthy();
    fireEvent.click(screen.getByText('Simulation (sans création)'));
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const arg = onImport.mock.calls[0][0];
    expect(arg.file.name).toBe('classe.csv');
    expect(arg.dryRun).toBe(true);
    expect(typeof arg.setReport).toBe('function');
  });

  test('rapport : totaux via totalsRenderer + erreurs tronquées', async () => {
    const report = {
      totals: { received: 4 },
      errors: [
        { row: 2, field: 'titre', error: 'requis' },
        { row: 3, field: 'titre', error: 'requis' },
      ],
    };
    // La mock passée en override est celle réellement branchée sur le panneau
    // (celle retournée par renderPanel est la valeur par défaut, remplacée ici).
    const onImport = vi.fn(async ({ setReport }) => setReport(report));
    renderPanel({ errorLimit: 1, onImport });
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(screen.getByText('Reçues: 4')).toBeTruthy());
    expect(screen.getByText('Ligne 2 (titre): requis')).toBeTruthy();
    expect(screen.queryByText('Ligne 3 (titre): requis')).toBeNull();
    expect(screen.getByText('... 1 de plus')).toBeTruthy();
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  test('pendant l’import : libellé occupé et bouton désactivé, modèles selon l’option', async () => {
    let resolveImport;
    renderPanel({
      importBusyLabel: 'Import…',
      templatesDisabledWhenBusy: true,
      onImport: vi.fn(() => new Promise((resolve) => (resolveImport = resolve))),
    });
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    const busyBtn = await screen.findByRole('button', { name: 'Import…' });
    expect(busyBtn.disabled).toBe(true);
    expect(screen.getByRole('button', { name: '📄 Modèle CSV' }).disabled).toBe(true);
    resolveImport();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importer' })).toBeTruthy());
    expect(screen.getByRole('button', { name: '📄 Modèle CSV' }).disabled).toBe(false);
  });

  test('importDisabled désactive le bouton Importer', () => {
    renderPanel({ importDisabled: true });
    expect(screen.getByRole('button', { name: 'Importer' }).disabled).toBe(true);
  });

  test('variante card : conteneur + titre h3 + intro', () => {
    renderPanel({
      variant: 'card',
      title: 'Import n3beurs',
      titleStyle: { margin: 0 },
      intro: <p>Téléchargez un modèle.</p>,
    });
    expect(screen.getByRole('heading', { level: 3, name: 'Import n3beurs' })).toBeTruthy();
    expect(screen.getByText('Téléchargez un modèle.')).toBeTruthy();
    expect(document.querySelector('details')).toBeNull();
  });
});

describe('ImportPanel (slot body)', () => {
  test('rend le conteneur et délègue le corps avec l’état partagé', () => {
    render(
      <ImportPanel
        title="Import biodiversité"
        body={({ file, importing, report }) => (
          <p>
            corps custom — fichier: {String(file)}, occupé: {String(importing)}, rapport:{' '}
            {String(report)}
          </p>
        )}
      />,
    );
    expect(screen.getByText('Import biodiversité')).toBeTruthy();
    expect(
      screen.getByText('corps custom — fichier: null, occupé: false, rapport: null'),
    ).toBeTruthy();
    expect(screen.queryByText('Simulation (sans création)')).toBeNull();
  });
});

describe('ImportReportErrors', () => {
  test('rien si pas d’erreurs', () => {
    const { container } = render(<ImportReportErrors errors={[]} moreLabel={() => ''} />);
    expect(container.firstChild).toBeNull();
  });
});
