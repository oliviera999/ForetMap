import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLContentLibraryAuditPanel } from '../../src/gl/components/admin/GLContentLibraryAuditPanel.jsx';

function renderPanel(props = {}) {
  return render(
    <GLContentLibraryAuditPanel report={null} busy={false} onRun={vi.fn()} {...props} />,
  );
}

describe('GLContentLibraryAuditPanel', () => {
  test('affiche le bouton de lancement et aucun rapport par défaut', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Lancer l’audit' })).toBeInTheDocument();
    expect(screen.queryByText(/clé\(s\) en médiathèque/)).not.toBeInTheDocument();
  });

  test("désactive le bouton et change le libellé en cours d'audit", () => {
    renderPanel({ busy: true });
    const btn = screen.getByRole('button', { name: 'Audit en cours…' });
    expect(btn.disabled).toBe(true);
  });

  test('appelle onRun au clic', () => {
    const onRun = vi.fn();
    renderPanel({ onRun });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’audit' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  test('rend le récapitulatif et les états « tout va bien »', () => {
    renderPanel({ report: { keyCount: 12, ok: [], unwired: [] } });
    expect(screen.getByText(/12 clé\(s\) en médiathèque/)).toBeInTheDocument();
    expect(screen.getByText('Aucune clé récit suspecte.')).toBeInTheDocument();
    expect(screen.getByText('Toutes les ressources requises sont présentes.')).toBeInTheDocument();
  });

  test('liste les clés récit suspectes', () => {
    renderPanel({ report: { keyCount: 3, suspectRecitKeys: ['recit_xx', 'recit_yy'] } });
    expect(screen.getByText(/2 clé\(s\) récit suspecte\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('recit_xx')).toBeInTheDocument();
    expect(screen.getByText('recit_yy')).toBeInTheDocument();
  });

  test('liste les ressources manquantes', () => {
    renderPanel({
      report: { keyCount: 1, missing: [{ category: 'biome', ref: 'foret', slug: 'biome_foret' }] },
    });
    expect(screen.getByText(/1 ressource\(s\) requise\(s\) manquante\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('biome_foret')).toBeInTheDocument();
  });

  test('résume les scènes de récit branchées', () => {
    renderPanel({
      report: {
        keyCount: 2,
        ok: [
          { category: 'chapitre-recit', ref: 'ch1' },
          { category: 'chapitre-recit', ref: 'ch2' },
        ],
      },
    });
    expect(screen.getByText(/Scènes de récit branchées/)).toBeInTheDocument();
    expect(screen.getByText(/ch1, ch2/)).toBeInTheDocument();
  });
});
