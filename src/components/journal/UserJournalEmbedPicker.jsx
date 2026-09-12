import { useState } from 'react';
import { DialogShell } from '../DialogShell.jsx';
import { JOURNAL_EMBED_TYPE_LABELS, MODULE_STUB_OPTIONS } from '../../utils/fmJournalMeta.js';

export function UserJournalEmbedPicker({ open, onClose, onInsert }) {
  const [embedType, setEmbedType] = useState('plant');
  const [embedRef, setEmbedRef] = useState('');

  function handleInsert() {
    const ref =
      embedType === 'module_stub'
        ? String(embedRef || 'plants').trim() || 'plants'
        : String(embedRef || '').trim();
    if (!ref) return;
    onInsert?.(embedType, ref);
    setEmbedRef('');
    onClose?.();
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="fm-modal-overlay"
      dialogClassName="fm-modal-panel animate-pop fm-journal-embed-picker"
      ariaLabelledBy="fm-journal-embed-title"
    >
      <header className="fm-journal-modal-head">
        <h2 id="fm-journal-embed-title">Insérer un élément</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>
      </header>
      <label className="fm-journal-field">
        Type d’élément
        <select value={embedType} onChange={(e) => setEmbedType(e.target.value)}>
          {Object.entries(JOURNAL_EMBED_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {embedType === 'module_stub' ? (
        <label className="fm-journal-field">
          Module
          <select value={embedRef || 'plants'} onChange={(e) => setEmbedRef(e.target.value)}>
            {MODULE_STUB_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="fm-journal-field">
          {embedType === 'plant'
            ? 'Identifiant de fiche espèce'
            : embedType === 'tutorial'
              ? 'Identifiant du tutoriel'
              : 'Code glossaire'}
          <input
            type="text"
            value={embedRef}
            onChange={(e) => setEmbedRef(e.target.value)}
            placeholder={embedType === 'glossary' ? 'ex. COMPOST' : 'ex. 12'}
          />
        </label>
      )}
      <div className="fm-journal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn btn-primary" onClick={handleInsert}>
          Insérer
        </button>
      </div>
    </DialogShell>
  );
}
