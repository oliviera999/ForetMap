'use strict';

/**
 * Remarques des fiches espèces — une seule zone de texte, `plants.remarks` (migration 305,
 * piste C de l'audit du 25/09/2026, § 1.3.6, § 2.3 et § 3.5), à la place des trois champs
 * `remark_1`, `remark_2`, `remark_3`.
 *
 * - **Reprise** (migration 305) : `remarks` = remarques non vides, dans l'ordre, séparées
 *   par une ligne vide. La ventilation éditoriale vers les sosies et les dangers reste un
 *   travail humain : rien n'est déplacé automatiquement.
 * - **Miroir (T2, retiré au T3)** — choix le plus sûr pour un retour arrière : si le texte
 *   saisi est la simple concaténation des trois anciens champs (fiche dont les remarques
 *   n'ont pas changé), ceux-ci restent INTACTS (découpage d'origine conservé) ; sinon
 *   `remark_1` reçoit le texte entier et `remark_2` / `remark_3` sont vidés. Ni perte (le
 *   texte complet est dans `remark_1`), ni doublon (les deux autres ne répètent rien).
 * - **Repli de lecture (T1, retiré au T3)** : `remarks` vide alors que les anciens champs
 *   ne le sont pas, ou texte différent de leur concaténation (écriture par une version
 *   antérieure du code, une migration de contenu ou un script) : la fiche lit les anciens
 *   champs.
 */

const { asTrimmedString } = require('../shared/stringHelpers');

const LEGACY_REMARK_FIELDS = Object.freeze(['remark_1', 'remark_2', 'remark_3']);
const REMARK_SEPARATOR = '\n\n';

function optionalText(value) {
  const s = asTrimmedString(value);
  return s ? s : null;
}

/** Concaténation des trois anciens champs (non vides, dans l'ordre), ou `null`. */
function legacyRemarksText(row) {
  const parts = LEGACY_REMARK_FIELDS.map((field) => optionalText(row?.[field])).filter(Boolean);
  return parts.length > 0 ? parts.join(REMARK_SEPARATOR) : null;
}

/** Clé de comparaison : espaces et retours à la ligne réduits. */
function remarksKey(value) {
  return asTrimmedString(value).replace(/\s+/g, ' ');
}

/**
 * Remarques effectives d'une fiche (lecture T1).
 * @returns {{ remarks: string|null, origin: 'table'|'colonnes' }} `table` = champ `remarks`
 */
function resolvePlantRemarks(row) {
  const remarks = optionalText(row?.remarks);
  const legacy = legacyRemarksText(row);
  if (remarksKey(remarks) === remarksKey(legacy)) return { remarks, origin: 'table' };
  return { remarks: legacy, origin: 'colonnes' };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

/**
 * Applique la règle des remarques au payload d'écriture d'une fiche (mutation), après la
 * fusion corps + valeurs existantes :
 * - le corps porte `remarks` (formulaire) : c'est la source ; miroir selon la règle
 *   ci-dessus ;
 * - le corps ne porte que des anciens champs (client historique, import) : `remarks` en
 *   est la concaténation ;
 * - ni l'un ni l'autre : rien ne change.
 */
function applyRemarksToPayload(body, payload) {
  if (hasOwn(body, 'remarks')) {
    const remarks = optionalText(body.remarks);
    payload.remarks = remarks;
    if (remarksKey(legacyRemarksText(payload)) !== remarksKey(remarks)) {
      payload.remark_1 = remarks;
      payload.remark_2 = null;
      payload.remark_3 = null;
    }
    return payload;
  }
  if (LEGACY_REMARK_FIELDS.some((field) => hasOwn(body, field))) {
    payload.remarks = legacyRemarksText(payload);
  }
  return payload;
}

module.exports = {
  LEGACY_REMARK_FIELDS,
  REMARK_SEPARATOR,
  legacyRemarksText,
  resolvePlantRemarks,
  applyRemarksToPayload,
};
