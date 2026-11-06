import { categoryInfo, formatInfo } from '../../shared/taskTaxonomyCore.js';

/**
 * Étiquettes discrètes « 🪴 Jardinage · ⚡ Flash » d'une tuile de tâche (migration 329).
 * Lisibles sans la couleur (emoji + texte), non cliquables. Le mot « badge » est réservé aux
 * récompenses : ici, ce sont des **étiquettes**.
 */
export function TaskTaxonomyTags({ category, format }) {
  const cat = categoryInfo(category);
  const fmt = formatInfo(format);
  if (!cat && !fmt) return null;
  return (
    <span className="task-chip task-chip--taxonomy" data-testid="task-taxonomy-tags">
      {cat && (
        <span title={cat.description}>
          <span aria-hidden="true">{cat.emoji}</span> {cat.label}
        </span>
      )}
      {cat && fmt && (
        <span className="task-chip__sep" aria-hidden="true">
          {' · '}
        </span>
      )}
      {fmt && (
        <span title={fmt.description}>
          <span aria-hidden="true">{fmt.emoji}</span> {fmt.label}
        </span>
      )}
    </span>
  );
}
