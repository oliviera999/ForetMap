import { normalizeGlImageFrame } from '../../utils/glImageFrame.js';
import { normalizeChapterTheme } from '../../utils/glBrandTheme.js';
import { GL_SPELL_CATEGORY_LABELS } from './glSpellFieldLabels.js';

export const EMPTY_CHAPTER_THEME = { colors: {} };

export const EMPTY_CHAPTER_FORM = {
  slug: '',
  title: '',
  biome: '',
  biomeSlugs: [],
  spellCodes: [],
  mapImageUrl: '',
  storyMarkdown: '',
  biotopeMarkdown: '',
  biocenoseMarkdown: '',
  sortilegesMarkdown: '',
  orderIndex: 0,
  plateauNumber: '',
  mapMarkersVisible: '',
  mapZonesVisible: '',
  mapImageFrame: normalizeGlImageFrame(null, 'chapter-map'),
  theme: { ...EMPTY_CHAPTER_THEME },
};

/**
 * Déplace un slug de biome d'un cran dans la liste (direction -1 = haut, +1 = bas).
 * Renvoie une nouvelle liste ; renvoie la liste inchangée si le slug est absent
 * ou si la cible sort des bornes.
 */
export function moveBiomeSlug(slugs, slug, direction) {
  const list = [...slugs];
  const index = list.indexOf(slug);
  if (index < 0) return list;
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  [list[index], list[target]] = [list[target], list[index]];
  return list;
}

/**
 * Normalise le détail d'un chapitre (objet brut côté API) vers l'état du formulaire.
 */
export function chapterDetailToForm(data) {
  return {
    slug: data.chapter.slug,
    title: data.chapter.title || '',
    biome: data.chapter.biome || '',
    biomeSlugs: Array.isArray(data.chapter.biomes) ? data.chapter.biomes.map((b) => b.slug) : [],
    spellCodes: Array.isArray(data.chapter.spells)
      ? data.chapter.spells.map((s) => s.spell_code)
      : [],
    mapImageUrl: data.chapter.map_image_url || '',
    mapImageFrame: normalizeGlImageFrame(data.chapter.map_image_frame, 'chapter-map'),
    storyMarkdown: data.chapter.story_markdown || '',
    biotopeMarkdown: data.chapter.biotope_markdown || '',
    biocenoseMarkdown: data.chapter.biocenose_markdown || '',
    sortilegesMarkdown: data.chapter.sortileges_markdown || '',
    orderIndex: Number(data.chapter.order_index || 0),
    plateauNumber: data.chapter.plateau_number != null ? String(data.chapter.plateau_number) : '',
    mapMarkersVisible: chapterMapVisibilityToFormValue(data.chapter.map_markers_visible),
    mapZonesVisible: chapterMapVisibilityToFormValue(data.chapter.map_zones_visible),
    theme: normalizeChapterTheme(data.chapter.theme),
  };
}

/**
 * Construit le payload d'enregistrement (POST/PUT) à partir de l'état du formulaire.
 * Normalise le cadre image et le thème, coerce l'ordre en nombre et le plateau en
 * nombre ou null.
 */
export function chapterFormToPayload(chapterForm) {
  return {
    ...chapterForm,
    mapImageFrame: normalizeGlImageFrame(chapterForm.mapImageFrame, 'chapter-map'),
    theme: normalizeChapterTheme(chapterForm.theme),
    orderIndex: Number(chapterForm.orderIndex) || 0,
    plateauNumber: chapterForm.plateauNumber === '' ? null : Number(chapterForm.plateauNumber),
    mapMarkersVisible: chapterMapVisibilityToPayload(chapterForm.mapMarkersVisible),
    mapZonesVisible: chapterMapVisibilityToPayload(chapterForm.mapZonesVisible),
  };
}

function chapterMapVisibilityToFormValue(value) {
  if (value == null) return '';
  return value === true || value === 1 ? 'true' : 'false';
}

function chapterMapVisibilityToPayload(value) {
  if (value == null || value === '') return null;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

/**
 * Regroupe le catalogue de sorts par catégorie (libellé canonique), trié par nom (fr).
 */
export function groupSpellsByCategory(spellCatalog) {
  const map = new Map();
  for (const spell of spellCatalog) {
    const slug = String(spell.category_slug || 'autre');
    if (!map.has(slug)) {
      map.set(slug, {
        slug,
        nom: GL_SPELL_CATEGORY_LABELS[slug] || spell.category_nom || slug,
        spells: [],
      });
    }
    map.get(slug).spells.push(spell);
  }
  return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Liste tous les codes de sorts du catalogue (trimmés, non vides).
 */
export function allSpellCodesFrom(spellCatalog) {
  return spellCatalog.map((s) => String(s.spell_code || '').trim()).filter(Boolean);
}
