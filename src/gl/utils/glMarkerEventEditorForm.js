/**
 * Logique pure de l'éditeur d'événements de repère GL (`GLMarkerEventEditor`).
 * Constantes de types d'événement + normalisation/transformation de la config
 * de formulaire ⇄ config d'événement, sans dépendance React.
 * Couverts par `tests-ui/gl/glMarkerEventEditorForm.test.js`.
 */

import {
  DEFAULT_QUESTION_POOL,
  DEFAULT_LORE_QUESTION_POOL,
  defaultEventConfigForQuestion,
  normalizeEventConfig,
  normalizeQuestionPool,
  normalizeLoreQuestionPool,
} from '../../utils/glMarkerEventConfig.js';

/** Types d'événement proposés dans le sélecteur. */
export const EVENT_TYPE_OPTIONS = [
  { value: 'start', label: 'Départ', enabled: true },
  { value: 'question', label: 'Question (QCM)', enabled: true },
  { value: 'event', label: 'Événement', enabled: true },
  { value: 'souffle', label: 'Souffle', enabled: true },
  { value: 'trame', label: 'Trame', enabled: true },
  { value: 'challenge', label: 'Défi', enabled: true },
  { value: 'shortcut', label: 'Raccourci', enabled: true },
  { value: 'frontier', label: 'Frontière', enabled: true },
  { value: 'finish', label: 'Arrivée', enabled: true },
  { value: 'story', label: 'Histoire', enabled: true },
  { value: 'point', label: "Point d'intérêt", enabled: true },
  { value: 'narration', label: 'Narration', enabled: true },
  { value: 'behavior', label: 'Comportement', enabled: true },
];

/** Niveaux toujours proposés dans le filtre de pool. */
export const DEFAULT_NIVEAUX = ['base', 'approfondissement', 'avance'];

/** Options de tier lore. */
export const TIER_LORE_OPTIONS = [
  { value: 'cle', label: 'Clé' },
  { value: 'recit', label: 'Récit' },
];

/** Construit le formulaire vierge (question biome) à partir des défauts de config. */
export function emptyQuestionForm() {
  const base = defaultEventConfigForQuestion();
  return {
    eventType: 'question',
    questionSet: base.question.set || 'biome',
    questionMode: base.question.mode,
    fixedQuestionCode: base.question.fixedQuestionCode || '',
    pool: { ...base.question.pool },
  };
}

/** Dérive l'état du formulaire depuis un repère existant (ou vierge si absent). */
export function formFromMarker(marker) {
  if (!marker) return emptyQuestionForm();
  const eventType = String(marker.event_type || '')
    .trim()
    .toLowerCase();
  const cfg = normalizeEventConfig(marker.event_config) || defaultEventConfigForQuestion();
  const question = cfg.question || defaultEventConfigForQuestion().question;
  return {
    eventType: eventType === 'quiz' ? 'question' : eventType || 'question',
    questionSet: question.set || 'biome',
    questionMode: question.mode,
    fixedQuestionCode: question.fixedQuestionCode || '',
    pool: { ...question.pool },
  };
}

/** Reconstruit la config d'événement normalisée à partir du formulaire + brouillon d'effets. */
export function buildEventConfigFromForm(form, effectsDraft = null) {
  const pool =
    form.questionSet === 'lore'
      ? normalizeLoreQuestionPool(form.pool)
      : normalizeQuestionPool(form.pool);
  const base =
    form.eventType === 'question'
      ? normalizeEventConfig({
          version: 2,
          question: {
            set: form.questionSet || 'biome',
            mode: form.questionMode,
            fixedQuestionCode: form.fixedQuestionCode || null,
            pool,
          },
        })
      : null;
  if (!effectsDraft?.effects && !effectsDraft?.eventMeta) return base;
  return normalizeEventConfig({
    version: 2,
    ...(base?.question ? { question: base.question } : {}),
    ...(effectsDraft.effects ? { effects: effectsDraft.effects } : {}),
    ...(effectsDraft.eventMeta ? { eventMeta: effectsDraft.eventMeta } : {}),
  });
}

/** Pool vierge pour un catalogue donné (biome/lore), au changement de catalogue. */
export function emptyPoolForSet(nextSet) {
  return nextSet === 'lore' ? { ...DEFAULT_LORE_QUESTION_POOL } : { ...DEFAULT_QUESTION_POOL };
}

/** Applique un patch au pool en le renormalisant selon le catalogue courant. */
export function patchPoolForSet(pool, questionSet, patch) {
  return questionSet === 'lore'
    ? normalizeLoreQuestionPool({ ...pool, ...patch })
    : normalizeQuestionPool({ ...pool, ...patch });
}

/**
 * Biomes effectifs du pool : ceux du chapitre, plus les biomes additionnels
 * éventuels (mode `custom`) sans doublon.
 */
export function effectiveBiomeSlugs(pool, chapterBiomeSlugs) {
  const normalized = normalizeQuestionPool(pool);
  if (normalized.biomeMode === 'chapter') return chapterBiomeSlugs;
  const merged = [...chapterBiomeSlugs];
  for (const slug of normalized.biomeSlugs || []) {
    if (!merged.includes(slug)) merged.push(slug);
  }
  return merged;
}

/** Slugs des biomes du chapitre (filtrés non vides). */
export function chapterBiomeSlugsFrom(chapterBiomes) {
  return Array.isArray(chapterBiomes) ? chapterBiomes.map((b) => b.slug).filter(Boolean) : [];
}

/** Options « biomes additionnels » : tous les biomes hors ceux du chapitre. */
export function buildAdditionalBiomeOptions(allBiomes, chapterBiomeSlugs) {
  return allBiomes
    .filter((biome) => !chapterBiomeSlugs.includes(biome.slug))
    .map((biome) => ({ value: biome.slug, label: biome.nom || biome.slug }));
}

/** Options de catégories QCM/lore (libellé préfixé de l'emoji éventuel). */
export function buildCategoryOptions(categories) {
  return categories.map((cat) => ({
    value: cat.slug,
    label: `${cat.emoji ? `${cat.emoji} ` : ''}${cat.nom || cat.slug}`,
  }));
}

/** Options de scopes lore. */
export function buildLoreScopeOptions(loreScopes) {
  return loreScopes.map((scope) => ({ value: scope.slug, label: scope.nom || scope.slug }));
}

/** Options de niveaux : défauts + niveaux présents dans le pool, triés. */
export function buildNiveauOptions(poolItems) {
  const set = new Set(DEFAULT_NIVEAUX);
  for (const item of poolItems) {
    if (item.niveau) set.add(item.niveau);
  }
  return Array.from(set)
    .sort()
    .map((n) => ({ value: n, label: n }));
}

/**
 * Bascule l'appartenance d'un code de question dans la liste des codes
 * sélectionnés (normalisé majuscule). Renvoie la liste inchangée si code vide.
 */
export function toggleSelectedCode(selectedCodes, code, allPoolCodes = null) {
  const upper = String(code || '')
    .trim()
    .toUpperCase();
  const current = selectedCodes || [];
  if (!upper) return current;
  if (current.length === 0 && Array.isArray(allPoolCodes) && allPoolCodes.length > 0) {
    const allUpper = allPoolCodes
      .map((item) =>
        String(item || '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean);
    return allUpper.filter((item) => item !== upper);
  }
  return current.includes(upper) ? current.filter((c) => c !== upper) : [...current, upper];
}

/** Normalise un code de question fixe (trim + majuscule). */
export function normalizeFixedCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase();
}
