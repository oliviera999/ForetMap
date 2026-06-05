import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { usePrefersReducedMotion } from '../../shared/hooks/usePrefersReducedMotion.js';
import { fetchSpellDetail } from '../utils/glSpellDetailCache.js';
import { GLButton } from './ui/GLButton.jsx';

const CLOSE_MS = 200;

const CATEGORY_ACCENT = {
  vie: '#dc2626',
  mouvement: '#2563eb',
  meta_social: '#7c3aed',
  pedagogique: '#059669',
};

function categoryAccent(slug) {
  return CATEGORY_ACCENT[String(slug || '').toLowerCase()] || '#047c8c';
}

export function GLSpellCastResultPopover({
  open = false,
  result = null,
  onClose,
}) {
  const titleId = useId();
  const castersId = useId();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const spellCode = result?.spellCode || null;

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

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !spellCode) {
      setDetail(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);

    fetchSpellDetail(spellCode)
      .then((data) => {
        if (cancelled) return;
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
  }, [open, spellCode]);

  useEffect(() => {
    if (!open && !isClosing) return undefined;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.classList.add('gl-spell-popover-open');
    body.style.overflow = 'hidden';
    return () => {
      body.classList.remove('gl-spell-popover-open');
      body.style.overflow = prevOverflow;
    };
  }, [open, isClosing]);

  if ((!open && !isClosing) || !result || typeof document === 'undefined' || !document.body) {
    return null;
  }

  const spell = detail?.spell;
  const accent = categoryAccent(spell?.category_slug);
  const overlayClass = [
    'gl-spell-popover',
    'gl-spell-cast-result',
    isClosing ? 'is-closing' : '',
  ].filter(Boolean).join(' ');

  const casters = Array.isArray(result.casters) ? result.casters : [];

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
        className={`gl-spell-popover__panel gl-grimoire${prefersReducedMotion ? '' : ' animate-pop'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ '--gl-spell-accent': accent }}
      >
        <div className="gl-spell-popover__category-strip" aria-hidden="true" />

        <header className="gl-spell-popover__header">
          <h3 id={titleId}>
            <span className="gl-spell-popover__emoji" aria-hidden="true">
              {result.spellEmoji || '✨'}
            </span>
            {result.spellName || 'Sortilège'}
          </h3>
          <button
            type="button"
            className="gl-spell-popover__close"
            onClick={requestClose}
            aria-label="Fermer le récapitulatif du sortilège"
          >
            ✕
          </button>
        </header>

        <div className="gl-spell-popover__content fade-in">
          <div className="gl-spell-popover__badges stagger">
            <span className="gl-badge gl-badge--success">Sortilège lancé</span>
            {result.costLabel ? (
              <span className="gl-badge">Coût : {result.costLabel}</span>
            ) : null}
          </div>

          {casters.length > 0 ? (
            <section className="gl-spell-cast-result__casters" aria-labelledby={castersId}>
              <h4 id={castersId} className="gl-spell-cast-result__casters-title">
                Lancé par
              </h4>
              <ul className="gl-spell-cast-result__casters-list">
                {casters.map((caster) => (
                  <li key={caster.playerId} className="gl-spell-cast-result__caster">
                    <span className="gl-spell-cast-result__caster-name">{caster.displayName}</span>
                    {caster.contributionLabel ? (
                      <span className="gl-spell-cast-result__caster-contrib">
                        {caster.contributionLabel}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {error ? (
            <p className="gl-error gl-spell-popover__error">{error}</p>
          ) : null}

          {loading && !spell && !error ? (
            <div className="gl-spell-popover__body gl-spell-popover__body--loading">
              <div className="gl-spell-popover__skeleton" />
              <div className="gl-spell-popover__skeleton gl-spell-popover__skeleton--short" />
            </div>
          ) : null}

          {spell && !error ? (
            <div className="gl-spell-popover__body">
              {spell.effet_court ? (
                <p className="gl-spell-popover__lead">{spell.effet_court}</p>
              ) : null}
              {spell.effet_detaille ? (
                <p className="gl-spell-popover__text">{spell.effet_detaille}</p>
              ) : null}
              {!spell.effet_court && !spell.effet_detaille ? (
                <p className="gl-hint">Aucune description enregistrée pour ce sortilège.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="gl-spell-popover__footer">
          <GLButton type="button" variant="primary" onClick={requestClose}>
            Compris
          </GLButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
