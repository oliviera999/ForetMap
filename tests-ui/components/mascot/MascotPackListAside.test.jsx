import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotPackListAside from '../../../src/components/mascot/MascotPackListAside.jsx';

function setup(extra = {}) {
  const props = {
    mapTitle: 'Forêt',
    actionBusy: false,
    catalogModelOptions: [{ id: 'sprout', label: 'SPR0UT' }],
    selectedCatalogModelId: 'sprout',
    onSelectCatalogModel: vi.fn(),
    findPackForCatalogModel: vi.fn(() => null),
    onNewDraft: vi.fn(),
    onOpenCatalogModelForEdit: vi.fn(),
    onNewFromCatalog: vi.fn(),
    onRefresh: vi.fn(),
    onDuplicateSelected: vi.fn(),
    listError: '',
    loading: false,
    packs: [],
    selectedId: null,
    onSelectPack: vi.fn(),
    selectedRow: undefined,
    labelDraft: '',
    onLabelDraftChange: vi.fn(),
    onSave: vi.fn(),
    onTogglePublish: vi.fn(),
    onDelete: vi.fn(),
    selectedValidation: { ok: false },
    editorWarnings: [],
    actionError: '',
    actionIssues: [],
    ...extra,
  };
  render(<MascotPackListAside {...props} />);
  return props;
}

describe('MascotPackListAside', () => {
  test('liste vide : message d’invitation et bouton de brouillon', () => {
    const props = setup();
    expect(screen.getByText(/Aucun pack pour la carte/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau brouillon' }));
    expect(props.onNewDraft).toHaveBeenCalledTimes(1);
  });

  test('sélectionner un pack de la liste transmet son id', () => {
    const props = setup({
      packs: [
        {
          id: 'p1',
          label: 'Pack 1',
          catalog_id: 'sprout',
          is_published: 1,
          pack: { mascotPackVersion: 2 },
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le pack Pack 1' }));
    expect(props.onSelectPack).toHaveBeenCalledWith('p1');
  });

  test('« Éditer sur cette carte » ouvre le modèle catalogue', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Éditer sur cette carte' }));
    expect(props.onOpenCatalogModelForEdit).toHaveBeenCalledWith('sprout');
  });

  test('pack sélectionné invalide : enregistrer et publier désactivés', () => {
    const props = setup({
      selectedId: 'p1',
      selectedRow: { id: 'p1', is_published: 0 },
      selectedValidation: { ok: false },
    });
    expect(screen.getByRole('button', { name: 'Enregistrer sur le serveur' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Publier sur la visite' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer sur le serveur' }));
    expect(props.onSave).not.toHaveBeenCalled();
  });

  test('pack sélectionné : enregistrer/publier/supprimer câblés et libellé édité', () => {
    const props = setup({
      selectedId: 'p1',
      selectedRow: { id: 'p1', is_published: 0 },
      selectedValidation: { ok: true },
      labelDraft: 'Mon pack',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer sur le serveur' }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Publier sur la visite' }));
    expect(props.onTogglePublish).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer…' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByPlaceholderText('Nom du pack'), { target: { value: 'X' } });
    expect(props.onLabelDraftChange).toHaveBeenCalledWith('X');
  });

  test('isDirty : affiche la bannière modifications non enregistrées', () => {
    setup({
      selectedId: 'p1',
      selectedRow: { id: 'p1', is_published: 0 },
      isDirty: true,
    });
    expect(screen.getByText('Modifications non enregistrées')).toBeTruthy();
  });

  test('erreur d’action : affiche le message et les lignes d’issues', () => {
    setup({
      actionError: 'Échec',
      actionIssues: [{ path: ['frameWidth'], message: 'requis' }],
    });
    expect(screen.getByText('Échec')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
