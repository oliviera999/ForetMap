import { useState } from 'react';
import { importTypeMeta, importTargetNav } from '../../utils/fmJournalMeta.js';

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR');
}

export function UserJournalImportCard({
  item,
  onNavigateTab,
  onDelete,
  onTogglePin,
  readOnly = false,
}) {
  const [removing, setRemoving] = useState(false);
  const [pinning, setPinning] = useState(false);
  const meta = importTypeMeta(item.resourceType);
  const nav = importTargetNav(item.resourceType, item.resourceRef);
  const label = item.title || `${item.resourceType} · ${item.resourceRef}`;
  const pinned = !!item.pinned;

  async function handleRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      await onDelete?.(item.id);
    } finally {
      setRemoving(false);
    }
  }

  async function handleTogglePin() {
    if (pinning) return;
    setPinning(true);
    try {
      await onTogglePin?.(item.id, !pinned);
    } finally {
      setPinning(false);
    }
  }

  return (
    <article className={`card fm-journal__import fade-in${pinned ? ' is-pinned' : ''}`}>
      <div className="fm-journal__import-main">
        <span className="fm-journal__import-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <div>
          <p className="fm-journal__import-kind">
            {pinned ? <span aria-hidden="true">📌 </span> : null}
            {meta.label}
          </p>
          <h3 className="fm-journal__import-title">{label}</h3>
          {item.createdAt ? (
            <p className="hint">Importé le {formatDateTime(item.createdAt)}</p>
          ) : null}
        </div>
      </div>
      <div className="fm-journal__import-actions">
        {nav && onNavigateTab ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onNavigateTab(nav)}
            aria-label={`Voir « ${label} »`}
          >
            Voir
          </button>
        ) : null}
        {!readOnly && onTogglePin ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleTogglePin}
            disabled={pinning}
            aria-pressed={pinned}
          >
            {pinned ? '📌 Épinglé' : 'Épingler'}
          </button>
        ) : null}
        {!readOnly ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? 'Retrait…' : 'Retirer'}
          </button>
        ) : null}
      </div>
    </article>
  );
}
