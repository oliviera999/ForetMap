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

const KEY_OUTCOMES = {
  id: 2,
  slug: 'petites-betes',
  title: 'Petites bêtes',
  is_published: true,
  tool_required: ['boite_loupe'],
  safety_note: 'Relâcher l’animal là où il a été trouvé.',
  couplets: [
    {
      id: 30,
      number: 1,
      leads: [
        {
          id: 301,
          statement: 'Six pattes',
          outcome: 'clade',
          clade_id: 'insectes',
          clade: { id: 'insectes', name: 'Insectes', shared_attribute: 'trois paires de pattes' },
          next_key: { id: 3, slug: 'insectes', title: 'Clé des insectes', is_published: true },
        },
        {
          id: 302,
          statement: 'Huit pattes',
          outcome: 'groupe',
          result_label: 'Araignées du jardin',
          group_plant_ids: [41, 42],
          group_plants: [
            { id: 41, name: 'Épeire diadème', emoji: '🕷️' },
            { id: 42, name: 'Tégénaire', emoji: '🕷️' },
          ],
        },
      ],
    },
  ],
};

describe('IdKeysView — issues groupe, grand groupe et renvoi (migration 366)', () => {
  beforeEach(() => {
    apiMock.mockImplementation(async (url) => {
      if (url.startsWith('/api/id-keys/')) return KEY_OUTCOMES;
      if (url.startsWith('/api/clades')) return { items: [{ id: 'insectes', name: 'Insectes' }] };
      return { items: [{ id: 2, title: 'Petites bêtes', is_published: true }] };
    });
  });

  test('matériel et sécurité affichés avant la première question', async () => {
    render(<IdKeysView initialKey="petites-betes" />);
    await screen.findByRole('heading', { name: /Petites bêtes/ });
    expect(screen.getByText(/Boîte-loupe/)).toBeTruthy();
    expect(screen.getByText(/Relâcher l’animal/)).toBeTruthy();
  });

  test('grand groupe : arrivée avec point commun et renvoi vers une autre clé', async () => {
    render(<IdKeysView initialKey="petites-betes" />);
    await screen.findByRole('heading', { name: /Petites bêtes/ });
    fireEvent.click(screen.getByRole('button', { name: 'Six pattes' }));
    expect(screen.getByText('Grand groupe identifié')).toBeTruthy();
    expect(screen.getByText(/trois paires de pattes/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clé des insectes' }));
    expect(apiMock).toHaveBeenCalledWith('/api/id-keys/insectes');
  });

  test('groupe : chaque espèce candidate ouvre sa fiche', async () => {
    const onOpenPlant = vi.fn();
    render(<IdKeysView initialKey="petites-betes" onOpenPlant={onOpenPlant} />);
    await screen.findByRole('heading', { name: /Petites bêtes/ });
    fireEvent.click(screen.getByRole('button', { name: 'Huit pattes' }));
    expect(screen.getByText('Groupe identifié')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tégénaire/ }));
    expect(onOpenPlant).toHaveBeenCalledWith(42);
  });

  test('éditeur : l’issue de chaque proposition est conservée à l’enregistrement', async () => {
    render(<IdKeysView canManage />);
    fireEvent.click(await screen.findByRole('button', { name: /Éditer/ }));
    await screen.findByDisplayValue('Araignées du jardin');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les propositions' }));
    const call = apiMock.mock.calls.find(
      ([url, method]) => url.endsWith('/leads') && method === 'PUT',
    );
    const [first, second] = call[2].leads;
    expect(first).toMatchObject({
      id: 301,
      outcome: 'clade',
      clade_id: 'insectes',
      next_key_id: 3,
    });
    expect(second).toMatchObject({
      id: 302,
      outcome: 'groupe',
      result_label: 'Araignées du jardin',
      group_plant_ids: [41, 42],
    });
  });
});
