import React, { useCallback } from 'react';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../../shared/hooks/useDebouncedAutoSave.js';
import { GLButton } from '../ui/GLButton.jsx';

export function GLChapterSceneDraftRow({
  scene,
  index,
  draft,
  onDraftChange,
  onPersist,
  onSetCover,
  savingKey,
}) {
  const persistScene = useCallback(async () => {
    await onPersist(scene.stableKey, {
      caption: draft.caption.trim() || null,
      order: draft.order.trim() === '' ? null : Number(draft.order),
    });
    return draft;
  }, [draft, onPersist, scene.stableKey]);

  const { status, error } = useDebouncedAutoSave({
    value: draft,
    resetKey: scene.stableKey,
    onSave: persistScene,
  });

  return (
    <li className="gl-chapter-scenes-admin__item">
      <img
        src={scene.url}
        alt={scene.caption || scene.stableKey}
        loading="lazy"
        width={96}
        style={{ maxWidth: 96, borderRadius: 6 }}
      />
      <div className="gl-chapter-scenes-admin__fields">
        <strong>
          #{index + 1} · <code>{scene.stableKey}</code>
          {scene.cover ? ' · couverture' : ''}
        </strong>
        <label>
          Légende (alt + figcaption)
          <input
            value={draft.caption}
            placeholder="Scène du récit"
            onChange={(event) => onDraftChange(scene.stableKey, { caption: event.target.value })}
          />
        </label>
        <label>
          Ordre
          <input
            type="number"
            value={draft.order}
            placeholder="auto"
            style={{ width: 90 }}
            onChange={(event) => onDraftChange(scene.stableKey, { order: event.target.value })}
          />
        </label>
        {error ? <p className="gl-error">{error}</p> : null}
        <AutoSaveStatus status={status} className="gl-hint" />
        <span className="gl-inline-actions">
          {!scene.cover ? (
            <GLButton
              type="button"
              size="sm"
              variant="secondary"
              disabled={savingKey === scene.stableKey}
              onClick={() => onSetCover(scene.stableKey, true)}
            >
              Définir couverture
            </GLButton>
          ) : (
            <GLButton
              type="button"
              size="sm"
              variant="secondary"
              disabled={savingKey === scene.stableKey}
              onClick={() => onSetCover(scene.stableKey, false)}
            >
              Retirer couverture
            </GLButton>
          )}
        </span>
      </div>
    </li>
  );
}
