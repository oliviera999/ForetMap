import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';

export function GLQcmModal({
  open,
  marker,
  biomeSlugs = [],
  gameId,
  onClose,
  onOpenGlossaryTerm,
  onAnswered,
}) {
  const [questionCode, setQuestionCode] = useState(null);
  const [presentation, setPresentation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const slugsKey = Array.isArray(biomeSlugs) ? biomeSlugs.join(',') : '';

  const loadQuestion = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    setPresentation(null);
    setSelectedChoiceId(null);
    setResult(null);
    try {
      let code = marker?.qcm_question_code || null;
      if (!code) {
        if (!slugsKey) throw new Error('Aucun biome catalogue lié au chapitre');
        const params = new URLSearchParams({ biomeSlugs: slugsKey });
        if (marker?.qcm_categorie_slug) {
          params.set('categorieSlug', marker.qcm_categorie_slug);
        }
        const draw = await apiGL(`/api/gl/qcm/draw?${params.toString()}`);
        code = draw?.question_code || null;
      }
      if (!code) throw new Error('Aucune question disponible');
      setQuestionCode(code);
      const present = await apiGL(`/api/gl/qcm/questions/${encodeURIComponent(code)}/present`);
      setPresentation(present);
    } catch (err) {
      setError(err.message || 'Chargement du quiz impossible');
    } finally {
      setLoading(false);
    }
  }, [open, slugsKey, marker?.qcm_question_code, marker?.qcm_categorie_slug]);

  useEffect(() => {
    if (open) loadQuestion();
  }, [open, loadQuestion]);

  async function submitAnswer() {
    if (!questionCode || !presentation?.presentationToken || selectedChoiceId == null) return;
    setSubmitting(true);
    setError('');
    try {
      const body = {
        questionCode,
        presentationToken: presentation.presentationToken,
        choiceId: selectedChoiceId,
        markerId: marker?.id ?? null,
      };
      const data = gameId
        ? await apiGL(`/api/gl/games/${gameId}/qcm/answer`, 'POST', body)
        : await apiGL(`/api/gl/qcm/questions/${encodeURIComponent(questionCode)}/answer`, 'POST', {
          presentationToken: body.presentationToken,
          choiceId: body.choiceId,
        });
      setResult(data);
      if (gameId && data?.correct) onAnswered?.(data);
    } catch (err) {
      setError(err.message || 'Envoi de la réponse impossible');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="gl-qcm-modal" role="dialog" aria-label="Quiz">
      <div className="gl-qcm-modal__body">
        <h3>{marker?.label || 'Quiz'}</h3>
        {loading ? <p className="gl-hint">Chargement de la question…</p> : null}
        {error ? <p className="gl-error">{error}</p> : null}
        {!loading && !result && presentation ? (
          <>
            {questionCode ? (
              <p className="gl-hint">Question {questionCode}</p>
            ) : null}
            <p className="gl-qcm-modal__question">{presentation.question}</p>
            {presentation.photoUrl ? (
              <img src={presentation.photoUrl} alt="" className="gl-qcm-modal__photo" />
            ) : null}
            <div className="gl-qcm-modal__choices">
              {presentation.choices.map((choice) => (
                <label key={choice.id} className="gl-qcm-choice">
                  <input
                    type="radio"
                    name="qcm-choice"
                    checked={selectedChoiceId === choice.id}
                    onChange={() => setSelectedChoiceId(choice.id)}
                  />
                  <span>{choice.text}</span>
                </label>
              ))}
            </div>
            {Array.isArray(presentation.glossaryTerms) && presentation.glossaryTerms.length > 0 ? (
              <div className="gl-qcm-modal__glossary">
                <strong>Glossaire :</strong>
                <div className="gl-glossary-chips">
                  {presentation.glossaryTerms.map((term) => (
                    <button
                      key={term.glossary_code}
                      type="button"
                      className="gl-glossary-chip"
                      onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                    >
                      {term.terme}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="gl-inline-actions">
              <GLButton type="button" onClick={loadQuestion}>Re-mélanger</GLButton>
              <GLButton
                type="button"
                onClick={submitAnswer}
                disabled={submitting || selectedChoiceId == null}
              >
                {submitting ? 'Envoi…' : 'Valider ma réponse'}
              </GLButton>
              <GLButton type="button" variant="ghost" onClick={onClose}>Fermer</GLButton>
            </div>
          </>
        ) : null}
        {result ? (
          <>
            <p className={result.correct ? 'gl-qcm-feedback gl-qcm-feedback--ok' : 'gl-qcm-feedback gl-qcm-feedback--ko'}>
              {result.feedback}
              {Number(result.scoreDelta) > 0 ? ` (+${result.scoreDelta} point)` : ''}
            </p>
            {Array.isArray(result.glossaryTerms) && result.glossaryTerms.length > 0 ? (
              <div className="gl-qcm-modal__glossary">
                <strong>Termes liés :</strong>
                <div className="gl-glossary-chips">
                  {result.glossaryTerms.map((term) => (
                    <button
                      key={term.glossary_code}
                      type="button"
                      className="gl-glossary-chip"
                      onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                    >
                      {term.terme}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="gl-inline-actions">
              {!result.correct ? (
                <GLButton type="button" onClick={loadQuestion}>Réessayer (ordre différent)</GLButton>
              ) : null}
              <GLButton type="button" onClick={onClose}>Fermer</GLButton>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
