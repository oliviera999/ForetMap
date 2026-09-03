/**
 * Puces de filtre par catégorie (lot 4) : sélection multiple, défilement horizontal, cibles
 * tactiles de 44 px. Aucune puce cochée = tous les lieux.
 *
 * @param {object} props
 * @param {Array<{ id: string, label: string, emoji: string, color: string }>} props.categories
 * @param {Set<string>} props.selectedIds
 * @param {(id: string) => void} props.onToggle
 * @param {() => void} props.onReset
 * @param {Map<string, number>} [props.counts] nombre de lieux par catégorie.
 */
export function PlanCategoryChips({ categories, selectedIds, onToggle, onReset, counts = null }) {
  if (!categories || categories.length === 0) return null;
  const hasSelection = selectedIds.size > 0;
  return (
    <div className="plan-chips" role="group" aria-label="Filtrer par catégorie">
      <button
        type="button"
        className={`plan-chip${hasSelection ? '' : ' is-active'}`}
        aria-pressed={!hasSelection}
        onClick={onReset}
      >
        Tout
      </button>
      {categories.map((category) => {
        const id = String(category.id);
        const active = selectedIds.has(id);
        const count = counts?.get(id);
        return (
          <button
            key={id}
            type="button"
            className={`plan-chip${active ? ' is-active' : ''}`}
            aria-pressed={active}
            style={active && category.color ? { borderColor: category.color } : undefined}
            onClick={() => onToggle(id)}
          >
            {category.emoji ? (
              <span className="plan-chip__emoji" aria-hidden>
                {category.emoji}
              </span>
            ) : null}
            <span className="plan-chip__label">{category.label}</span>
            {count != null ? <span className="plan-chip__count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
