import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Fenêtre « Importer /tutos/ » — le bouton « Importer les nouvelles fiches » ne doit
 * jamais rester muet.
 *
 * Symptôme signalé : « le bouton importer de nouvelles fiches ne fonctionne pas ». Trois
 * chemins y menaient, tous silencieux :
 *  1. aucune fiche à importer → bouton grisé, sans un mot sur la raison ;
 *  2. la fenêtre ne listait que les fiches à importer, donc rien n'expliquait qu'une fiche
 *     déposée à l'instant ait été rapprochée d'un tutoriel existant ;
 *  3. un import en échec côté serveur affichait « Aucune nouvelle fiche à importer ».
 */

const apiMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, api: (...args) => apiMock(...args), getAuthToken: () => 'jeton-de-test' };
});

vi.mock('../../src/contexts/DataContext.jsx', () => ({
  useData: () => ({ tutorials: [], zones: [], markers: [], activeMapId: 'foret' }),
}));
vi.mock('../../src/contexts/PublicSettingsContext.jsx', () => ({
  usePublicSettings: () => ({ modules: {} }),
}));
vi.mock('../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ canParticipateContextComments: true }),
}));
vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: vi.fn(async () => true) }),
}));
vi.mock('../../src/hooks/useTutorialReadIds', () => ({
  useTutorialReadIds: () => ({ readIds: new Set(), markRead: vi.fn() }),
}));
vi.mock('../../src/hooks/useGatingSummary', () => ({
  useGatingSummary: () => ({ summaries: new Map(), refresh: vi.fn() }),
}));

const { TutorialsView } = await import('../../src/components/tutorials-views.jsx');

const SCAN_ALL_KNOWN = {
  totals: { on_disk: 2, already_imported: 2, pending: 0, errors: 0 },
  items: [
    {
      filename: 'fiche-compost-punk.html',
      title: 'Composter',
      status: 'already_imported',
      existing_tutorial_id: 6,
      match_reason: 'filename_stem',
    },
    {
      filename: 'fiche-plantes-punk.html',
      title: 'Choisir ses plantes',
      status: 'already_imported',
      existing_tutorial_id: 5,
      match_reason: 'content',
    },
  ],
};

const SCAN_ONE_PENDING = {
  totals: { on_disk: 1, already_imported: 0, pending: 1, errors: 0 },
  items: [{ filename: 'fiche-paillage-punk.html', title: 'Le paillage', status: 'pending' }],
};

async function openImportModal() {
  render(<TutorialsView isTeacher onRefresh={vi.fn()} onForceLogout={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /Importer \/tutos\// }));
  await screen.findByRole('button', { name: /Importer les nouvelles fiches/ });
}

describe('fenêtre d’import des fiches tutos/', () => {
  beforeEach(() => apiMock.mockReset());

  test('sans nouveauté : chaque fiche écartée est listée avec son motif, et le bouton grisé est expliqué', async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/tutorials/import/scan') return { report: SCAN_ALL_KNOWN };
      return {};
    });

    await openImportModal();

    // 1. Les fiches écartées sont visibles — auparavant la liste était vide.
    expect(screen.getByText('fiche-compost-punk.html')).toBeInTheDocument();
    expect(screen.getByText('fiche-plantes-punk.html')).toBeInTheDocument();
    // 2. Avec le critère de rapprochement, seul moyen de comprendre un faux positif.
    expect(screen.getByText(/nom de fichier proche/)).toBeInTheDocument();
    expect(screen.getByText(/contenu identique/)).toBeInTheDocument();
    // 3. Le bouton reste grisé, mais la raison est écrite.
    expect(screen.getByRole('button', { name: /Importer les nouvelles fiches/ })).toBeDisabled();
    expect(screen.getByText(/correspondent déjà à un tutoriel en base/)).toBeInTheDocument();
  });

  test('import en échec : le message d’erreur du serveur remplace « aucune nouvelle fiche »', async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/tutorials/import/scan') return { report: SCAN_ONE_PENDING };
      if (path === '/api/tutorials/import/files') {
        return {
          report: {
            dryRun: false,
            totals: { ...SCAN_ONE_PENDING.totals, imported: 0, import_errors: 1 },
            items: [
              {
                filename: 'fiche-paillage-punk.html',
                title: 'Le paillage',
                status: 'error',
                error: 'Insertion impossible',
              },
            ],
          },
        };
      }
      return {};
    });

    await openImportModal();
    await userEvent.click(screen.getByRole('button', { name: /Importer les nouvelles fiches/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /fiche-paillage-punk\.html.*Insertion impossible/,
      ),
    );
    expect(screen.queryByText('Aucune nouvelle fiche à importer')).not.toBeInTheDocument();
  });

  test('« Relancer l’analyse » redemande le scan sans refermer la fenêtre', async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/tutorials/import/scan') return { report: SCAN_ONE_PENDING };
      return {};
    });

    await openImportModal();
    const scansBefore = apiMock.mock.calls.filter(
      ([p]) => p === '/api/tutorials/import/scan',
    ).length;

    await userEvent.click(screen.getByRole('button', { name: /Relancer l’analyse/ }));

    await waitFor(() =>
      expect(apiMock.mock.calls.filter(([p]) => p === '/api/tutorials/import/scan').length).toBe(
        scansBefore + 1,
      ),
    );
    expect(screen.getByRole('button', { name: /Importer les nouvelles fiches/ })).toBeEnabled();
  });
});
