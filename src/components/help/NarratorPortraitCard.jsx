import React from 'react';

import VisitMascotFallbackSvg from '../VisitMascotFallbackSvg.jsx';
import {
  describeNarratorPreviewOrigin,
  NARRATOR_FRAMING_HINTS,
  NARRATOR_FRAMING_LABELS,
  resolveNarratorPreview,
} from '../../utils/helpNarratorDraft.js';
import {
  DEFAULT_MASCOT_EXPRESSION,
  DEFAULT_MASCOT_FRAMING,
} from '../../utils/mascotExpressions.js';

/** Cadrages secondaires, repliés par défaut : `bust` suffit à faire fonctionner l'ensemble. */
const SECONDARY_FRAMINGS = ['face', 'body'];

function fileNameFromUrl(url) {
  const clean = String(url || '').split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || clean;
}

function FramingRow({ framing, url, busy, onPick, onUpload, onClear, expressionLabel }) {
  const label = NARRATOR_FRAMING_LABELS[framing] || framing;
  return (
    <div className="fm-narrator-framing">
      <div className="fm-narrator-framing__head">
        <span className="fm-narrator-framing__label">{label}</span>
        <span className="fm-narrator-framing__hint">{NARRATOR_FRAMING_HINTS[framing]}</span>
      </div>
      <p className="fm-narrator-framing__value">
        {url ? (
          <span title={url}>📎 {fileNameFromUrl(url)}</span>
        ) : (
          <span className="fm-narrator-muted">Aucune image</span>
        )}
      </p>
      <div className="fm-narrator-framing__actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => onPick(framing)}
        >
          Choisir…
        </button>
        <label className={`btn btn-secondary btn-sm ${busy ? 'is-disabled' : ''}`}>
          Importer
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onUpload(framing, file);
            }}
          />
        </label>
        {url ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm fm-narrator-danger"
            disabled={busy}
            aria-label={`Retirer l’image ${label} de l’expression ${expressionLabel}`}
            onClick={() => onClear(framing)}
          >
            Retirer
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Une expression du narrateur dans le studio prof : vignette de ce qui sera
 * réellement affiché, provenance de cette vignette, et actions d'affectation.
 *
 * Le parti pris d'affichage est celui de la cascade (§4.2) : la carte ne montre
 * jamais un cadre vide mais **le résultat effectif** — l'image propre, à défaut
 * celle de « Neutre », à défaut la silhouette de repli — avec un badge qui dit
 * d'où il vient. C'est ce qui rend lisible, sans documentation, le fait qu'une
 * expression non illustrée n'est pas une erreur.
 */
export function NarratorPortraitCard({
  expression,
  label,
  hint,
  draft,
  busy = false,
  onPick,
  onUpload,
  onClear,
  onClearAll,
}) {
  const portrait = draft?.portraits?.[expression] || {};
  const ownFramings = Object.keys(portrait);
  const preview = resolveNarratorPreview(draft, expression, DEFAULT_MASCOT_FRAMING);
  const originLabel = describeNarratorPreviewOrigin(preview.origin);
  const isDefaultExpression = expression === DEFAULT_MASCOT_EXPRESSION;
  const hasOwnImage = ownFramings.length > 0;

  return (
    <article
      className={`fm-narrator-card ${hasOwnImage ? 'is-filled' : ''}`}
      data-expression={expression}
      data-state={hasOwnImage ? 'filled' : preview.origin}
    >
      <header className="fm-narrator-card__head">
        <h4 className="fm-narrator-card__title">{label}</h4>
        {isDefaultExpression ? (
          <span className="fm-narrator-badge fm-narrator-badge--key">Socle</span>
        ) : null}
      </header>

      <div className="fm-narrator-card__body">
        <div className="fm-narrator-card__thumb" aria-hidden="true">
          {preview.src ? (
            <img src={preview.src} alt="" loading="lazy" decoding="async" />
          ) : (
            <VisitMascotFallbackSvg
              silhouette={draft?.fallbackSilhouette || 'olu'}
              variant="forest"
            />
          )}
        </div>
        <div className="fm-narrator-card__meta">
          <p className="fm-narrator-card__hint">{hint}</p>
          <p className="fm-narrator-card__origin">
            {hasOwnImage ? (
              <span className="fm-narrator-badge fm-narrator-badge--ok">Image dédiée</span>
            ) : (
              <span className="fm-narrator-badge">{originLabel}</span>
            )}
          </p>
        </div>
      </div>

      <FramingRow
        framing={DEFAULT_MASCOT_FRAMING}
        url={portrait[DEFAULT_MASCOT_FRAMING] || ''}
        busy={busy}
        onPick={onPick}
        onUpload={onUpload}
        onClear={onClear}
        expressionLabel={label}
      />

      <details className="fm-narrator-card__more">
        <summary>Cadrages complémentaires</summary>
        {SECONDARY_FRAMINGS.map((framing) => (
          <FramingRow
            key={framing}
            framing={framing}
            url={portrait[framing] || ''}
            busy={busy}
            onPick={onPick}
            onUpload={onUpload}
            onClear={onClear}
            expressionLabel={label}
          />
        ))}
        {hasOwnImage ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm fm-narrator-danger"
            disabled={busy}
            onClick={() => onClearAll(expression)}
          >
            Vider cette expression
          </button>
        ) : null}
      </details>
    </article>
  );
}
