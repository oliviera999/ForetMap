'use strict';

/**
 * Garde des textes visiteurs : **aucun texte affiché aux visiteurs n'invite à cueillir,
 * goûter ou manipuler un être vivant** (règle permanente du projet ; audit du 25/09/2026,
 * § 1.4.8).
 *
 * Pur, sans I/O : sert le test de contenu (`tests/content/visitor-texts.test.js`) et le script
 * d'audit de la base de production. Les motifs visent l'**incitation** (impératif, tournure
 * modale, « à goûter », « se mange ») ; trois familles d'exceptions évitent les faux
 * positifs mesurés sur le corpus :
 *   - négation dans la phrase (« ne pas toucher », « sans cueillir ») ;
 *   - geste d'écran (« touche une zone pour ouvrir sa fiche ») ;
 *   - troisième personne (« l'oiseau mange »).
 *
 * Classes rendues :
 *   - `incitation` : à corriger ;
 *   - `zone-grise:manipulation-decrite` : manipulation décrite sans être demandée
 *     (« odorante quand on la froisse ») ;
 *   - `zone-grise:information-consommation` : information de consommation (« se mange cuit ») ;
 *   - `faux-positif:*` : ignorées.
 */

const INF =
  '(?:cueillir|go[uû]ter|manger|toucher|ramasser|arracher|croquer|m[aâ]cher|sucer|l[eé]cher|r[eé]colter|caresser|attraper|capturer|froisser|[eé]craser|casser|secouer|soulever|d[eé]guster|pr[eé]lever|prendre)';
// « mâche » est absent à dessein : c'est d'abord le nom d'une salade (« laitues et mâche »).
const IMP_SING =
  '(?:cueille|go[uû]te|mange|touche|ramasse|arrache|croque|suce|l[eè]che|r[eé]colte|caresse|attrape|capture|froisse|[eé]crase|casse|secoue|soul[eè]ve|d[eé]guste|pr[eé]l[eè]ve|prends)';
const IMP_PLUR =
  '(?:cueillez|go[uû]tez|mangez|touchez|ramassez|arrachez|croquez|m[aâ]chez|sucez|l[eé]chez|r[eé]coltez|caressez|attrapez|capturez|froissez|[eé]crasez|cassez|secouez|soulevez|d[eé]gustez|pr[eé]levez|prenez|cueillons|go[uû]tons|mangeons|touchons|ramassons|croquons|r[eé]coltons)';
const B = '(?<![\\p{L}])';
const E = '(?![\\p{L}])';

const RULES = Object.freeze([
  {
    id: 'modal+inf',
    re: new RegExp(
      `${B}(?:tu peux|vous pouvez|on peut|tu pourras|vous pourrez|n['’]h[eé]site(?:z)? pas [aà]|essaie(?:z)? de|essayez de|pense(?:z)? [aà]|va|allez|viens|venez|il faut|faut)\\s+(?:\\p{L}+\\s+){0,2}?${INF}${E}`,
      'giu',
    ),
  },
  {
    id: 'a+inf',
    re: new RegExp(
      `${B}(?:bon(?:ne)?s? )?[aà] (?:go[uû]ter|croquer|cueillir|r[eé]colter|manger|d[eé]guster|ramasser)${E}`,
      'giu',
    ),
  },
  {
    id: 'se-mange',
    re: new RegExp(
      `${B}(?:se (?:mange|d[eé]guste|croque|cueille|r[eé]colte)nt?|d[eé]licieu(?:x|se)s?|savoureu(?:x|se)s?|comestible,? (?:essaie|go[uû]te))${E}`,
      'giu',
    ),
  },
  {
    id: 'manip-implicite',
    re: new RegExp(
      `${B}(?:(?:quand|si|lorsqu['’]|lorsque)\\s*on\\s+(?:les?\\s+|la\\s+|l['’])?(?:froiss|frott|touch|[eé]cras|cueill|go[uû]t|croqu|m[aâ]ch|retourn|soul[eè]v)\\p{L}*|(?:froiss|frott|[eé]cras)ée?s?)${E}`,
      'giu',
    ),
  },
  { id: 'imp-pluriel', re: new RegExp(`${B}${IMP_PLUR}${E}`, 'giu') },
  {
    id: 'imp-sing-debut',
    re: new RegExp(
      `(?:^|[.!?:;•\\-–—\\n«"(]\\s*|,\\s*(?:puis|et)\\s+|\\bet\\s+)${IMP_SING}${E}`,
      'giu',
    ),
  },
]);

const NEGATION =
  /(ne\s+(?:\p{L}+\s+)?(?:pas|jamais|plus)|\bne pas\b|\bsans\b|\bjamais\b|\binterdit|\b[eé]vite|\bni\b|\bdéfense de|\bpas de\b|\bpas\s)/iu;
const SCREEN_GESTURE =
  /touch\p{L}*(?:-(?:les|la|le|l[àa]))?\s*(?:[«"]|(?:(?:un|une|le|la|les|l['’]|ce|cette|son|sa|ses|l['’]un[e]?\s+des)\s*)?(?:\p{L}+\s+)?(?:bouton|[eé]cran|carte|zone|rep[eè]re|esp[eè]ce|lieu|vignette|ic[oô]ne|onglet|point|pastille|nom|mascotte|fl[eè]che|photo|image|lien|fiche|case|menu|ligne|[eé]toile|bulle|pin|marqueur|plan|titre|terme|mot)|pour (?:zoomer|ouvrir|voir|lire|afficher|choisir|s[eé]lectionner|agrandir))/iu;
/** Déterminants et pronoms qui suivent un impératif adressé (« cueille les… », « touche-la »). */
const IMPERATIVE_OBJECT =
  /^\s*(?:-\s*(?:les?|la|l[àa]|en|y)\b|(?:les?|la|l['’]|un|une|des|du|de|d['’]|ce|cet|cette|ces|ta|ton|tes|sa|son|ses|votre|vos|leur|leurs|quelques|plusieurs|tout|toute|tous|toutes|doucement|délicatement)\b)/iu;
const THIRD_PERSON =
  /(?:\b(?:il|elle|on|qui|ils|elles|que|dont|le|la|les|l['’]\p{L}+|oiseau|animal|chenille|larve|insecte|h[eé]risson|[eé]cureuil|renard|fourmi|abeille|puceron|coccinelle|chat|chien|chèvre|poule|lapin|oiseaux|animaux)\s+(?:\p{L}+\s+){0,2}?)$/iu;

function classify(text, index, length, ruleId) {
  const before = text.slice(Math.max(0, index - 60), index);
  const sentenceStart = Math.max(
    before.lastIndexOf('.'),
    before.lastIndexOf('!'),
    before.lastIndexOf('?'),
    before.lastIndexOf('\n'),
  );
  const sentenceBefore = sentenceStart >= 0 ? before.slice(sentenceStart + 1) : before;
  if (NEGATION.test(sentenceBefore + text.slice(index, index + length + 25))) {
    return 'faux-positif:negation';
  }
  if (SCREEN_GESTURE.test(text.slice(index, index + length + 60))) {
    return 'faux-positif:geste-ecran';
  }
  if (ruleId === 'imp-sing-debut' && THIRD_PERSON.test(before)) return 'faux-positif:3e-personne';
  // Style télégraphique d'une fiche (« Mange pucerons et débris. ») : sujet sous-entendu,
  // l'espèce ; un impératif adressé au lecteur est suivi d'un déterminant ou d'un pronom.
  if (ruleId === 'imp-sing-debut' && !IMPERATIVE_OBJECT.test(text.slice(index + length))) {
    return 'faux-positif:style-telegraphique';
  }
  if (ruleId === 'manip-implicite') return 'zone-grise:manipulation-decrite';
  if (ruleId === 'se-mange') return 'zone-grise:information-consommation';
  if (ruleId === 'a+inf' && /r[eé]colter/i.test(text.slice(index, index + length))) {
    return 'zone-grise:information-consommation';
  }
  return 'incitation';
}

function severity(cls) {
  if (cls === 'incitation') return 2;
  return cls.startsWith('zone-grise') ? 1 : 0;
}

/**
 * @param {string} text texte brut ou HTML (les balises sont retirées)
 * @returns {Array<{ rule: string, match: string, cls: string, extract: string }>}
 */
function scanVisitorText(text) {
  if (!text || typeof text !== 'string') return [];
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  // Un même passage peut répondre à plusieurs règles : on garde la classe la plus grave
  // (« Écrase la feuille » est une incitation avant d'être une manipulation décrite).
  const bySpan = new Map();
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(plain))) {
      const extract = plain
        .slice(Math.max(0, m.index - 50), m.index + m[0].length + 50)
        .replace(/\s+/g, ' ')
        .trim();
      const key = `${extract}|${m[0].trim()}`;
      const hit = {
        rule: rule.id,
        match: m[0].trim(),
        cls: classify(plain, m.index, m[0].length, rule.id),
        extract,
      };
      const previous = bySpan.get(key);
      if (!previous || severity(hit.cls) > severity(previous.cls)) bySpan.set(key, hit);
      if (m[0].length === 0) rule.re.lastIndex += 1;
    }
  }
  return [...bySpan.values()];
}

/** Correspondances à corriger (incitations), sans les zones grises ni les faux positifs. */
function findVisitorTextIncitations(text) {
  return scanVisitorText(text).filter((hit) => hit.cls === 'incitation');
}

module.exports = { RULES, scanVisitorText, findVisitorTextIncitations };
