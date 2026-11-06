import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/**
 * « Tenir à deux » — la chasse côté client : carnet de la classe (`GET /chasse`), fouille au
 * clic, réponse à la question de chasse, ouverture et tenue d'une page. Comme pour le tour, la
 * vérité est côté serveur : chaque action recharge le carnet puis appelle `onChanged`.
 */
export function useGlChasse({ gameId, enabled = true, onChanged = null }) {
  const [carnet, setCarnet] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fouilleMode, setFouilleMode] = useState(false);
  /** Question de chasse en cours `{ zoneKey, question }` ou page ouverte `{ page }`. */
  const [question, setQuestion] = useState(null);
  const [page, setPage] = useState(null);
  const [dernierVerdict, setDernierVerdict] = useState(null);

  const refresh = useCallback(async () => {
    if (!gameId || !enabled) return null;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/chasse`);
      setCarnet(data);
      setError('');
      return data;
    } catch (err) {
      setError(err.message || 'Carnet indisponible');
      return null;
    }
  }, [gameId, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(
    async (fn) => {
      setBusy(true);
      setError('');
      try {
        const result = await fn();
        await refresh();
        await onChanged?.();
        return result;
      } catch (err) {
        setError(err.message || 'Action impossible');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh, onChanged],
  );

  const fouiller = useCallback(
    async ({ x, y, teamId = null }) => {
      const result = await run(() =>
        apiGL(`/api/gl/games/${gameId}/chasse/fouiller`, 'POST', {
          x,
          y,
          ...(teamId != null ? { teamId } : {}),
        }),
      );
      if (result) {
        setDernierVerdict({ verdict: result.verdict, zoneKey: result.zoneKey, at: Date.now() });
        if (result.question) setQuestion({ zoneKey: result.zoneKey, question: result.question });
        setFouilleMode(false);
      }
      return result;
    },
    [gameId, run],
  );

  const repondre = useCallback(
    async (choiceId, teamId = null) => {
      if (!question?.question) return null;
      const result = await run(() =>
        apiGL(`/api/gl/games/${gameId}/chasse/repondre`, 'POST', {
          presentationToken: question.question.presentationToken,
          questionCode: question.question.questionCode,
          choiceId,
          ...(teamId != null ? { teamId } : {}),
        }),
      );
      if (result) {
        setQuestion(null);
        setDernierVerdict({
          verdict: result.correct ? 'page_trouvee' : 'pas_encore',
          zoneKey: result.zoneKey || question.zoneKey,
          feedback: result.feedback,
          at: Date.now(),
        });
      }
      return result;
    },
    [gameId, run, question],
  );

  const ouvrir = useCallback(
    async (zoneKey, teamId = null) => {
      const result = await run(() =>
        apiGL(
          `/api/gl/games/${gameId}/chasse/pages/${encodeURIComponent(zoneKey)}/ouvrir`,
          'POST',
          teamId != null ? { teamId } : {},
        ),
      );
      if (result) setPage({ zoneKey, ...result });
      return result;
    },
    [gameId, run],
  );

  const tenir = useCallback(
    async (choiceId, teamId = null) => {
      if (!page?.question) return null;
      const result = await run(() =>
        apiGL(
          `/api/gl/games/${gameId}/chasse/pages/${encodeURIComponent(page.zoneKey)}/tenir`,
          'POST',
          {
            presentationToken: page.question.presentationToken,
            questionCode: page.question.questionCode,
            choiceId,
            ...(teamId != null ? { teamId } : {}),
          },
        ),
      );
      if (result) {
        setPage((prev) =>
          prev
            ? {
                ...prev,
                etat: result.etat || prev.etat,
                peutTenir: result.correct ? false : prev.peutTenir,
                question: result.correct ? null : result.question || prev.question,
                feedback: result.feedback,
              }
            : prev,
        );
      }
      return result;
    },
    [gameId, run, page],
  );

  return {
    carnet,
    error,
    busy,
    refresh,
    fouilleMode,
    setFouilleMode,
    question,
    clearQuestion: () => setQuestion(null),
    page,
    closePage: () => setPage(null),
    dernierVerdict,
    fouiller,
    repondre,
    ouvrir,
    tenir,
  };
}
