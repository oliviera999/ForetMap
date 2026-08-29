'use strict';

// Vérifie que les tutoriels liés à une tâche ont été lus avant statut « done ».

const { getSettingValue } = require('./settings');
const gatingCore = require('./shared/gatingSettingsCore');

async function isRequireLinkedTutorialsEnabled() {
  const def = gatingCore.GATING_SETTING_DEFS.requireLinkedTutorialsBeforeTaskDone;
  if (!def?.fmKey) return false;
  const raw = await getSettingValue(def.fmKey, def.default);
  return raw === true || raw === 1 || raw === '1' || raw === 'true';
}

/**
 * Tutoriels liés non encore lus par l'élève.
 * @returns {Promise<{ ok: true } | { ok: false, missing: Array<{ id, title }> }>}
 */
async function assertLinkedTutorialsRead(db, { taskId, userId } = {}) {
  const tid = taskId != null ? String(taskId).trim() : '';
  const uid = userId != null ? String(userId) : '';
  if (!tid || !uid) {
    return { ok: true };
  }

  if (!(await isRequireLinkedTutorialsEnabled())) {
    return { ok: true };
  }

  const rows = await db.queryAll(
    `SELECT t.id, t.title
       FROM task_tutorials tt
       INNER JOIN tutorials t ON t.id = tt.tutorial_id AND t.is_active = 1
      WHERE tt.task_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM user_tutorial_reads utr
           WHERE utr.tutorial_id = t.id AND utr.user_id = ?
        )
      ORDER BY t.sort_order ASC, t.title ASC`,
    [tid, uid],
  );

  if (!rows.length) return { ok: true };
  return {
    ok: false,
    missing: rows.map((r) => ({ id: r.id, title: r.title })),
  };
}

module.exports = {
  isRequireLinkedTutorialsEnabled,
  assertLinkedTutorialsRead,
};
