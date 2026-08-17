import {
  DEFAULT_MASCOT_EXPRESSION,
  DEFAULT_MASCOT_FRAMING,
  MASCOT_EXPRESSIONS,
  MASCOT_FRAMINGS,
} from './mascotExpressions.js';

/**
 * Manipulation du brouillon de configuration du narrateur (`content.help.narrator`)
 * côté studio prof — **fonctions pures**, sans React ni réseau.
 *
 * Miroir client de `lib/helpNarrator.js` : mêmes expressions, mêmes cadrages, même
 * règle d'URL. Le serveur reste l'autorité (il renormalise à l'enregistrement) ; ces
 * fonctions existent pour que l'écran d'administration montre *exactement* ce qui
 * sera retenu, plutôt que d'afficher une saisie que la persistance écarterait en
 * silence.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §4.3, §4.4 et §5.2.
 */

/** Défauts identiques à `loadDefaultNarratorConfig()` côté serveur. */
export const NARRATOR_DRAFT_DEFAULTS = Object.freeze({
  enabled: true,
  speakerName: 'OLU',
  fallbackSilhouette: 'olu',
  portraits: {},
});

/** Longueur maximale d'URL acceptée par le schéma Zod serveur. */
export const NARRATOR_URL_MAX_LENGTH = 500;

/** Budget réseau conseillé par portrait, en octets (§9.2). Au-delà : avertissement, pas blocage. */
export const NARRATOR_PORTRAIT_BUDGET_BYTES = 30 * 1024;

/** À quoi sert chaque expression — copie destinée aux profs (§4.3). */
export const NARRATOR_EXPRESSION_HINTS = Object.freeze({
  neutre: 'Défaut : en-tête des panneaux d’aide, et repli de toutes les autres expressions.',
  parle: 'Étape de visite guidée standard.',
  montre: 'L’étape désigne un élément précis de l’écran.',
  content: 'Fin de parcours, validation réussie.',
  vigilant: 'Avertissement, action délicate ou irréversible.',
  cherche: 'Étape d’exploration ou de recherche.',
  grave: 'Passage lourd de sens — au plus un par parcours.',
  complice: 'Trait d’humour, clin d’œil, relance.',
});

/** Libellés des cadrages, du plus utile au plus optionnel (§4.4). */
export const NARRATOR_FRAMING_LABELS = Object.freeze({
  bust: 'Buste',
  face: 'Visage',
  body: 'Corps entier',
});

export const NARRATOR_FRAMING_HINTS = Object.freeze({
  bust: 'Cadrage principal : visite guidée. Le seul indispensable.',
  face: 'Facultatif : sans lui, le visage est recadré automatiquement depuis le buste.',
  body: 'Facultatif : grands formats (écran d’accueil, intro).',
});

/**
 * N'accepte qu'une URL servable telle quelle dans un `<img src>` — même règle que
 * `normalizePortraitUrl()` côté serveur, pour ne jamais afficher une valeur qui
 * serait écartée à l'enregistrement.
 * @returns {string} URL retenue, ou '' si la valeur est refusée
 */
export function normalizeNarratorUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value.length > NARRATOR_URL_MAX_LENGTH) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return '';
}

/** Normalise une configuration reçue du serveur en brouillon exploitable par l'écran. */
export function normalizeNarratorDraft(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const portraits = {};
  for (const expression of MASCOT_EXPRESSIONS) {
    const source = input.portraits?.[expression];
    if (!source || typeof source !== 'object') continue;
    const portrait = {};
    for (const framing of MASCOT_FRAMINGS) {
      const url = normalizeNarratorUrl(source[framing]);
      if (url) portrait[framing] = url;
    }
    if (Object.keys(portrait).length > 0) portraits[expression] = portrait;
  }
  return {
    enabled: input.enabled !== false,
    speakerName: String(input.speakerName ?? NARRATOR_DRAFT_DEFAULTS.speakerName)
      .trim()
      .slice(0, 40),
    fallbackSilhouette:
      String(input.fallbackSilhouette || '').trim() || NARRATOR_DRAFT_DEFAULTS.fallbackSilhouette,
    portraits,
  };
}

/**
 * Pose (ou remplace) l'URL d'un cadrage. Une URL refusée par la règle serveur
 * **efface** l'entrée plutôt que d'enregistrer une valeur qui disparaîtrait.
 * @returns {object} nouveau brouillon (l'entrée n'est jamais mutée)
 */
export function setNarratorPortrait(draft, expression, framing, url) {
  const portraits = { ...(draft?.portraits || {}) };
  const current = { ...(portraits[expression] || {}) };
  const normalized = normalizeNarratorUrl(url);
  if (normalized) current[framing] = normalized;
  else delete current[framing];

  if (Object.keys(current).length > 0) portraits[expression] = current;
  else delete portraits[expression];

  return { ...draft, portraits };
}

/** Retire un cadrage précis. */
export function clearNarratorPortrait(draft, expression, framing) {
  return setNarratorPortrait(draft, expression, framing, '');
}

/** Retire tous les cadrages d'une expression. */
export function clearNarratorExpression(draft, expression) {
  const portraits = { ...(draft?.portraits || {}) };
  delete portraits[expression];
  return { ...draft, portraits };
}

/** Nombre d'expressions disposant d'au moins un portrait. */
export function countIllustratedExpressions(draft) {
  const portraits = draft?.portraits || {};
  return MASCOT_EXPRESSIONS.filter(
    (expression) => Object.keys(portraits[expression] || {}).length > 0,
  ).length;
}

/**
 * Reproduit **la cascade de rendu de `MascotSpeaker`** pour un couple
 * (expression, cadrage) : c'est ce qui permet à l'écran d'administration de montrer
 * ce que l'élève verra réellement, y compris quand rien n'a été fourni.
 *
 * @returns {{ src: string, origin: 'own'|'derived'|'inherited'|'svg', framing: string, expression: string }}
 */
export function resolveNarratorPreview(
  draft,
  expression,
  framing = DEFAULT_MASCOT_FRAMING,
  { silhouette = '' } = {},
) {
  const portraits = draft?.portraits || {};
  const candidates = [
    [expression, framing, 'own'],
    [expression, DEFAULT_MASCOT_FRAMING, 'derived'],
    [DEFAULT_MASCOT_EXPRESSION, framing, 'inherited'],
    [DEFAULT_MASCOT_EXPRESSION, DEFAULT_MASCOT_FRAMING, 'inherited'],
  ];
  for (const [key, wanted, origin] of candidates) {
    const src = portraits[key]?.[wanted];
    if (typeof src === 'string' && src) {
      return { src, origin, framing: wanted, expression: key };
    }
  }
  return {
    src: '',
    origin: 'svg',
    framing,
    expression,
    silhouette:
      silhouette || draft?.fallbackSilhouette || NARRATOR_DRAFT_DEFAULTS.fallbackSilhouette,
  };
}

/** Étiquette courte de provenance, pour le badge d'une vignette. */
export function describeNarratorPreviewOrigin(origin) {
  if (origin === 'own') return '';
  if (origin === 'derived') return 'recadré depuis le buste';
  if (origin === 'inherited') return 'reprend « Neutre »';
  return 'silhouette de repli';
}
