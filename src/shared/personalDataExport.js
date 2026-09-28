/**
 * Nom proposé pour l'archive d'export des données personnelles (droit d'accès RGPD).
 * @param {string} prefix préfixe lisible (`mes-donnees`, `donnees-compte-…`)
 * @param {Date} [now]
 */
export function personalDataExportFilename(prefix = 'mes-donnees', now = new Date()) {
  const safe =
    String(prefix || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'mes-donnees';
  return `${safe}-${now.toISOString().slice(0, 10)}.zip`;
}
