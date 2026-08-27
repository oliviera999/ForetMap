import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// L'illustration (rendue par le popover d'aperçu) charge un runtime d'assets GL.
vi.mock('../../src/gl/components/GLFeuilletIllustration.jsx', () => ({
  GLFeuilletIllustration: () => null,
}));

import { GLLoreFeuilletsOverviewPanel } from '../../src/gl/components/admin/GLLoreFeuilletsOverviewPanel.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const OVERVIEW = {
  total: 3,
  active: 2,
  unassignedChapterCount: 1,
  channels: {
    counts: { zone: 1, 'lien:espece': 1, orphan: 1 },
    orphans: ['orph'],
    total: 3,
  },
  byChapter: [{ id: 1, name: 'Chapitre 1', count: 2 }],
  items: [
    {
      feuilletCode: 'ep-I-01',
      titre: 'Zone A',
      statut: 'actif',
      channel: 'zone',
      linkLabel: null,
      chapters: [{ id: 1, name: 'Chapitre 1' }],
      discovery: { games: 2, teams: 3 },
    },
    {
      feuilletCode: 'a',
      titre: 'Espèce',
      statut: 'actif',
      channel: 'lien:espece',
      linkLabel: 'espece · Fennec (SP0001)',
      chapters: [{ id: 1, name: 'Chapitre 1' }],
      discovery: { games: 0, teams: 0 },
    },
    {
      feuilletCode: 'orph',
      titre: 'Orphelin',
      statut: 'inactif',
      channel: 'orphan',
      linkLabel: null,
      chapters: [],
      discovery: { games: 0, teams: 0 },
    },
  ],
};

describe('GLLoreFeuilletsOverviewPanel', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue(OVERVIEW);
  });

  // Chaque item est rendu deux fois (ligne de tableau desktop + carte mobile,
  // alternance gérée en CSS) → toujours interroger via getAllByText/queryAllByText.
  test('affiche les KPI et la couverture par canal', async () => {
    render(<GLLoreFeuilletsOverviewPanel />);
    await waitFor(() => expect(screen.getAllByText('Zone A').length).toBeGreaterThan(0));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/lore/admin/feuillets/overview');
    // Lien résolu + libellé de canal.
    expect(screen.getAllByText('espece · Fennec (SP0001)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lien espèce').length).toBeGreaterThan(0);
  });

  test('filtre par canal via le clic sur la couverture', async () => {
    render(<GLLoreFeuilletsOverviewPanel />);
    await waitFor(() => expect(screen.getAllByText('Zone A').length).toBeGreaterThan(0));

    // Clique sur le canal « Orphelin » dans la couverture → ne garde que l'orphelin.
    const coverage = document.querySelector('.gl-feuillets-overview__coverage');
    fireEvent.click(within(coverage).getByText('Orphelin').closest('button'));

    await waitFor(() => {
      expect(screen.queryAllByText('Zone A')).toHaveLength(0);
      expect(screen.getAllByText('Orphelin').length).toBeGreaterThan(0);
    });
  });

  test('« Aperçu » ouvre le popover du feuillet, avec bascule vers l’édition', async () => {
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/lore/admin/feuillets/overview') return OVERVIEW;
      if (path === '/api/gl/biomes') return [];
      if (path === '/api/gl/chapters') return [];
      if (path === '/api/gl/lore/admin/feuillets/ep-I-01') {
        if (method === 'PUT') return { ok: true, feuillet: { feuilletCode: 'ep-I-01' } };
        return {
          feuillet: {
            feuilletCode: 'ep-I-01',
            titre: 'Zone A',
            texte: 'Le récit de la zone A.',
            statut: 'actif',
          },
        };
      }
      return {};
    });

    render(<GLLoreFeuilletsOverviewPanel />);
    await waitFor(() => expect(screen.getAllByText('Zone A').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByLabelText('Aperçu du feuillet ep-I-01')[0]);

    // Le popover charge le détail et affiche le contenu tel que le joueur le verra.
    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/lore/admin/feuillets/ep-I-01');
    });
    expect(await screen.findByText('Le récit de la zone A.')).toBeInTheDocument();

    // L'édition du feuillet reste accessible depuis ce même popover.
    fireEvent.click(screen.getByRole('tab', { name: 'Édition' }));
    expect(await screen.findByRole('textbox', { name: 'Titre' })).toHaveValue('Zone A');
  });
});
