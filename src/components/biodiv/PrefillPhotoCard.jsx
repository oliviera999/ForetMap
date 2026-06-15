import React from 'react';

/**
 * Carte (présentation) d'une photo proposée par la pré-saisie — extrait de `PlantPrefillPanel`
 * (O6). Affiche la case d'inclusion, le menu « Associer au champ », l'aperçu (avec repli en cas
 * d'erreur de chargement) et les métadonnées crédit/licence. Toute la logique d'état reste gérée
 * par le parent via les callbacks.
 *
 * @param {object} props
 * @param {object} props.photo proposition photo (`url`, `source_url`, `credit`, `license`)
 * @param {string} props.slotKey clé d'emplacement `field:idx`
 * @param {string} props.fieldLabel libellé de la source de suggestion (pour l'aria-label)
 * @param {boolean} props.checked case d'inclusion cochée
 * @param {string} props.assignTo champ photo cible courant
 * @param {boolean} props.broken aperçu image en erreur de chargement
 * @param {Array<{key: string, label: string}>} props.fieldOptions options du menu « Associer au champ »
 * @param {(checked: boolean) => void} props.onToggleChecked bascule l'inclusion
 * @param {(value: string) => void} props.onAssignChange change le champ cible
 * @param {() => void} props.onThumbError signale une erreur de chargement de l'aperçu
 */
export function PrefillPhotoCard({
  photo,
  slotKey,
  fieldLabel,
  checked,
  assignTo,
  broken,
  fieldOptions,
  onToggleChecked,
  onAssignChange,
  onThumbError,
}) {
  return (
    <div className={`plant-prefill-photo-card${checked ? ' plant-prefill-photo-card--selected' : ''}`}>
      <div className="plant-prefill-photo-card-row">
        <input
          type="checkbox"
          className="plant-prefill-photo-check"
          checked={checked}
          aria-label={`Inclure cette proposition dans la pré-saisie (${fieldLabel})`}
          onChange={(e) => onToggleChecked(e.target.checked)}
        />
        <div className="plant-prefill-photo-body">
          <div className="plant-prefill-photo-assign-row">
            <label className="plant-prefill-photo-assign-label" htmlFor={`prefill-assign-${slotKey}`}>
              Associer au champ
            </label>
            <select
              id={`prefill-assign-${slotKey}`}
              className="plant-prefill-photo-assign"
              value={assignTo}
              disabled={!checked}
              onChange={(e) => onAssignChange(e.target.value)}
            >
              {fieldOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="plant-prefill-photo-thumb-wrap">
            {broken ? (
              <div className="plant-prefill-photo-thumb-fallback" role="img" aria-label="Aperçu non chargé">
                Aperçu indisponible
              </div>
            ) : (
              <img
                src={photo.url}
                alt=""
                className="plant-prefill-photo-thumb"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={onThumbError}
              />
            )}
          </div>
          <div className="plant-prefill-photo-meta">
            <a
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              className="plant-prefill-photo-url"
              onClick={(e) => e.stopPropagation()}
            >
              Ouvrir l’image
            </a>
            {photo.source_url && (
              <a
                href={photo.source_url}
                target="_blank"
                rel="noreferrer"
                className="plant-prefill-photo-source"
                onClick={(e) => e.stopPropagation()}
              >
                Page source
              </a>
            )}
            <div className="plant-prefill-photo-credit">
              Crédit : {photo.credit || 'inconnu'} · Licence : {photo.license || 'à vérifier'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
