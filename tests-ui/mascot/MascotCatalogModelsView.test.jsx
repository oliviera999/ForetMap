import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Onglet « Mascottes livrées » du studio.
 *
 * Le cas qui compte est le dernier : **cocher/décocher ne doit jamais effacer les packs publiés**
 * du sélecteur. Quand aucune restriction n'est posée, `toggleProposedMascotId` construit la
 * première liste d'autorisation à partir du registre qu'on lui donne ; le limiter aux modèles
 * catalogue affichés ici retirerait en silence tous les packs serveur.
 */

const apiMock = vi.fn();
const downloadMock = vi.fn();

vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
}));
vi.mock('../../src/utils/downloadApiFile.js', () => ({
  downloadApiFile: (...args) => downloadMock(...args),
}));
// Le rendu réel charge les moteurs d'animation : hors sujet ici, et coûteux.
vi.mock('../../src/components/VisitMapMascotRenderer.jsx', () => ({
  default: ({ mascotId }) => <div data-testid={`vignette-${mascotId}`} />,
}));

const MODELS = [
  { catalog_id: 'olu-spritesheet', label: 'OLU', frame_count: 88, has_real_animation: true },
  { catalog_id: 'sprout-rive', label: 'SPR0UT', frame_count: 1, has_real_animation: false },
];

/** Registre complet servi par `GET /api/visit/mascots` : catalogue **et** pack publié. */
const REGISTRY = {
  mascots: [{ id: 'olu-spritesheet' }, { id: 'sprout-rive' }, { id: 'srv-un-pack-publie' }],
};

function mockApi({ canManageVisibility = true, allowedIds = '' } = {}) {
  apiMock.mockImplementation((path, method) => {
    if (path === '/api/visit/mascot-catalog/models') {
      return Promise.resolve({ models: MODELS, can_manage_visibility: canManageVisibility });
    }
    if (path === '/api/settings/public') {
      return Promise.resolve({ visit: { mascot: { allowed_ids: allowedIds } } });
    }
    if (path === '/api/visit/mascots') return Promise.resolve(REGISTRY);
    if (method === 'PUT') return Promise.resolve({ ok: true });
    return Promise.resolve({});
  });
}

async function renderView(props = {}) {
  const { default: MascotCatalogModelsView } =
    await import('../../src/components/mascot/MascotCatalogModelsView.jsx');
  const utils = render(<MascotCatalogModelsView {...props} />);
  await waitFor(() => expect(screen.getByText('OLU')).toBeTruthy());
  return utils;
}

describe('MascotCatalogModelsView', () => {
  beforeEach(() => {
    apiMock.mockReset();
    downloadMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('distingue un modèle animé d’un figurant', async () => {
    mockApi();
    await renderView();
    expect(screen.getByText('88 trames')).toBeTruthy();
    expect(screen.getByText(/silhouette seule/i)).toBeTruthy();
  });

  it('exporte un modèle sans passer par un clone', async () => {
    mockApi();
    await renderView();
    const ligneOlu = screen.getByText('OLU').closest('li');
    await userEvent.click(within(ligneOlu).getByRole('button', { name: /Exporter ZIP/i }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    expect(downloadMock.mock.calls[0][0]).toContain(
      '/api/visit/mascot-catalog/olu-spritesheet/export.zip',
    );
  });

  it('désactive la case de visibilité sans la permission, et l’explique', async () => {
    mockApi({ canManageVisibility: false });
    await renderView();
    for (const c of screen.getAllByRole('checkbox')) expect(c.disabled).toBe(true);
    expect(screen.getByText(/réglage d’administration/i)).toBeTruthy();
  });

  it('n’efface pas les packs publiés en posant la première restriction', async () => {
    // Aucune restriction au départ : décocher SPR0UT doit produire une liste qui contient
    // **toujours** le pack serveur, sinon il disparaîtrait du sélecteur des visiteurs.
    mockApi({ allowedIds: '' });
    await renderView();
    const ligneSprout = screen.getByText('SPR0UT').closest('li');
    await userEvent.click(within(ligneSprout).getByRole('checkbox'));

    await waitFor(() => {
      const put = apiMock.mock.calls.find(([, method]) => method === 'PUT');
      expect(put).toBeTruthy();
    });
    const [, , body] = apiMock.mock.calls.find(([, method]) => method === 'PUT');
    const envoyes = String(body.value).split(',').filter(Boolean);
    expect(envoyes).toContain('srv-un-pack-publie');
    expect(envoyes).toContain('olu-spritesheet');
    expect(envoyes).not.toContain('sprout-rive');
  });
});
