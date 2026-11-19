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
  resolveBiomeSlugsForPool,
  resolveSousBiomePoolSlug,
} from './glMarkerEventConfig.js';

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
    keepQuestion: false,
    tenir: null,
  };
}

/**
 * Dérive l'état du formulaire depuis un repère existant (ou vierge si absent).
 *
 * Deux champs n'ont pas de contrôle à l'écran et ne font que traverser le formulaire, pour que
 * relire puis réécrire un repère ne lui retire rien (audit des bugs G&L 2026-11-19, E2) :
 * - `tenir` : marque d'une case « Défi d'équipe » (`tenir.defi`), lue par le moteur du tour ;
 * - `keepQuestion` : le repère porte une question alors que son type n'est pas « question »
 *   (le jeu la pose quand même, cf. `isQuestionMarker`). Elle est gardée tant que l'admin ne
 *   change pas le type lui-même.
 */
export function formFromMarker(marker) {
  if (!marker) return emptyQuestionForm();
  const rawType = String(marker.event_type ?? marker.eventType ?? '')
    .trim()
    .toLowerCase();
  const eventType = rawType === 'quiz' ? 'question' : rawType || 'question';
  const stored = normalizeEventConfig(marker.event_config ?? marker.eventConfig);
  const cfg = stored || defaultEventConfigForQuestion();
  const question = cfg.question || defaultEventConfigForQuestion().question;
  return {
    eventType,
    questionSet: question.set || 'biome',
    questionMode: question.mode,
    fixedQuestionCode: question.fixedQuestionCode || '',
    pool: { ...question.pool },
    keepQuestion: eventType !== 'question' && Boolean(stored?.question),
    tenir: stored?.tenir || null,
  };
}

/** Reconstruit la config d'événement normalisée à partir du formulaire + brouillon d'effets. */
export function buildEventConfigFromForm(form, effectsDraft = null) {
  const pool =
    form.questionSet === 'lore'
      ? normalizeLoreQuestionPool(form.pool)
      : normalizeQuestionPool(form.pool);
  const withQuestion = form.eventType === 'question' || form.keepQuestion === true;
  return normalizeEventConfig({
    version: 2,
    ...(withQuestion
      ? {
          question: {
            set: form.questionSet || 'biome',
            mode: form.questionMode,
            fixedQuestionCode: form.fixedQuestionCode || null,
            pool,
          },
        }
      : {}),
    ...(effectsDraft?.effects ? { effects: effectsDraft.effects } : {}),
    ...(effectsDraft?.eventMeta ? { eventMeta: effectsDraft.eventMeta } : {}),
    ...(form.tenir ? { tenir: form.tenir } : {}),
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
 * éventuels (mode `custom`) sans doublon ; en mode `sous_biome`, le biome de la case
 * (repli sur le chapitre pour une case sans biome propre, comme au tirage).
 */
export function effectiveBiomeSlugs(pool, chapterBiomeSlugs, sousBiomeSlug = null) {
  const normalized = normalizeQuestionPool(pool);
  if (normalized.biomeMode === 'sous_biome') {
    return resolveBiomeSlugsForPool(normalized, chapterBiomeSlugs, sousBiomeSlug);
  }
  if (normalized.biomeMode === 'chapter') return chapterBiomeSlugs;
  const merged = [...chapterBiomeSlugs];
  for (const slug of normalized.biomeSlugs || []) {
    if (!merged.includes(slug)) merged.push(slug);
  }
  return merged;
}

/**
 * Phrase d'aide du mode « Biome de la case » : quel biome le tirage utilisera pour ce
 * repère, ou pourquoi il retombe sur les biomes du chapitre.
 */
export function sousBiomePoolHint(sousBiomeSlug, chapterBiomeSlugs = []) {
  const raw = String(sousBiomeSlug || '').trim();
  const chapterLabel = chapterBiomeSlugs.length ? chapterBiomeSlugs.join(', ') : 'aucun';
  const caseBiome = resolveSousBiomePoolSlug(raw);
  if (caseBiome) {
    return caseBiome === raw
      ? `Questions du biome de la case : ${caseBiome}.`
      : `Questions du biome de la case : ${caseBiome} (sous-biome ${raw}).`;
  }
  if (!raw) {
    return `Ce repère n'a pas de sous-biome : tirage dans les biomes du chapitre (${chapterLabel}).`;
  }
  return `Sous-biome « ${raw} » sans biome propre : tirage dans les biomes du chapitre (${chapterLabel}).`;
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
