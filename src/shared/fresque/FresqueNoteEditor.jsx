import { useEffect, useState } from 'react';

import { DialogShell } from '../components/DialogShell.jsx';
import { FRESQUE_LIMITS, NOTE_COLORS } from './fresqueCore.js';

export const NOTE_COLOR_LABELS = Object.freeze({
  yellow: 'Jaune',
  green: 'Vert',
  blue: 'Bleu',
  pink: 'Rose',
  orange: 'Orange',
});

/**
 * Post-it de l'élève : texte brut (≤ 280 caractères), cinq couleurs. Sert à créer et à
 * modifier ; « Supprimer » n'apparaît qu'en modification.
 */
export function FresqueNoteDialog({
  open,
  note = null,
  onSave,
  onDelete = null,
  onClose,
  prompt = '',
}) {
  const [text, setText] = useState(note?.text || '');
  const [color, setColor] = useState(note?.color || NOTE_COLORS[0]);
  useEffect(() => {
    setText(note?.text || '');
    setColor(note?.color || NOTE_COLORS[0]);
  }, [note, open]);
  if (!open) return null;
  const remaining = FRESQUE_LIMITS.maxNoteText - text.length;
  return (
    <DialogShell
      open
      onClose={onClose}
      dialogClassName="fm-fresque-dialog"
      ariaLabel={note ? 'Modifier le post-it' : 'Nouveau post-it'}
    >
      <h2>{note ? 'Modifier le post-it' : 'Nouveau post-it'}</h2>
      {prompt ? <p>{prompt}</p> : null}
      <label className="fm-fresque-field">
        <span className="fm-fresque-sr">Texte du post-it</span>
        <textarea
          className="fm-fresque-textarea"
          value={text}
          maxLength={FRESQUE_LIMITS.maxNoteText}
          rows={4}
          onChange={(e) => setText(e.target.value.slice(0, FRESQUE_LIMITS.maxNoteText))}
          placeholder="Une idée d’action, une question…"
          data-testid="fm-fresque-note-text"
        />
      </label>
      <small aria-live="polite">{remaining} caractère(s) restant(s)</small>
      <div className="fm-fresque-palette" role="radiogroup" aria-label="Couleur du post-it">
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c ? 'true' : 'false'}
            aria-label={NOTE_COLOR_LABELS[c] || c}
            className="fm-fresque-swatch fm-fresque-swatch--note"
            data-color={c}
            onClick={() => setColor(c)}
            data-testid={`fm-fresque-note-color-${c}`}
          >
            {color === c ? '✓' : ''}
          </button>
        ))}
      </div>
      <div className="fm-fresque-dialog__actions">
        {note && onDelete ? (
          <button
            type="button"
            className="fm-fresque-btn"
            onClick={() => onDelete(note)}
            data-testid="fm-fresque-note-delete"
          >
            Supprimer
          </button>
        ) : null}
        <button type="button" className="fm-fresque-btn fm-fresque-btn--ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="fm-fresque-btn fm-fresque-btn--primary"
          disabled={!text.trim()}
          onClick={() => onSave({ text: text.trim(), color })}
          data-testid="fm-fresque-note-save"
        >
          {note ? 'Enregistrer' : 'Coller le post-it'}
        </button>
      </div>
    </DialogShell>
  );
}

/**
 * Bulle d'un post-it « Indice » : relire l'indice, accepter la flèche révélée (cran 4), fermer
 * le post-it (il reste dans l'historique).
 */
export function FresqueHintDialog({ note, model, onAccept = null, onDismiss, onClose }) {
  if (!note) return null;
  const link = note.link;
  return (
    <DialogShell open onClose={onClose} dialogClassName="fm-fresque-dialog" ariaLabel="Indice">
      <h2>Indice {note.rung ? `(${note.rung}/4)` : ''}</h2>
      <p data-testid="fm-fresque-hint-text">{note.text}</p>
      <div className="fm-fresque-dialog__actions">
        {link && onAccept ? (
          <button
            type="button"
            className="fm-fresque-btn fm-fresque-btn--primary"
            onClick={() => onAccept(note)}
            data-testid="fm-fresque-hint-accept"
          >
            Tracer la flèche {model.cardsById[link.from]?.number} →{' '}
            {model.cardsById[link.to]?.number}
          </button>
        ) : null}
        <button
          type="button"
          className="fm-fresque-btn"
          onClick={() => onDismiss(note)}
          data-testid="fm-fresque-hint-dismiss"
        >
          Fermer le post-it
        </button>
        <button type="button" className="fm-fresque-btn fm-fresque-btn--ghost" onClick={onClose}>
          Garder
        </button>
      </div>
    </DialogShell>
  );
}
