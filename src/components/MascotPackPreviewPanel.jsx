import React from 'react';
import MascotPackRenderPreview from './mascot/MascotPackRenderPreview.jsx';

/**
 * Prévisualisation mascotte pack v1 après validation Zod (éditeur WYSIWYG embarqué).
 * @param {{
 *   pack: Record<string, unknown>,
 *   catalogId?: string,
 *   label?: string,
 * }} props
 */
export default function MascotPackPreviewPanel({ pack, catalogId = '', label = '' }) {
  return (
    <MascotPackRenderPreview
      pack={pack}
      catalogId={catalogId}
      label={label}
      variant="embedded"
      focusSection="all"
    />
  );
}
