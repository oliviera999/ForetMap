import React from 'react';
import { GLButton } from './ui/GLButton.jsx';

export function GLMarkerQuestionList({
  items = [],
  loading = false,
  error = '',
  mode = 'random',
  qcmSet = 'biome',
  fixedQuestionCode = '',
  selectedQuestionCodes = [],
  onToggleCode,
  onSelectFixed,
  onSelectAll,
  onRefresh,
}) {
  const selectedSet = new Set(
    (Array.isArray(selectedQuestionCodes) ? selectedQuestionCodes : [])
      .map((c) => String(c).toUpperCase())
  );
  const allExplicit = selectedSet.size > 0;
  const eligibleCount = allExplicit
    ? items.filter((item) => selectedSet.has(String(item.question_code).toUpperCase())).length
    : items.length;

  function isIncluded(code) {
    const upper = String(code).toUpperCase();
    if (mode === 'fixed') {
      return String(fixedQuestionCode || '').toUpperCase() === upper;
    }
    if (!allExplicit) return true;
    return selectedSet.has(upper);
  }

  return (
    <section className="gl-marker-question-list" aria-label="Liste des questions du pool">
      <header className="gl-marker-question-list__header">
        <strong>Questions du pool</strong>
        <span className="gl-hint">
          {eligibleCount}
          {' / '}
          {items.length}
          {mode === 'random' && !allExplicit ? ' (toutes éligibles)' : ''}
        </span>
        {mode === 'random' ? (
          <GLButton type="button" size="sm" variant="secondary" onClick={onSelectAll}>Tout le pool</GLButton>
        ) : null}
        <GLButton type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={loading} loading={loading}>
          Actualiser
        </GLButton>
      </header>
      {error ? <p className="gl-error">{error}</p> : null}
      {loading && items.length === 0 ? (
        <p className="gl-hint">Chargement des questions…</p>
      ) : null}
      {!loading && items.length === 0 && !error ? (
        <p className="gl-hint">Aucune question ne correspond aux filtres.</p>
      ) : null}
      {items.length > 0 ? (
        <ul className="gl-marker-question-list__items">
          {items.map((item) => {
            const code = String(item.question_code || '');
            const included = isIncluded(code);
            return (
              <li
                key={code}
                className={[
                  'gl-marker-question-list__row',
                  included ? 'is-included' : '',
                  mode === 'fixed' && included ? 'is-fixed-selected' : '',
                ].filter(Boolean).join(' ')}
              >
                {mode === 'random' ? (
                  <label className="gl-marker-question-list__pick">
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={() => onToggleCode?.(code)}
                      aria-label={`Inclure ${code}`}
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    className={`gl-marker-question-list__pick gl-marker-question-list__pick-radio${included ? ' is-selected' : ''}`}
                    aria-pressed={included}
                    aria-label={`Choisir ${code}`}
                    onClick={() => onSelectFixed?.(code)}
                  >
                    <span aria-hidden>{included ? '●' : '○'}</span>
                  </button>
                )}
                <div className="gl-marker-question-list__main">
                  <div className="gl-marker-question-list__top">
                    <span className="gl-marker-question-list__code">{code}</span>
                    <span className="gl-marker-question-list__meta">
                      {qcmSet === 'lore' ? (
                        <>
                          {item.chapitre_slug}
                          {' · '}
                          {item.categorie_slug}
                          {item.tier_lore ? ` · ${item.tier_lore}` : ''}
                        </>
                      ) : (
                        <>
                          {item.biome_slug}
                          {' · '}
                          {item.categorie_slug}
                        </>
                      )}
                      {item.niveau ? ` · ${item.niveau}` : ''}
                      {item.difficulte != null ? ` · diff. ${item.difficulte}` : ''}
                    </span>
                  </div>
                  <p className="gl-marker-question-list__text">{item.question}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
