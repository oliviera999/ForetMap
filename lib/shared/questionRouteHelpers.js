'use strict';

// Noyau partagé ForetMap / GL : utilitaires des routes de questions.
//
// **Périmètre volontairement minuscule, et c'est le résultat de l'analyse.**
// L'audit (`docs/PARTAGE_FM_GL.md` §4.1) relevait 109 lignes communes entre
// `routes/quiz.js` et `routes/gl/qcm.js`. Leur examen ligne à ligne montre
// qu'elles sont très majoritairement **légitimes** :
//
//   - plomberie Express et réponses d'erreur (~30 lignes) ;
//   - imports de noyaux **déjà** partagés (`questionCrudCore`,
//     `questionQueryFactory`, `glGlossaryMatch`) — preuve que la mutualisation
//     a déjà eu lieu (~12 lignes) ;
//   - listes de noms de champs (~10 lignes) : de la donnée, pas de la logique.
//
// Ne subsistait qu'une poignée de lignes réellement factorisables, dont ce
// module ne retient que le **duplicata exact et sans machinerie**.
//
// Écartés délibérément :
//   - les agrégats statistiques admin : requêtes différentes par table **et**
//     par colonnes ; les paramétrer produirait une fabrique de SQL ;
//   - l'enrobage « glossaire » (`loadGlossaryLookup` / `enrichQuestionWithGlossary`) :
//     seulement deux appelants identiques, et un troisième variant
//     (`routes/gl/games/markers.js`) qui branche sur les questions lore avec un
//     autre index. L'y faire entrer supposerait un drapeau par produit — signal
//     que les cas ne sont pas le même problème (cf. §8 du plan).

/**
 * Normalise un code de question issu d'une URL ou d'un corps de requête.
 * Duplicata strictement identique entre `routes/quiz.js` et `routes/gl/qcm.js`.
 *
 * @param {*} value
 * @returns {string|null} code en majuscules sans espaces, ou `null` s'il est vide
 */
function normalizeQuestionCode(value) {
  const s = String(value || '')
    .trim()
    .toUpperCase();
  return s.length > 0 ? s : null;
}

module.exports = { normalizeQuestionCode };
