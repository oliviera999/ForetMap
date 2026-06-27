'use strict';

/**
 * Dérive la variante « fiche éditeur » d'un upsert de questions QCM à partir de l'upsert d'import.
 *
 * L'upsert d'import conserve l'ancien feedback quand la valeur entrante est vide
 * (`feedback_x = COALESCE(NULLIF(VALUES(feedback_x), ''), feedback_x)`) : c'est volontaire pour un
 * import XLSX partiel (une cellule vide ne doit pas écraser un feedback existant). Mais pour
 * l'édition unitaire d'une fiche complète (PUT/POST formulaire admin), vider un champ feedback DOIT
 * être persisté (mis à NULL). On remplace donc la clause par `feedback_x = VALUES(feedback_x)`.
 *
 * @param {string} importUpsertSql — la requête upsert d'import (clauses feedback en COALESCE/NULLIF)
 * @returns {string} la requête upsert « formulaire » (feedback effaçable)
 */
function toFormFeedbackUpsertSql(importUpsertSql) {
  return String(importUpsertSql).replace(
    /feedback_(correct|a|b|c|d|e) = COALESCE\(NULLIF\(VALUES\(feedback_\1\), ''\), feedback_\1\)/g,
    'feedback_$1 = VALUES(feedback_$1)',
  );
}

module.exports = { toFormFeedbackUpsertSql };
