import { EmptyState } from '../shared/components/EmptyState.jsx';
import { IconLeaf } from '../shared/icons.jsx';
/**
 * État vide de la vue Tâches (O6, extrait de `tasks-views.jsx`).
 *
 * Affiche le placeholder « Rien à faire… » (icône feuille) lorsqu'aucune tâche n'est visible.
 * Ne rend rien dès qu'il reste au moins une tâche. Passe par l'`EmptyState` partagé (lot R0
 * de l'audit UI/UX du 19/11/2026) ; texte inchangé.
 *
 * @param {object} props
 * @param {number} [props.count] nombre de tâches filtrées visibles ; 0 → affiche l'état vide
 */
export function TasksEmptyState({ count = 0 }) {
  if (count !== 0) return null;
  return (
    <EmptyState icon={<IconLeaf size={28} />}>
      <p>Rien à faire ici pour l’instant — reviens plus tard ou change tes filtres.</p>
    </EmptyState>
  );
}
