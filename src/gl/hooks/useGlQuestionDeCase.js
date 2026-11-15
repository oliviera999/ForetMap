import { useCallback, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/**
 * « Tenir à deux », lot 2 — question de case due à l'arrivée du tour : l'écran d'équipe la
 * présente par le geste « Répondre », même si un sort a déplacé l'équipe entre-temps. Le
 * serveur décide (jeton de présentation, question due) ; ici on affiche et on transmet.
 */
export function useGlQuestionDeCase({ gameId, onChanged = null }) {
  const [question, setQuestion] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const presenter = useCallback(
    async (markerId) => {
      if (!gameId || !markerId) return null;
      setBusy(true);
      setError('');
      try {
        const data = await apiGL(
          `/api/gl/games/${gameId}/markers/${markerId}/present-question`,
          'POST',
          {},
        );
        setFeedback('');
        setQuestion({
          markerId,
          questionCode: data.questionCode,
          presentationToken: data.presentation?.presentationToken,
          question: data.presentation?.question,
          choices: data.presentation?.choices || [],
        });
        return data;
      } catch (err) {
        setError(err.message || 'Question indisponible');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [gameId],
  );

  const repondre = useCallback(
    async (choiceId) => {
      if (!gameId || !question) return null;
      setBusy(true);
      setError('');
      try {
        const data = await apiGL(`/api/gl/games/${gameId}/qcm/answer`, 'POST', {
          questionCode: question.questionCode,
          presentationToken: question.presentationToken,
          choiceId,
        });
        // Le retour du serveur est affiché tel quel (« Pas encore… » : rien n'est retiré).
        setFeedback(data?.feedback || '');
        setQuestion(null);
        await onChanged?.();
        return data;
      } catch (err) {
        setError(err.message || 'Réponse impossible');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [gameId, question, onChanged],
  );

  return {
    question,
    feedback,
    busy,
    error,
    presenter,
    repondre,
    fermer: () => setQuestion(null),
  };
}
