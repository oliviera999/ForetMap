import React, { useState } from 'react';
import { DialogShell } from '../../components/DialogShell.jsx';
import { JOURNAL_EMBED_TYPE_LABELS } from '../utils/glPlayerJournalEmbed.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLSelect } from './ui/GLSelect.jsx';

export function GLPlayerJournalEmbedPicker({ open, onClose, onInsert, chapterSpells = [] }) {
  const [embedType, setEmbedType] = useState('spell');
  const [embedRef, setEmbedRef] = useState('');

  function handleInsert() {
    const ref = embedType === 'module_stub' ? 'narrative' : String(embedRef || '').trim();
    if (!ref && embedType !== 'module_stub') return;
    onInsert?.(embedType, ref);
    setEmbedRef('');
    onClose?.();
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="fm-modal-overlay gl-player-journal-embed-picker"
      dialogClassName="fm-modal-panel animate-pop gl-player-journal-embed-picker__body"
      ariaLabelledBy="gl-journal-embed-title"
    >
      <header className="gl-profile-modal-head">
        <h2 id="gl-journal-embed-title">Insérer un élément du site</h2>
        <GLButton type="button" variant="secondary" onClick={onClose} aria-label="Fermer">
          ✕
        </GLButton>
      </header>
      <div>
        <GLField label="Type d’élément">
          <GLSelect value={embedType} onChange={(e) => setEmbedType(e.target.value)}>
            {Object.entries(JOURNAL_EMBED_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </GLSelect>
        </GLField>
        {embedType === 'spell' ? (
          <GLField label="Code sort (ex. SL001) ou choix chapitre">
            <input
              type="text"
              list="gl-journal-spell-codes"
              value={embedRef}
              onChange={(e) => setEmbedRef(e.target.value)}
              placeholder="SL001"
            />
            <datalist id="gl-journal-spell-codes">
              {chapterSpells.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </GLField>
        ) : null}
        {embedType === 'species' ? (
          <GLField label="Code espèce (ex. SP0001)">
            <input
              type="text"
              value={embedRef}
              onChange={(e) => setEmbedRef(e.target.value)}
              placeholder="SP0001"
            />
          </GLField>
        ) : null}
        {embedType === 'glossary' ? (
          <GLField label="Code glossaire (ex. GL001)">
            <input
              type="text"
              value={embedRef}
              onChange={(e) => setEmbedRef(e.target.value)}
              placeholder="GL001"
            />
          </GLField>
        ) : null}
        {embedType === 'chapter' ? (
          <GLField label="Identifiant chapitre">
            <input
              type="number"
              min="1"
              value={embedRef}
              onChange={(e) => setEmbedRef(e.target.value)}
              placeholder="1"
            />
          </GLField>
        ) : null}
        {embedType === 'module_stub' ? (
          <p className="gl-hint">
            Place un rappel « module narratif à venir » dans ton carnet. Tu pourras le remplacer
            plus tard par un vrai encart.
          </p>
        ) : null}
      </div>
      <div className="gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={onClose}>Annuler</GLButton>
        <GLButton type="button" onClick={handleInsert}>Insérer</GLButton>
      </div>
    </DialogShell>
  );
}
