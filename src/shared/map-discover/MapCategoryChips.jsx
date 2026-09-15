/**
 * Puces de filtre par catégorie (lot 4 Plan, réutilisées Visite) : sélection multiple,
 * défilement horizontal, cibles tactiles de 44 px. Aucune puce cochée = tous les lieux.
 *
 * Elles font aussi office de **légende** : chaque puce porte la pastille de couleur de sa
 * catégorie.
 *
 * @param {object} props
 * @param {Array<{ id: string, label: string, emoji: string, color: string }>} props.categories
 * @param {Set<string>} props.selectedIds
 * @param {(id: string) => void} props.onToggle
 * @param {() => void} props.onReset
 * @param {Map<string, number>} [props.counts] nombre de lieux par catégorie.
 * @param {string} [props.className] racine (défaut `plan-chips` ; Visite : `visit-chips`).
 * @param {string} [props.chipClassName] puce (défaut `plan-chip` ; Visite : `visit-chip`).
 */
export function MapCategoryChips({
  categories,
  selectedIds,
  onToggle,
  onReset,
  counts = null,
  className = 'plan-chips',
  chipClassName = 'plan-chip',
}) {
  // Une puce sans aucun lieu vide la carte quand on la coche : on ne la propose pas —
  // sauf si elle est déjà cochée, pour que l'on puisse la décocher.
  const shown = (categories || []).filter((category) => {
    const id = String(category.id);
    if (selectedIds.has(id)) return true;
    if (!counts) return true;
    return (counts.get(id) || 0) > 0;
  });
  if (shown.length === 0) return null;
  const hasSelection = selectedIds.size > 0;
  const swatchClass = `${chipClassName}__swatch`;
  const emojiClass = `${chipClassName}__emoji`;
  const labelClass = `${chipClassName}__label`;
  const countClass = `${chipClassName}__count`;
  return (
    <div className={className} role="group" aria-label="Filtrer par catégorie">
      <button
        type="button"
        className={`${chipClassName}${hasSelection ? '' : ' is-active'}`}
        aria-pressed={!hasSelection}
        onClick={onReset}
      >
        Tout
      </button>
      {shown.map((category) => {
        const id = String(category.id);
        const active = selectedIds.has(id);
        const count = counts?.get(id);
        return (
          <button
            key={id}
            type="button"
            className={`${chipClassName}${active ? ' is-active' : ''}`}
            aria-pressed={active}
            style={active && category.color ? { borderColor: category.color } : undefined}
            onClick={() => onToggle(id)}
          >
            <span
              className={swatchClass}
              style={category.color ? { background: category.color } : undefined}
              aria-hidden
            />
            {category.emoji ? (
              <span className={emojiClass} aria-hidden>
                {category.emoji}
              </span>
            ) : null}
            <span className={labelClass}>{category.label}</span>
            {count != null ? <span className={countClass}>{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
