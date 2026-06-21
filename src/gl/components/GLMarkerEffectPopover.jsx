import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';

function formatVitalitySummary(vitality) {
  if (!vitality) return null;
  const parts = [];
  const health = Number(vitality.healthDelta) || 0;
  const power = Number(vitality.powerDelta) || 0;
  if (health !== 0) {
    parts.push(`${health > 0 ? '+' : ''}${health} cœur${Math.abs(health) > 1 ? 's' : ''}`);
  }
  if (power !== 0) {
    parts.push(`${power > 0 ? '+' : ''}${power} gemme${Math.abs(power) > 1 ? 's' : ''}`);
  }
  if (!parts.length) return null;
  const targetLabel = vitality.target === 'players' ? ' (joueurs ciblés)' : ' (équipe entière)';
  return `${parts.join(', ')}${targetLabel}`;
}

export function GLMarkerEffectPopover({
  open,
  marker,
  gameId,
  teamId = null,
  arrival,
  vitality = null,
  loading,
  error: externalError,
  canApplyEffects = false,
  onClose,
  onApplied,
  themeStyle = null,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const vitalitySummary = formatVitalitySummary(vitality);
  const vitalityApplied = vitality?.applied === true;
  const vitalityAlreadyApplied = vitality?.alreadyApplied === true;
  const showManualApply =
    canApplyEffects &&
    arrival?.resolvedEffect &&
    !vitalityApplied &&
    !vitalityAlreadyApplied &&
    (Number(vitality?.healthDelta) !== 0 || Number(vitality?.powerDelta) !== 0);

  async function applyEffects() {
    if (!gameId || !marker?.id || teamId == null) return;
    try {
      await apiGL(`/api/gl/games/${gameId}/markers/${marker.id}/apply-effects`, 'POST', {
        teamId: Number(teamId),
        reason: marker.label,
      });
      onApplied?.();
      onClose?.();
    } catch (err) {
      onClose?.();
    }
  }

  const content = (
    <div
      className="fm-modal-overlay gl-marker-effect-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="fm-modal-panel gl-marker-effect-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gl-marker-effect-title"
        style={themeStyle || undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gl-marker-effect-popover__header">
          <h2 id="gl-marker-effect-title">{marker?.label || 'Repère'}</h2>
          <button type="button" className="gl-icon-btn" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        {loading ? <p className="gl-hint">Chargement…</p> : null}
        {externalError ? (
          <p className="gl-error" role="alert">
            {externalError}
          </p>
        ) : null}
        {!loading && !externalError && arrival ? (
          <div className="gl-marker-effect-popover__body">
            {marker?.description ? <p>{marker.description}</p> : null}
            {arrival.effetMecanique ? (
              <p>
                <strong>Effet :</strong> {arrival.effetMecanique}
              </p>
            ) : null}
            {arrival.effectSummary ? <p>{arrival.effectSummary}</p> : null}
            {vitalitySummary ? (
              <p className="gl-feuillet-popover__mechanics" aria-label="Effets vitalité">
                {vitalityApplied ? (
                  <span className="gl-hint">Appliqué : {vitalitySummary}</span>
                ) : vitalityAlreadyApplied ? (
                  <span className="gl-hint">Effets déjà appliqués pour cette équipe.</span>
                ) : (
                  <span>{vitalitySummary}</span>
                )}
              </p>
            ) : null}
            {arrival.passTurn ? (
              <p className="gl-hint">Cette équipe doit passer son tour.</p>
            ) : null}
            {arrival.resolvedEffect?.deltaMove ? (
              <p className="gl-hint">
                Déplacement suggéré : {arrival.resolvedEffect.deltaMove > 0 ? '+' : ''}
                {arrival.resolvedEffect.deltaMove} case(s) — à appliquer manuellement sur la carte.
              </p>
            ) : null}
          </div>
        ) : null}
        <footer className="gl-marker-effect-popover__footer">
          {showManualApply ? (
            <GLButton type="button" onClick={applyEffects}>
              Appliquer les effets (MJ)
            </GLButton>
          ) : null}
          <GLButton type="button" variant="secondary" onClick={onClose}>
            Fermer
          </GLButton>
        </footer>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
