/**
 * Helpers d'affichage purs de la bibliothèque de contenus G&L.
 * Aucun état React ni effet de bord (hors `canUseClipboard` qui lit `navigator`).
 */

export const FILE_STATUS_LABEL = {
  pending: 'En attente',
  uploading: 'Envoi',
  analyzing: 'Analyse',
  ok: 'OK',
  error: 'Erreur',
};

/** Indique si l'API presse-papiers `navigator.clipboard.writeText` est disponible. */
export function canUseClipboard() {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;
}

/** Résumé textuel (dry-run) d'une entrée d'analyse. */
export function previewSummary(entry) {
  if (!entry?.preview) return '—';
  if (entry.kind === 'media') {
    return `${entry.preview.mediaType || 'média'} → ${entry.preview.relativePath || entry.preview.url || ''}`;
  }
  const totals = entry.preview;
  if (totals.valid != null) {
    return `${totals.valid}/${totals.received || '?'} ligne(s) valide(s)`;
  }
  if (totals.upserted != null) {
    return `${totals.upserted} élément(s) prêt(s)`;
  }
  if (totals.feuillets) {
    return `${totals.feuillets.upserted || 0} feuillet(s), ${totals.plateaux?.upserted || 0} plateau(x)`;
  }
  return 'Analyse OK';
}

/** Classe CSS de la pastille de nature d'une entrée. */
export function kindBadgeClass(kind) {
  if (kind === 'media') return 'gl-content-library-kind gl-content-library-kind--media';
  if (kind === 'unknown' || kind === 'unsupported') return 'gl-content-library-kind gl-content-library-kind--unknown';
  return 'gl-content-library-kind gl-content-library-kind--catalog';
}

/** Ligne de fichier initiale (état d'upload). */
export function createFileRow(file) {
  return {
    file,
    status: 'pending',
    progress: 0,
    error: null,
  };
}

/** Clé stable d'une entrée d'analyse (nom + index). */
export function entryKey(entry, index) {
  return `${entry.fileName}:${index}`;
}
