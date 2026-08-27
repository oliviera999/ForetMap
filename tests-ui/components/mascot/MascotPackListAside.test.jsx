import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotPackListAside from '../../../src/components/mascot/MascotPackListAside.jsx';

function setup(extra = {}) {
  const props = {
    actionBusy: false,
    onNewDraft: vi.fn(),
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
    onResetFromOrigin: vi.fn(),
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
    expect(screen.getByText(/Aucune mascotte pour l’instant/)).toBeTruthy();
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

  test('plus aucune liste de modèles à côté de la liste des mascottes', () => {
    // Le dernier reste de la seconde liste : un menu « Partir d'un modèle livré » qui affichait
    // les seize noms du catalogue au-dessus de la liste — donc, à l'écran, des mascottes qu'on ne
    // pouvait ni ouvrir ni supprimer. Il faisait doublon avec « Dupliquer », qui part de la ligne
    // en base et copie aussi les images téléversées.
    setup({
      packs: [{ id: 'p1', label: 'SPR0UT', catalog_id: 'sprout', is_published: 1 }],
    });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /modèle/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Éditer (une|la) copie/ })).toBeNull();
  });

  test('l’origine de chaque mascotte se lit dans la liste', () => {
    // C'est elle qui dit ce qu'on peut faire de la ligne : réinitialiser une livrée,
    // supprimer une mascotte créée ici.
    setup({
      packs: [
        { id: 'p1', label: 'SPR0UT', catalog_id: 'sprout', is_published: 1, origin: 'builtin' },
        { id: 'p2', label: 'Abeille', catalog_id: 'srv-x', is_published: 0, origin: 'custom' },
      ],
    });
    expect(screen.getByText(/Livrée · Publiée/)).toBeTruthy();
    expect(screen.getByText(/Créée ici · Brouillon/)).toBeTruthy();
  });

  test('mascotte livrée : réinitialiser **et** supprimer', () => {
    // Une seule liste veut dire un seul jeu de droits : la livrée se supprime comme les autres.
    // Elle garde « Réinitialiser » en plus — c'est ce qui rend son édition sans risque.
    const props = setup({
      selectedId: 'p1',
      selectedRow: { id: 'p1', is_published: 1, origin: 'builtin' },
      selectedValidation: { ok: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser depuis l’origine…' }));
    expect(props.onResetFromOrigin).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer…' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  test('mascotte créée ici : supprimer, et pas de réinitialisation', () => {
    const props = setup({
      selectedId: 'p2',
      selectedRow: { id: 'p2', is_published: 0, origin: 'custom' },
      selectedValidation: { ok: true },
    });
    expect(screen.queryByRole('button', { name: 'Réinitialiser depuis l’origine…' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer…' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onResetFromOrigin).not.toHaveBeenCalled();
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
      selectedRow: { id: 'p1', is_published: 0, origin: 'custom' },
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

  test('export ZIP states[] : bouton dédié câblé sur onExportZipUnified', () => {
    const props = setup({
      selectedId: 'p1',
      selectedRow: { id: 'p1', is_published: 0 },
      selectedValidation: { ok: true },
      onExportZip: vi.fn(),
      onExportZipUnified: vi.fn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exporter ZIP (states[])' }));
    expect(props.onExportZipUnified).toHaveBeenCalledTimes(1);
    expect(props.onExportZip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter ZIP' }));
    expect(props.onExportZip).toHaveBeenCalledTimes(1);
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
