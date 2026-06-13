import React from 'react';
import { AttachmentImagesPicker } from '../attachment-images-picker';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';

/**
 * Formulaire de saisie d'un commentaire contextuel (feuille prop-driven).
 * L'état (texte, images, soumission) reste géré par le parent.
 */
function ContextCommentForm({
  body,
  onBodyChange,
  pendingImages,
  onPendingImagesChange,
  placeholder,
  submitting,
  onSubmit,
  onNotify,
}) {
  return (
    <form className="context-comments-form" onSubmit={onSubmit}>
      <MarkdownTextarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        rows={2}
        maxLength={4000}
        placeholder={placeholder}
        required={pendingImages.length === 0}
      />
      <AttachmentImagesPicker
        value={pendingImages}
        onChange={onPendingImagesChange}
        disabled={submitting}
        onNotify={onNotify}
      />
      <button type="submit" className="btn btn-secondary btn-sm" disabled={submitting}>
        {submitting ? 'Envoi...' : 'Publier'}
      </button>
    </form>
  );
}

export { ContextCommentForm };
