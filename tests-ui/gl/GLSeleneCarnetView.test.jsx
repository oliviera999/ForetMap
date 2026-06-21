import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLSeleneCarnetView } from '../../src/gl/components/GLSeleneCarnetView.jsx';
import { GLLoreGlossaryView } from '../../src/gl/components/GLLoreGlossaryView.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

describe('GLSeleneCarnetView', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockResolvedValue({
      items: [
        {
          feuilletCode: 'test-feui',
          titre: 'Feuillet test',
          displayText: 'Contenu accessible',
          liasse: 'I',
          ordreVoyage: 1,
          ordreLiasse: 1,
          progressStatus: 'discovered',
        },
      ],
    });
  });

  test('affiche le titre Carnet de Sélène', async () => {
    render(<GLSeleneCarnetView gameState={{ game: { id: 1 }, teams: [{ id: 2 }] }} />);
    expect(await screen.findByRole('heading', { name: 'Carnet de Sélène' })).toBeTruthy();
    expect(await screen.findByText('Feuillet test')).toBeTruthy();
  });
});

describe('GLLoreGlossaryView', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockResolvedValue({
      items: [
        {
          lore_code: 'LR0001',
          terme: 'la Trame',
          categorie: 'cosmologie',
          categorie_label: 'Cosmologie',
          definition_courte: 'Définition',
        },
      ],
    });
  });

  test('affiche le lexique du lore', async () => {
    render(<GLLoreGlossaryView onOpenPopover={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Lexique du lore' })).toBeTruthy();
    expect(await screen.findByText('la Trame')).toBeTruthy();
  });
});
