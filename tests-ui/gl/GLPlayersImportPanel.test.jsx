import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLPlayersImportPanel } from '../../src/gl/components/admin/GLPlayersImportPanel.jsx';
import {
  buildCredentialsCsv,
  credentialStatusLabel,
  countDistributablePasswords,
} from '../../src/gl/utils/glPlayerCredentials.js';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: (...args) => apiGLMock(...args) }));
vi.mock('../../src/gl/utils/downloadGlFile.js', () => ({ downloadGlFile: vi.fn() }));

describe('glPlayerCredentials — mise en forme des identifiants restitués', () => {
  test('libellés de statut et CSV à distribuer', () => {
    const rows = [
      {
        pseudo: 'aurore',
        firstName: 'Aurore',
        lastName: 'Dupont',
        className: '6e A',
        password: 'abc',
        generated: true,
      },
      {
        pseudo: 'lea',
        firstName: 'Léa',
        lastName: 'Martin',
        className: '6e A',
        password: 'x"y',
        generated: false,
      },
      {
        pseudo: 'noe',
        firstName: 'Noé',
        lastName: 'Durand',
        className: '6e A',
        password: null,
        reusedExisting: true,
      },
    ];
    expect(credentialStatusLabel(rows[0])).toBe('Mot de passe généré');
    expect(credentialStatusLabel(rows[1])).toBe('Mot de passe du fichier');
    expect(credentialStatusLabel(rows[2])).toMatch(/existant/);
    expect(countDistributablePasswords(rows)).toBe(2);
    const csv = buildCredentialsCsv(rows);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Aurore";"Dupont";"6e A";"aurore";"abc";"Mot de passe généré"');
    expect(csv).toContain('"x""y"');
  });
});

describe('GLPlayersImportPanel — identifiants affichés une seule fois', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
  });

  test('après un import réel, le rapport liste pseudo + mot de passe des comptes créés', async () => {
    apiGLMock.mockResolvedValue({
      report: {
        totals: { received: 2, valid: 2, created: 2, skipped_invalid: 0, reused_existing: 1 },
        errors: [],
        credentials: [
          {
            row: 2,
            pseudo: 'aurore',
            firstName: 'Aurore',
            lastName: 'Dupont',
            className: '6e A',
            password: 'k7mnp2q4rs',
            generated: true,
          },
          {
            row: 3,
            pseudo: 'lea',
            firstName: 'Léa',
            lastName: 'Martin',
            className: '6e A',
            password: null,
            reusedExisting: true,
          },
        ],
      },
    });
    const onReload = vi.fn();
    render(<GLPlayersImportPanel onReload={onReload} />);

    const file = new File(['Prénom;Nom'], 'joueurs.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(screen.getByDisplayValue('Simulation (dry-run)'), {
      target: { value: 'apply' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lancer l’import/i }));

    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    expect(await screen.findByText('k7mnp2q4rs')).toBeInTheDocument();
    expect(screen.getByText('aurore')).toBeInTheDocument();
    expect(screen.getByText(/Comptes ForetMap existants rapprochés/i)).toBeInTheDocument();
    expect(screen.getByText(/existant \(mot de passe conservé\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Télécharger \(CSV\)/i })).toBeInTheDocument();
    expect(onReload).toHaveBeenCalled();
  });
});
