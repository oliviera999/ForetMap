import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLLoreFeuilletsEditorPanel } from '../../src/gl/components/admin/GLLoreFeuilletsEditorPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const LIST_ITEM = {
  feuillet_code: 'cop-cover',
  titre: 'Couverture',
  type: 'copiste',
  liasse: 'I',
  biome_slug: 'sahara',
  zone_label: null,
  mode_apparition: 'carte',
  ordre_voyage: 1,
  statut: 'actif',
};

const DETAIL = {
  feuilletCode: 'cop-cover',
  type: 'copiste',
  titre: 'Couverture',
  biomeSlug: 'sahara',
  statut: 'actif',
};

describe('GLLoreFeuilletsEditorPanel — chemins API', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/biomes') return [{ slug: 'sahara', nom: 'Sahara' }];
      if (path === '/api/gl/lore/admin/feuillets') return { items: [LIST_ITEM] };
      if (path === '/api/gl/lore/admin/feuillets/cop-cover') {
        if (method === 'PUT') return { ok: true, feuillet: DETAIL };
        return { feuillet: DETAIL };
      }
      return {};
    });
  });

  test('charge la liste via /api/gl/lore/admin/feuillets (et jamais sans /lore)', async () => {
    render(<GLLoreFeuilletsEditorPanel />);

    await waitFor(() => {
      expect(screen.getAllByText('cop-cover').length).toBeGreaterThan(0);
    });

    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/lore/admin/feuillets');
    // Régression : le préfixe /lore manquant retombait sur le fallback SPA (HTML 200).
    const calledPaths = apiGlMock.mock.calls.map((args) => args[0]);
    expect(calledPaths).not.toContain('/api/gl/admin/feuillets');
    // Aucune erreur affichée.
    expect(document.querySelector('.gl-error')).toBeNull();
  });

  test('édition unitaire : GET puis PUT sur /api/gl/lore/admin/feuillets/:code', async () => {
    render(<GLLoreFeuilletsEditorPanel />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Éditer' }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Éditer' })[0]);

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/lore/admin/feuillets/cop-cover');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/lore/admin/feuillets/cop-cover',
        'PUT',
        expect.any(Object),
      );
    });
  });

  test('édition en masse : POST /api/gl/lore/admin/feuillets/bulk avec la sélection', async () => {
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/biomes') return [{ slug: 'sahara', nom: 'Sahara' }];
      if (path === '/api/gl/lore/admin/feuillets') return { items: [LIST_ITEM] };
      if (path === '/api/gl/lore/admin/feuillets/bulk' && method === 'POST') {
        return { ok: true, requested: 1, updated: 1 };
      }
      return {};
    });

    render(<GLLoreFeuilletsEditorPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText('Sélectionner cop-cover')).toBeInTheDocument();
    });

    // Sélectionne le feuillet → la barre d'édition en masse apparaît.
    fireEvent.click(screen.getAllByLabelText('Sélectionner cop-cover')[0]);
    const fieldSelect = await screen.findByLabelText('Champ');
    fireEvent.change(fieldSelect, { target: { value: 'statut' } });
    const valueSelect = await screen.findByLabelText('Nouvelle valeur');
    fireEvent.change(valueSelect, { target: { value: 'inactif' } });

    fireEvent.click(screen.getByRole('button', { name: /Appliquer à 1/ }));

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/lore/admin/feuillets/bulk', 'POST', {
        codes: ['cop-cover'],
        patch: { statut: 'inactif' },
      });
    });
  });
});
