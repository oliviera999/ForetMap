// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

/**
 * Test de montage de `QuizView` — posé AVANT d'en extraire le cycle de vie d'une question
 * (hook `useQuizSession`) et le client `quizApi` (étape B2 de la piste B, audit du
 * 25/09/2026, § 3.3 ligne 8). Il suit le parcours d'un élève : filtres, tirage,
 * présentation, réponse, feedback, remédiation, nouvelle question — et fige les URL
 * appelées, qui doivent rester identiques après l'extraction.
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

vi.mock('../../../src/hooks/useGlossaryLinkIndex.js', () => ({
  useGlossaryLinkIndex: () => [],
  resetGlossaryLinkIndexCache: () => {},
}));

vi.mock('../../../src/shared/components/LearningQuizPopover.jsx', () => ({
  LearningQuizPopover: ({ children, onClose }) => (
    <div data-testid="quiz-popover">
      <button type="button" onClick={onClose}>
        Fermer la fenêtre
      </button>
      {children}
    </div>
  ),
}));

import { QuizView } from '../../../src/components/pedago/QuizView.jsx';
import { resetCurriculumNotionsCache } from '../../../src/hooks/useCurriculumNotions.js';

const CATEGORIES = [
  { slug: 'vivant', nom: 'Le vivant', emoji: '🌱', questionCount: 4 },
  { slug: 'sol', nom: 'Le sol', emoji: '', questionCount: 2 },
];
const PRESENTATION = {
  presentationToken: 'jeton-1',
  questionCode: 'QF0042',
  question: 'Quelle plante fixe l’azote ?',
  choices: [
    { id: 0, text: 'Le trèfle' },
    { id: 1, text: 'Le pissenlit' },
  ],
  glossaryTerms: [{ glossary_code: 'G-AZOTE', terme: 'Azote' }],
  photoUrl: 'https://example.org/trefle.jpg',
  photoCredit: 'A. Auteur',
  photoLicence: 'CC BY',
};

let progress;
let answerResponse;

function paths() {
  return apiMock.mock.calls.map(([p]) => String(p));
}

beforeEach(() => {
  apiMock.mockReset();
  resetCurriculumNotionsCache();
  progress = { attempts: 5, correct: 3 };
  answerResponse = {
    correct: true,
    feedback: 'Oui : ses nodosités hébergent des bactéries.',
    correctChoiceId: 0,
    glossaryTerms: [{ glossary_code: 'G-NODO', terme: 'Nodosité' }],
  };
  apiMock.mockImplementation((path, method) => {
    if (path.startsWith('/api/curriculum/notions')) return Promise.resolve({ items: [] });
    if (path.startsWith('/api/quiz/me/progress')) return Promise.resolve(progress);
    if (path.startsWith('/api/quiz/categories')) return Promise.resolve({ categories: CATEGORIES });
    if (path.startsWith('/api/quiz/draw')) return Promise.resolve({ question_code: 'QF0042' });
    if (path.endsWith('/present')) return Promise.resolve(PRESENTATION);
    if (path.endsWith('/answer') && method === 'POST') return Promise.resolve(answerResponse);
    if (path.startsWith('/api/glossary/terms/G-NODO')) {
      return Promise.resolve({ linkedPlants: [{ id: 7, name: 'Trèfle blanc', emoji: '☘️' }] });
    }
    if (path.startsWith('/api/glossary/terms/')) return Promise.resolve({ linkedPlants: [] });
    return Promise.resolve({});
  });
});

async function drawAndPresent() {
  fireEvent.click(screen.getByRole('button', { name: 'Tirer une question' }));
  await screen.findByText('Quelle plante fixe l’azote ?');
}

describe('QuizView — montage et parcours élève', () => {
  it('au montage : catégories, progression et invitation à tirer', async () => {
    render(<QuizView />);
    expect(screen.getByText('Choisis des filtres puis lance un tirage aléatoire.')).toBeTruthy();
    expect(await screen.findByText('Progression : 3/5 bonnes réponses')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: '🌱 Le vivant (4)' })).toBeTruthy(),
    );
    expect(screen.getByRole('option', { name: 'Le sol (2)' })).toBeTruthy();
    expect(paths()).toContain('/api/quiz/categories');
    expect(paths()).toContain('/api/quiz/me/progress');
  });

  it('tirage : URL des filtres, présentation, photo et glossaire masqué avant réponse', async () => {
    render(<QuizView />);
    await screen.findByRole('option', { name: '🌱 Le vivant (4)' });
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'vivant' } });
    fireEvent.change(screen.getByLabelText('Difficulté'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Illustrées'));
    await drawAndPresent();

    expect(paths()).toContain('/api/quiz/draw?categorieSlug=vivant&difficulte=2&illustrated=1');
    expect(paths()).toContain('/api/quiz/questions/QF0042/present');
    expect(screen.getByText('Question QF0042')).toBeTruthy();
    expect(screen.getByText('A. Auteur — CC BY')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    // Glossaire utile : visible seulement après la réponse (sinon il donne la réponse).
    expect(screen.queryByText('Glossaire utile')).toBeNull();
    expect(screen.getByRole('button', { name: 'Valider ma réponse' }).disabled).toBe(true);
  });

  it('tirage sans filtre : URL avec « ? » final, comme avant', async () => {
    render(<QuizView />);
    await drawAndPresent();
    expect(paths()).toContain('/api/quiz/draw?');
  });

  it('réponse : envoi signé, feedback, remédiation glossaire et espèces, progression relue', async () => {
    const onOpenPlant = vi.fn();
    const onOpenGlossaryTerm = vi.fn();
    render(<QuizView onOpenPlant={onOpenPlant} onOpenGlossaryTerm={onOpenGlossaryTerm} />);
    await drawAndPresent();
    const progressCalls = paths().filter((p) => p === '/api/quiz/me/progress').length;

    fireEvent.click(screen.getByLabelText('Le trèfle'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));

    expect(await screen.findByText('Oui : ses nodosités hébergent des bactéries.')).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith('/api/quiz/questions/QF0042/answer', 'POST', {
      presentationToken: 'jeton-1',
      choiceId: 0,
    });
    // Les choix disparaissent, la remédiation apparaît.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const glossary = screen.getByText('Pour approfondir — glossaire').parentElement;
    expect(within(glossary).getByRole('button', { name: 'Azote' })).toBeTruthy();
    fireEvent.click(within(glossary).getByRole('button', { name: 'Nodosité' }));
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('G-NODO');

    const plantChip = await screen.findByRole('button', { name: '☘️ Trèfle blanc' });
    fireEvent.click(plantChip);
    expect(onOpenPlant).toHaveBeenCalledWith(7);
    expect(paths()).toContain('/api/glossary/terms/G-AZOTE');
    expect(paths()).toContain('/api/glossary/terms/G-NODO');

    await waitFor(() =>
      expect(paths().filter((p) => p === '/api/quiz/me/progress').length).toBe(progressCalls + 1),
    );
  });

  it('« Nouvelle question » revient à l’invitation ; « Re-tirer » relance un tirage', async () => {
    render(<QuizView />);
    await drawAndPresent();
    fireEvent.click(screen.getByLabelText('Le pissenlit'));
    answerResponse = { correct: false, feedback: 'Non, pas le pissenlit.' };
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    await screen.findByText('Non, pas le pissenlit.');

    const drawsBefore = paths().filter((p) => p.startsWith('/api/quiz/draw')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Re-tirer' }));
    await screen.findByText('Quelle plante fixe l’azote ?');
    expect(paths().filter((p) => p.startsWith('/api/quiz/draw')).length).toBe(drawsBefore + 1);
    expect(screen.queryByText('Non, pas le pissenlit.')).toBeNull();

    fireEvent.click(screen.getByLabelText('Le trèfle'));
    answerResponse = { correct: true, feedback: 'Bien vu.' };
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    await screen.findByText('Bien vu.');
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle question' }));
    expect(screen.getByText('Choisis des filtres puis lance un tirage aléatoire.')).toBeTruthy();
    expect(screen.queryByText('Question QF0042')).toBeNull();
  });

  it('erreurs : tirage vide, API en échec, envoi en échec', async () => {
    render(<QuizView />);
    apiMock.mockImplementationOnce(() => Promise.resolve({}));
    fireEvent.click(screen.getByRole('button', { name: 'Tirer une question' }));
    expect(await screen.findByText('Aucune question disponible')).toBeTruthy();
    // L'invitation disparaît tant qu'une erreur est affichée.
    expect(screen.queryByText('Choisis des filtres puis lance un tirage aléatoire.')).toBeNull();

    apiMock.mockImplementationOnce(() => Promise.reject(new Error('Serveur indisponible')));
    fireEvent.click(screen.getByRole('button', { name: 'Tirer une question' }));
    expect(await screen.findByText('Serveur indisponible')).toBeTruthy();

    await drawAndPresent();
    expect(screen.queryByText('Serveur indisponible')).toBeNull();
    fireEvent.click(screen.getByLabelText('Le trèfle'));
    apiMock.mockImplementationOnce(() => Promise.reject(new Error('Présentation déjà utilisée')));
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    expect(await screen.findByText('Présentation déjà utilisée')).toBeTruthy();
    // La question reste affichée : l'élève peut réessayer.
    expect(screen.getByText('Quelle plante fixe l’azote ?')).toBeTruthy();
  });

  it('question imposée (séance, lien) : présentée sans tirage, code en majuscules', async () => {
    render(<QuizView initialQuestionCode=" qf0042 " />);
    await screen.findByText('Quelle plante fixe l’azote ?');
    expect(paths()).toContain('/api/quiz/questions/QF0042/present');
    expect(paths().some((p) => p.startsWith('/api/quiz/draw'))).toBe(false);
  });

  it('question imposée introuvable : message d’erreur', async () => {
    apiMock.mockImplementation((path) => {
      if (path.endsWith('/present')) return Promise.reject(new Error('Question introuvable'));
      if (path.startsWith('/api/quiz/categories')) return Promise.resolve({ categories: [] });
      return Promise.resolve(null);
    });
    render(<QuizView initialQuestionCode="QF9999" />);
    expect(await screen.findByText('Question introuvable')).toBeTruthy();
  });

  it('fenêtre : même question, fermée à la demande', async () => {
    render(<QuizView />);
    await drawAndPresent();
    fireEvent.click(screen.getByRole('button', { name: '⤢ Ouvrir en fenêtre' }));
    const popover = screen.getByTestId('quiz-popover');
    expect(within(popover).getByText('Quelle plante fixe l’azote ?')).toBeTruthy();
    // Deux surfaces, deux groupes de boutons radio distincts.
    const names = new Set(screen.getAllByRole('radio').map((r) => r.getAttribute('name')));
    expect([...names].sort()).toEqual(['pedago-quiz-choice-page', 'pedago-quiz-choice-popover']);
    fireEvent.click(within(popover).getByRole('button', { name: 'Fermer la fenêtre' }));
    expect(screen.queryByTestId('quiz-popover')).toBeNull();
  });
});
