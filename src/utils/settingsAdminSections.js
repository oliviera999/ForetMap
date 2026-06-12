/**
 * Sectionnement et libellés des réglages admin — extraits de `settings-admin-views.jsx` (O6).
 *
 * Résolution du libellé d'une clé (métadonnées connues, libellés dynamiques selon la terminologie
 * des rôles, repli humanisé), regroupement des réglages en sections ordonnées, filtrage par
 * recherche texte (libellé/clé/portée/aide) et comptage. Logique pure, testable.
 */

import { SECTION_DEFS, KEY_META } from '../constants/settingsAdminMeta.js';
import {
  humanizeKey,
  inferSectionFromKey,
  scopeLabel,
  buildConstraintHelp,
} from './settingDisplay.js';

/**
 * Libellé d'un réglage : métadonnée connue (avec libellés dynamiques `google*`/`defaultMap*`
 * construits depuis `roleTerms`), sinon humanisation du dernier segment de la clé.
 */
export function resolveSettingLabel(key, roleTerms) {
  const meta = KEY_META[key];
  if (!meta) return humanizeKey(key);
  if (meta.dynamicLabel === 'googleStudent') return `Afficher "Google ${roleTerms.studentSingular}"`;
  if (meta.dynamicLabel === 'googleTeacher') return `Afficher "Google ${roleTerms.teacherShort}"`;
  if (meta.dynamicLabel === 'defaultStudentMap') return `Carte par défaut (${roleTerms.studentSingular})`;
  if (meta.dynamicLabel === 'defaultTeacherMap') return `Carte par défaut (${roleTerms.teacherSingular})`;
  return meta.label || humanizeKey(key);
}

/**
 * Regroupe les réglages en sections triées (ordre de section puis titre) ; dans chaque section,
 * lignes triées par ordre de champ puis clé. Chaque ligne est enrichie de `_sectionId`,
 * `_sectionTitle`, `_sectionOrder`, `_fieldOrder` et `_multiline` (consommé par le champ texte).
 */
export function buildSettingSections(settings) {
  const rows = (settings || []).map((row) => {
    const meta = KEY_META[row.key] || {};
    const sectionId = meta.section || inferSectionFromKey(row.key);
    const sectionDef = SECTION_DEFS[sectionId] || SECTION_DEFS.other;
    return {
      ...row,
      _sectionId: sectionId,
      _sectionTitle: sectionDef.title,
      _sectionOrder: sectionDef.order,
      _fieldOrder: meta.order ?? 999,
      _multiline: !!meta.multiline,
    };
  });
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row._sectionId)) {
      grouped.set(row._sectionId, {
        id: row._sectionId,
        title: row._sectionTitle,
        order: row._sectionOrder,
        rows: [],
      });
    }
    grouped.get(row._sectionId).rows.push(row);
  }
  const ordered = Array.from(grouped.values())
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  for (const section of ordered) {
    section.rows.sort((a, b) => a._fieldOrder - b._fieldOrder || String(a.key).localeCompare(String(b.key)));
  }
  return ordered;
}

/**
 * Filtre les sections par recherche texte (insensible à la casse) sur libellé résolu, clé,
 * libellé de portée et texte d'aide ; les sections vides sont retirées. Requête vide → entrée
 * retournée telle quelle (même référence).
 */
export function filterSettingSections(sections, searchQuery, roleTerms) {
  const query = String(searchQuery || '').trim().toLowerCase();
  if (!query) return sections;
  return sections
    .map((section) => {
      const rows = section.rows.filter((row) => {
        const label = resolveSettingLabel(row.key, roleTerms).toLowerCase();
        const key = String(row.key || '').toLowerCase();
        const scope = scopeLabel(row.scope).toLowerCase();
        const help = buildConstraintHelp(row).toLowerCase();
        return label.includes(query) || key.includes(query) || scope.includes(query) || help.includes(query);
      });
      return { ...section, rows };
    })
    .filter((section) => section.rows.length > 0);
}

/** Nombre total de lignes (réglages) sur l'ensemble des sections. */
export function countSectionRows(sections) {
  let n = 0;
  for (const section of sections || []) n += section.rows.length;
  return n;
}
