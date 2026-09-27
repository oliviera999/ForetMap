'use strict';

/**
 * Observations — ce que les observations font de leurs lignes et de leurs fichiers quand un
 * compte ou un groupe disparaît (registre `lib/accounts/cleanerRegistry.js`).
 *
 * - Ancien carnet `observation_logs` (retrait en trois temps, audit du 25/09/2026, § 3.5) :
 *   plus aucune écriture. `student_id` est une clé étrangère en cascade, et le détachement du
 *   groupe est fait par la clé étrangère `fk_observation_logs_group` (ON DELETE SET NULL) :
 *   l'`UPDATE … SET group_id = NULL` d'avant était redondant, il est retiré (temps 2).
 * - Observations d'espèces (`species_observations`, migration 307) : les lignes partent en
 *   cascade avec le compte, mais pas les **fichiers** photo. Leurs chemins sont relevés dans la
 *   transaction, puis les fichiers supprimés après validation (jamais avant : un retour
 *   arrière de la transaction laisserait des lignes sans fichier).
 */

const { deleteFile } = require('../uploads');

module.exports = {
  domain: 'Observations',
  product: 'foret',
  studentDelete: {
    order: 50,
    async run(tx, student) {
      // `require` paresseux : le service d'observation charge le dépôt et la base.
      const { collectObserverPhotoPaths } = require('../terrain/observationService');
      const paths = await collectObserverPhotoPaths(student.id, { dbx: tx });
      return { speciesObservationPhotoPaths: paths };
    },
  },
  afterStudentDelete: {
    order: 50,
    async run(_summary, contributions = {}) {
      for (const relativePath of contributions.speciesObservationPhotoPaths || []) {
        deleteFile(relativePath);
      }
    },
  },
};
