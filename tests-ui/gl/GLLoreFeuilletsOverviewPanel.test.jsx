import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
});
