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
