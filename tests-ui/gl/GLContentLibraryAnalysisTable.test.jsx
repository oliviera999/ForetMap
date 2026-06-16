import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLContentLibraryAnalysisTable } from '../../src/gl/components/admin/GLContentLibraryAnalysisTable.jsx';

function renderTable(props = {}) {
  return render(
    <GLContentLibraryAnalysisTable
      entries={[]}
      selectedKeys={new Set()}
      busy={false}
      onToggle={vi.fn()}
      onOpenSubTab={vi.fn()}
      {...props}
    />,
  );
}

const mediaEntry = {
  fileName: 'arbre.png',
  kind: 'media',
  kindLabel: 'Média',
  mediaType: 'image',
  size: 2048,
  canApply: true,
  preview: { mediaType: 'image', relativePath: 'gl/arbre.png' },
};

describe('GLContentLibraryAnalysisTable', () => {
  test('ne rend rien sans entrées', () => {
    const { container } = renderTable({ entries: [] });
    expect(container.firstChild).toBeNull();
  });

  test('rend une ligne par entrée avec nom et nature', () => {
    renderTable({ entries: [mediaEntry] });
    expect(screen.getByText('arbre.png')).toBeInTheDocument();
    expect(screen.getByText('Média')).toBeInTheDocument();
    expect(screen.getByText(/image → gl\/arbre\.png/)).toBeInTheDocument();
  });

  test('coche selon selectedKeys', () => {
    renderTable({ entries: [mediaEntry], selectedKeys: new Set(['arbre.png:0']) });
    expect(screen.getByRole('checkbox').checked).toBe(true);
  });

  test('appelle onToggle avec la clé au changement', () => {
    const onToggle = vi.fn();
    renderTable({ entries: [mediaEntry], onToggle });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('arbre.png:0', true);
  });

  test('désactive la case si non applicable, en erreur ou occupé', () => {
    renderTable({ entries: [{ ...mediaEntry, canApply: false }] });
    expect(screen.getByRole('checkbox').disabled).toBe(true);
  });

  test("affiche l'erreur à la place du résumé", () => {
    renderTable({ entries: [{ ...mediaEntry, error: 'Format invalide' }] });
    expect(screen.getByText('Format invalide')).toBeInTheDocument();
  });

  test('liste les avertissements', () => {
    renderTable({ entries: [{ ...mediaEntry, warnings: ['ratio non standard'] }] });
    expect(screen.getByText('ratio non standard')).toBeInTheDocument();
  });

  test('bouton « Ouvrir » présent avec subTab et onOpenSubTab', () => {
    const onOpenSubTab = vi.fn();
    renderTable({ entries: [{ ...mediaEntry, subTab: 'species' }], onOpenSubTab });
    const btn = screen.getByRole('button', { name: /Ouvrir Média/ });
    fireEvent.click(btn);
    expect(onOpenSubTab).toHaveBeenCalledWith('species');
  });

  test('pas de bouton sans onOpenSubTab', () => {
    renderTable({ entries: [{ ...mediaEntry, subTab: 'species' }], onOpenSubTab: undefined });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
