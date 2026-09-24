import { useEffect, useRef } from 'react';
import { AttachmentImagesPicker } from '../components/AttachmentImagesPicker.jsx';
import { ForumPlainEditor } from './SharedForumMarkdown.jsx';
import { forumBtn } from './forumUi.js';

/**
 * Formulaire « Nouveau sujet ». Brouillon tenu par la vue (il survit à une bascule de
 * volet) ; le titre prend le focus à l'ouverture.
 */
export function ForumNewThreadForm({
  draft,
  onDraftChange,
  groupOptions = [],
  limits,
  Editor = ForumPlainEditor,
  submitting,
  onSubmit,
  onCancel,
  onNotify,
}) {
  const titleRef = useRef(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const set = (patch) => onDraftChange({ ...draft, ...patch });
  const images = draft.images || [];

  return (
    <section className="fm-panel forum-panel forum-composer" aria-labelledby="forum-new-title">
      <h3 id="forum-new-title">Nouveau sujet</h3>
      <form className="forum-form" onSubmit={onSubmit}>
        <div className="fm-field">
          <label className="fm-label" htmlFor="forum-thread-title">
            Titre
          </label>
          <input
            id="forum-thread-title"
            className="fm-input"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            minLength={limits.titleMin}
            maxLength={limits.titleMax}
            required
            ref={titleRef}
          />
        </div>
        <div className="fm-field">
          <label className="fm-label" htmlFor="forum-thread-body">
            Message
          </label>
          <Editor
            id="forum-thread-body"
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            rows={4}
            maxLength={limits.bodyMax}
            required={images.length === 0}
          />
        </div>
        {groupOptions.length > 0 && (
          <div className="fm-field">
            <label className="fm-label" htmlFor="forum-thread-group">
              Groupe (optionnel)
            </label>
            <select
              id="forum-thread-group"
              className="fm-select"
              value={draft.groupId || ''}
              onChange={(e) => set({ groupId: e.target.value })}
            >
              <option value="">Tous les groupes visibles</option>
              {groupOptions.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <AttachmentImagesPicker
          value={images}
          onChange={(next) => set({ images: next })}
          onNotify={onNotify}
          label="Photos du premier message (optionnel, max 3)"
        />
        <div className="forum-form-actions">
          <button type="submit" className={forumBtn('primary')} disabled={submitting}>
            {submitting ? 'Publication…' : 'Publier le sujet'}
          </button>
          <button
            type="button"
            className={forumBtn('ghost')}
            onClick={onCancel}
            disabled={submitting}
          >
            Annuler
          </button>
        </div>
      </form>
    </section>
  );
}

/** Formulaire de réponse en bas de la discussion. */
export function ForumReplyForm({
  value,
  onChange,
  images,
  onImagesChange,
  limits,
  Editor = ForumPlainEditor,
  editorRef,
  submitting,
  onSubmit,
  onNotify,
  lockedNote = null,
}) {
  return (
    <form className="forum-form forum-reply-form" onSubmit={onSubmit}>
      {lockedNote}
      <div className="fm-field">
        <label className="fm-label" htmlFor="forum-reply">
          Répondre
        </label>
        <Editor
          id="forum-reply"
          ref={editorRef}
          value={value}
          onChange={onChange}
          rows={3}
          maxLength={limits.bodyMax}
          required={images.length === 0}
        />
      </div>
      <AttachmentImagesPicker
        value={images}
        onChange={onImagesChange}
        onNotify={onNotify}
        label="Photos (optionnel, max 3)"
      />
      <div className="forum-form-actions">
        <button type="submit" className={forumBtn('primary')} disabled={submitting}>
          {submitting ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </form>
  );
}
