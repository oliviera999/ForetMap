import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { usePrefersReducedMotion } from '../../shared/hooks/usePrefersReducedMotion.js';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLLearningAcknowledgeButton } from './GLLearningAcknowledgeButton.jsx';

const CLOSE_MS = 200;

const CATEGORY_ACCENT = {
  ecologie: '#059669',
  climat: '#0284c7',
  faune: '#d97706',
  flore: '#16a34a',
  biome: '#047857',
  ecosysteme: '#0d9488',
  conservation: '#7c3aed',
  geographie: '#2563eb',
  geologie: '#78716c',
  interaction: '#ea580c',
  methode_svt: '#4f46e5',
};

const NIVEAU_LABELS = {
  base: 'Base',
  approfondissement: 'Approfondissement',
  avance: 'Avancé',
};

const detailCache = new Map();

function cacheKey(code, biomeSlugs) {
  const slugs = Array.isArray(biomeSlugs) ? biomeSlugs.filter(Boolean).join(',') : '';
  return `${code}|${slugs}`;
}

function categoryAccent(categorie) {
  return CATEGORY_ACCENT[String(categorie || '').toLowerCase()] || '#047c8c';
}

export function GLGlossaryPopover({
  open = false,
  glossaryCode = null,
  biomeSlugs = [],
  onClose,
  onOpenFullGlossary,
  showFullGlossaryLink = true,
  learningProgress,
}) {
  const titleId = useId();
  const [activeCode, setActiveCode] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const requestClose = useCallback(() => {
    if (isClosing) return;
    if (prefersReducedMotion) {
      onClose?.();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false);
      onClose?.();
    }, CLOSE_MS);
  }, [isClosing, onClose, prefersReducedMotion]);

  const dialogRef = useDialogA11y(() => {
    requestClose();
  });

  useEffect(
    () => () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      setActiveCode(String(glossaryCode || '').trim() || null);
    }
  }, [open, glossaryCode]);

  useEffect(() => {
    if (!open || !activeCode) {
      setDetail(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    const key = cacheKey(activeCode, biomeSlugs);
    const cached = detailCache.get(key);
    if (cached) {
      setDetail(cached);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);

    const params =
      Array.isArray(biomeSlugs) && biomeSlugs.length > 0
        ? `?biomeSlugs=${encodeURIComponent(biomeSlugs.filter(Boolean).join(','))}`
        : '';

    apiGL(`/api/gl/glossary/${encodeURIComponent(activeCode)}${params}`)
      .then((data) => {
        if (cancelled) return;
        detailCache.set(key, data);
        setDetail(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Fiche introuvable');
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeCode, biomeSlugs]);

  useEffect(() => {
    if (!open && !isClosing) return undefined;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.classList.add('gl-glossary-popover-open');
    body.style.overflow = 'hidden';
    return () => {
      body.classList.remove('gl-glossary-popover-open');
      body.style.overflow = prevOverflow;
    };
  }, [open, isClosing]);

  function openRelatedTerm(code) {
    const next = String(code || '').trim();
    if (!next) return;
    setActiveCode(next);
  }

  function openFullGlossary() {
    const code = activeCode;
    onClose?.();
    onOpenFullGlossary?.(code);
  }

  if ((!open && !isClosing) || typeof document === 'undefined' || !document.body) {
    return null;
  }

  const term = detail?.term;
  const activeGlossaryCode = String(activeCode || '').trim();
  const isLearned = learningProgress?.isGlossaryLearned?.(activeGlossaryCode) || !!term?.learned;
  const accent = categoryAccent(term?.categorie);
  const overlayClass = ['gl-glossary-popover', isClosing ? 'is-closing' : '']
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className={overlayClass}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`gl-glossary-popover__panel${prefersReducedMotion ? '' : ' animate-pop'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ '--gl-glossary-accent': accent }}
      >
        <div className="gl-glossary-popover__category-strip" aria-hidden="true" />

        <header className="gl-glossary-popover__header">
          {loading && !term ? (
            <div className="gl-glossary-popover__skeleton gl-glossary-popover__skeleton-title" />
          ) : (
            <h3 id={titleId}>{term?.terme || 'Glossaire'}</h3>
          )}
          <button
            type="button"
            className="gl-glossary-popover__close"
            onClick={requestClose}
            aria-label="Fermer la fiche glossaire"
          >
            ✕
          </button>
        </header>

        {error ? <p className="gl-error gl-glossary-popover__error">{error}</p> : null}

        {loading && !term && !error ? (
          <div className="gl-glossary-popover__body gl-glossary-popover__body--loading">
            <div className="gl-glossary-popover__skeleton" />
            <div className="gl-glossary-popover__skeleton gl-glossary-popover__skeleton--short" />
            <div className="gl-glossary-popover__skeleton" />
          </div>
        ) : null}

        {term && !error ? (
          <div key={activeCode} className="gl-glossary-popover__content fade-in">
            <div className="gl-glossary-popover__badges stagger">
              {term.categorie_label || term.categorie ? (
                <span className="gl-badge gl-glossary-popover__badge-cat">
                  {term.categorie_label || term.categorie}
                </span>
              ) : null}
              {term.niveau ? (
                <span className="gl-badge gl-badge--info">
                  {NIVEAU_LABELS[term.niveau] || term.niveau}
                </span>
              ) : null}
            </div>

            <div className="gl-glossary-popover__body">
              {term.definition_courte ? (
                <p className="gl-glossary-popover__lead">{term.definition_courte}</p>
              ) : null}
              {term.definition_complete ? (
                <p className="gl-glossary-popover__text">{term.definition_complete}</p>
              ) : null}
              {term.exemple ? (
                <p className="gl-glossary-popover__text">
                  <strong>Exemple :</strong> {term.exemple}
                </p>
              ) : null}
              {term.etymologie ? (
                <p className="gl-glossary-popover__text">
                  <strong>Étymologie :</strong> {term.etymologie}
                </p>
              ) : null}
            </div>

            {Array.isArray(detail.relatedTerms) && detail.relatedTerms.length > 0 ? (
              <div className="gl-glossary-popover__related">
                <h4>Termes liés</h4>
                <div className="gl-glossary-chips">
                  {detail.relatedTerms.map((t) => (
                    <button
                      key={t.glossary_code}
                      type="button"
                      className={`gl-glossary-chip${activeCode === t.glossary_code ? ' is-active' : ''}`}
                      onClick={() => openRelatedTerm(t.glossary_code)}
                    >
                      {t.terme}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <footer className="gl-glossary-popover__footer">
          {activeGlossaryCode && learningProgress ? (
            <GLLearningAcknowledgeButton
              acknowledgePath={`/api/gl/learning/glossary/${encodeURIComponent(activeGlossaryCode)}`}
              resourceType="glossary"
              resourceRef={activeGlossaryCode}
              itemTitle={term?.terme}
              labelAction="Marquer comme appris"
              labelDone="✓ Appris"
              titleDone="Tu as confirmé avoir appris ce terme"
              confirmIntro={
                <>
                  En validant, tu confirmes avoir compris le terme{' '}
                  <strong>« {term?.terme || activeGlossaryCode} »</strong>.
                </>
              }
              confirmCheckboxLabel="Je confirme avoir lu et compris cette définition."
              isDone={isLearned}
              onAcknowledged={() => learningProgress.markLocal('glossary', activeGlossaryCode)}
            />
          ) : null}
          {showFullGlossaryLink ? (
            <GLButton type="button" variant="ghost" onClick={openFullGlossary}>
              Voir le glossaire complet
            </GLButton>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
