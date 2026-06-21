import React from 'react';

/**
 * Indicateur d'état d'enregistrement automatique (ForetMap + GL).
 * @param {'idle'|'pending'|'saving'|'saved'|'error'} status
 * @param {string} [error]
 * @param {string} [className] — classes additionnelles (ex. gl-hint)
 * @param {string} [savedLabel='Enregistré ✓']
 * @param {string} [savingLabel='Enregistrement…']
 */
export function AutoSaveStatus({
  status,
  error = '',
  className = '',
  savedLabel = 'Enregistré ✓',
  savingLabel = 'Enregistrement…',
}) {
  const base = ['auto-save-status', className].filter(Boolean).join(' ');

  if (error) {
    return (
      <span className={`${base} auto-save-status--error`.trim()} role="alert">
        {error}
      </span>
    );
  }
  if (status === 'saving' || status === 'pending') {
    return (
      <span className={`${base} auto-save-status--saving`.trim()} aria-live="polite">
        {savingLabel}
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className={`${base} auto-save-status--saved`.trim()} aria-live="polite">
        {savedLabel}
      </span>
    );
  }
  return null;
}
