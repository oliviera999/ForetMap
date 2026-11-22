'use strict';

// Tables figées de liens question ↔ fiche / tutoriel, supprimées par la migration
// `retrait_t3_quiz_question_links` (retrait T3, audit du 25/09/2026, § 3.5).
//
// Les migrations plus anciennes qui les lisent ou les écrivent (`learning_links_single_source`,
// `contenus_terrain_2026_11_20`) tournent toujours sur une base fraîche, AVANT le retrait. Leurs
// tests de rejeu reconstituent ce contexte : ils recréent les deux tables (DDL de la migration
// `quiz`), rejouent la migration, puis les suppriment à nouveau pour rendre la base dans son état
// d'après le retrait. Usage réservé à ces tests : aucun code applicatif ne doit les lire.

const LEGACY_QUIZ_LINK_TABLES = Object.freeze(['quiz_question_species', 'quiz_question_tutorials']);

const DDL = [
  `CREATE TABLE IF NOT EXISTS quiz_question_tutorials (
     question_code varchar(16) NOT NULL, tutorial_id int(10) unsigned NOT NULL,
     PRIMARY KEY (question_code,tutorial_id), KEY idx_qqt_tuto (tutorial_id),
     CONSTRAINT fk_qqt_q FOREIGN KEY (question_code) REFERENCES quiz_questions (question_code) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT fk_qqt_t FOREIGN KEY (tutorial_id) REFERENCES tutorials (id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS quiz_question_species (
     question_code varchar(16) NOT NULL, plant_id int(10) unsigned NOT NULL,
     PRIMARY KEY (question_code,plant_id), KEY idx_qqs_plant (plant_id),
     CONSTRAINT fk_qqs_q FOREIGN KEY (question_code) REFERENCES quiz_questions (question_code) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT fk_qqs_p FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Recrée les deux tables figées (vides) le temps d'un rejeu de migration ancienne. */
async function recreateLegacyQuizLinkTables(execute) {
  for (const sql of DDL) await execute(sql);
}

/** Les supprime à nouveau : la base revient à son état d'après le retrait T3. */
async function dropLegacyQuizLinkTables(execute) {
  for (const table of LEGACY_QUIZ_LINK_TABLES) await execute(`DROP TABLE IF EXISTS ${table}`);
}

/** Tables figées encore présentes dans la base courante. */
async function presentLegacyQuizLinkTables(queryAll) {
  const rows = await queryAll(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name IN (?, ?)`,
    [...LEGACY_QUIZ_LINK_TABLES],
  );
  return rows.map((r) => r.t).sort();
}

module.exports = {
  LEGACY_QUIZ_LINK_TABLES,
  recreateLegacyQuizLinkTables,
  dropLegacyQuizLinkTables,
  presentLegacyQuizLinkTables,
};
