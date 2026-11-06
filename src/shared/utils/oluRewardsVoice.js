/**
 * La voix d'OLU quand un badge arrive. Charte : `docs/MASCOT_NARRATEUR_OLU.md` §2 (voix),
 * §2.2bis (règle d'or de l'humour), §7 (corpus).
 *
 * Partagé ForetMap **et** Gnomes & Licornes : la célébration est un composant commun
 * (`src/shared/rewards/RewardCelebration.jsx`). Un produit peut ajouter ses familles avec
 * `extraPools` (G&L : quêtes, sorts…) sans réécrire le reste du corpus.
 *
 * Règles portées par ce module :
 *
 * 1. **L'information d'abord, la pointe ensuite** (§2.2bis-2) : la célébration nomme déjà le
 *    badge et son palier ; la phrase d'OLU vient en plus, jamais à la place.
 * 2. **La pointe ne vise jamais l'élève** (§2.2bis-1) : elle vise OLU, un outil, une bête,
 *    une situation. Pas de flatterie non plus (§2.2) : OLU constate.
 * 3. **Varier** (§2.2bis-3) : plusieurs variantes par famille, tirage **déterministe**
 *    (`pickOluLine`, graine = clé du badge) — la phrase ne change pas sous les yeux de l'élève
 *    au fil des rendus.
 * 4. **Badge décerné par un adulte** : le mot de l'adulte est la vedette ; OLU se contente
 *    d'une phrase d'introduction, sans pointe.
 */

import { pickOluLine } from './oluLearningVoice.js';

/** Phrases par famille de badges (clé de famille du catalogue). */
export const OLU_REWARD_LINES = Object.freeze({
  metiers: Object.freeze([
    'Un métier de plus qui te connaît. Les outils, eux, ne disent jamais merci — alors je le fais.',
    'Le terrain a retenu ton passage. Moi aussi, j’ai noté.',
    'C’est du travail réel, validé par un adulte. Le genre de badge qui ne s’achète pas.',
  ]),
  engagement: Object.freeze([
    'Tu reviens, tu tiens parole : c’est rare, et ça se remarque.',
    'La régularité, c’est le secret du compost. Et apparemment le tien.',
    'Les petites tâches font les grandes forêts. Je l’ai lu quelque part, je crois que c’était moi.',
  ]),
  projet: Object.freeze([
    'Une étape du projet porte ta marque. Les plans aiment qu’on les suive jusqu’au bout.',
    'Concevoir, préparer, réaliser… Tu avances dans le projet, et le projet avance avec toi.',
  ]),
  polyvalence: Object.freeze([
    'Tu passes d’un métier à l’autre comme une abeille de fleur en fleur. En moins bruyant.',
    'L’écotone, c’est la lisière où la vie foisonne. Te voilà en bonne compagnie.',
  ]),
  exploration: Object.freeze([
    'Un coin de forêt de plus sur ta carte. Je croyais être le seul à fouiner par là.',
    'Les espèces que tu as croisées s’en souviennent peut-être. Moi, j’en suis sûr.',
    'Mesurer un arbre, c’est lui demander son âge poliment. Il ne répond jamais, mais il grandit.',
  ]),
  reportage: Object.freeze([
    'Une photo, un texte : ton carnet garde la mémoire de la forêt. Le mien a surtout des taches de boue.',
    'Ce que tu racontes, d’autres le liront. C’est comme ça qu’un jardin se transmet.',
  ]),
  nature: Object.freeze([
    'Ton herbier mental grossit. Le mien déborde, mais je ne retrouve jamais rien.',
    'Tu sais reconnaître ce que d’autres ne voient pas. Les petites bêtes apprécient la discrétion.',
    'Une notion de plus bien rangée. J’ai dû relire la mienne trois fois.',
  ]),
  temps: Object.freeze([
    'Les saisons ont défilé et tu étais là. Les racines, c’est exactement ça.',
    'Tu fais partie du paysage, maintenant. Au sens le plus gentil du terme.',
  ]),
  collectif: Object.freeze([
    'Une idée qui plaît, un coup de main qui compte : la forêt pousse mieux à plusieurs.',
    'Les autres ont remarqué ce que tu as apporté. Je ne suis pas le seul, ça me rassure.',
  ]),
  seances: Object.freeze([
    'Une séance terminée de plus. Les chemins s’apprennent en les parcourant.',
    'Tu as fini la séance jusqu’au bout. Certains escargots n’en reviennent toujours pas.',
  ]),
});

/** Repli générique (famille inconnue, plusieurs familles mêlées). */
export const OLU_REWARD_GENERIC = Object.freeze([
  'Voilà ce que ton travail t’a rapporté. Je l’accroche au tableau, avec les autres.',
  'Ça mérite d’être fêté — sobrement, je n’ai pas de confettis.',
  'Ce badge, tu l’as gagné sur le terrain. Ce sont les meilleurs.',
]);

/** Introduction d'un badge décerné par un adulte (le mot de l'adulte suit). */
export const OLU_REWARD_MANUAL = Object.freeze([
  'Un adulte a tenu à te le dire avec un badge :',
  'Quelqu’un a remarqué ce que tu as fait, et te laisse un mot :',
]);

/**
 * Phrase d'OLU pour un lot de badges célébrés ensemble.
 * @param {object[]} rewards badges décrits (`key`, `family`, `source`, `note`)
 * @param {{ extraPools?: Record<string, string[]> }} [options] familles propres à un produit
 * @returns {string}
 */
export function oluRewardLine(rewards, { extraPools = null } = {}) {
  const list = (rewards || []).filter(Boolean);
  if (!list.length) return '';
  const seed = list.map((r) => r.key).join('|');
  if (list.every((r) => r.source === 'manual' && r.note)) {
    return pickOluLine(OLU_REWARD_MANUAL, seed);
  }
  const families = [...new Set(list.filter((r) => r.source !== 'manual').map((r) => r.family))];
  const pools = { ...OLU_REWARD_LINES, ...(extraPools || {}) };
  const pool = families.length === 1 ? pools[families[0]] : null;
  return pickOluLine(pool && pool.length ? pool : OLU_REWARD_GENERIC, seed);
}
