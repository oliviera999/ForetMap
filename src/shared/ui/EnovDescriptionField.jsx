/**
 * Texte **e-nov** d'un lieu (migration 313) : en quoi cette zone ou ce repère constitue une
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
 */
export function EnovDescriptionField({ idPrefix, value, onChange }) {
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
    </div>
  );
}
