import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';

const CATEGORY_ACCENT = {
  cosmologie: '#6d28d9',
  menace: '#b91c1c',
  peuple: '#047857',
  personnage: '#2563eb',
  creature: '#d97706',
  objet: '#78716c',
  lieu: '#0d9488',
  rituel: '#7c3aed',
  concept: '#4f46e5',
  epoque: '#57534e',
};

export function GLLoreGlossaryPopover({
  open = false,
  loreCode = null,
  onClose,
  onOpenFullGlossary,
}) {
  const [term, setTerm] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !loreCode) {
      setTerm(null);
      setRelated([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiGL(`/api/gl/lore/glossary/${encodeURIComponent(loreCode)}`);
        if (cancelled) return;
        setTerm(data?.term || null);
        setRelated(Array.isArray(data?.relatedTerms) ? data.relatedTerms : []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Terme introuvable');
          setTerm(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, loreCode]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const accent = CATEGORY_ACCENT[String(term?.categorie || '').toLowerCase()] || '#047c8c';

  return createPortal(
    <div className="gl-lore-glossary-popover-overlay" role="presentation" onClick={() => onClose?.()}>
      <div
        className="gl-lore-glossary-popover"
        role="dialog"
        aria-label={term?.terme || 'Lexique du lore'}
        onClick={(e) => e.stopPropagation()}
        style={{ '--gl-lore-accent': accent }}
      >
        <header>
          <p className="gl-lore-glossary-popover__cat">{term?.categorie_label || term?.categorie}</p>
          <h3>{term?.terme || '…'}</h3>
          <button type="button" className="gl-lore-glossary-popover__close" onClick={() => onClose?.()} aria-label="Fermer">✕</button>
        </header>
        {loading ? <p className="gl-hint">Chargement…</p> : null}
        {error ? <p className="gl-error">{error}</p> : null}
        {term ? (
          <div className="gl-lore-glossary-popover__body">
            {term.definition_courte ? <p className="gl-lore-glossary-popover__short">{term.definition_courte}</p> : null}
            {term.definition_complete ? <p>{term.definition_complete}</p> : null}
            {term.role_recit ? (
              <p><strong>Rôle récit :</strong> {term.role_recit}</p>
            ) : null}
            {term.correspondance_reelle ? (
              <p><strong>Correspondance réelle :</strong> {term.correspondance_reelle}</p>
            ) : null}
            {related.length ? (
              <ul className="gl-lore-glossary-popover__related">
                {related.map((r) => (
                  <li key={r.lore_code}>{r.terme}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <footer>
          {onOpenFullGlossary ? (
            <GLButton type="button" variant="ghost" onClick={() => { onOpenFullGlossary?.(); onClose?.(); }}>
              Ouvrir le lexique
            </GLButton>
          ) : null}
          <GLButton type="button" onClick={() => onClose?.()}>Fermer</GLButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
