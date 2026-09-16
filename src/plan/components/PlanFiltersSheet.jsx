import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';

/**
 * Toutes les catégories du plan, en liste, dans une feuille basse.
 *
 * La rangée de puces reste le raccourci ; elle ne peut pas être la seule porte d'entrée : sur
 * un téléphone de 390 px, les onze catégories de production occupent 1 935 px, soit cinq
 * écrans de défilement horizontal — trois puces seulement sont visibles, et rien n'indique
 * qu'un filtre d'établissement est déjà actif
 * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N6).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Array<{ id: string, label: string, emoji: string, color: string, description?: string }>} props.categories
 * @param {Set<string>} props.selectedIds
 * @param {(id: string) => void} props.onToggle
 * @param {() => void} props.onReset
 * @param {Map<string, number>} [props.counts] nombre de lieux par catégorie.
 * @param {number} [props.shownCount] lieux actuellement affichés sur la carte.
 * @param {number} [props.totalCount] lieux publiés sur ce plan.
 */
export function PlanFiltersSheet({
  open,
  onClose,
  categories,
  selectedIds,
  onToggle,
  onReset,
  counts = null,
  shownCount = null,
  totalCount = null,
}) {
  const hasSelection = selectedIds.size > 0;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Filtrer par catégorie"
      snapPoints={['half', 'full']}
      initialSnap="half"
      blockBackground={false}
      className="plan-sheet plan-filters-sheet"
      testId="plan-filters-sheet"
      closeLabel="Fermer les filtres"
      wideAsDialog
      footer={
        <div className="plan-filters-sheet__actions">
          <button
            type="button"
            className="plan-filters-sheet__reset"
            disabled={!hasSelection}
            onClick={onReset}
          >
            Tout afficher
          </button>
        </div>
      }
    >
      <p className="plan-filters-sheet__summary" role="status">
        {hasSelection && shownCount != null && totalCount != null
          ? `${shownCount} lieux affichés sur ${totalCount}.`
          : 'Aucun filtre : tous les lieux du plan sont affichés.'}
      </p>
      <ul className="plan-filters-sheet__list">
        {(categories || []).map((category) => {
          const id = String(category.id);
          const active = selectedIds.has(id);
          const count = counts?.get(id) ?? null;
          return (
            <li key={id}>
              <button
                type="button"
                className={`plan-filters-sheet__item${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onToggle(id)}
              >
                <span
                  className="plan-filters-sheet__swatch"
                  style={category.color ? { background: category.color } : undefined}
                  aria-hidden
                />
                <span className="plan-filters-sheet__label">
                  {category.emoji ? <span aria-hidden>{category.emoji} </span> : null}
                  {category.label}
                </span>
                {count != null ? <span className="plan-filters-sheet__count">{count}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="plan-filters-sheet__note">
        Les lieux sans catégorie — entrées, loge, repères de service — restent affichés quel que
        soit le filtre.
      </p>
    </BottomSheet>
  );
}
