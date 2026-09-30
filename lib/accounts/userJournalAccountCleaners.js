'use strict';

/**
 * Carnet personnel — ce que le carnet unifié (`lib/fmUserJournal.js`) fait de ses **fichiers**
 * quand un compte élève disparaît (registre `lib/accounts/cleanerRegistry.js`).
 *
 * Les lignes (`user_journal_articles`, `user_journal_article_assets`, `user_journal_imports`)
 * partent en cascade avec le compte ; les fichiers sous `uploads/user-journal/<id>/`, eux,
 * restaient sur le disque (RG3 de `docs/AUDIT_SECURITE_RGPD_2026-09-30.md`). Leurs chemins
 * sont relevés dans la transaction, puis supprimés — avec le dossier du compte — après
 * validation (jamais avant : un retour arrière laisserait des articles sans leurs images).
 */

const { deleteFile, deleteDirectory } = require('../uploads');

const USER_JOURNAL_PREFIX = 'user-journal';
/** Identifiant de compte utilisable comme segment de chemin (UUID, identifiant historique). */
const SAFE_ACCOUNT_SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Dossier du carnet d'un compte sous `uploads/`, ou `null` si l'identifiant est douteux. */
function userJournalDirectory(userId) {
  const id = String(userId == null ? '' : userId).trim();
  if (!SAFE_ACCOUNT_SEGMENT_RE.test(id)) return null;
  return `${USER_JOURNAL_PREFIX}/${id}`;
}

module.exports = {
  domain: 'Carnet personnel',
  product: 'foret',
  studentDelete: {
    order: 60,
    async run(tx, student) {
      const rows = await tx.queryAll(
        'SELECT asset_path FROM user_journal_article_assets WHERE user_id = ? AND asset_path IS NOT NULL',
        [student.id],
      );
      return {
        userJournalAssetPaths: (rows || []).map((r) => String(r.asset_path)).filter(Boolean),
        userJournalDirectory: userJournalDirectory(student.id),
      };
    },
  },
  afterStudentDelete: {
    order: 60,
    async run(summary, contributions = {}) {
      if (!summary?.ok) return;
      for (const relativePath of contributions.userJournalAssetPaths || []) {
        deleteFile(relativePath);
      }
      if (contributions.userJournalDirectory) deleteDirectory(contributions.userJournalDirectory);
    },
  },
  userJournalDirectory,
};
