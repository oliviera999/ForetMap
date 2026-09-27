import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  answerQuizQuestion,
  drawQuizQuestion,
  fetchQuizProgress,
  presentQuizQuestion,
} from '../services/quizApi';
import { shouldShowQcmAnswerPhase } from '../shared/qcm/qcmFeedback.js';

/** Espèces liées aux termes de glossaire de la question (remédiation après réponse). */
async function fetchLinkedPlantsForTerms(terms) {
  const codes = (terms || []).map((t) => t.glossary_code).filter(Boolean);
  if (codes.length === 0) return [];
  const results = await Promise.allSettled(
    codes.map((code) => api(`/api/glossary/terms/${encodeURIComponent(code)}`)),
  );
  const byId = new Map();
  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    for (const plant of res.value?.linkedPlants || []) {
      if (plant?.id != null) byId.set(Number(plant.id), plant);
    }
  }
  return [...byId.values()];
}

/**
 * Cycle de vie d'une question du quiz ForetMap, sorti de `QuizView` (étape B2 de la piste B,
 * audit du 25/09/2026) : tirage, présentation signée, choix, réponse, remédiation (termes
 * de glossaire et espèces liées) et progression du compte, relue après chaque réponse.
 * Les filtres restent au composant, qui les passe à `drawQuestion`.
 *
 * @param {{ initialQuestionCode?: string|null }} [options] question imposée (séance, lien) :
 *   présentée sans tirage
 */
export function useQuizSession({ initialQuestionCode = null } = {}) {
  const [progress, setProgress] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [questionCode, setQuestionCode] = useState('');
  const [presentation, setPresentation] = useState(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);
  const [remediationPlants, setRemediationPlants] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchQuizProgress();
        if (!cancelled) setProgress(data);
      } catch (_) {
        if (!cancelled) setProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [answerResult]);

  useEffect(() => {
    if (!initialQuestionCode) return;
    let cancelled = false;
    (async () => {
      try {
        const code = String(initialQuestionCode).trim().toUpperCase();
        if (!code) return;
        setQuestionCode(code);
        const present = await presentQuizQuestion(code);
        if (!cancelled) {
          setPresentation(present);
          setAnswerResult(null);
          setSelectedChoiceId(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Question introuvable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialQuestionCode]);

  const showAnswer = shouldShowQcmAnswerPhase(answerResult);
  const showChoices = !drawing && !showAnswer && presentation;

  const remediationTerms = useMemo(() => {
    const fromAnswer = answerResult?.glossaryTerms || [];
    const fromPresentation = presentation?.glossaryTerms || [];
    const byCode = new Map();
    for (const term of [...fromPresentation, ...fromAnswer]) {
      if (term?.glossary_code) byCode.set(term.glossary_code, term);
    }
    return [...byCode.values()];
  }, [answerResult, presentation]);

  useEffect(() => {
    if (!showAnswer) return;
    let cancelled = false;
    (async () => {
      const plants = await fetchLinkedPlantsForTerms(remediationTerms);
      if (!cancelled) setRemediationPlants(plants);
    })();
    return () => {
      cancelled = true;
    };
  }, [showAnswer, remediationTerms]);

  /**
   * Tire puis présente une question.
   * @param {Record<string, unknown>} drawParams filtres du tirage (`quizApi.drawQuizQuestion`)
   */
  async function drawQuestion(drawParams) {
    setDrawing(true);
    setError('');
    setPresentation(null);
    setAnswerResult(null);
    setSelectedChoiceId(null);
    setQuestionCode('');
    setRemediationPlants([]);
    try {
      const draw = await drawQuizQuestion(drawParams);
      const code = draw?.question_code;
      if (!code) throw new Error('Aucune question disponible');
      setQuestionCode(code);
      const present = await presentQuizQuestion(code);
      setPresentation(present);
    } catch (err) {
      setError(err.message || 'Tirage impossible');
    } finally {
      setDrawing(false);
    }
  }

  async function submitAnswer() {
    if (!questionCode || !presentation?.presentationToken || selectedChoiceId == null) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await answerQuizQuestion(questionCode, {
        presentationToken: presentation.presentationToken,
        choiceId: selectedChoiceId,
      });
      setAnswerResult(data);
    } catch (err) {
      setError(err.message || 'Envoi impossible');
    } finally {
      setSubmitting(false);
    }
  }

  function resetQuestion() {
    setPresentation(null);
    setAnswerResult(null);
    setSelectedChoiceId(null);
    setQuestionCode('');
    setRemediationPlants([]);
    setError('');
  }

  return {
    progress,
    drawing,
    questionCode,
    presentation,
    selectedChoiceId,
    setSelectedChoiceId,
    submitting,
    answerResult,
    remediationTerms,
    remediationPlants,
    error,
    showAnswer,
    showChoices,
    drawQuestion,
    submitAnswer,
    resetQuestion,
  };
}
