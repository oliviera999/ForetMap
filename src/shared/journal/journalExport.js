import { formatDateTime } from '../utils/formatDateTime.js';

/**
 * Export Markdown d'un carnet lu par un professeur / MJ (accompagnement pédagogique,
 * lecture seule). N'inclut pas les illustrations (binaire). Commun ForetMap / G&L : le
 * produit ne fournit que le libellé du propriétaire, ses métadonnées d'imports et, au
 * besoin, une ligne d'information par article (la zone côté ForetMap).
 *
 * @param {object} params
 * @param {string} params.subjectLabel « Éva Test », « eleve7 (Éva Test) »…
 * @param {object[]} [params.articles]
 * @param {object[]} [params.imports]
 * @param {(resourceType: string) => { label: string }} params.importTypeMeta
 * @param {(article: object) => string|null} [params.articleExtraLine] ligne ajoutée sous le titre
 * @returns {string}
 */
export function buildJournalExport({
  subjectLabel,
  articles = [],
  imports = [],
  importTypeMeta,
  articleExtraLine = null,
}) {
  const rows = Array.isArray(articles) ? articles : [];
  const items = Array.isArray(imports) ? imports : [];
  const lines = [`# Carnet de ${subjectLabel || 'Carnet'}`, ''];
  lines.push(`_${rows.length} article(s) · ${items.length} import(s)_`, '');
  if (rows.length) {
    lines.push('## Articles', '');
    for (const a of rows) {
      lines.push(`### ${String(a.title || '').trim() || 'Article sans titre'}`);
      const meta = [];
      if (a.createdAt) meta.push(`créé le ${formatDateTime(a.createdAt)}`);
      if (a.updatedAt) meta.push(`modifié le ${formatDateTime(a.updatedAt)}`);
      if (meta.length) lines.push(`_${meta.join(' · ')}_`);
      const extra = typeof articleExtraLine === 'function' ? articleExtraLine(a) : null;
      if (extra) lines.push(`_${extra}_`);
      lines.push('', String(a.bodyMarkdown || '').trim() || '_(sans texte)_', '');
    }
  }
  if (items.length) {
    lines.push('## Éléments importés', '');
    for (const it of items) {
      const meta = importTypeMeta(it.resourceType);
      const when = it.createdAt ? ` (importé le ${formatDateTime(it.createdAt)})` : '';
      lines.push(`- ${meta.label} — ${it.title || it.resourceRef}${when}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
