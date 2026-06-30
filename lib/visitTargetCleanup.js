'use strict';

const { queryAll: defaultQueryAll, execute: defaultExecute } = require('../database');
const { deleteFile: defaultDeleteFile } = require('./uploads');

// Table de la couche « visite » par type de cible. Liste fermée (jamais d'entrée
// utilisateur) : sûr à interpoler comme identifiant SQL (un identifiant ne peut
// pas être paramétré par `?`).
const VISIT_TARGET_TABLE = Object.freeze({ zone: 'visit_zones', marker: 'visit_markers' });

/**
 * Supprime intégralement la couche « visite » rattachée à une cible carte
 * (zone ou repère) partageant le même `id` : ligne `visit_zones` / `visit_markers`,
 * médias `visit_media` (fichiers disque + lignes) et progression vue
 * (`visit_seen_students`, `visit_seen_anonymous`).
 *
 * Appelé lors de la suppression d'une zone / d'un repère côté **carte** pour que
 * l'onglet Visite ne conserve pas de cible « fantôme » obsolète, et réutilisé par
 * les suppressions côté visite (source unique, DRY). La suppression de fichiers est
 * « best-effort » : un fichier déjà absent n'interrompt pas le nettoyage SQL.
 *
 * @param {'zone'|'marker'} targetType
 * @param {string|number} targetId
 * @param {{ execute?: Function, queryAll?: Function, deleteFile?: Function }} [deps]
 *   Injection de dépendances (tests sans BDD). Par défaut : helpers `database` / `uploads`.
 * @returns {Promise<boolean>} `false` si `targetType` inconnu (no-op), `true` sinon.
 */
async function deleteVisitTargetCascade(targetType, targetId, deps = {}) {
  const table = VISIT_TARGET_TABLE[targetType];
  if (!table) return false;
  const execute = deps.execute || defaultExecute;
  const queryAll = deps.queryAll || defaultQueryAll;
  const deleteFile = deps.deleteFile || defaultDeleteFile;
  const id = String(targetId);

  const mediaRows = await queryAll(
    'SELECT image_path FROM visit_media WHERE target_type = ? AND target_id = ?',
    [targetType, id],
  );
  for (const row of mediaRows || []) {
    if (row && row.image_path) {
      try {
        deleteFile(row.image_path);
      } catch (_) {
        /* fichier déjà absent : on poursuit le nettoyage SQL */
      }
    }
  }

  await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  await execute('DELETE FROM visit_media WHERE target_type = ? AND target_id = ?', [
    targetType,
    id,
  ]);
  await execute('DELETE FROM visit_seen_students WHERE target_type = ? AND target_id = ?', [
    targetType,
    id,
  ]);
  await execute('DELETE FROM visit_seen_anonymous WHERE target_type = ? AND target_id = ?', [
    targetType,
    id,
  ]);
  return true;
}

module.exports = { deleteVisitTargetCascade, VISIT_TARGET_TABLE };
