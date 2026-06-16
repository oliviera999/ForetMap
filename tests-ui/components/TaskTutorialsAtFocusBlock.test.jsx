import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskTutorialsAtFocusBlock } from '../../src/components/tasks/TaskTutorialsAtFocusBlock.jsx';
import { api } from '../../src/services/api.js';

vi.mock('../../src/services/api.js', () => ({
  api: vi.fn(async () => ({})),
  withAppBase: (path) => path,
}));

const ZONES = [{ id: 'z1', name: 'Mare', map_id: 'foret' }];
const MARKERS = [{ id: 'm1', label: 'Ruche', emoji: '🐝', map_id: 'foret' }];

function renderBlock(overrides = {}) {
  const setToast = vi.fn();
  const openTasksTutorialPreview = vi.fn();
  /** Même contrat que TasksView.withLoad : exécute la fn async sous une clé de loading. */
  const withLoad = vi.fn(async (id, fn) => {
    await fn();
  });
  render(
    <TaskTutorialsAtFocusBlock
      isTeacher
      filterZone="zone:z1"
      tutorialsModuleEnabled
      tutorials={[]}
      tasks={[]}
      zones={ZONES}
      markers={MARKERS}
      activeMapId="foret"
      loading={{}}
      withLoad={withLoad}
      setToast={setToast}
      openTasksTutorialPreview={openTasksTutorialPreview}
      {...overrides}
    />,
  );
  return { setToast, openTasksTutorialPreview, withLoad };
}

describe('TaskTutorialsAtFocusBlock', () => {
  beforeEach(() => {
    api.mockClear();
    api.mockResolvedValue({});
  });

  test('n3boss sans tutoriel lié : message vide + sélecteur de liaison', () => {
    renderBlock();
    expect(screen.getByText('📘 Tutoriels pour ce lieu')).toBeTruthy();
    expect(screen.getByText('Aucun tutoriel lié à ce lieu.')).toBeTruthy();
    expect(screen.getByLabelText('Lier un tutoriel existant')).toBeTruthy();
  });

  test('n3boss : tutoriel lié au lieu → « Délier » envoie le PUT sans la zone', async () => {
    const tu = { id: 7, title: 'Planter un arbre', zone_ids: ['z1', 'z9'], marker_ids: [] };
    const { setToast } = renderBlock({ tutorials: [tu] });
    fireEvent.click(screen.getByRole('button', { name: 'Délier' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith('/api/tutorials/7', 'PUT', {
      zone_ids: ['z9'],
      marker_ids: [],
    });
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('Tutoriel dissocié de ce lieu ✓'));
  });

  test('n3boss : tutoriel lié seulement via mission → mention « via mission », pas de Délier', () => {
    const tu = { id: 7, title: 'Planter un arbre', zone_ids: [], marker_ids: [] };
    const tasks = [{ id: 't1', status: 'available', zone_ids: ['z1'], tutorials_linked: [tu] }];
    renderBlock({ tutorials: [tu], tasks });
    expect(screen.getByText('via mission')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Délier' })).toBeNull();
  });

  test('n3boss : lier un tutoriel assignable du même lieu (PUT avec la zone ajoutée)', async () => {
    const tu = {
      id: 8,
      title: 'Compost',
      zone_ids: [],
      marker_ids: [],
      zones_linked: [],
      markers_linked: [],
    };
    const { setToast } = renderBlock({ tutorials: [tu] });
    const select = screen.getByLabelText('Lier un tutoriel existant');
    expect(screen.getByRole('option', { name: 'Compost' })).toBeTruthy();
    fireEvent.change(select, { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '🔗 Lier le tutoriel' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith('/api/tutorials/8', 'PUT', {
      zone_ids: ['z1'],
      marker_ids: [],
    });
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('Tutoriel lié à ce lieu ✓'));
  });

  test('n3boss : un tutoriel archivé lié reste listé avec la mention (archivé)', () => {
    const tu = { id: 9, title: 'Vieux guide', is_active: false, zone_ids: ['z1'], marker_ids: [] };
    renderBlock({ tutorials: [tu] });
    expect(screen.getByText('Vieux guide (archivé)')).toBeTruthy();
  });

  test('élève : carte du tutoriel (résumé, autres lieux) + « Consulter » ouvre l’aperçu', () => {
    const tu = {
      id: 7,
      title: 'Planter un arbre',
      type: 'link',
      source_url: 'https://exemple.org/tuto',
      summary: 'Pas à pas',
      zone_ids: ['z1'],
      marker_ids: [],
      zones_linked: [
        { id: 'z1', name: 'Mare' },
        { id: 'z2', name: 'Verger' },
      ],
      markers_linked: [{ id: 'm1', label: 'Ruche', emoji: '🐝' }],
    };
    const { openTasksTutorialPreview } = renderBlock({ isTeacher: false, tutorials: [tu] });
    expect(screen.getByText('Pas à pas')).toBeTruthy();
    expect(screen.getByText(/Verger/)).toBeTruthy();
    expect(screen.queryByText(/Mare/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '📖 Consulter' }));
    expect(openTasksTutorialPreview).toHaveBeenCalledWith(tu);
  });

  test('élève : les tutoriels archivés sont masqués', () => {
    const tu = { id: 9, title: 'Vieux guide', is_active: false, zone_ids: ['z1'], marker_ids: [] };
    renderBlock({ isTeacher: false, tutorials: [tu] });
    expect(screen.getByText('Aucun tutoriel lié à ce lieu.')).toBeTruthy();
  });
});
