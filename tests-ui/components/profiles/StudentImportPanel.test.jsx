import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StudentImportPanel } from '../../../src/components/profiles/StudentImportPanel.jsx';

const ROLE_TERMS = { studentSingular: 'n3beur', studentPlural: 'n3beurs' };

function renderPanel(overrides = {}) {
  const setters = {
    setImportFile: vi.fn(),
    setImportReport: vi.fn(),
    setDryRunImport: vi.fn(),
  };
  const handlers = {
    downloadStudentsTemplate: vi.fn(),
    importStudents: vi.fn(),
  };
  const props = {
    roleTerms: ROLE_TERMS,
    canImport: true,
    importFile: null,
    importLoading: false,
    importReport: null,
    dryRunImport: false,
    ...setters,
    ...handlers,
    ...overrides,
  };
  render(<StudentImportPanel {...props} />);
  return { ...setters, ...handlers };
}

describe('StudentImportPanel', () => {
  test('affiche le titre avec le pluriel de rôle et les boutons modèles', () => {
    renderPanel();
    expect(screen.getByText('Import n3beurs (CSV / XLSX)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '📄 Modèle CSV' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '📗 Modèle XLSX' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importer' })).toBeTruthy();
  });

  test('le bouton Modèle CSV appelle downloadStudentsTemplate("csv")', () => {
    const { downloadStudentsTemplate } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '📄 Modèle CSV' }));
    expect(downloadStudentsTemplate).toHaveBeenCalledWith('csv');
  });

  test('le bouton Modèle XLSX appelle downloadStudentsTemplate("xlsx")', () => {
    const { downloadStudentsTemplate } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '📗 Modèle XLSX' }));
    expect(downloadStudentsTemplate).toHaveBeenCalledWith('xlsx');
  });

  test('le bouton Importer appelle importStudents', () => {
    const { importStudents } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    expect(importStudents).toHaveBeenCalledTimes(1);
  });

  test('la case Simulation appelle setDryRunImport', () => {
    const { setDryRunImport } = renderPanel();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(setDryRunImport).toHaveBeenCalledWith(true);
  });

  test('sans permission ou en cours : bouton Importer désactivé', () => {
    renderPanel({ canImport: false });
    expect(screen.getByRole('button', { name: 'Importer' }).disabled).toBe(true);
  });

  test('pendant l’import : libellé « Import… » et bouton désactivé', () => {
    renderPanel({ importLoading: true });
    expect(screen.getByRole('button', { name: 'Import…' }).disabled).toBe(true);
  });

  test('le nom du fichier sélectionné est affiché', () => {
    renderPanel({ importFile: { name: 'classe.csv' } });
    expect(screen.getByText('classe.csv')).toBeTruthy();
  });

  test('le rapport d’import affiche les totaux et les erreurs', () => {
    renderPanel({
      importReport: {
        totals: { received: 5, valid: 4, created: 3, skipped_existing: 1, skipped_invalid: 1 },
        errors: [{ row: 2, field: 'email', error: 'invalide' }],
      },
    });
    expect(screen.getByText(/Ligne 2 \(email\): invalide/)).toBeTruthy();
  });
});
