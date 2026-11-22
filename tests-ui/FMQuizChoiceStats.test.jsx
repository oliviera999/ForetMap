import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  FMQuizChoiceBar,
  FMQuizItemStatsSummary,
} from '../src/components/pedago/admin/FMQuizChoiceStats.jsx';
import {
  formatDurationMs,
  formatIndex,
  formatPercent,
  sortSuspectFirst,
} from '../src/components/pedago/admin/fmQuizChoiceStatsModel.js';
import { FMQuizQuestionEditorPanel } from '../src/components/pedago/admin/FMQuizQuestionEditorPanel.jsx';
import { sortQcmItems as sortGlBiomeItems } from '../src/gl/utils/glQcmEditorForm.js';
import { sortQcmItems as sortGlLoreItems } from '../src/gl/utils/glQcmLoreEditorForm.js';

// Statistiques d'items dans l'écran d'édition des questions du quiz (migration
// `quiz_attempt_choice`, lot D) : barres sous les choix, badges, encart, seuils non atteints
// affichés comme tels, tri « Suspectes d'abord ».

const apiMock = vi.fn();
vi.mock('../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
}));

function stat(overrides = {}) {
  return {
    question_code: 'QF0001',
    suspect: true,
    success_rate: 0.32,
    signaux: { reussite_faible: true, attracteur: true, discrimination_negative: false },
    version: {
      empreinte: 'abcdefabcdef',
      tentatives: 25,
      choix_connus: 25,
      success_rate: 0.32,
      tentatives_versions_anterieures: 4,
      tentatives_sans_version: 3,
    },
    repartition: [
      { lettre: 'A', effectif: 8, pourcentage: 32, correcte: true },
      { lettre: 'B', effectif: 12, pourcentage: 48, correcte: false },
      { lettre: 'C', effectif: 5, pourcentage: 20, correcte: false },
      { lettre: 'D', effectif: 0, pourcentage: 0, correcte: false },
    ],
    attracteurs: ['B'],
    distracteurs_morts: ['D'],
    distracteurs_morts_evalues: true,
    discrimination: { disponible: false, repondants: 12, seuil_repondants: 30, negative: false },
    temps_median_ms: { global: 12400, bonnes_reponses: 9000, mesures: 25 },
    ...overrides,
  };
}

describe('formats et tri (fonctions pures)', () => {
  it('durée, pourcentage, indice en notation française', () => {
    expect(formatDurationMs(12400)).toBe('12 s');
    expect(formatDurationMs(65000)).toBe('1 min 05 s');
    expect(formatDurationMs(null)).toBe(null);
    expect(formatPercent(12.5)).toBe('12,5 %');
    expect(formatPercent(null)).toBe('—');
    expect(formatIndex(0.45)).toBe('0,45');
    expect(formatIndex(-0.2)).toBe('−0,2');
  });

  it('suspectes d’abord : le plus de signaux, puis la réussite la plus basse, puis l’ordre de base', () => {
    const items = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].map((question_code) => ({ question_code }));
    const stats = [
      { question_code: 'Q2', suspect: true, success_rate: 0.5, signaux: { attracteur: true } },
      {
        question_code: 'Q4',
        suspect: true,
        success_rate: 0.6,
        signaux: { attracteur: true, discrimination_negative: true },
      },
      { question_code: 'Q5', suspect: true, success_rate: 0.1, signaux: { attracteur: true } },
      { question_code: 'Q1', suspect: false, success_rate: 0.9, signaux: {} },
    ];
    const order = sortSuspectFirst(items, stats, (rows) => rows).map((i) => i.question_code);
    expect(order).toEqual(['Q4', 'Q5', 'Q2', 'Q1', 'Q3']);
    // Sans statistiques : ordre de base intact.
    expect(sortSuspectFirst(items, [], (rows) => rows).map((i) => i.question_code)).toEqual([
      'Q1',
      'Q2',
      'Q3',
      'Q4',
      'Q5',
    ]);
  });
});

describe('FMQuizChoiceBar', () => {
  it('barre décorative, pourcentage en texte, badges attracteur et mort', () => {
    const { container, rerender } = render(<FMQuizChoiceBar stat={stat()} letter="B" />);
    expect(screen.getByText('Choisi par 48 % des réponses (12 sur 25)')).toBeTruthy();
    expect(screen.getByText('⚠ Attire plus que la bonne réponse')).toBeTruthy();
    const track = container.querySelector('.fm-choice-stat__track');
    expect(track.getAttribute('aria-hidden')).toBe('true');
    expect(
      container.querySelector('.fm-choice-stat__bar').style.getPropertyValue('--fm-choice-pct'),
    ).toBe('48%');

    rerender(<FMQuizChoiceBar stat={stat()} letter="D" />);
    expect(screen.getByText('Personne ne le choisit')).toBeTruthy();
    expect(screen.queryByText('⚠ Attire plus que la bonne réponse')).toBeNull();

    rerender(<FMQuizChoiceBar stat={stat()} letter="A" />);
    // La bonne réponse est dite en texte, pas seulement par la couleur.
    expect(screen.getByText(/Bonne réponse — Choisi par 32 %/)).toBeTruthy();
  });

  it('aucune réponse de la version : dit tel quel ; sans statistiques : rien', () => {
    const empty = stat({
      version: { ...stat().version, tentatives: 0, choix_connus: 0 },
      repartition: stat().repartition.map((r) => ({ ...r, effectif: 0, pourcentage: null })),
    });
    const { container, rerender } = render(<FMQuizChoiceBar stat={empty} letter="B" />);
    expect(screen.getByText(/aucune réponse enregistrée pour cette version/)).toBeTruthy();
    rerender(<FMQuizChoiceBar stat={null} letter="B" />);
    expect(container.textContent).toBe('');
    rerender(<FMQuizChoiceBar stat={stat()} letter="E" />);
    expect(container.textContent).toBe('');
  });
});

describe('FMQuizItemStatsSummary', () => {
  it('mention de version, seuil de discrimination non atteint, temps médian', () => {
    render(<FMQuizItemStatsSummary stat={stat()} />);
    expect(
      screen.getByText(
        /Statistiques de la version actuelle : 25 réponses \(4 sur les versions précédentes, 3 plus anciennes/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Discrimination : pas encore calculable (12 élèves sur 30 nécessaires).'),
    ).toBeTruthy();
    expect(
      screen.getByText('Temps médian de réponse : 12 s (bonnes réponses : 9 s).'),
    ).toBeTruthy();
    expect(screen.getByText(/compare la réussite des élèves les plus à l’aise/)).toBeTruthy();
  });

  it('distracteurs morts pas encore évalués ; discrimination négative signalée en texte', () => {
    render(
      <FMQuizItemStatsSummary
        stat={stat({
          version: { ...stat().version, choix_connus: 7 },
          distracteurs_morts_evalues: false,
          discrimination: {
            disponible: true,
            indice: -0.25,
            negative: true,
            repondants: 40,
            seuil_repondants: 30,
          },
          temps_median_ms: { global: null, bonnes_reponses: null, mesures: 0 },
        })}
      />,
    );
    expect(
      screen.getByText(
        'Les choix que personne ne prend sont repérés à partir de 20 réponses (7 pour l’instant).',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Discrimination : −0,25')).toBeTruthy();
    expect(
      screen.getByText(/Les élèves les plus à l’aise la ratent plus que les autres/),
    ).toBeTruthy();
    expect(screen.getByText('Temps médian de réponse : pas encore mesuré.')).toBeTruthy();
  });

  it('aucune statistique : le dit', () => {
    render(<FMQuizItemStatsSummary stat={null} />);
    expect(screen.getByText('Aucune réponse enregistrée pour cette question.')).toBeTruthy();
  });
});

describe('G&L : le 3ᵉ argument de clientSort ne change aucun tri', () => {
  const items = [
    {
      question_code: 'Q3',
      biome_slug: 'mare',
      chapitre_slug: 'c2',
      categorie_slug: 'b',
      numero_dans_categorie: 2,
      difficulte: 2,
    },
    {
      question_code: 'Q1',
      biome_slug: 'foret',
      chapitre_slug: 'c1',
      categorie_slug: 'a',
      numero_dans_categorie: 1,
      difficulte: null,
    },
    {
      question_code: 'Q2',
      biome_slug: 'foret',
      chapitre_slug: 'c1',
      categorie_slug: 'a',
      numero_dans_categorie: 3,
      difficulte: 1,
    },
  ];
  const refs = { questionStats: [{ question_code: 'Q3', suspect: true }] };
  for (const [name, sort] of [
    ['biomes', sortGlBiomeItems],
    ['lore', sortGlLoreItems],
  ]) {
    for (const sortBy of [
      'theme',
      'biome',
      'code',
      'code_desc',
      'category',
      'difficulte',
      'suspect',
    ]) {
      it(`${name} / ${sortBy}`, () => {
        const before = sort(items, sortBy).map((i) => i.question_code);
        expect(sort(items, sortBy, { refs }).map((i) => i.question_code)).toEqual(before);
      });
    }
  }
});

describe('Écran d’édition du quiz (montage)', () => {
  const list = [
    {
      question_code: 'QF0001',
      theme: 'sciences',
      categorie_slug: 'vivant',
      numero_dans_categorie: 1,
      question: 'Première ?',
      statut: 'actif',
    },
    {
      question_code: 'QF0002',
      theme: 'sciences',
      categorie_slug: 'vivant',
      numero_dans_categorie: 2,
      question: 'Deuxième ?',
      statut: 'actif',
    },
  ];
  const question = {
    question_code: 'QF0002',
    categorie_slug: 'vivant',
    numero_dans_categorie: 2,
    niveau: 'college',
    statut: 'actif',
    question: 'Deuxième ?',
    choix_a: 'Bonne',
    choix_b: 'Piège',
    choix_c: 'Autre',
    choix_d: 'Morte',
    reponse_correcte: 'A',
  };

  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (path) => {
      if (path.startsWith('/api/quiz/categories')) {
        return { categories: [{ slug: 'vivant', nom: 'Vivant', theme: 'sciences' }] };
      }
      if (path.startsWith('/api/quiz/admin/questions/stats')) {
        return { stats: [stat({ question_code: 'QF0002' })] };
      }
      if (path.startsWith('/api/quiz/admin/questions/QF0002')) return { question };
      if (path.startsWith('/api/quiz/admin/questions')) return { items: list };
      return {};
    });
  });

  it('tri « Suspectes d’abord », puis barres et encart sur la question ouverte', async () => {
    const { container } = render(<FMQuizQuestionEditorPanel />);
    await screen.findByText('Première ?');
    await waitFor(() =>
      expect(apiMock.mock.calls.some((c) => c[0].includes('/admin/questions/stats'))).toBe(true),
    );
    const listCodes = () =>
      [...container.querySelectorAll('.pedago-quiz-editor__list-item strong')].map(
        (n) => n.textContent,
      );
    expect(listCodes()).toEqual(['QF0001', 'QF0002']);
    fireEvent.change(screen.getByLabelText('Tri'), { target: { value: 'suspect' } });
    await waitFor(() => expect(listCodes()).toEqual(['QF0002', 'QF0001']));

    fireEvent.click(screen.getByText('Deuxième ?'));
    await screen.findByDisplayValue('Piège');
    const choiceB = screen.getByDisplayValue('Piège').closest('.fm-choice-field');
    expect(within(choiceB).getByText('Choisi par 48 % des réponses (12 sur 25)')).toBeTruthy();
    expect(within(choiceB).getByText('⚠ Attire plus que la bonne réponse')).toBeTruthy();
    expect(screen.getByText(/Statistiques de la version actuelle : 25 réponses/)).toBeTruthy();
  });
});
