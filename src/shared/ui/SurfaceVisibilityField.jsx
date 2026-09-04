/**
 * Surfaces d'affichage d'un lieu ou d'une catégorie (lot 4 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.4) : la carte de travail ForetMap, la Visite et le
 * Plan Lyautey. Même liste que `lib/locationSurfaces.js` côté serveur.
 */
export const SURFACE_OPTIONS = Object.freeze([
  { id: 'map', label: 'Carte', hint: 'carte de travail des élèves' },
  { id: 'visit', label: 'Visite', hint: 'visite grand public' },
  { id: 'plan', label: 'Plan', hint: 'plan de l’établissement (planlyautey)' },
]);

export const ALL_SURFACES = Object.freeze(SURFACE_OPTIONS.map((s) => s.id));

/** Normalise une valeur serveur (`'map,plan'`, tableau, vide) en tableau de surfaces connues. */
export function normalizeSurfaceList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen = new Set();
  for (const item of raw) {
    const id = String(item || '')
      .trim()
      .toLowerCase();
    if (ALL_SURFACES.includes(id)) seen.add(id);
  }
  return ALL_SURFACES.filter((id) => seen.has(id));
}

/**
 * Groupe de cases « une par surface ».
 * - `mode="visible"` (catégorie : `surfaces`) : cochée = visible sur la surface ;
 * - `mode="hidden"` (lieu : `hidden_surfaces`) : cochée = **masqué** sur la surface.
 * `value` est toujours la liste stockée (surfaces visibles, ou surfaces masquées).
 *
 * `unavailable` marque les surfaces qui n'ont pas encore d'écran pour ce contenu : la case
 * reste lisible (et cochée si elle l'était déjà) mais ne se coche plus, et le repère dit
 * pourquoi. Une case qui promet un affichage inexistant vaut moins qu'une case honnête
 * (`docs/AUDIT_PARCOURS_2026-09.md` §2.3).
 *
 * @param {object} props
 * @param {string[]} props.value
 * @param {(next: string[]) => void} props.onChange
 * @param {'visible'|'hidden'} [props.mode='hidden']
 * @param {string} [props.legend]
 * @param {boolean} [props.disabled]
 * @param {string} [props.idPrefix]
 * @param {string[]} [props.unavailable] surfaces sans écran pour ce contenu.
 * @param {string} [props.unavailableHint] repère affiché sous ces surfaces.
 */
export function SurfaceVisibilityField({
  value,
  onChange,
  mode = 'hidden',
  legend,
  disabled = false,
  idPrefix = 'surface',
  unavailable = [],
  unavailableHint = 'écran à venir',
}) {
  const list = normalizeSurfaceList(value);
  const blocked = new Set(normalizeSurfaceList(unavailable));
  const title = legend || (mode === 'visible' ? 'Visible sur' : 'Masquer sur');
  const toggle = (id, checked) => {
    const next = new Set(list);
    if (checked) next.add(id);
    else next.delete(id);
    onChange?.(ALL_SURFACES.filter((s) => next.has(s)));
  };
  return (
    <fieldset className="fm-surface-field" disabled={disabled}>
      <legend className="fm-surface-field__legend">{title}</legend>
      <div className="fm-surface-field__options">
        {SURFACE_OPTIONS.map((surface) => {
          const inputId = `${idPrefix}-${mode}-${surface.id}`;
          const checked = list.includes(surface.id);
          // Une surface sans écran reste cochable pour la **décocher** : sinon une valeur
          // déjà posée serait impossible à retirer.
          const locked = blocked.has(surface.id) && !checked;
          return (
            <label key={surface.id} htmlFor={inputId} className="fm-surface-field__option">
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                disabled={disabled || locked}
                onChange={(e) => toggle(surface.id, e.target.checked)}
                aria-describedby={`${inputId}-hint`}
              />
              <span>{surface.label}</span>
              <small id={`${inputId}-hint`} className="fm-surface-field__hint">
                {blocked.has(surface.id) ? unavailableHint : surface.hint}
              </small>
            </label>
          );
        })}
      </div>
      {mode === 'hidden' && list.length === ALL_SURFACES.length ? (
        <p className="fm-surface-field__warning" role="status">
          Ce lieu ne sera visible nulle part.
        </p>
      ) : null}
    </fieldset>
  );
}
