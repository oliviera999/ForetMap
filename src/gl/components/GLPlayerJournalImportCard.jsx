import React, { useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';
import { importTypeMeta, importTargetNav } from '../utils/glJournalImportMeta.js';

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR');
}

/**
 * Carte d'un élément du site importé dans le carnet (lecture seule) :
 * type + titre réel + lien « Voir » vers l'onglet d'origine + retrait.
 */
export function GLPlayerJournalImportCard({ item, onNavigateTab, onDelete, readOnly = false }) {
  const [removing, setRemoving] = useState(false);
  const meta = importTypeMeta(item.resourceType);
  const nav = importTargetNav(item.resourceType, item.resourceRef);

  async function handleRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      await onDelete?.(item.id);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <article className="gl-panel gl-player-journal__import fade-in">
      <div className="gl-player-journal__import-main">
        <span className="gl-player-journal__import-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <div>
          <p className="gl-player-journal__import-kind">{meta.label}</p>
          <h3 className="gl-player-journal__import-title">
            {item.title || `${item.resourceType} · ${item.resourceRef}`}
          </h3>
          {item.createdAt ? (
            <p className="gl-hint">Importé le {formatDateTime(item.createdAt)}</p>
          ) : null}
        </div>
      </div>
      <div className="gl-inline-actions gl-player-journal__import-actions">
        {nav && onNavigateTab ? (
          <GLButton type="button" variant="secondary" onClick={() => onNavigateTab(nav)}>
            Voir
          </GLButton>
        ) : null}
        {!readOnly ? (
          <GLButton type="button" variant="secondary" onClick={handleRemove} disabled={removing}>
            {removing ? 'Retrait…' : 'Retirer'}
          </GLButton>
        ) : null}
      </div>
    </article>
  );
}
