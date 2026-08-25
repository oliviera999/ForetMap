'use strict';

// =====================================================================
// Appariement CONTENU question <-> CONTENU tutoriel (ForetMap).
//
// Complement du moteur `resourceQuestionMatch`, qui cherche le LIBELLE d'une
// ressource a l'interieur de l'enonce. Cette direction marche pour un terme de
// glossaire ou un nom d'espece — des libelles courts et specifiques — mais rate
// l'essentiel pour un tutoriel, dont le seul libelle est le titre : « Le
// compostage » n'apparait pas dans « Que met-on dans le compost ? ».
//
// Ici on compare les deux CONTENUS : le corps du tutoriel (titre, resume, texte)
// contre l'enonce de la question (et ses champs annexes). Un terme partage pese
// d'autant plus qu'il est RARE dans le corpus des tutoriels (ponderation IDF) :
// « compost » ne se trouve que dans une fiche et vaut cher ; « jardin » est
// partout et ne discrimine rien. Le score est ramene entre 0 et 1.
//
// 100 % pur : aucun acces BDD, aucun etat. Les lectures et ecritures sont dans
// routes/learning-links.js et scripts/suggest-learning-links.js.
// =====================================================================

const { STOPWORDS, normalizeText, tokenize } = require('./resourceQuestionMatch');

/**
 * Mots-outils supplementaires propres a la redaction pedagogique. Ils traversent
 * enonces et fiches sans rien distinguer ; les garder ferait matcher n'importe
 * quelle question avec n'importe quel tutoriel.
 */
const EXTRA_STOPWORDS = new Set([
  'quel',
  'quelle',
  'quels',
  'quelles',
  'comment',
  'pourquoi',
  'combien',
  'lequel',
  'laquelle',
  'parmi',
  'suivantes',
  'suivants',
  'suivante',
  'suivant',
  'proposition',
  'propositions',
  'reponse',
  'reponses',
  'question',
  'questions',
  'exemple',
  'exemples',
  'plus',
  'moins',
  'tres',
  'bien',
  'faut',
  'peut',
  'doit',
  'etre',
  'avoir',
  'fait',
  'faire',
  'aussi',
  'donc',
  'alors',
  'quand',
  'chaque',
  'tout',
  'tous',
  'toute',
  'toutes',
  'autre',
  'autres',
  'meme',
  'memes',
  'entre',
  'apres',
  'avant',
  'pendant',
  'vrai',
  'faux',
  'oui',
  'non',
  'cas',
  'part',
  'fois',
  'type',
  'types',
  'sorte',
  'sortes',
  'permet',
  'permettent',
  'utilise',
  'utiliser',
  'trouve',
  'trouver',
  'appelle',
  'appelle',
  'nomme',
  'dit',
  'dire',
  'sert',
  'servir',
  'tutoriel',
  'tutoriels',
  'fiche',
  'fiches',
  // Releves sur le corpus reel : ils polluaient les justifications sans rien designer.
  'agit',
  'exact',
  'exactement',
  'certain',
  'certains',
  'certaine',
  'certaines',
  'passe',
  'lieu',
  'maniere',
  'facon',
  'general',
  'souvent',
  'jamais',
  'toujours',
  'surtout',
  'notamment',
  'egalement',
  'ensuite',
  'enfin',
  'ainsi',
  'role',
]);

/**
 * Suffixes derivationnels francais, du plus long au plus court. Les formes de
 * PLURIEL n'y figurent pas : elles sont retirees avant, sans quoi le radical
 * differerait entre singulier et pluriel d'un meme mot (« elements » aurait donne
 * « element », et « element » aurait donne « elem » — ils ne se seraient jamais
 * rejoints).
 */
const SUFFIXES = [
  'issement',
  'ation',
  'ement',
  'ateur',
  'trice',
  'euse',
  'ance',
  'ence',
  'iere',
  'ière',
  'age',
  'ion',
  'que',
  'eur',
  'ive',
  'ant',
  'ent',
  'ee',
  'er',
  'ir',
  'if',
  'al',
  'e',
];

/** Longueur minimale d'un radical : en deca, la troncature cree des collisions. */
const MIN_STEM_CHARS = 4;
/** Un terme plus court que ceci n'est pas assez porteur pour servir d'indice. */
const MIN_TERM_CHARS = 4;
/** Nombre minimal de termes partages : un seul mot commun est trop souvent fortuit. */
const MIN_SHARED_TERMS = 2;
/** Plafond de confiance : un rapprochement textuel n'est jamais une certitude. */
const MAX_CONFIDENCE = 0.95;
/** Le corps d'un tutoriel peut peser des centaines de Ko : on borne la lecture. */
const MAX_BODY_CHARS = 200000;

/** Poids par champ : un mot du titre en dit plus qu'un mot noye dans le corps. */
const FIELD_WEIGHTS = Object.freeze({ title: 3, summary: 2, body: 1 });

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Retire une marque de pluriel. Fait AVANT la derivation, pour que « composts »,
 * « compostages » et « compostage » convergent vers le meme radical.
 */
function depluralize(word) {
  const w = String(word || '');
  if (w.length - 3 >= MIN_STEM_CHARS && w.endsWith('aux')) return `${w.slice(0, -3)}al`;
  if (w.length - 1 >= MIN_STEM_CHARS && w.endsWith('s') && !w.endsWith('ss')) {
    return w.slice(0, -1);
  }
  return w;
}

/**
 * Radical grossier d'un mot francais : pluriel retire, puis un suffixe
 * derivationnel courant. Volontairement conservateur — un seul suffixe, radical
 * d'au moins 4 caracteres — c'est ce qui rapproche « compost » de « compostage »
 * ou « arroser » de « arrosage » sans raboter « hiver » en « hiv ».
 */
function stem(word) {
  const base = depluralize(String(word || ''));
  if (base.length <= MIN_STEM_CHARS) return base;
  for (const suffix of SUFFIXES) {
    if (base.length - suffix.length >= MIN_STEM_CHARS && base.endsWith(suffix)) {
      return base.slice(0, base.length - suffix.length);
    }
  }
  return base;
}

/** Le terme est-il porteur de sens (hors mots-outils, assez long) ? */
function isMeaningfulToken(token) {
  if (!token || token.length < MIN_TERM_CHARS) return false;
  if (STOPWORDS.has(token) || EXTRA_STOPWORDS.has(token)) return false;
  return !/^\d+$/.test(token); // un nombre nu ne rattache rien
}

/** Texte brut d'un fragment HTML : balises, scripts et entites retires. */
function stripHtml(html) {
  return String(html == null ? '' : html)
    .slice(0, MAX_BODY_CHARS)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Radicaux porteurs de sens d'un texte, dedupliques. */
function extractTerms(text) {
  const out = new Set();
  for (const token of tokenize(text)) {
    if (!isMeaningfulToken(token)) continue;
    const s = stem(token);
    if (s.length >= MIN_STEM_CHARS) out.add(s);
  }
  return out;
}

/**
 * Document d'un tutoriel : pour chaque radical, le poids du champ le plus fort
 * ou il apparait. Le corps HTML est nettoye ; les tutoriels de type lien ou PDF
 * n'ont que titre et resume, ce qui reste exploitable mais moins riche.
 * @param {{id:*, title?:string, summary?:string, html_content?:string}} row
 */
function buildTutorialDocument(row) {
  const weights = new Map();
  const add = (text, weight) => {
    for (const term of extractTerms(text)) {
      if ((weights.get(term) || 0) < weight) weights.set(term, weight);
    }
  };
  add(row?.title, FIELD_WEIGHTS.title);
  add(row?.summary, FIELD_WEIGHTS.summary);
  add(stripHtml(row?.html_content), FIELD_WEIGHTS.body);
  return {
    ref: String(row?.id ?? ''),
    title: String(row?.title || ''),
    weights,
    titleTerms: extractTerms(row?.title),
  };
}

/** Texte agrege d'une question : enonce, reponse redigee, tags, explication. */
function buildQuestionTerms(question) {
  return extractTerms(
    [question?.text, question?.reponse_texte, question?.tags, question?.feedback_correct]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Poids IDF de chaque radical sur le corpus des tutoriels : un terme present
 * partout ne distingue rien, un terme rare identifie sa fiche.
 * @param {Array<{weights: Map<string, number>}>} documents
 * @returns {Map<string, number>}
 */
function computeIdf(documents) {
  const docs = Array.isArray(documents) ? documents : [];
  const total = docs.length;
  const df = new Map();
  for (const doc of docs) {
    for (const term of doc.weights.keys()) df.set(term, (df.get(term) || 0) + 1);
  }
  const idf = new Map();
  for (const [term, count] of df) {
    // ln((N+1)/df) : un terme present dans TOUS les tutoriels tombe pres de zero
    // (il ne designe aucune fiche), un terme present dans une seule culmine. Le
    // lissage au numerateur evite le zero absolu, qui ferait disparaitre le terme
    // du calcul meme comme simple appui.
    idf.set(term, Math.log((total + 1) / count));
  }
  return idf;
}

/**
 * Bonus de confiance quand les termes partages figurent dans le TITRE du
 * tutoriel — signe que la fiche porte bien sur le sujet de la question, et pas
 * qu'elle l'evoque en passant.
 */
const TITLE_BONUS_PER_TERM = 0.05;
const TITLE_BONUS_MAX = 0.15;

/**
 * Demi-saturation de la masse IDF partagee. La couverture seule est RELATIVE :
 * une question pauvre en vocabulaire (« Quelle espece reconnais-tu sur cette
 * photo ? ») n'a que des termes passe-partout, et le premier tutoriel qui les
 * contient tous decroche 1 — constate sur le corpus reel, ou dix questions-photo
 * arrivaient en tete. Il faut donc aussi une preuve ABSOLUE : la masse des
 * termes partages, saturee, qui reste faible quand ils sont communs.
 */
const EVIDENCE_HALF_MASS = 2.5;

/**
 * Plafond de confiance selon le NOMBRE de termes partages. La couverture seule
 * sature : deux termes rares suffisent a la porter a 1 si ce sont les seuls
 * termes de la question presents dans le corpus. Or deux mots communs restent
 * une preuve mince. Le plafond monte avec le volume d'indices — quatre termes
 * partages ou plus autorisent la confiance maximale.
 */
function evidenceCeiling(sharedCount) {
  return Math.min(MAX_CONFIDENCE, 0.35 + 0.15 * sharedCount);
}

/**
 * Score d'un couple question / tutoriel, entre 0 et 1.
 *
 * Le coeur du score est une COUVERTURE : quelle part de la masse IDF du
 * vocabulaire de la question ce tutoriel reprend-il. Une question dont tous les
 * termes porteurs se retrouvent dans la fiche vaut 1, qu'ils soient dans le
 * titre ou au fin fond du corps — le champ n'est qu'un bonus, jamais un
 * diviseur : penaliser le corps plafonnerait a 1/3 une correspondance parfaite.
 *
 * Les termes de la question absents de TOUT le corpus sont hors calcul : ils ne
 * departagent aucun tutoriel et ecraseraient le denominateur.
 *
 * Renvoie aussi les termes retenus, qui justifient la suggestion au professeur.
 */
function scorePair(questionTerms, doc, idf) {
  let matchedMass = 0;
  let totalMass = 0;
  let titleHits = 0;
  const shared = [];
  for (const term of questionTerms) {
    const weight = idf.get(term);
    if (weight == null) continue;
    totalMass += weight;
    const field = doc.weights.get(term);
    if (field == null) continue;
    matchedMass += weight;
    if (doc.titleTerms.has(term)) titleHits += 1;
    shared.push({ term, idf: weight, field });
  }
  if (totalMass <= 0 || shared.length < MIN_SHARED_TERMS) {
    return { score: 0, shared: [] };
  }
  const coverage = matchedMass / totalMass;
  const evidence = matchedMass / (matchedMass + EVIDENCE_HALF_MASS);
  const bonus = Math.min(TITLE_BONUS_MAX, titleHits * TITLE_BONUS_PER_TERM);
  shared.sort((a, b) => b.idf - a.idf || a.term.localeCompare(b.term));
  return {
    score: round3(Math.min(evidenceCeiling(shared.length), coverage * evidence + bonus)),
    shared,
  };
}

/** Raison lisible : les radicaux les plus discriminants ayant motive le lien. */
function buildReason(shared, maxTerms = 4) {
  const terms = shared.slice(0, maxTerms).map((s) => s.term);
  return `contenu: ${terms.join(', ')}`.slice(0, 255);
}

/**
 * Propose des liens tutoriel <-> question a partir des deux contenus.
 *
 * @param {object} params
 * @param {Array<{code:string, text?:string, tags?:string, reponse_texte?:string, feedback_correct?:string}>} params.questions
 * @param {Array<{id:*, title?:string, summary?:string, html_content?:string}>} params.tutorials
 * @param {Set<string>} [params.existing] cles `tutorial|<ref>|<code>` deja liees (tous statuts)
 * @param {number} [params.minConfidence] seuil de retenue (defaut 0.35)
 * @param {number} [params.maxPerQuestion] plafond de suggestions par question (defaut 3)
 * @returns {Array<object>} liens candidats, tries par confiance decroissante
 */
function suggestTutorialLinks({
  questions,
  tutorials,
  existing = new Set(),
  minConfidence = 0.5,
  maxPerQuestion = 3,
} = {}) {
  const documents = (Array.isArray(tutorials) ? tutorials : [])
    .map(buildTutorialDocument)
    .filter((doc) => doc.ref && doc.weights.size > 0);
  if (!documents.length) return [];

  const idf = computeIdf(documents);
  const out = [];

  for (const question of Array.isArray(questions) ? questions : []) {
    if (!question || !question.code) continue;
    const terms = buildQuestionTerms(question);
    if (terms.size < MIN_SHARED_TERMS) continue;

    const ranked = [];
    for (const doc of documents) {
      if (existing.has(`tutorial|${doc.ref}|${question.code}`)) continue;
      const { score, shared } = scorePair(terms, doc, idf);
      if (score < minConfidence) continue;
      ranked.push({ doc, score, shared });
    }
    ranked.sort((a, b) => b.score - a.score || a.doc.ref.localeCompare(b.doc.ref));

    for (const m of ranked.slice(0, Math.max(1, maxPerQuestion))) {
      out.push({
        resource_type: 'tutorial',
        resource_ref: m.doc.ref,
        question_code: String(question.code),
        confidence: m.score,
        origin: 'auto',
        status: 'suggested',
        reason: buildReason(m.shared),
        matched_terms: m.shared.map((s) => s.term),
        resource_label: m.doc.title,
      });
    }
  }

  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

module.exports = {
  EXTRA_STOPWORDS,
  EVIDENCE_HALF_MASS,
  evidenceCeiling,
  TITLE_BONUS_MAX,
  TITLE_BONUS_PER_TERM,
  depluralize,
  FIELD_WEIGHTS,
  MIN_SHARED_TERMS,
  MIN_STEM_CHARS,
  MIN_TERM_CHARS,
  MAX_CONFIDENCE,
  stem,
  isMeaningfulToken,
  stripHtml,
  extractTerms,
  buildTutorialDocument,
  buildQuestionTerms,
  computeIdf,
  scorePair,
  buildReason,
  suggestTutorialLinks,
  normalizeText,
};
