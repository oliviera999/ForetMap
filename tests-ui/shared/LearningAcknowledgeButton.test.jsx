import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LearningAcknowledgeButton } from '../../src/shared/components/LearningAcknowledgeButton.jsx';
import { LEARNING_GATING_CHANGED_EVENT } from '../../src/shared/utils/learningGatingEvents.js';

// D3 / D4 (docs/AUDIT_VALIDATION_QUIZ_2026-09.md) : les erreurs du serveur sont lues (statut,
// corps) plutôt qu'affichées en texte brut, et chaque progrès est annoncé aux résumés.

const resource = { resourceType: 'tutorial', resourceRef: '12' };

function httpError(status, body) {
  const err = new Error(body?.error || `HTTP ${status}`);
  err.status = status;
  err.body = body;
  return err;
}

function handlers(overrides = {}) {
  return {
    fetchChallenge: vi.fn(async () => ({ required: false, questions: [], pending_count: 0 })),
    presentQuestion: vi.fn(),
    answerQuestion: vi.fn(),
    ...overrides,
  };
}

describe('LearningAcknowledgeButton — erreurs du serveur', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('challenge illisible → phase « erreur » avec « Réessayer », pas la confirmation', async () => {
    const fetchChallenge = vi
      .fn()
      .mockRejectedValueOnce(new Error('Serveur indisponible'))
      .mockResolvedValueOnce({ required: false, questions: [], pending_count: 0 });
    render(
      <LearningAcknowledgeButton
        itemTitle="Le compostage"
        gatingHandlers={handlers({ fetchChallenge })}
        gatingResource={resource}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Marquer comme lu/ }));
    await screen.findByText('Serveur indisponible');
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('checkbox');
    expect(fetchChallenge).toHaveBeenCalledTimes(2);
  });

  test('403 avec verrou à la confirmation → écran « Réessaie plus tard »', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      httpError(403, {
        error: 'Une erreur a été commise',
        missing_question_codes: [],
        cooldown: { locked: true, remaining_label: '5 h' },
      }),
    );
    render(
      <LearningAcknowledgeButton
        itemTitle="Le compostage"
        gatingHandlers={handlers()}
        gatingResource={resource}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Marquer comme lu/ }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await screen.findByText(/Réessaie plus tard/);
    expect(screen.getByRole('alert').textContent).toContain('5 h');
  });

  test('403 avec questions manquantes → retour au contrôle, avec le nombre à réussir', async () => {
    const fetchChallenge = vi
      .fn()
      .mockResolvedValueOnce({ required: false, questions: [], pending_count: 0 })
      .mockResolvedValueOnce({
        required: true,
        questions: [{ question_code: 'QF0001', already_correct: false }],
        pending_count: 1,
        ask_count: 1,
        retry_cooldown_hours: 6,
      });
    const onSubmit = vi
      .fn()
      .mockRejectedValue(httpError(403, { error: 'Répondez', missing_question_codes: ['QF0001'] }));
    render(
      <LearningAcknowledgeButton
        itemTitle="Le compostage"
        gatingHandlers={handlers({ fetchChallenge })}
        gatingResource={resource}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Marquer comme lu/ }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await screen.findByText(/1 question à réussir/);
    expect(screen.getByRole('button', { name: 'Commencer' })).toBeInTheDocument();
  });

  test('une validation réussie annonce le changement aux résumés (D4)', async () => {
    const listener = vi.fn();
    window.addEventListener(LEARNING_GATING_CHANGED_EVENT, listener);
    render(
      <LearningAcknowledgeButton
        itemTitle="Le compostage"
        gatingHandlers={handlers()}
        gatingResource={resource}
        onSubmit={vi.fn().mockResolvedValue({})}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Marquer comme lu/ }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      resourceRef: '12',
      kind: 'acknowledged',
    });
    window.removeEventListener(LEARNING_GATING_CHANGED_EVENT, listener);
  });
});

// Plafond « questions posées d'affilée » : la série finie ne vaut pas contrôle satisfait.
// L'écran envoyait pourtant sur la confirmation, que le serveur refusait ensuite (403).
describe('LearningAcknowledgeButton — série terminée mais contrôle inachevé', () => {
  test('annonce le reliquat au lieu de proposer une confirmation impossible', async () => {
    const fetchChallenge = vi.fn(async () => ({
      required: true,
      questions: [
        { question_code: 'QF0001', already_correct: false },
        { question_code: 'QF0002', already_correct: false },
      ],
      pending_count: 3,
      ask_count: 1,
      retry_cooldown_hours: 0,
    }));
    const presentQuestion = vi.fn(async () => ({
      presentationToken: 'tok',
      question: 'Que met-on dans le compost ?',
      choices: [{ id: 'a', text: 'Épluchures' }],
    }));
    const answerQuestion = vi.fn(async () => ({ correct: true }));
    render(
      <LearningAcknowledgeButton
        itemTitle="Le compostage"
        gatingHandlers={handlers({ fetchChallenge, presentQuestion, answerQuestion })}
        gatingResource={resource}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Marquer comme lu/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    fireEvent.click(await screen.findByLabelText('Épluchures'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    await screen.findByText(/Série terminée/);
    expect(screen.getByText(/2 questions à réussir/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continuer le contrôle' })).toBeInTheDocument();
  });
});
