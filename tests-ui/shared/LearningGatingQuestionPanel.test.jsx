import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LearningGatingQuestionPanel } from '../../src/shared/components/LearningGatingQuestionPanel.jsx';

// D3 : 409 (présentation expirée) recharge la question ; 403 avec verrou affiche le blocage.
const presentation = {
  presentationToken: 'tok',
  question: 'Que met-on dans le compost ?',
  choices: [
    { id: 'a', text: 'Épluchures' },
    { id: 'b', text: 'Plastique' },
  ],
};

function httpError(status, body) {
  const err = new Error(body?.error || `HTTP ${status}`);
  err.status = status;
  err.body = body;
  return err;
}

async function answerWithFirstChoice(
  answerQuestion,
  presentQuestion = vi.fn(async () => presentation),
) {
  render(
    <LearningGatingQuestionPanel
      questionCode="QF0001"
      resourceType="tutorial"
      resourceRef="12"
      itemTitle="Le compostage"
      presentQuestion={presentQuestion}
      answerQuestion={answerQuestion}
      onPassed={vi.fn()}
      onAbandon={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByLabelText('Épluchures'));
  fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
  return presentQuestion;
}

describe('LearningGatingQuestionPanel — erreurs à la réponse', () => {
  test('409 : la question est rechargée avec un mot d’explication', async () => {
    const answerQuestion = vi
      .fn()
      .mockRejectedValue(httpError(409, { error: 'Présentation déjà utilisée' }));
    const presentQuestion = await answerWithFirstChoice(answerQuestion);
    await screen.findByText(/rechargée avec de nouveaux choix/);
    await waitFor(() => expect(presentQuestion).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Présentation déjà utilisée')).toBeNull();
  });

  test('403 avec verrou : le blocage est affiché, pas une erreur brute', async () => {
    const answerQuestion = vi.fn().mockRejectedValue(
      httpError(403, {
        error: 'Cette question est bloquée après une erreur',
        cooldown: { locked: true, remaining_label: '3 h', scope: 'resource' },
      }),
    );
    await answerWithFirstChoice(answerQuestion);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('3 h');
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });

  test('autre erreur : message affiché, la question reste répondable', async () => {
    const answerQuestion = vi.fn().mockRejectedValue(new Error('Réseau coupé'));
    await answerWithFirstChoice(answerQuestion);
    await screen.findByText('Réseau coupé');
    expect(screen.getByRole('button', { name: 'Valider ma réponse' })).toBeInTheDocument();
  });
});

// Ce que l'élève ne lisait nulle part : la progression après une bonne réponse, et le
// nombre d'erreurs encore permises après une mauvaise qui n'a pas (encore) bloqué.
describe('LearningGatingQuestionPanel — retour après réponse', () => {
  test('bonne réponse : félicitations et progression dans la série', async () => {
    const answerQuestion = vi.fn(async () => ({ correct: true, feedback: 'Bonne réponse !' }));
    render(
      <LearningGatingQuestionPanel
        questionCode="QF0001"
        questionIndex={0}
        questionTotal={2}
        pendingTotal={2}
        itemTitle="Le compostage"
        presentQuestion={vi.fn(async () => presentation)}
        answerQuestion={answerQuestion}
        onPassed={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByLabelText('Épluchures'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    const notice = await screen.findByText(/^Bravo/);
    expect(notice.textContent).toContain('1 sur 2');
    expect(notice.textContent).toContain('encore 1 question');
  });

  test('dernière bonne réponse : la validation est annoncée comme ouverte', async () => {
    const answerQuestion = vi.fn(async () => ({ correct: true }));
    render(
      <LearningGatingQuestionPanel
        questionCode="QF0001"
        questionIndex={0}
        questionTotal={1}
        pendingTotal={1}
        itemTitle="Le compostage"
        presentQuestion={vi.fn(async () => presentation)}
        answerQuestion={answerQuestion}
        onPassed={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByLabelText('Épluchures'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    await screen.findByText(/le contrôle est réussi/);
  });

  test('mauvaise réponse tolérée : le nombre d’essais restants est affiché', async () => {
    const answerQuestion = vi.fn(async () => ({
      correct: false,
      feedback: 'Ce n’est pas la bonne réponse.',
      cooldown: {
        locked: false,
        retry_hours: 6,
        allowed_wrong_attempts: 2,
        wrong_attempts: 1,
        attempts_left: 1,
        scope: 'resource',
      },
    }));
    render(
      <LearningGatingQuestionPanel
        questionCode="QF0001"
        itemTitle="Le compostage"
        presentQuestion={vi.fn(async () => presentation)}
        answerQuestion={answerQuestion}
        onPassed={vi.fn()}
        onAbandon={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByLabelText('Épluchures'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    await screen.findByText(/Il te reste 1 erreur possible/);
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
