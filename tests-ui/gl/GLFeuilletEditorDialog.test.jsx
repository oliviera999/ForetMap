import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// L'illustration charge un runtime d'assets GL (import lourd / async) : on la neutralise.
vi.mock('../../src/gl/components/GLFeuilletIllustration.jsx', () => ({
  GLFeuilletIllustration: () => null,
}));

import { GLFeuilletEditorDialog } from '../../src/gl/components/admin/GLFeuilletEditorDialog.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const DETAIL = {
  feuilletCode: 'cop-cover',
  type: 'copiste',
  titre: 'Couverture',
  incipit: 'Au seuil du royaume…',
  texte: 'Le corps du feuillet.',
  biomeSlug: 'sahara',
  liasse: 'I',
  modeApparition: 'cover',
  statut: 'actif',
};

function mockApi(overrides = {}) {
  apiGlMock.mockImplementation(async (path, method) => {
    if (overrides[`${method || 'GET'} ${path}`]) return overrides[`${method || 'GET'} ${path}`];
    if (path === '/api/gl/biomes') return [{ slug: 'sahara', nom: 'Sahara' }];
    if (path === '/api/gl/chapters') return [];
    if (path === '/api/gl/lore/admin/feuillets/overview') return { items: [] };
    if (path === '/api/gl/lore/admin/feuillets/cop-cover') {
      if (method === 'PUT') return { ok: true, feuillet: { ...DETAIL, titre: 'Couverture bis' } };
      if (method === 'PATCH') return { ok: true, feuillet: { ...DETAIL, statut: 'inactif' } };
      return { feuillet: DETAIL };
    }
    return {};
  });
}

describe('GLFeuilletEditorDialog', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    mockApi();
  });

  test('ouvre en aperçu : contenu joueur + caractéristiques, sans bouton Enregistrer', async () => {
    render(<GLFeuilletEditorDialog code="cop-cover" initialMode="preview" onClose={() => {}} />);

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/lore/admin/feuillets/cop-cover');
    });

    // Rendu joueur du feuillet (titre + incipit + corps).
    expect(await screen.findByRole('heading', { name: 'Couverture' })).toBeInTheDocument();
    expect(screen.getByText('Au seuil du royaume…')).toBeInTheDocument();
    expect(screen.getByText('Le corps du feuillet.')).toBeInTheDocument();
    // Caractéristiques résumées.
    expect(screen.getByText('copiste')).toBeInTheDocument();
    expect(screen.getByText('cover')).toBeInTheDocument();
    // Pas d'enregistrement possible tant qu'on n'est pas passé en édition.
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });

  test("bascule vers l'édition et enregistre (PUT) le feuillet", async () => {
    render(<GLFeuilletEditorDialog code="cop-cover" initialMode="preview" onClose={() => {}} />);
    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/lore/admin/feuillets/cop-cover');
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Édition' }));

    const titre = await screen.findByRole('textbox', { name: 'Titre' });
    expect(titre).toHaveValue('Couverture');
    fireEvent.change(titre, { target: { value: 'Couverture bis' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/lore/admin/feuillets/cop-cover',
        'PUT',
        expect.objectContaining({ titre: 'Couverture bis' }),
      );
    });
    expect(await screen.findByText('Feuillet enregistré.')).toBeInTheDocument();
  });

  test('prévient le parent après enregistrement (rechargement de la liste)', async () => {
    const onSaved = vi.fn();
    render(
      <GLFeuilletEditorDialog
        code="cop-cover"
        initialMode="edit"
        onSaved={onSaved}
        onClose={() => {}}
      />,
    );

    await screen.findByRole('textbox', { name: 'Titre' });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test('feuillet introuvable : message d’erreur, pas de crash', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path === '/api/gl/biomes') return [];
      if (path === '/api/gl/lore/admin/feuillets/zzz') throw new Error('Feuillet introuvable');
      return {};
    });

    render(<GLFeuilletEditorDialog code="zzz" initialMode="preview" onClose={() => {}} />);

    expect(await screen.findByText('Feuillet introuvable')).toBeInTheDocument();
  });
});
