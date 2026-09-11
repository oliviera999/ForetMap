/**
 * La voix d'OLU sur les surfaces d'apprentissage — quiz de conditionnement, retour d'une
 * réponse QCM, accusés « appris » / « découvert ». Charte : `docs/MASCOT_NARRATEUR_OLU.md`
 * §2 (voix), §2.2bis (règle d'or de l'humour), §7 (corpus).
 *
 * Partagé ForetMap **et** Gnomes & Licornes : les deux produits affichent les mêmes boutons
 * d'accusé et le même panneau de question, écrire deux corpus reviendrait à faire parler
 * deux OLU différents sur le même écran.
 *
 * Trois règles portées par ce module, et pas seulement par la relecture :
 *
 * 1. **La pointe ne vise jamais l'élève** (§2.2bis-1). Elle vise OLU, un objet, une
 *    situation — jamais l'erreur qui vient d'être commise. C'est ce qui sépare l'espièglerie
 *    de la moquerie, et un feedback d'échec est exactement l'endroit où la frontière compte.
 * 2. **OLU se tait sur les avertissements** (§2.2bis-4). Le verrou après erreur, le compte
 *    des essais restants et les règles du contrôle gardent leur formulation neutre : ils sont
 *    construits ailleurs (`learningGatingChallengeClient.js`) et ce module n'y touche pas.
 * 3. **La répétition use le ton plus vite que la blague** (§2.2bis-3). Une bulle de parcours
 *    se lit une fois ; un retour de QCM se lit vingt fois dans la même heure. D'où les pools
 *    de variantes ci-dessous — et le tirage **déterministe** de `pickOluLine`.
 *
 * ⚠️ Tirage déterministe, jamais `Math.random()` : une phrase tirée au rendu change sous les
 * yeux de l'élève à chaque re-rendu de React (une saisie, un focus, un poll de données
 * suffisent). La graine est stable — code de question, référence de ressource — donc la
 * phrase l'est aussi tant que l'écran montre la même chose.
 *
 * Les libellés de boutons, les cases à cocher d'engagement et les infobulles **ne passent
 * pas** par ici : ce sont de la chrome d'interface (§11.8) ou une phrase dite par l'élève,
 * pas par OLU.
 */

/**
 * Index stable tiré d'une graine textuelle (FNV-1a 32 bits).
 *
 * Inspiré du hachage FNV-1a de Glenn Fowler, Landon Curt Noll et Phong Vo
 * (http://www.isthe.com/chongo/tech/comp/fnv/) — domaine public, réécrit ici en une ligne
 * de JavaScript : on ne cherche ni cryptographie ni uniformité parfaite, seulement un
 * éparpillement correct et reproductible sur quelques variantes.
 *
 * @param {string} seed graine (code de question, référence de ressource…)
 * @param {number} length taille du pool
 * @returns {number} index dans `[0, length[`
 */
export function oluSeedIndex(seed, length) {
  const size = Math.max(0, Number(length) || 0);
  if (size <= 0) return 0;
  const text = String(seed ?? '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // `Math.imul` plutôt que `*` : au-delà de 2^53 la multiplication flottante perd les bits
    // de poids faible, et deux graines voisines retomberaient sur le même index.
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % size;
}

/**
 * Variante d'un pool, choisie de façon stable pour une graine donnée.
 *
 * @template T
 * @param {T[]} pool
 * @param {string} [seed]
 * @returns {T|''} `''` si le pool est vide
 */
export function pickOluLine(pool, seed = '') {
  if (!Array.isArray(pool) || pool.length === 0) return '';
  return pool[oluSeedIndex(seed, pool.length)];
}

/**
 * Retour par défaut d'une **bonne** réponse, quand la question n'a pas de feedback écrit
 * par le professeur (celui-là gagne toujours, cf. `qcmFeedback.js`).
 *
 * Pas de « Bravo », pas d'« Excellent » : la charte exclut la flatterie (§2.2). OLU constate,
 * et c'est le constat qui fait plaisir parce qu'il vient de quelqu'un qui connaît le terrain.
 */
export const OLU_CORRECT_FEEDBACK = Object.freeze([
  'C’est exactement ça.',
  'Bonne réponse — et elle n’était pas donnée.',
  'Juste. Celle-là, j’ai dû la vérifier deux fois avant d’oser la retenir.',
  'Tu l’as. Une de plus dans la besace.',
  'C’est la bonne, et tu n’as pas mis longtemps.',
]);

/**
 * Retour par défaut d'une **mauvaise** réponse.
 *
 * L'endroit le plus délicat du corpus : c'est ici qu'un ton taquin dérape en moquerie.
 * Aucune variante ne commente le choix de l'élève ; chacune nomme le fait et rouvre une
 * porte (§2.2 « bienveillant »). Une seule sur cinq porte une pointe, et elle vise OLU.
 */
export const OLU_WRONG_FEEDBACK = Object.freeze([
  'Ce n’est pas celle-là. L’information est sur la fiche, je l’y ai laissée en évidence.',
  'Pas celle-ci. Reprends la fiche, elle ne bouge pas.',
  'Non, ce n’est pas ça. C’est écrit plus discrètement que je ne le pensais — cherche vers le bas.',
  'Ce n’est pas la bonne. La première fois, j’avais pris celle qui sonnait le mieux, moi aussi.',
  'Pas encore. La réponse est sur la fiche, et personne ne chronomètre.',
]);

/**
 * Sous-titre du Quiz libre (ForetMap). Le thème des questions — sciences du vivant et
 * jardinage — reste dit dans chaque variante : c'est l'information, la pointe passe après.
 */
export const OLU_QUIZ_HEADER = Object.freeze([
  'Sciences du vivant et jardinage. Tire une question, on verra bien.',
  'Des questions de terrain : sciences du vivant et jardinage.',
  'Sciences du vivant et jardinage — de quoi vérifier ce qui est resté.',
  'Sciences du vivant et jardinage. Je les ai toutes ratées au moins une fois.',
]);

/**
 * Ouverture du panneau de question, avant que l'élève ne réponde. Le décompte
 * (« question 1 sur 3 ») est ajouté par l'appelant : il est factuel, il ne tourne pas.
 */
export const OLU_QUIZ_INTRO = Object.freeze([
  'Je vérifie juste que c’est bien passé',
  'Une question avant de valider',
  'On regarde ensemble si ça a pris',
  'Petit arrêt avant de valider',
]);

/**
 * Ouverture de l'annonce du contrôle (avant d'entrer dans le quiz). Reçoit le libellé de la
 * ressource et l'énoncé du nombre de questions, tous deux déjà accordés par l'appelant.
 */
export const OLU_GATING_INTRO = Object.freeze([
  (label, asked) => `Avant de te laisser valider ${label}, ${asked} — histoire d’être sûr.`,
  (label, asked) => `Pour valider ${label}, ${asked} d’abord.`,
  (label, asked) => `${capitalize(asked)} avant de confirmer ${label} : c’est la règle ici.`,
  (label, asked) => `Une étape avant ${label} : ${asked}.`,
]);

/**
 * Progression dans la série, après une bonne réponse.
 *
 * Les nombres sont l'information : ils ne tournent pas, seule leur mise en phrase varie.
 * Cette ligne ne félicite plus (« Bravo, bonne réponse ! » doublait le retour affiché juste
 * au-dessus) — elle situe, et c'est tout ce qu'on lui demande.
 */
export const OLU_SERIES_PROGRESS = Object.freeze([
  (done, asked, left, label, plural) =>
    `${done} sur ${asked} — encore ${left} question${plural} pour valider ${label}.`,
  (done, asked, left, label, plural) =>
    `${done} sur ${asked}, il reste ${left} question${plural} pour valider ${label}.`,
  (done, asked, left, label, plural) =>
    `Ça avance : ${done} sur ${asked}. Encore ${left} question${plural} avant de valider ${label}.`,
]);

/** Contrôle satisfait : la validation vient de s'ouvrir. */
export const OLU_CONTROL_PASSED = Object.freeze([
  (label) => `Contrôle passé : tu peux valider ${label}.`,
  (label) => `Voilà, c’est plié — ${label} t’attend.`,
  (label) => `Tout y est. ${capitalize(label)} est à toi.`,
  (label) => `C’est bon de mon côté : valide ${label}.`,
]);

/** Série de questions entièrement réussie, mais le contrôle demande encore des réponses. */
export const OLU_SERIES_DONE = Object.freeze([
  'Série réussie de bout en bout.',
  'Toutes les questions de cette série sont tombées du bon côté.',
  'Rien à redire sur cette série.',
  'Sans faute sur celle-là.',
]);

/**
 * Pointe d'OLU sous la phrase d'engagement des accusés (« appris », « découvert »).
 *
 * L'engagement lui-même reste en tête et inchangé — c'est l'information utile, et la chute
 * vient après (§2.2bis-2). La case à cocher, elle, n'est pas d'OLU : c'est l'élève qui parle.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const OLU_ACK_ASIDES = Object.freeze({
  glossary: Object.freeze([
    'Un mot de plus dans la besace — ils finissent tous par servir.',
    'Celui-là revient partout, une fois qu’on l’a repéré.',
    'Je l’ai croisé trois fois cette semaine ; maintenant tu le verras aussi.',
  ]),
  species: Object.freeze([
    'Une fiche de plus au compteur — la forêt en garde encore quelques-unes en réserve.',
    'Celle-là, je l’ai cherchée deux saisons avant de savoir la reconnaître.',
    'Retiens la silhouette : c’est elle qui sert sur le terrain, pas le nom latin.',
  ]),
  tutorial: Object.freeze([
    'Le genre de chose qu’on croit avoir retenue jusqu’au moment de s’en servir.',
    'La suite est nettement plus simple avec ça en tête.',
    'Garde-le sous le coude, il resservira.',
  ]),
  observation: Object.freeze([
    'Vu sur le terrain, ça vaut dix fiches lues.',
    'Tu l’as trouvée avant moi, cette fois.',
    'Une observation de plus : c’est comme ça que la carte se remplit.',
  ]),
});

/**
 * Retour par défaut d'une réponse, dans la voix d'OLU.
 * @param {boolean} correct
 * @param {string} [seed]
 * @returns {string}
 */
export function oluAnswerFeedback(correct, seed = '') {
  return pickOluLine(correct ? OLU_CORRECT_FEEDBACK : OLU_WRONG_FEEDBACK, seed);
}

/**
 * Sous-titre du Quiz libre.
 * @param {string} [seed]
 * @returns {string}
 */
export function oluQuizHeaderSubtitle(seed = '') {
  return pickOluLine(OLU_QUIZ_HEADER, seed);
}

/**
 * Ouverture du panneau de question (sans le décompte, ajouté par l'appelant).
 * @param {string} [seed]
 * @returns {string}
 */
export function oluQuizIntroOpener(seed = '') {
  return pickOluLine(OLU_QUIZ_INTRO, seed);
}

/**
 * Annonce du contrôle : « Avant de te laisser valider « X », deux questions seront posées… »
 * @param {string} label libellé de la ressource, guillemets compris
 * @param {string} asked énoncé du nombre de questions (« une question sera posée »)
 * @param {string} [seed]
 * @returns {string}
 */
export function oluGatingIntroSentence(label, asked, seed = '') {
  const build = pickOluLine(OLU_GATING_INTRO, seed);
  return typeof build === 'function' ? build(label, asked) : '';
}

/**
 * Progression dans la série après une bonne réponse.
 * @param {{ done: number, asked: number, left: number, label: string, seed?: string }} params
 * @returns {string}
 */
export function oluSeriesProgressSentence({ done, asked, left, label, seed = '' }) {
  const build = pickOluLine(OLU_SERIES_PROGRESS, seed);
  if (typeof build !== 'function') return '';
  return build(done, asked, left, label, left > 1 ? 's' : '');
}

/**
 * Contrôle satisfait.
 * @param {string} label
 * @param {string} [seed]
 * @returns {string}
 */
export function oluControlPassedSentence(label, seed = '') {
  const build = pickOluLine(OLU_CONTROL_PASSED, seed);
  return typeof build === 'function' ? build(label) : '';
}

/**
 * Série entièrement réussie (le contrôle, lui, n'est pas terminé).
 * @param {string} [seed]
 * @returns {string}
 */
export function oluSeriesDoneOpener(seed = '') {
  return pickOluLine(OLU_SERIES_DONE, seed);
}

/**
 * Pointe d'OLU pour un accusé, selon la nature de la ressource.
 * @param {'glossary'|'species'|'tutorial'|'observation'} kind
 * @param {string} [seed]
 * @returns {string} `''` si la nature est inconnue — l'appelant n'affiche alors rien de plus
 */
export function oluAcknowledgeAside(kind, seed = '') {
  return pickOluLine(OLU_ACK_ASIDES[String(kind)] || [], seed);
}

/**
 * Nature de ressource → pool de pointes, pour les deux produits.
 *
 * ForetMap parle de `plant` là où G&L parle de `species`, et les deux désignent une fiche
 * d'être vivant — mais pas le même geste : côté ForetMap, l'élève déclare une observation
 * réelle sur le terrain, côté G&L il déclare avoir étudié la fiche. Deux gestes, deux pools.
 *
 * @param {string|null|undefined} resourceType type de ressource du conditionnement
 * @returns {string} clé de pool, ou `''` si aucune pointe ne convient (feuillet, lore…)
 */
export function oluAsideKindForResource(resourceType) {
  switch (String(resourceType || '')) {
    case 'plant':
      return 'observation';
    case 'species':
      return 'species';
    case 'glossary':
      return 'glossary';
    case 'tutorial':
      return 'tutorial';
    default:
      return '';
  }
}

/** Majuscule initiale — pour les phrases qui commencent par le libellé de la ressource. */
function capitalize(text) {
  const value = String(text ?? '');
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
