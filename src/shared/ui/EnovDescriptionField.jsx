import { ENOV_SPACE_TYPES } from '../enov/enovSpaceTypes.js';

/**
 * Texte **e-nov** d'un lieu (migration 315) : en quoi cette zone ou ce repère constitue une
 * innovation pour l'établissement. Il n'est affiché que sur le plan e-nov (`enov.*`), **en
 * tête** de la fiche du lieu ; aucune autre surface ne le montre.
 *
 * Le texte seul ne met pas le lieu en avant : c'est la catégorie « e-nov » (catégorie-label,
 * visible sur le seul plan e-nov) qui le fait ressortir. Le rappel est dit sous le champ —
 * sans lui, on écrit un texte que personne ne trouvera sur la carte.
 *
 * Miroir de `ENOV_DESCRIPTION_MAX_LENGTH` (`lib/enovPlan.js`).
 */
export const ENOV_DESCRIPTION_MAX_LENGTH = 4000;

/**
 * @param {object} props
 * @param {string} props.idPrefix préfixe d'identifiant (`zone`, `marker`).
 * @param {string} props.value texte courant.
 * @param {(next: string) => void} props.onChange
 * @param {string} [props.spaceType] type d'espace e-nov (migration 323) ; le sélecteur n'est
 *   affiché que si `onSpaceTypeChange` est fourni.
 * @param {(next: string) => void} [props.onSpaceTypeChange]
 */
export function EnovDescriptionField({
  idPrefix,
  value,
  onChange,
  spaceType = '',
  onSpaceTypeChange = null,
}) {
  const id = `${idPrefix}-enov-description`;
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>
        <span aria-hidden>💡</span> Description e-nov
      </label>
      <textarea
        id={id}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={ENOV_DESCRIPTION_MAX_LENGTH}
        aria-describedby={hintId}
        placeholder="En quoi ce lieu est-il une innovation pour l’établissement ?"
      />
      <p id={hintId} className="hint">
        Affichée en tête de fiche sur le seul plan e-nov. Pour que le lieu y soit mis en avant,
        cochez aussi la catégorie « e-nov » ci-dessus.
      </p>
      {onSpaceTypeChange ? (
        <>
          <label htmlFor={`${idPrefix}-enov-space-type`} style={{ marginTop: 8 }}>
            Type d’espace e-nov
          </label>
          <select
            id={`${idPrefix}-enov-space-type`}
            value={spaceType || ''}
            onChange={(event) => onSpaceTypeChange(event.target.value)}
            aria-describedby={`${idPrefix}-enov-space-type-hint`}
          >
            <option value="">— Non renseigné —</option>
            {ENOV_SPACE_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
          <p id={`${idPrefix}-enov-space-type-hint`} className="hint">
            Range le lieu dans la légende du plan annoté imprimable (le label attend des espaces de
            types différents : extérieur, pédagogique, sportif, administratif, restauration…).
          </p>
        </>
      ) : null}
    </div>
  );
}
