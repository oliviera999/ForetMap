import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { IdKeysView } = await import('../../../src/components/pedago/IdKeysView.jsx');

const KEY = {
  id: 1,
  slug: 'arbres',
  title: 'Arbres',
  is_published: true,
  couplets: [
    {
      id: 10,
      number: 1,
      leads: [
        { id: 101, statement: 'Feuilles opposées', next_couplet_id: 20, plant_id: null },
        {
          id: 102,
          statement: 'Feuilles alternes',
          next_couplet_id: null,
          plant_id: 5,
          plant_name: 'Chêne',
          plant_emoji: '🌳',
        },
        { id: 103, statement: 'Proposition en chantier', next_couplet_id: null, plant_id: null },
      ],
    },
    {
      id: 20,
      number: 2,
      leads: [
        {
          id: 201,
          statement: 'Écorce lisse',
          next_couplet_id: null,
          plant_id: 7,
          plant_name: 'Hêtre',
        },
        {
          id: 202,
          statement: 'Écorce crevassée',
          next_couplet_id: null,
          plant_id: 8,
          plant_name: 'Frêne',
        },
      ],
    },
  ],
};

beforeEach(() => {
  apiMock.mockReset();
  window.localStorage.clear();
  apiMock.mockImplementation(async (url) => {
    if (url.startsWith('/api/id-keys/')) return KEY;
    return { items: [{ id: 1, title: 'Arbres', is_published: true }] };
  });
});

async function openReader(props = {}) {
  render(<IdKeysView initialKey="arbres" {...props} />);
  await screen.findByRole('heading', { name: /Arbres/ });
}

describe('IdKeysView — lecteur (audit 29/09, K11/K12/K7)', () => {
  test('K11 : le chemin parcouru est récapitulé, y compris à l’arrivée, avec retour d’un cran', async () => {
    await openReader();
    fireEvent.click(screen.getByRole('button', { name: 'Feuilles opposées' }));
    expect(screen.getByText('Chemin parcouru :')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Écorce lisse' }));
    expect(screen.getByText('Espèce identifiée')).toBeTruthy();
    const recap = screen.getByText('Caractères observés :').parentElement;
    expect(recap.textContent).toContain('Feuilles opposées');
    expect(recap.textContent).toContain('Écorce lisse');
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByRole('button', { name: 'Écorce crevassée' })).toBeTruthy();
  });

  test('K12 : une proposition sans suite ni espèce est désactivée', async () => {
    await openReader();
    const btn = screen.getByRole('button', { name: /Proposition en chantier/ });
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('(à compléter)');
  });

  test('K7 : en Schéma, un élève ne voit pas les espèces ; un gestionnaire peut les montrer', async () => {
    await openReader();
    fireEvent.click(screen.getByRole('button', { name: 'Schéma' }));
    expect(document.querySelector('.id-key-schema__node--hidden')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Montrer toutes les espèces' })).toBeNull();
  });

  test('K7 : le gestionnaire bascule l’affichage des espèces', async () => {
    await openReader({ canManage: true });
    fireEvent.click(screen.getByRole('button', { name: 'Schéma' }));
    fireEvent.click(screen.getByRole('button', { name: 'Montrer toutes les espèces' }));
    expect(document.querySelector('.id-key-schema__node--hidden')).toBeNull();
    expect(document.querySelector('.id-key-schema').textContent).toContain('Chêne');
  });
});
