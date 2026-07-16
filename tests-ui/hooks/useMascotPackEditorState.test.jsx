import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMascotPackEditorState } from '../../src/hooks/useMascotPackEditorState.js';

const PACK_ID = 'srv-123e4567-e89b-42d3-a456-426614174000';

function makeRow(overrides = {}) {
  return {
    id: PACK_ID,
    label: 'Renard curieux',
    pack: { mascotPackVersion: 1, stateFrames: {} },
    ...overrides,
  };
}

function setup(initial = { selectedId: null, packs: [] }) {
  return renderHook((props) => useMascotPackEditorState(props), {
    initialProps: initial,
  });
}

describe('useMascotPackEditorState', () => {
  it('état par défaut sans sélection', () => {
    const { result } = setup();
    expect(result.current.editorPack).toEqual({});
    expect(result.current.editorTab).toBe('workspace');
    expect(result.current.jsonDraft).toBe('{}');
    expect(result.current.jsonError).toBe('');
    expect(result.current.labelDraft).toBe('');
    expect(result.current.isDirty).toBe(false);
  });

  it('sélectionne un pack : pack et libellé synchronisés, non modifié', () => {
    const row = makeRow();
    const { result, rerender } = setup();
    rerender({ selectedId: PACK_ID, packs: [row] });

    expect(result.current.labelDraft).toBe('Renard curieux');
    expect(result.current.editorPack).toMatchObject({ mascotPackVersion: 1 });
    // Aucun changement juste après chargement (aucune modification utilisateur).
    expect(result.current.isDirty).toBe(false);
    expect(result.current.editorDirty).toBe(false);
    // Le garde du brouillon JSON préserve un draft non resynchronisé (comportement
    // inchangé du composant : l’onglet JSON re-sérialise à l’ouverture de l’onglet).
    expect(result.current.jsonDraft).toBe('{}');
  });

  it('modifier le libellé rend l’éditeur « dirty »', () => {
    const row = makeRow();
    const { result, rerender } = setup();
    rerender({ selectedId: PACK_ID, packs: [row] });
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setLabelDraft('Renard modifié'));
    expect(result.current.editorDirty).toBe(true);
    expect(result.current.isDirty).toBe(true);
  });

  it('modifier le pack rend l’éditeur « dirty »', () => {
    const row = makeRow();
    const { result, rerender } = setup();
    rerender({ selectedId: PACK_ID, packs: [row] });

    act(() => result.current.setEditorPack((p) => ({ ...p, mascotPackVersion: 2 })));
    expect(result.current.editorDirty).toBe(true);
    expect(result.current.isDirty).toBe(true);
  });

  it('jsonDirty ne compte que dans l’onglet JSON', () => {
    const row = makeRow();
    const { result, rerender } = setup();
    rerender({ selectedId: PACK_ID, packs: [row] });

    // Un brouillon JSON divergent hors onglet JSON n’affecte pas isDirty.
    act(() => result.current.setJsonDraft('{"mascotPackVersion":9}'));
    expect(result.current.jsonDirty).toBe(false);
    expect(result.current.isDirty).toBe(false);

    // En onglet JSON, le même brouillon divergent devient « dirty ».
    act(() => result.current.setEditorTab('json'));
    expect(result.current.jsonDirty).toBe(true);
    expect(result.current.isDirty).toBe(true);
  });

  it('désélectionner réinitialise l’état d’édition', () => {
    const row = makeRow();
    const { result, rerender } = setup();
    rerender({ selectedId: PACK_ID, packs: [row] });
    expect(result.current.labelDraft).toBe('Renard curieux');

    rerender({ selectedId: null, packs: [row] });
    expect(result.current.editorPack).toEqual({});
    expect(result.current.labelDraft).toBe('');
    expect(result.current.jsonDraft).toBe('{}');
    expect(result.current.isDirty).toBe(false);
  });
});
