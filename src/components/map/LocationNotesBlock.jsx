import { MarkdownContent } from '../MarkdownContent.jsx';

/**
 * Compléments réservés d'un lieu — affichage (migration 263).
 *
 * La liste arrive **déjà filtrée** par le serveur (`projectLocationAudienceForViewer`) : ce
 * qui est ici est ce que ce lecteur a le droit de lire. Le cadenas ne cache donc rien, il
 * rappelle que le bloc n'est pas public.
 */
export function LocationNotesBlock({ notes }) {
  const list = Array.isArray(notes) ? notes.filter((n) => n && String(n.body || '').trim()) : [];
  if (!list.length) return null;
  return (
    <>
      {list.map((note) => (
        <div className="location-note-block" key={note.id ?? `${note.title}-${note.body}`}>
          <strong className="location-note-block__title">
            <span aria-hidden>🔒</span> {String(note.title || '').trim() || 'Complément réservé'}
          </strong>
          <MarkdownContent>{note.body}</MarkdownContent>
        </div>
      ))}
    </>
  );
}
