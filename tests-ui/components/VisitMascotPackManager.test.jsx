import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * Montage de `VisitMascotPackManager` (studio des mascottes de la visite, ≈ 1 180 lignes) —
 * piste B, étape B7 de l'audit du 25/09/2026 : le composant racine du studio n'avait aucun
 * test. Patron `tests-ui/AppShellWiring.test.jsx` : le VRAI composant est monté, seul le
 * transport HTTP est simulé (et le téléchargement de fichier). On vérifie qu'il rend sans
 * lever, qu'il charge la liste, qu'une sélection ouvre l'éditeur et charge les images, et que
 * les erreurs de chargement et de session sont remontées.
 */

const PACK_ID = '00000000-0000-4000-8000-0000000000a1';
const SECOND_ID = '00000000-0000-4000-8000-0000000000b2';

const PACK_DETAIL = {
  mascotPackVersion: 2,
  id: `srv-${PACK_ID}`,
  label: 'Renard du verger',
  renderer: 'sprite_cut',
  fallbackSilhouette: 'fox',
  framesBase: `/api/visit/mascot-packs/${PACK_ID}/assets/`,
  stateFrames: {
    idle: { files: ['idle-1.png'], fps: 4 },
  },
};

const LIST = {
  packs: [
    {
      id: PACK_ID,
      catalog_id: `srv-${PACK_ID}`,
      label: 'Renard du verger',
      is_published: true,
      origin: 'custom',
      pack_summary: { renderer: 'sprite_cut', mascotPackVersion: 2, stateCount: 1 },
    },
    {
      id: SECOND_ID,
      catalog_id: 'gnome1',
      label: 'Gnome livré',
      is_published: false,
      origin: 'builtin',
      pack_summary: { renderer: 'sprite_cut', mascotPackVersion: 2, stateCount: 1 },
    },
  ],
  allowed_catalog_ids: ['renard2', 'gnome1'],
};

const apiMock = vi.fn();

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: (...args) => apiMock(...args),
}));

vi.mock('../../src/utils/downloadApiFile.js', () => ({ downloadApiFile: vi.fn() }));

const { AccountDeletedError } = await import('../../src/services/api');
const { default: VisitMascotPackManager } =
  await import('../../src/components/VisitMascotPackManager.jsx');

function defaultApi(path) {
  const p = String(path);
  if (p === '/api/visit/mascot-packs') return Promise.resolve(LIST);
  if (p === '/api/visit/mascot-catalog/models') {
    return Promise.resolve({
      models: [
        { catalog_id: 'renard2', label: 'Renard', has_real_animation: true },
        { catalog_id: 'gnome1', label: 'Gnome', has_real_animation: false },
      ],
    });
  }
  if (p === `/api/visit/mascot-packs/${PACK_ID}`) {
    return Promise.resolve({ ...LIST.packs[0], pack: PACK_DETAIL });
  }
  if (p === `/api/visit/mascot-packs/${PACK_ID}/assets`) {
    return Promise.resolve({
      pack_id: PACK_ID,
      assets: [
        {
          filename: 'idle-1.png',
          url: `/api/visit/mascot-packs/${PACK_ID}/assets/idle-1.png`,
          preview_url: `/api/visit/mascot-packs/${PACK_ID}/assets/idle-1.png?preview_token=t`,
        },
      ],
    });
  }
  if (p === '/api/visit/mascot-sprite-library/assets') return Promise.resolve({ assets: [] });
  if (p === '/api/visit/mascot-assets') {
    return Promise.resolve({
      assets: [],
      counts: { total: 0, public: 0, pack: 0, library: 0 },
    });
  }
  return Promise.resolve({});
}

function calledPaths() {
  return apiMock.mock.calls.map((c) => String(c[0]));
}

describe('VisitMascotPackManager — montage', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(defaultApi);
  });

  test('rend sans lever : liste des mascottes, invitation à choisir, modes du studio', async () => {
    const onDirtyChange = vi.fn();
    render(<VisitMascotPackManager variant="page" onDirtyChange={onDirtyChange} />);
    expect(await screen.findByText('Renard du verger')).toBeInTheDocument();
    expect(screen.getByText('Gnome livré')).toBeInTheDocument();
    expect(screen.getByText(/Sélectionnez une/)).toBeInTheDocument();
    expect(calledPaths()).toEqual(
      expect.arrayContaining(['/api/visit/mascot-packs', '/api/visit/mascot-catalog/models']),
    );
    expect(onDirtyChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Nouveau brouillon' })).toBeInTheDocument();
  });

  test('sélectionner une mascotte ouvre l’éditeur et charge ses images', async () => {
    render(<VisitMascotPackManager variant="page" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le pack Renard du verger' }));
    const tabs = await screen.findByRole('tablist', { name: 'Sections d’édition du pack' });
    for (const label of ['Édition guidée', 'JSON', 'Comportements visite', 'Bulles de dialogue']) {
      expect(within(tabs).getByRole('tab', { name: label })).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(calledPaths()).toEqual(
        expect.arrayContaining([
          `/api/visit/mascot-packs/${PACK_ID}`,
          `/api/visit/mascot-packs/${PACK_ID}/assets`,
          '/api/visit/mascot-sprite-library/assets',
          '/api/visit/mascot-assets',
        ]),
      ),
    );
  });

  test('onglet JSON : le pack chargé est affiché, éditable', async () => {
    render(<VisitMascotPackManager variant="page" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le pack Renard du verger' }));
    const tabs = await screen.findByRole('tablist', { name: 'Sections d’édition du pack' });
    await waitFor(() => expect(calledPaths()).toContain(`/api/visit/mascot-packs/${PACK_ID}`));
    fireEvent.click(within(tabs).getByRole('tab', { name: 'JSON' }));
    const panel = await screen.findByRole('tabpanel', { name: 'JSON' });
    const textarea = await waitFor(() => {
      const el = panel.querySelector('textarea');
      expect(el).toBeTruthy();
      expect(el.value).toContain('"stateFrames"');
      return el;
    });
    expect(textarea.value).toContain('idle-1.png');
  });

  test('mode « Dialogues » : le studio des dialogues remplace la liste', async () => {
    render(<VisitMascotPackManager variant="page" />);
    await screen.findByText('Renard du verger');
    fireEvent.click(screen.getByRole('tab', { name: 'Dialogues' }));
    await waitFor(() => expect(screen.queryByText('Renard du verger')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Mascottes' }));
    expect(await screen.findByText('Renard du verger')).toBeInTheDocument();
  });

  test('échec du chargement : le message d’erreur est affiché', async () => {
    apiMock.mockImplementation((path) =>
      String(path) === '/api/visit/mascot-packs'
        ? Promise.reject(new Error('Table MySQL absente (test)'))
        : defaultApi(path),
    );
    render(<VisitMascotPackManager variant="page" />);
    expect(await screen.findByText(/Table MySQL absente \(test\)/)).toBeInTheDocument();
  });

  test('compte supprimé pendant le chargement : déconnexion demandée', async () => {
    const onForceLogout = vi.fn();
    apiMock.mockImplementation((path) =>
      String(path) === '/api/visit/mascot-packs'
        ? Promise.reject(new AccountDeletedError())
        : defaultApi(path),
    );
    render(<VisitMascotPackManager variant="page" onForceLogout={onForceLogout} />);
    await waitFor(() => expect(onForceLogout).toHaveBeenCalled());
  });

  test('« Nouveau brouillon » crée un pack côté serveur puis recharge la liste', async () => {
    const onPacksChanged = vi.fn();
    apiMock.mockImplementation((path, method) => {
      if (String(path) === '/api/visit/mascot-packs' && method === 'POST') {
        return Promise.resolve({ ...LIST.packs[0], id: SECOND_ID, pack: PACK_DETAIL });
      }
      return defaultApi(path);
    });
    render(<VisitMascotPackManager variant="page" onPacksChanged={onPacksChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau brouillon' }));
    await waitFor(() =>
      expect(
        apiMock.mock.calls.some((c) => c[0] === '/api/visit/mascot-packs' && c[1] === 'POST'),
      ).toBe(true),
    );
    await waitFor(() => expect(onPacksChanged).toHaveBeenCalled());
  });
});
