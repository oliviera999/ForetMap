import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLQcmFeedbackBlock } from './GLQcmFeedbackBlock.jsx';
import { hasQcmAnswerFeedback } from '../utils/glQcmDisplay.js';

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

  const showAnswer = hasQcmAnswerFeedback(result);

  return (
    <div className="gl-qcm-modal" role="dialog" aria-label="Quiz">
      <div className="gl-qcm-modal__body">
        <header className="gl-qcm-popover__header">
          <h3>{marker?.label || 'Quiz'}</h3>
          {loading ? <p className="gl-hint">Chargement de la question…</p> : null}
          {error ? <p className="gl-error">{error}</p> : null}
        </header>
        {!loading && !result && presentation ? (
          <>
            <div className="gl-qcm-popover__scroll">
              {questionCode ? (
                <p className="gl-hint">Question {questionCode}</p>
              ) : null}
              <p className="gl-qcm-modal__question">{presentation.question}</p>
              {presentation.photoUrl ? (
                <figure className="gl-qcm-modal__photo-wrap">
                  <img src={presentation.photoUrl} alt="" className="gl-qcm-modal__photo" />
                  {presentation.photoCredit || presentation.photoLicence ? (
                    <figcaption className="gl-qcm-modal__photo-credit">
                      {[presentation.photoCredit, presentation.photoLicence].filter(Boolean).join(' — ')}
                    </figcaption>
                  ) : null}
                </figure>
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
            </div>
            <footer className="gl-qcm-popover__footer">
              <GLButton
                type="button"
                className="gl-qcm-popover__submit"
                onClick={submitAnswer}
                disabled={submitting || selectedChoiceId == null}
                loading={submitting}
              >
                {submitting ? 'Envoi…' : 'C\'est cette réponse !'}
              </GLButton>
              <div className="gl-inline-actions">
                <GLButton type="button" variant="ghost" onClick={loadQuestion}>Re-mélanger</GLButton>
                <GLButton type="button" variant="ghost" onClick={onClose}>Fermer</GLButton>
              </div>
            </footer>
          </>
        ) : null}
        {showAnswer ? (
          <>
            <div className="gl-qcm-popover__scroll">
              {questionCode ? (
                <p className="gl-hint">Question {questionCode}</p>
              ) : null}
              <GLQcmFeedbackBlock result={result} scoreDelta={result?.scoreDelta} />
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
            </div>
            <footer className="gl-qcm-popover__footer">
              <div className="gl-inline-actions">
                {!result.correct ? (
                  <GLButton type="button" onClick={loadQuestion}>Réessayer (ordre différent)</GLButton>
                ) : null}
                <GLButton type="button" onClick={onClose}>Fermer</GLButton>
              </div>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}
