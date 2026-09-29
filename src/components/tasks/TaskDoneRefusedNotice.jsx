import { useState } from 'react';
import { IconDelete } from '../../shared/icons.jsx';

/**
 * « Tâche faite » écrite sans réseau puis refusée à l'arrivée (tâche archivée ou supprimée,
 * inscription retirée, tutoriel devenu obligatoire…). Le marquage est perdu, mais le
 * commentaire de l'élève ne l'est pas : il reste affiché ici jusqu'à ce qu'il l'efface.
 *
 * @param {object} props
 * @param {Array<{ client_uuid: string, task_title?: string, comment?: string, error?: string }>} props.items
 * @param {(clientUuid: string) => void} props.onDismiss
 * @param {(message: string) => void} [props.onToast]
 */
export function TaskDoneRefusedNotice({ items = [], onDismiss, onToast = null }) {
  const [copiedId, setCopiedId] = useState(null);
  if (!items.length) return null;

  const copy = async (item) => {
    try {
      await navigator.clipboard.writeText(item.comment || '');
      setCopiedId(item.client_uuid);
    } catch {
      onToast?.('Copie impossible : sélectionne le texte pour le copier à la main.');
    }
  };

  return (
    <section className="task-done-refused" aria-label="Rapports non envoyés">
      <h3 className="task-done-refused__title">
        {items.length > 1
          ? `${items.length} rapports écrits sans réseau n’ont pas pu être envoyés`
          : 'Un rapport écrit sans réseau n’a pas pu être envoyé'}
      </h3>
      <p className="task-done-refused__hint">
        Ton commentaire est gardé ici : copie-le si tu veux le réutiliser, puis efface-le.
      </p>
      <ul className="task-done-refused__list">
        {items.map((item) => (
          <li key={item.client_uuid} className="task-done-refused__item">
            <strong>« {item.task_title || 'Tâche'} »</strong>
            {item.error ? <span className="task-done-refused__error">{item.error}</span> : null}
            <p className="task-done-refused__comment">{item.comment}</p>
            <div className="task-done-refused__actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(item)}>
                {copiedId === item.client_uuid ? 'Copié ✓' : 'Copier le commentaire'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onDismiss(item.client_uuid)}
                aria-label={`Effacer le rapport non envoyé de « ${item.task_title || 'Tâche'} »`}
              >
                <IconDelete size={14} /> Effacer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
