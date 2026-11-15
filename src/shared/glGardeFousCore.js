/**
 * Garde-fous de « Tenir à deux » — **source unique** de la liste des chaînes jamais visibles
 * d'un élève (règles de référence § 1). Noyau partagé serveur / client, miroir CJS
 * `lib/shared/glGardeFousCore.js` régénéré par `npm run sync:shared-cores`.
 *
 * Lisent ce noyau : l'import des catalogues (`lib/glTenirImport.js`), le banc de simulation
 * (`tools/gl-sim/client.js`, option `--mots-interdits`), les tests de contenu
 * (`tests/content/gl-tenir-*.test.js`) et le test de rendu
 * (`tests-ui/gl/tenir-chaines-interdites.test.jsx`). Changer la liste ici la change partout.
 *
 * Deux familles :
 * - insensibles à la casse : le Souffle n'est jamais personnifié (`monstre`, `ennemi`,
 *   `attaque`, `poursui…`), l'oiseau n'est jamais nommé (`corbeau`), l'erreur ne punit jamais
 *   (`faux`, `raté`, `perdu`), aucun `classement` ;
 * - sensibles à la casse : `Krâ`, `Kraa` (noms propres) et `Grise` (nom propre du Souffle ;
 *   l'adjectif « grise » reste permis : « une bande grise »).
 *
 * Une chaîne ne compte qu'en **début de mot** (« défaut » ne contient pas « faux », « poursuite »
 * commence par « poursui »).
 */

/** Chaînes interdites, insensibles à la casse (préfixes de mot). */
export const FORBIDDEN_WORDS_CI = Object.freeze([
  'monstre',
  'ennemi',
  'attaque',
  'poursui',
  'corbeau',
  'faux',
  'raté',
  'ratée',
  'perdu',
  'classement',
]);

/** Chaînes interdites, sensibles à la casse (noms propres). */
export const FORBIDDEN_WORDS_CS = Object.freeze(['Krâ', 'Kraa', 'Grise']);

/**
 * Exceptions connues : ce que la liste ne vise pas. Chaque chargeur choisit les champs qu'il
 * contrôle (`checkVisible` de `lib/glTenirImport.js`) ; ce relevé nomme ceux qui ne sont jamais
 * servis à un élève, pour qu'un nouveau contrôle ne les refuse pas à tort.
 */
export const GARDE_FOUS_EXCEPTIONS = Object.freeze({
  /** Identifiants techniques tolérés dans le code, les clés de payload et les attributs. */
  identifiantsTechniques: Object.freeze(['kraa']),
  /**
   * Champs jamais montrés à un élève : titre privé d'une zone de chasse, justification et
   * avertissement d'une page du Passeur. (Le `critere` d'un badge, lui, est visible.)
   */
  champsReservesProf: Object.freeze(['titre_prive', 'justification', 'avertissement']),
  /** Mots permis malgré « l'erreur ne punit jamais » : « l'erreur du jour d'Olu » existe. */
  motsPermis: Object.freeze(['erreur']),
});

function escapeRegExp(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FORBIDDEN_CI_RE = new RegExp(
  `(^|[^\\p{L}])(${FORBIDDEN_WORDS_CI.map(escapeRegExp).join('|')})`,
  'iu',
);
const FORBIDDEN_CS_RE = new RegExp(
  `(^|[^\\p{L}])(${FORBIDDEN_WORDS_CS.map(escapeRegExp).join('|')})`,
  'u',
);

/** Première chaîne interdite trouvée dans `text`, ou `null`. */
export function findForbiddenString(text) {
  const s = String(text ?? '');
  if (!s) return null;
  const ci = FORBIDDEN_CI_RE.exec(s);
  if (ci) return ci[2];
  const cs = FORBIDDEN_CS_RE.exec(s);
  if (cs) return cs[2];
  return null;
}

/** Vrai si le champ nommé est réservé au prof (jamais servi à un élève) : hors contrôle. */
export function isChampReserveProf(field) {
  return GARDE_FOUS_EXCEPTIONS.champsReservesProf.includes(String(field ?? ''));
}
