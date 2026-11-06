import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskFormModal } from '../../../src/components/tasks/TaskFormModal.jsx';
import { TaskTaxonomyTags } from '../../../src/components/tasks/TaskTaxonomyTags.jsx';
import {
  TaskPhaseTimeline,
  groupTasksByPhase,
} from '../../../src/components/tasks/TaskPhaseTimeline.jsx';
import { TaskFiltersBar } from '../../../src/components/tasks/TaskFiltersBar.jsx';
import { resolveTaskTaxonomyFormState } from '../../../src/utils/taskTaxonomyForm.js';
import {
  taskMatchesTaxonomyFilters,
  readTaskTaxonomyFilters,
  writeTaskTaxonomyFilters,
  TASK_TAXONOMY_FILTERS_STORAGE_KEY,
} from '../../../src/utils/taskTaxonomyFilters.js';

/**
 * Taxonomie des tâches côté interface (migration 329) : champs métier / format / phase du
 * formulaire (requis, suggestion, verrou Routine, phase conditionnelle, garde-fou de
 * découpage), étiquettes des tuiles, filtres (dont « J'ai 15 minutes ») et frise des phases.
 */

const MAPS = [{ id: 'foret', label: 'Forêt comestible' }];
const PROJECTS = [{ id: 'p1', title: 'Cactéraie', map_id: 'foret', status: 'active' }];

function renderForm(props = {}) {
  const onSave = vi.fn().mockResolvedValue({});
  const onClose = vi.fn();
  render(
    <TaskFormModal
      zones={[]}
      maps={MAPS}
      taskProjects={PROJECTS}
      activeMapId="foret"
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave, onClose };
}

const metierGroup = () => screen.getByRole('group', { name: 'Métier de la tâche' });
const formatGroup = () => screen.getByRole('group', { name: 'Format de la tâche' });

describe('État dérivé du formulaire', () => {
  test('création : suggestion pré-remplie et marquée, champs requis', () => {
    const empty = resolveTaskTaxonomyFormState({ form: { title: '' }, isNew: true });
    expect(empty.missing).toEqual(['métier', 'format']);
    const guessed = resolveTaskTaxonomyFormState({
      form: { title: 'Arroser les tomates', required_students: 4 },
      isNew: true,
    });
    expect(guessed.category).toBe('jardinage');
    expect(guessed.categorySuggested).toBe(true);
    expect(guessed.missingError).toBe('');
  });

  test('modification sans métier : suggestion affichée sans être appliquée', () => {
    const state = resolveTaskTaxonomyFormState({
      form: { title: 'Arroser les tomates', category: '' },
      isNew: false,
    });
    expect(state.category).toBe('');
    expect(state.hintCategory).toBe('jardinage');
    expect(state.missing).toEqual([]);
  });

  test('garde-fou de découpage aux bons seuils', () => {
    const base = { title: 'Construire', format: 'seance' };
    const at = (extra) =>
      resolveTaskTaxonomyFormState({ form: { ...base, ...extra }, isNew: true }).looksLikeProject;
    expect(at({ required_students: 5 })).toBe(false);
    expect(at({ required_students: 6 })).toBe(true);
    expect(at({ description: 'x'.repeat(1500) })).toBe(false);
    expect(at({ description: 'x'.repeat(1501) })).toBe(true);
    expect(at({ format: 'flash', required_students: 10 })).toBe(false);
  });
});

describe('Formulaire de tâche', () => {
  test('création : métier et format exigés avant l’envoi', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.type(screen.getByLabelText(/titre/i, { selector: 'input' }), 'Truc');
    await user.click(screen.getByRole('button', { name: /Créer|Enregistrer|Ajouter/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Choisissez un métier et un format/)).toBeTruthy();
  });

  test('suggestion « suggéré » puis choix explicite envoyé', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.type(screen.getByLabelText(/titre/i, { selector: 'input' }), 'Nettoyer les gants');
    expect(
      within(metierGroup()).getByRole('button', { name: /Entretien du lieu/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('suggéré').length).toBeGreaterThan(0);
    await user.click(within(metierGroup()).getByRole('button', { name: /Rangement/ }));
    await user.click(within(formatGroup()).getByRole('button', { name: /Séance/ }));
    await user.click(screen.getByRole('button', { name: /Créer|Enregistrer|Ajouter/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ category: 'rangement', format: 'seance' });
  });

  test('récurrence : format verrouillé sur Routine', () => {
    renderForm({
      editTask: {
        id: 't1',
        title: 'Arroser',
        map_id: 'foret',
        required_students: 1,
        status: 'available',
        recurrence: 'weekly',
        category: 'jardinage',
        format: 'routine',
      },
    });
    const group = formatGroup();
    expect(within(group).getByRole('button', { name: /Routine/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: /Flash/ })).toBeDisabled();
    expect(screen.getByText(/toujours une Routine/)).toBeTruthy();
  });

  test('phase visible seulement quand un projet est choisi', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByLabelText('Phase dans le projet')).toBeNull();
    const projectSelect = screen.getByDisplayValue('Aucun projet');
    await user.selectOptions(projectSelect, 'p1');
    const phase = screen.getByLabelText('Phase dans le projet');
    await user.selectOptions(phase, 'transmettre');
    expect(screen.getByText(/Documenter, étiqueter/)).toBeTruthy();
  });

  test('suggestion de découpage affichée pour une Séance à 6 élèves', () => {
    renderForm({
      editTask: {
        id: 't2',
        title: 'Chantier',
        map_id: 'foret',
        required_students: 6,
        status: 'available',
        category: 'bricolage',
        format: 'seance',
      },
    });
    expect(screen.getByText(/ressemble à un projet/)).toBeTruthy();
  });
});

describe('Étiquettes des tuiles', () => {
  test('« 🪴 Jardinage · ⚡ Flash », lisibles sans couleur', () => {
    render(<TaskTaxonomyTags category="jardinage" format="flash" />);
    const tags = screen.getByTestId('task-taxonomy-tags');
    expect(tags.textContent.replace(/\s+/g, ' ').trim()).toBe('🪴 Jardinage · ⚡ Flash');
  });

  test('rien sans métier ni format', () => {
    const { container } = render(<TaskTaxonomyTags category={null} format="inconnu" />);
    expect(container.textContent).toBe('');
  });
});

describe('Filtres', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  const flashOpen = {
    category: 'jardinage',
    format: 'flash',
    status: 'available',
    required_students: 2,
    assigned_count: 1,
  };

  test('métiers et formats en sélection multiple', () => {
    const f = { categories: ['jardinage', 'animaux'], formats: [], quick: false };
    expect(taskMatchesTaxonomyFilters(flashOpen, f)).toBe(true);
    expect(taskMatchesTaxonomyFilters({ ...flashOpen, category: 'bricolage' }, f)).toBe(false);
    expect(
      taskMatchesTaxonomyFilters(flashOpen, { categories: [], formats: ['seance'], quick: false }),
    ).toBe(false);
  });

  test('« J’ai 15 minutes » : Flash disponibles seulement', () => {
    const quick = { categories: [], formats: [], quick: true };
    expect(taskMatchesTaxonomyFilters(flashOpen, quick)).toBe(true);
    expect(taskMatchesTaxonomyFilters({ ...flashOpen, assigned_count: 2 }, quick)).toBe(false);
    expect(taskMatchesTaxonomyFilters({ ...flashOpen, status: 'done' }, quick)).toBe(false);
    expect(taskMatchesTaxonomyFilters({ ...flashOpen, format: 'seance' }, quick)).toBe(false);
  });

  test('mémorisés pour la session d’onglet, stockage en panne toléré', () => {
    writeTaskTaxonomyFilters({ categories: ['animaux', 'cuisine'], formats: [], quick: true });
    expect(readTaskTaxonomyFilters()).toEqual({
      categories: ['animaux'],
      formats: [],
      quick: true,
    });
    window.sessionStorage.setItem(TASK_TAXONOMY_FILTERS_STORAGE_KEY, '{pas du json');
    expect(readTaskTaxonomyFilters()).toEqual({ categories: [], formats: [], quick: false });
  });

  test('bouton « J’ai 15 minutes » de la barre : bascule et chip', async () => {
    const user = userEvent.setup();
    let filters = { categories: [], formats: [], quick: false };
    const setTaxonomyFilters = vi.fn((next) => {
      filters = typeof next === 'function' ? next(filters) : next;
    });
    const props = {
      viewMode: 'tiles',
      setViewMode: () => {},
      filterMap: 'active',
      setFilterMap: () => {},
      filterText: '',
      setFilterText: () => {},
      filterZone: '',
      setFilterZone: () => {},
      filterProject: '',
      setFilterProject: () => {},
      filterGroupId: '',
      setFilterGroupId: () => {},
      filterUrgentCategory: '',
      setFilterUrgentCategory: () => {},
      filterStatus: '',
      setFilterStatus: () => {},
      setHasTouchedStatusFilter: () => {},
      setTaxonomyFilters,
    };
    const { rerender } = render(<TaskFiltersBar {...props} taxonomyFilters={filters} />);
    const toggle = screen.getByRole('button', { name: /J’ai 15 minutes/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(filters.quick).toBe(true);
    await act(async () => rerender(<TaskFiltersBar {...props} taxonomyFilters={filters} />));
    expect(
      screen.getByRole('button', { name: 'Retirer le raccourci « J’ai 15 minutes »' }),
    ).toBeTruthy();
  });
});

describe('Frise des phases', () => {
  const tasks = [
    { id: 'a', project_phase: 'concevoir', status: 'validated' },
    { id: 'b', project_phase: 'realiser', status: 'available' },
    { id: 'c', project_phase: null, status: 'available' },
  ];

  test('phase courante mise en évidence, phase vide en pointillé avec infobulle', () => {
    render(<TaskPhaseTimeline tasks={tasks} />);
    const timeline = screen.getByTestId('task-phase-timeline');
    const steps = within(timeline).getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    const current = steps.find((s) => s.getAttribute('aria-current') === 'step');
    expect(current.dataset.phase).toBe('realiser');
    const transmettre = steps.find((s) => s.dataset.phase === 'transmettre');
    expect(transmettre.className).toContain('task-phase-step--empty');
    expect(transmettre.getAttribute('title')).toBe('Aucune tâche prévue pour cette phase');
    const concevoir = steps.find((s) => s.dataset.phase === 'concevoir');
    expect(concevoir.textContent).toContain('1/1');
  });

  test('aucune frise sans phase ; regroupement par phase dans l’ordre', () => {
    const { container } = render(<TaskPhaseTimeline tasks={[{ id: 'x' }]} />);
    expect(container.textContent).toBe('');
    expect(groupTasksByPhase(tasks).map((g) => g.label)).toEqual([
      'Concevoir',
      'Réaliser',
      'Sans phase',
    ]);
  });
});
