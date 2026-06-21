import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import {
  PedagoQcmFeedbackBlock,
  shouldShowPedagoQcmAnswerPhase,
} from './PedagoQcmFeedbackBlock.jsx';

const THEME_OPTIONS = [
  { value: '', label: 'Tous thèmes' },
  { value: 'sciences', label: 'Sciences du vivant' },
  { value: 'jardinage', label: 'Jardinage' },
];

const NIVEAU_OPTIONS = [
  { value: '', label: 'Tous niveaux' },
  { value: 'college', label: 'Collège' },
  { value: 'lycee', label: 'Lycée' },
];

const DIFFICULTE_OPTIONS = [
  { value: '', label: 'Toute difficulté' },
  { value: '1', label: '★ Facile' },
  { value: '2', label: '★★' },
  { value: '3', label: '★★★' },
  { value: '4', label: '★★★★' },
  { value: '5', label: '★★★★★ Difficile' },
];

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

export function QuizView({ onOpenPlant, onOpenGlossaryTerm, initialQuestionCode = null }) {
  const [theme, setTheme] = useState('');
  const [niveau, setNiveau] = useState('');
  const [difficulte, setDifficulte] = useState('');
  const [categorieSlug, setCategorieSlug] = useState('');
  const [illustratedOnly, setIllustratedOnly] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [progress, setProgress] = useState(null);

  const [drawing, setDrawing] = useState(false);
  const [questionCode, setQuestionCode] = useState('');
  const [presentation, setPresentation] = useState(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);
  const [remediationPlants, setRemediationPlants] = useState([]);
  const [error, setError] = useState('');

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const params = new URLSearchParams();
      if (theme) params.set('theme', theme);
      if (niveau) params.set('niveau', niveau);
      const qs = params.toString();
      const data = await api(`/api/quiz/categories${qs ? `?${qs}` : ''}`);
      setCategories(Array.isArray(data?.categories) ? data.categories : []);
    } catch (_) {
      setCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  }, [theme, niveau]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/quiz/me/progress');
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
        const present = await api(`/api/quiz/questions/${encodeURIComponent(code)}/present`);
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

  useEffect(() => {
    if (!categorieSlug) return;
    if (!categories.some((c) => c.slug === categorieSlug)) setCategorieSlug('');
  }, [categories, categorieSlug]);

  const categorieOptions = useMemo(
    () => [
      { value: '', label: 'Toutes catégories' },
      ...categories.map((c) => ({
        value: c.slug,
        label: `${c.emoji ? `${c.emoji} ` : ''}${c.nom}${c.questionCount != null ? ` (${c.questionCount})` : ''}`,
      })),
    ],
    [categories],
  );

  const showAnswer = shouldShowPedagoQcmAnswerPhase(answerResult);
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

  async function drawQuestion() {
    setDrawing(true);
    setError('');
    setPresentation(null);
    setAnswerResult(null);
    setSelectedChoiceId(null);
    setQuestionCode('');
    setRemediationPlants([]);
    try {
      const params = new URLSearchParams();
      if (categorieSlug) params.set('categorieSlug', categorieSlug);
      if (niveau) params.set('niveau', niveau);
      if (difficulte) params.set('difficulte', difficulte);
      if (illustratedOnly) params.set('illustrated', '1');
      const draw = await api(`/api/quiz/draw?${params.toString()}`);
      const code = draw?.question_code;
      if (!code) throw new Error('Aucune question disponible');
      setQuestionCode(code);
      const present = await api(`/api/quiz/questions/${encodeURIComponent(code)}/present`);
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
      const data = await api(
        `/api/quiz/questions/${encodeURIComponent(questionCode)}/answer`,
        'POST',
        { presentationToken: presentation.presentationToken, choiceId: selectedChoiceId },
      );
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

  return (
    <div className="pedago-view pedago-quiz">
      <header className="pedago-view__head">
        <h2 className="section-title">❓ Quiz</h2>
        <p className="section-sub">Questions sciences du vivant et jardinage.</p>
        {progress ? (
          <p className="section-sub pedago-quiz__progress">
            Progression : {progress.correct}/{progress.attempts} bonnes réponses
          </p>
        ) : null}
      </header>

      <div className="pedago-filters card">
        <label className="pedago-filter-field">
          <span>Thème</span>
          <select className="form-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEME_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Niveau</span>
          <select
            className="form-select"
            value={niveau}
            onChange={(e) => setNiveau(e.target.value)}
          >
            {NIVEAU_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Difficulté</span>
          <select
            className="form-select"
            value={difficulte}
            onChange={(e) => setDifficulte(e.target.value)}
          >
            {DIFFICULTE_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Catégorie</span>
          <select
            className="form-select"
            value={categorieSlug}
            onChange={(e) => setCategorieSlug(e.target.value)}
            disabled={loadingCategories}
          >
            {categorieOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field pedago-filter-field--checkbox">
          <span>Illustrées</span>
          <input
            type="checkbox"
            checked={illustratedOnly}
            onChange={(e) => setIllustratedOnly(e.target.checked)}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={drawQuestion} disabled={drawing}>
          {drawing ? 'Tirage…' : 'Tirer une question'}
        </button>
      </div>

      {error ? <p className="pedago-error">{error}</p> : null}

      {!presentation && !drawing && !error ? (
        <p className="section-sub card" style={{ padding: 16 }}>
          Choisis des filtres puis lance un tirage aléatoire.
        </p>
      ) : null}

      {(showChoices || showAnswer) && (
        <article className="card pedago-quiz__card">
          {questionCode ? <p className="section-sub">Question {questionCode}</p> : null}

          {showChoices ? (
            <>
              <p className="pedago-quiz__question">{presentation.question}</p>
              {presentation.photoUrl ? (
                <figure className="pedago-quiz__photo-wrap">
                  <img src={presentation.photoUrl} alt="" className="pedago-quiz__photo" />
                  {presentation.photoCredit || presentation.photoLicence ? (
                    <figcaption className="pedago-quiz__photo-credit">
                      {[presentation.photoCredit, presentation.photoLicence]
                        .filter(Boolean)
                        .join(' — ')}
                    </figcaption>
                  ) : null}
                </figure>
              ) : null}

              <div className="pedago-quiz__choices">
                {presentation.choices.map((choice) => (
                  <label key={choice.id} className="pedago-quiz__choice">
                    <input
                      type="radio"
                      name="pedago-quiz-choice"
                      checked={selectedChoiceId === choice.id}
                      onChange={() => setSelectedChoiceId(choice.id)}
                    />
                    <span>{choice.text}</span>
                  </label>
                ))}
              </div>

              {presentation.glossaryTerms?.length > 0 ? (
                <div className="pedago-remediation">
                  <strong>Glossaire utile</strong>
                  <div className="pedago-chip-row">
                    {presentation.glossaryTerms.map((term) => (
                      <button
                        key={term.glossary_code}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                      >
                        {term.terme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="pedago-quiz__actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={submitAnswer}
                  disabled={submitting || selectedChoiceId == null}
                >
                  {submitting ? 'Envoi…' : 'Valider ma réponse'}
                </button>
              </div>
            </>
          ) : null}

          {showAnswer ? (
            <>
              <PedagoQcmFeedbackBlock result={answerResult} />
              {remediationTerms.length > 0 ? (
                <div className="pedago-remediation">
                  <strong>Pour approfondir — glossaire</strong>
                  <div className="pedago-chip-row">
                    {remediationTerms.map((term) => (
                      <button
                        key={term.glossary_code}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                      >
                        {term.terme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {remediationPlants.length > 0 ? (
                <div className="pedago-remediation">
                  <strong>Pour approfondir — espèces</strong>
                  <div className="pedago-chip-row">
                    {remediationPlants.map((plant) => (
                      <button
                        key={plant.id}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => onOpenPlant?.(plant.id)}
                      >
                        {plant.emoji ? `${plant.emoji} ` : ''}
                        {plant.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="pedago-quiz__actions">
                <button type="button" className="btn btn-secondary" onClick={resetQuestion}>
                  Nouvelle question
                </button>
                <button type="button" className="btn btn-primary" onClick={drawQuestion}>
                  Re-tirer
                </button>
              </div>
            </>
          ) : null}
        </article>
      )}
    </div>
  );
}
