import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LearningGatingQuestionPanel,
  LEARNING_LOGIN_REQUIRED_MESSAGE,
} from '../src/shared/components/LearningGatingQuestionPanel.jsx';

/**
 * Audit ForetMap du 19/11/2026, constat P1 : la validation d'une fiche exige désormais un
 * compte (401 à la présentation comme à la réponse avec contexte). Le panneau du contrôle de
 * compréhension invite à se connecter au lieu d'afficher une erreur brute.
 */

const presentation = {
  presentationToken: 'tok',
  question: 'Que met-on dans le compost ?',
  choices: [
    { id: 0, text: 'Épluchures' },
    { id: 1, text: 'Plastique' },
  ],
};

function httpError(status, body) {
  const err = new Error(body?.error || `HTTP ${status}`);
  err.status = status;
  err.body = body;
  return err;
}

const LOGIN_BODY = {
  error: 'Connecte-toi pour débloquer cette fiche : la validation se fait avec ton compte.',
  code: 'LOGIN_REQUIRED',
};

function renderPanel({ presentQuestion, answerQuestion, onAbandon = vi.fn() }) {
  render(
    <LearningGatingQuestionPanel
      questionCode="QF0001"
      resourceType="tutorial"
      resourceRef="12"
      itemTitle="Le compostage"
      presentQuestion={presentQuestion}
      answerQuestion={answerQuestion}
      onPassed={vi.fn()}
      onAbandon={onAbandon}
    />,
  );
  return { onAbandon };
}

describe('LearningGatingQuestionPanel — compte exigé (audit lot 9, P1)', () => {
  test('401 à la présentation : message « connecte-toi », pas d’erreur, bouton Fermer', async () => {
    const presentQuestion = vi.fn().mockRejectedValue(httpError(401, LOGIN_BODY));
    const { onAbandon } = renderPanel({ presentQuestion, answerQuestion: vi.fn() });
    const notice = await screen.findByTestId('learning-gating-login-required');
    expect(notice.textContent).toBe(LEARNING_LOGIN_REQUIRED_MESSAGE);
    expect(notice.getAttribute('role')).toBe('status');
    expect(document.querySelector('.tuto-read-ack-error')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  test('401 à la réponse : la question disparaît au profit du message de connexion', async () => {
    const presentQuestion = vi.fn(async () => presentation);
    const answerQuestion = vi.fn().mockRejectedValue(httpError(401, LOGIN_BODY));
    renderPanel({ presentQuestion, answerQuestion });
    fireEvent.click(await screen.findByLabelText('Épluchures'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    await screen.findByTestId('learning-gating-login-required');
    expect(screen.queryByText('Que met-on dans le compost ?')).toBeNull();
    expect(document.querySelector('.tuto-read-ack-error')).toBeNull();
  });
});
