import React from 'react';
import { withAppBase } from '../../services/api.js';
import { formatMediaLibrarySize } from '../../utils/mediaLibraryView.js';
import { MediaUsageInfo } from './MediaUsageInfo.jsx';

export function resolveMediaUrl(url) {
  return withAppBase(String(url || ''));
}

export function MediaLibraryGalleryTile({
  item,
  onPickUrl,
  showMeta = false,
  selected = false,
  showSelect = false,
  onToggleSelect,
  usage,
  usageReady = false,
  showUsage = false,
}) {
  const mediaType = String(item.mediaType || 'image');
  const mediaUrl = resolveMediaUrl(item.url);

  return (
    <div className={`media-library-menu__gallery-card${selected ? ' is-selected' : ''}`}>
      {showSelect ? (
        <label className="media-library-menu__gallery-select">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Sélectionner ${item.filename}`}
            onChange={(event) => onToggleSelect?.(event.target.checked)}
          />
        </label>
      ) : null}
      <button
        type="button"
        className="media-library-menu__gallery-tile"
        title={`Copier l’URL — ${item.filename}`}
        aria-label={`Copier l’URL — ${item.filename}`}
        onClick={() => onPickUrl?.(item.url)}
      >
        <span className="media-library-menu__gallery-preview">
          {mediaType === 'image' ? (
            <img src={mediaUrl} alt="" loading="lazy" decoding="async" />
          ) : mediaType === 'video' ? (
            <>
              <video src={mediaUrl} preload="metadata" muted playsInline aria-hidden="true" />
              <span className="media-library-menu__gallery-type">Vidéo</span>
            </>
          ) : (
            <>
              <span className="media-library-menu__gallery-icon" aria-hidden="true">
                🎧
              </span>
              <span className="media-library-menu__gallery-type">Audio</span>
            </>
          )}
        </span>
        <span className="media-library-menu__gallery-caption">{item.filename}</span>
        {item.stableKey ? (
          <span className="media-library-menu__gallery-slug" title={`Slug : ${item.stableKey}`}>
            {item.stableKey}
          </span>
        ) : null}
        {showMeta ? (
          <span className="media-library-menu__gallery-meta">
            {formatMediaLibrarySize(item.size)}
          </span>
        ) : null}
      </button>
      {showUsage ? <MediaUsageInfo usage={usage} ready={usageReady} /> : null}
    </div>
  );
}
