// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

/**
 * Caractérisation des listes de valeurs du front branchées sur le référentiel partagé des ENUM
 * (audit du 25/09/2026, § 3.2.5, étape B1 — piste B, sans changement de comportement).
 *
 * Les valeurs, leur ordre et leurs libellés sont écrits ici **en dur**, volontairement : ce
 * fichier passe sur le code d'avant la bascule (listes recopiées dans chaque composant) comme
 * sur celui d'après (listes lues dans `src/shared/enums/`). Un écart de valeur, d'ordre ou de
 * libellé introduit par la bascule le fait échouer.
 */

const apiMock = vi.fn();
vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));
vi.mock('../../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));
vi.mock('../../src/contexts/DataContext.jsx', () => ({
  useData: () => ({ plants: [] }),
}));

const { TaskFormLevelsField } = await import('../../src/components/tasks/TaskFormLevelsField.jsx');
const {
  TaskDifficultyAndRiskChips,
  getDefinedTaskDangerLevel,
  getDefinedTaskDifficultyLevel,
  getDefinedTaskImportanceLevel,
  taskRequiresReferentBriefingBeforeStart,
} = await import('../../src/utils/badges.jsx');
const { TASK_IMPORTANCE_SORT_WEIGHT, compareTasksByImportanceThenDueDate } =
  await import('../../src/utils/taskListHelpers.js');
const { TEACHER_STATUS_ACTIONS } = await import('../../src/components/tasks/taskViewHelpers.js');
const { TASK_RECURRENCE_FILTER_LABELS } = await import('../../src/utils/taskFilterSummary.js');
const biodivLevel = await import('../../src/utils/biodivPedagoLevel.js');
const scales = await import('../../src/utils/pedagoScales.js');
const { IdKeysView } = await import('../../src/components/pedago/IdKeysView.jsx');
const { GlossaryView } = await import('../../src/components/pedago/GlossaryView.jsx');
const { BiodivPedagoProvider } = await import('../../src/contexts/BiodivPedagoContext.jsx');

/** Paires [valeur, texte] des options d'un <select>. */
function optionPairs(select) {
  return [...select.querySelectorAll('option')].map((o) => [o.value, o.textContent]);
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('formulaire de tâche — niveaux', () => {
  test('options des trois menus : valeurs, ordre et libellés', () => {
    render(
      <TaskFormLevelsField
        onDangerChange={() => {}}
        onDifficultyChange={() => {}}
        onImportanceChange={() => {}}
      />,
    );
    const [danger, difficulty, importance] = screen.getAllByRole('combobox');
    expect(optionPairs(danger)).toEqual([
      ['', 'Non renseigné'],
      ['safe', 'Sans danger'],
      ['potential_danger', 'Danger potentiel'],
      ['dangerous', 'Dangereux'],
      ['very_dangerous', 'Très dangereux'],
    ]);
    expect(optionPairs(difficulty)).toEqual([
      ['', 'Non renseigné'],
      ['easy', 'Facile'],
      ['medium', 'Moyen'],
      ['hard', 'Compliqué'],
      ['very_hard', 'Super compliqué'],
    ]);
    expect(optionPairs(importance)).toEqual([
      ['', 'Non renseigné'],
      ['not_important', 'Pas important'],
      ['low', 'Peu important'],
      ['medium', 'Modéré'],
      ['high', 'Important'],
      ['absolute', 'Urgent !'],
    ]);
  });
});

describe('pastilles et helpers de niveaux de tâche', () => {
  test('valeurs admises, casse et espaces tolérés, valeurs inconnues ignorées', () => {
    expect(getDefinedTaskDangerLevel({ danger_level: ' Dangerous ' })).toBe('dangerous');
    expect(getDefinedTaskDangerLevel({ danger_level: 'nope' })).toBeNull();
    expect(getDefinedTaskDifficultyLevel({ difficulty_level: 'VERY_HARD' })).toBe('very_hard');
    expect(getDefinedTaskDifficultyLevel({ difficulty_level: '' })).toBeNull();
    expect(getDefinedTaskImportanceLevel({ importance_level: 'absolute' })).toBe('absolute');
    expect(getDefinedTaskImportanceLevel({ importance_level: 'urgent' })).toBeNull();
    expect(taskRequiresReferentBriefingBeforeStart({ difficulty_level: 'hard' })).toBe(true);
    expect(taskRequiresReferentBriefingBeforeStart({ danger_level: 'potential_danger' })).toBe(
      false,
    );
  });

  test('libellés des pastilles', () => {
    const cases = [
      [{ importance_level: 'not_important' }, '○ Pas important'],
      [{ importance_level: 'low' }, '◔ Peu important'],
      [{ importance_level: 'medium' }, '◕ Modéré'],
      [{ importance_level: 'high' }, '⏫ Important'],
      [{ importance_level: 'absolute' }, '🚨 Urgent !'],
      [{ difficulty_level: 'easy' }, '🌱 Facile'],
      [{ difficulty_level: 'medium' }, '🪜 Moyen'],
      [{ difficulty_level: 'hard' }, '🧗 Compliqué'],
      [{ difficulty_level: 'very_hard' }, '⛰️ Super compliqué'],
      [{ danger_level: 'safe' }, '🛡️ Sans danger'],
      [{ danger_level: 'potential_danger' }, '🔸 Danger potentiel'],
      [{ danger_level: 'dangerous' }, '⚠️ Dangereux'],
      [{ danger_level: 'very_dangerous' }, '🚨 Très dangereux'],
    ];
    for (const [task, text] of cases) {
      const { container, unmount } = render(<TaskDifficultyAndRiskChips task={task} />);
      expect(container.textContent).toBe(text);
      unmount();
    }
  });

  test('poids d’importance et tri', () => {
    expect(TASK_IMPORTANCE_SORT_WEIGHT).toEqual({
      not_important: 1,
      low: 2,
      medium: 3,
      high: 4,
      absolute: 5,
    });
    const tasks = [
      { id: 'a', importance_level: 'low', due_date: '2026-10-01' },
      { id: 'b', importance_level: null, due_date: '2026-09-01' },
      { id: 'c', importance_level: 'absolute', due_date: '2026-12-01' },
    ];
    expect([...tasks].sort(compareTasksByImportanceThenDueDate).map((t) => t.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  test('actions de statut du n3boss et libellés du filtre de récurrence', () => {
    expect(TEACHER_STATUS_ACTIONS).toEqual([
      { value: 'in_progress', label: 'En cours' },
      { value: 'available', label: 'À faire' },
      { value: 'done', label: 'Terminée' },
      { value: 'validated', label: 'Validée' },
      { value: 'proposed', label: 'Proposée' },
      { value: 'on_hold', label: 'En attente' },
    ]);
    expect(Object.entries(TASK_RECURRENCE_FILTER_LABELS)).toEqual([
      ['recurring', 'Récurrentes seulement'],
      ['weekly', 'Hebdomadaire'],
      ['biweekly', 'Toutes les 2 semaines'],
      ['monthly', 'Mensuelle'],
      ['none', 'Sans récurrence'],
    ]);
  });
});

describe('niveaux pédagogiques (miroirs ESM)', () => {
  test('étapes d’affichage, libellés et types d’interaction du collège', () => {
    expect([...biodivLevel.PEDAGO_LEVELS]).toEqual(['college', 'lycee', 'universite']);
    expect({ ...biodivLevel.PEDAGO_LEVEL_LABELS }).toEqual({
      college: 'Collège',
      lycee: 'Lycée',
      universite: 'Université',
    });
    expect([...biodivLevel.COLLEGE_FOODWEB_TYPES]).toEqual([
      'pollinisation',
      'herbivorie',
      'predation',
      'plante_hote',
      'decomposition',
      'detritivorie',
      'parasitisme',
      'competition',
      'symbiose',
    ]);
    expect(biodivLevel.normalizePedagoLevel(' Lycée ')).toBe('lycee');
    expect(biodivLevel.normalizePedagoLevel('bidon')).toBeNull();
    expect(biodivLevel.pedagoLevelLabel('UNIVERSITE')).toBe('Université');
    expect(biodivLevel.minPedagoLevel(['universite', 'lycee'])).toBe('lycee');
    expect(biodivLevel.minPedagoLevel([null, 'bidon'])).toBe('college');
  });

  test('échelles du programme et de l’apprenant', () => {
    expect([...scales.ETAPES]).toEqual(['college', 'lycee', 'universite']);
    expect([...scales.CURRICULUM_NIVEAU_VALUES]).toEqual([
      'cycle3',
      'cycle4',
      'seconde',
      'premiere_spe',
      'terminale_spe',
      'es_premiere',
      'es_terminale',
    ]);
    expect([...scales.LEARNER_NIVEAU_VALUES]).toEqual([
      'cycle3',
      'cycle4',
      'seconde',
      'premiere_spe',
      'terminale_spe',
      'es_premiere',
      'es_terminale',
      'universite',
    ]);
    expect(Object.isFrozen(scales.ETAPES)).toBe(true);
    expect(Object.isFrozen(scales.LEARNER_NIVEAU_VALUES)).toBe(true);
  });
});

describe('écrans pédagogiques', () => {
  test('clé d’identification : menu « Niveau » de l’éditeur', async () => {
    const key = {
      id: 7,
      slug: 'arbres',
      title: 'Arbres',
      niveau: 'lycee',
      is_published: 1,
      couplets: [],
    };
    apiMock.mockImplementation(async (path) => {
      if (path.startsWith('/api/id-keys?')) return { items: [key] };
      if (path.startsWith('/api/id-keys/')) return key;
      return {};
    });
    render(<IdKeysView canManage />);
    fireEvent.click(await screen.findByRole('button', { name: /Éditer/ }));
    const label = await screen.findByText('Niveau', { selector: 'label' });
    const select = within(label).getByRole('combobox');
    expect(optionPairs(select)).toEqual([
      ['college', 'Collège'],
      ['lycee', 'Lycée'],
    ]);
    expect(select.value).toBe('lycee');
  });

  test('glossaire : menu « Niveau » (profondeur du terme)', async () => {
    apiMock.mockImplementation(async (path) => {
      if (path.startsWith('/api/glossary/categories')) return { categories: [] };
      if (path.startsWith('/api/glossary/terms')) return { items: [] };
      if (path.startsWith('/api/curriculum/notions')) return { items: [] };
      return {};
    });
    render(
      <BiodivPedagoProvider>
        <GlossaryView />
      </BiodivPedagoProvider>,
    );
    const selects = await screen.findAllByRole('combobox');
    const niveau = selects.find((s) =>
      [...s.querySelectorAll('option')].some((o) => o.value === 'approfondissement'),
    );
    expect(niveau).toBeTruthy();
    expect(optionPairs(niveau)).toEqual([
      ['', 'Tous niveaux'],
      ['base', 'Base'],
      ['approfondissement', 'Approfondissement'],
      ['avance', 'Avancé'],
    ]);
  });
});
