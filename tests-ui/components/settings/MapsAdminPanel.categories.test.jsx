// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * « Cartographie → Cartes » : chaque carte porte ses propres sélecteurs « Catégories
 * affichées par défaut » et « Catégories cachées », limités aux catégories globales et à
 * celles de la carte ; une catégorie ne peut pas être à la fois cochée d'office et cachée.
 */

const CATEGORIES = [
  { id: 'globale', label: 'Globale', map_id: null, is_active: true, surfaces: ['map', 'plan'] },
  { id: 'foret-only', label: 'Sous-bois', map_id: 'foret', is_active: true, surfaces: ['map'] },
  { id: 'n3-only', label: 'Salle N3', map_id: 'n3', is_active: true, surfaces: ['map'] },
  { id: 'plan-only', label: 'Plan seul', map_id: null, is_active: true, surfaces: ['plan'] },
];

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/api', () => ({ api: apiMock }));
vi.mock('../../../src/components/settings/MapGeorefPanel.jsx', () => ({
  MapGeorefPanel: () => null,
}));
vi.mock('../../../src/components/MediaLibraryMenu.jsx', () => ({ MediaLibraryMenu: () => null }));

const { MapsAdminPanel } = await import('../../../src/components/settings/MapsAdminPanel.jsx');

const MAPS = [
  {
    id: 'foret',
    label: 'Forêt',
    sort_order: 1,
    is_active: true,
    default_category_ids: ['globale'],
    hidden_category_ids: [],
  },
  {
    id: 'n3',
    label: 'N3',
    sort_order: 2,
    is_active: true,
    default_category_ids: [],
    hidden_category_ids: [],
  },
];

function renderPanel() {
  return render(
    <MapsAdminPanel
      maps={MAPS}
      get={(key, fallback) => fallback}
      saveSetting={vi.fn()}
      onMessage={vi.fn()}
      onError={vi.fn()}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async (url, method, body) => {
    if (String(url) === '/api/map-categories/manage') return CATEGORIES;
    if (method === 'PUT') {
      const id = decodeURIComponent(String(url).split('/').pop());
      const base = MAPS.find((m) => m.id === id);
      const split = (v) => (v === undefined ? undefined : String(v).split(';').filter(Boolean));
      return {
        ...base,
        default_category_ids: split(body.default_category_ids) ?? base.default_category_ids,
        hidden_category_ids: split(body.hidden_category_ids) ?? base.hidden_category_ids,
      };
    }
    return [];
  });
});

describe('MapsAdminPanel — catégories par carte', () => {
  test('plus de sélecteur global : chaque carte a les siens, limités à ses catégories', async () => {
    renderPanel();
    expect(screen.queryByTestId('map-default-category-ids')).toBeNull();

    const foretDefaults = screen.getByTestId('map-default-category-ids-foret');
    await within(foretDefaults).findByRole('checkbox', { name: /Globale/ });
    expect(within(foretDefaults).getByRole('checkbox', { name: /Globale/ })).toBeChecked();
    expect(within(foretDefaults).getByRole('checkbox', { name: /Sous-bois/ })).toBeTruthy();
    expect(within(foretDefaults).queryByRole('checkbox', { name: /Salle N3/ })).toBeNull();
    expect(within(foretDefaults).queryByRole('checkbox', { name: /Plan seul/ })).toBeNull();

    const n3Defaults = screen.getByTestId('map-default-category-ids-n3');
    expect(within(n3Defaults).getByRole('checkbox', { name: /Salle N3/ })).toBeTruthy();
    expect(within(n3Defaults).queryByRole('checkbox', { name: /Sous-bois/ })).toBeNull();

    // Une seule lecture du catalogue pour tous les sélecteurs.
    expect(apiMock.mock.calls.filter(([u]) => u === '/api/map-categories/manage')).toHaveLength(1);
  });

  test('cocher une catégorie cachée l’enregistre sur la carte et la retire des défauts', async () => {
    renderPanel();
    const foretHidden = screen.getByTestId('map-hidden-category-ids-foret');
    // « Globale » est cochée d'office : elle n'est pas proposée au masquage.
    await within(foretHidden).findByRole('checkbox', { name: /Sous-bois/ });
    expect(within(foretHidden).queryByRole('checkbox', { name: /Globale/ })).toBeNull();

    fireEvent.click(within(foretHidden).getByRole('checkbox', { name: /Sous-bois/ }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/api/settings/admin/maps/foret', 'PUT', {
        hidden_category_ids: 'foret-only',
      }),
    );
    const foretDefaults = screen.getByTestId('map-default-category-ids-foret');
    await waitFor(() =>
      expect(within(foretDefaults).queryByRole('checkbox', { name: /Sous-bois/ })).toBeNull(),
    );
  });
});
