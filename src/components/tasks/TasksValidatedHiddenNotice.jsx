import { IconCheck } from '../../shared/icons.jsx';

/** Accord au pluriel français (suffixe vide ou « s »). */
const plural = (n) => (n > 1 ? 's' : '');

/**
 * Invite « éléments validés masqués » de la vue Tâches.
 *
 * Les tâches validées et les projets validés sont masqués par défaut, sur le modèle des
 * archives : plus rien n'est attendu dessus, et ils repoussaient le contenu utile vers le
 * bas de l'écran. Cette ligne les rend découvrables — sans elle, il faudrait deviner que
 * le filtre de statut « Validée » les ramène. Le bouton pose ce filtre.
 *
 * Ne rend rien quand il n'y a rien à masquer (la vue ne la monte pas non plus quand les
 * validés sont déjà affichés).
 *
 * @param {object} props
 * @param {number} [props.tasksCount] tâches validées masquées par les filtres courants
 * @param {number} [props.projectsCount] projets validés masqués par les filtres courants
 * @param {() => void} props.onShowValidated pose le filtre de statut « Validée »
 */
export function TasksValidatedHiddenNotice({ tasksCount = 0, projectsCount = 0, onShowValidated }) {
  if (tasksCount <= 0 && projectsCount <= 0) return null;
  const parts = [];
  if (tasksCount > 0) {
    const s = plural(tasksCount);
    parts.push(`${tasksCount} tâche${s} validée${s} masquée${s}`);
  }
  if (projectsCount > 0) {
    const s = plural(projectsCount);
    parts.push(`${projectsCount} projet${s} validé${s} masqué${s}`);
  }
  return (
    <div className="tasks-validated-hidden">
      <span className="tasks-validated-hidden__text">
        <IconCheck size={14} /> {parts.join(' et ')}.
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onShowValidated}
        title="Afficher les tâches et projets validés (filtre de statut « Validée »)"
      >
        Afficher les validés
      </button>
    </div>
  );
}
