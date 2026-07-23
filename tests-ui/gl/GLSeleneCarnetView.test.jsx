import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  test('affiche le compteur N trouvés / M du chapitre', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      items: [
        { feuilletCode: 'a', titre: 'A', progressStatus: 'discovered', ordreVoyage: 1 },
        { feuilletCode: 'b', titre: 'B', progressStatus: 'locked', ordreVoyage: 2 },
        { feuilletCode: 'c', titre: 'C', progressStatus: 'locked', ordreVoyage: 3 },
      ],
    });
    render(<GLSeleneCarnetView gameState={{ game: { id: 1 }, teams: [{ id: 2 }] }} />);
    expect(await screen.findByText(/du chapitre/)).toHaveTextContent('1 trouvé / 3 du chapitre');
  });

  test('le filtre Verrouillés masque les feuillets trouvés', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      items: [
        { feuilletCode: 'a', titre: 'Trouvé A', progressStatus: 'discovered', ordreVoyage: 1 },
        { feuilletCode: 'b', titre: 'Bloqué B', progressStatus: 'locked', ordreVoyage: 2 },
      ],
    });
    render(<GLSeleneCarnetView gameState={{ game: { id: 1 }, teams: [{ id: 2 }] }} />);
    expect(await screen.findByText('Trouvé A')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Verrouillés' }));
    expect(screen.queryByText('Trouvé A')).not.toBeInTheDocument();
    expect(screen.getByText('Bloqué B')).toBeInTheDocument();
  });

  test('affiche l’état de jeu en français lisible (Trouvé), pas la valeur brute', async () => {
    render(<GLSeleneCarnetView gameState={{ game: { id: 1 }, teams: [{ id: 2 }] }} />);
    expect(await screen.findByText('Feuillet test')).toBeTruthy();
    expect(screen.getByTitle('État de jeu : Trouvé')).toBeInTheDocument();
    expect(screen.queryByText('discovered')).not.toBeInTheDocument();
  });

  test('un feuillet verrouillé ne propose pas le marquage « étudié »', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      items: [
        { feuilletCode: 'lock', titre: 'Verrouillé', progressStatus: 'locked', ordreVoyage: 1 },
      ],
    });
    render(<GLSeleneCarnetView gameState={{ game: { id: 1 }, teams: [{ id: 2 }] }} />);
    await userEvent.click(await screen.findByText('Verrouillé'));
    expect(screen.queryByRole('button', { name: /Marquer comme étudié/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Feuillet non découvert/)).toBeInTheDocument();
  });

  test('le compteur et les filtres sont masqués pour le MJ', async () => {
    render(<GLSeleneCarnetView gameState={{ game: { id: 1 }, teams: [{ id: 2 }] }} isMj />);
    await screen.findByRole('heading', { name: 'Carnet de Sélène' });
    expect(screen.queryByText(/du chapitre/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verrouillés' })).not.toBeInTheDocument();
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
