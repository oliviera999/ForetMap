import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { usePrefersReducedMotion } from '../../shared/hooks/usePrefersReducedMotion.js';
import { fetchSpellDetail } from '../utils/glSpellDetailCache.js';
import { GLButton } from './ui/GLButton.jsx';
import {
  GL_SPELL_CATEGORY_LABELS,
  GL_SPELL_FIELD_LABELS,
  GL_SPELL_STATUT_LABELS,
} from '../utils/glSpellFieldLabels.js';

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

function formatMeta(spell) {
  const parts = [];
  if (spell.portee) parts.push(`${GL_SPELL_FIELD_LABELS.portee} : ${spell.portee}`);
  if (spell.cible) parts.push(`${GL_SPELL_FIELD_LABELS.cible} : ${spell.cible}`);
  if (spell.timing) parts.push(`${GL_SPELL_FIELD_LABELS.timing} : ${spell.timing}`);
  return parts;
}

export function GLSpellPopover({
  open = false,
  spellCode = null,
  onClose,
  canLaunch = false,
  onLaunchSpell,
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
      setActiveCode(
        String(spellCode || '')
          .trim()
          .toUpperCase() || null,
      );
    }
  }, [open, spellCode]);

  useEffect(() => {
    if (!open || !activeCode) {
      setDetail(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);

    fetchSpellDetail(activeCode)
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
  }, [open, activeCode]);

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

  if ((!open && !isClosing) || typeof document === 'undefined' || !document.body) {
    return null;
  }

  const spell = detail?.spell;
  const accent = categoryAccent(spell?.category_slug);
  const overlayClass = ['gl-spell-popover', isClosing ? 'is-closing' : '']
    .filter(Boolean)
    .join(' ');

  const costParts = [];
  if (spell?.cout_total_eq) costParts.push(spell.cout_total_eq);
  else {
    if (Number(spell?.cout_gemmes) > 0) costParts.push(`${spell.cout_gemmes} 💎`);
    if (Number(spell?.cout_coeurs) > 0) costParts.push(`${spell.cout_coeurs} ❤️`);
  }

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
          {loading && !spell ? (
            <div className="gl-spell-popover__skeleton gl-spell-popover__skeleton-title" />
          ) : (
            <h3 id={titleId}>
              <span className="gl-spell-popover__emoji" aria-hidden="true">
                {spell?.emoji || '✨'}
              </span>
              {spell?.nom || 'Sortilège'}
            </h3>
          )}
          <button
            type="button"
            className="gl-spell-popover__close"
            onClick={requestClose}
            aria-label="Fermer la fiche sort"
          >
            ✕
          </button>
        </header>

        {error ? <p className="gl-error gl-spell-popover__error">{error}</p> : null}

        {loading && !spell && !error ? (
          <div className="gl-spell-popover__body gl-spell-popover__body--loading">
            <div className="gl-spell-popover__skeleton" />
            <div className="gl-spell-popover__skeleton gl-spell-popover__skeleton--short" />
          </div>
        ) : null}

        {spell && !error ? (
          <div key={activeCode} className="gl-spell-popover__content fade-in">
            <div className="gl-spell-popover__badges stagger">
              {spell.category_slug ? (
                <span className="gl-badge gl-spell-popover__badge-cat">
                  {GL_SPELL_CATEGORY_LABELS[spell.category_slug] || spell.category_slug}
                </span>
              ) : null}
              {spell.statut ? (
                <span className="gl-badge gl-badge--info">
                  {GL_SPELL_STATUT_LABELS[spell.statut] || spell.statut}
                </span>
              ) : null}
              {costParts.length > 0 ? (
                <span className="gl-badge">{costParts.join(' · ')}</span>
              ) : null}
            </div>

            <div className="gl-spell-popover__body">
              {spell.effet_court ? (
                <p className="gl-spell-popover__lead">{spell.effet_court}</p>
              ) : null}
              {spell.effet_detaille ? (
                <p className="gl-spell-popover__text">{spell.effet_detaille}</p>
              ) : null}
              {formatMeta(spell).map((line) => (
                <p key={line} className="gl-spell-popover__meta">
                  {line}
                </p>
              ))}
              {spell.limite_usage ? (
                <p className="gl-spell-popover__meta">
                  <strong>{GL_SPELL_FIELD_LABELS.limite_usage} :</strong> {spell.limite_usage}
                </p>
              ) : null}
              {spell.cumul ? (
                <p className="gl-spell-popover__meta">
                  <strong>{GL_SPELL_FIELD_LABELS.cumul} :</strong> {spell.cumul}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <footer className="gl-spell-popover__footer">
          {canLaunch && spell ? (
            <GLButton type="button" variant="primary" onClick={() => onLaunchSpell?.()}>
              Lancer ce sortilège
            </GLButton>
          ) : null}
          <GLButton type="button" variant="ghost" onClick={requestClose}>
            Fermer
          </GLButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
