const express = require('express');
const crypto = require('node:crypto');
const { queryOne, withTransaction } = require('../../database');
const { deleteFile, writeBufferToDisk } = require('../../lib/uploads');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../audit');
const { emitTasksChanged } = require('../../lib/realtime');
const { ensurePrimaryRole, buildAuthzPayload, setPrimaryRole } = require('../../lib/rbac');
const { syncStudentRoleFromGroups, resolveDefaultRoleForStudent } = require('../../lib/groupRole');
const { syncTaskSpecies } = require('../../lib/speciesJunction');
// Helpers du cluster « tasks » mutualisés dans lib/tasks/taskQueries.js (aucun import circulaire).
const {
  parseOptionalAuth,
  validateTaskLocations,
  setTaskZones,
  setTaskMarkers,
  setTaskTutorials,
  setTaskReferents,
  syncLegacyLocationColumns,
  getTaskWithAssignments,
} = require('../../lib/tasks/taskQueries');
const {
  resolveTaskMapId,
  parseTaskDangerLevelFromClient,
  parseTaskDifficultyLevelFromClient,
  parseTaskImportanceLevelFromClient,
  decodeTaskImageBuffer,
  sanitizeRequiredStudents,
  normalizeIdArray,
} = require('../../lib/taskRouteHelpers');
const { isVisitorRole } = require('../../lib/taskAuthzHelpers');

const router = express.Router();

async function ensureStudentPermission({ studentId, permissionKey }) {
  await syncStudentRoleFromGroups(studentId);
  await ensurePrimaryRole('student', studentId, 'eleve_novice');
  let base = await buildAuthzPayload('student', studentId);
  if (!base) return { ok: false, error: 'Profil introuvable' };
  if (!base.permissions.includes(permissionKey)) {
    const resolved = await resolveDefaultRoleForStudent(studentId);
    if (resolved?.roleId && resolved.source === 'group') {
      await setPrimaryRole('student', studentId, resolved.roleId);
      base = await buildAuthzPayload('student', studentId);
      if (!base) return { ok: false, error: 'Profil introuvable' };
    }
  }
  if (base.permissions.includes(permissionKey)) return { ok: true };
  return { ok: false, error: 'Permission insuffisante' };
}

router.post(
  '/proposals',
  asyncHandler(async (req, res) => {
    const {
      title,
      description,
      zone_id,
      marker_id,
      zone_ids,
      marker_ids,
      map_id,
      start_date,
      due_date,
      required_students,
      firstName,
      lastName,
      studentId,
      danger_level,
      difficulty_level,
      importance_level,
      living_beings,
    } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Titre requis' });
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });
    if (!studentId) return res.status(400).json({ error: 'Identifiant n3beur requis' });

    const authProposal = await parseOptionalAuth(req);
    if (authProposal?.userType === 'student' && isVisitorRole(authProposal)) {
      return res.status(403).json({ error: 'Le profil visiteur ne permet pas cette action.' });
    }

    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [
      studentId,
    ]);
    if (!student) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    const permission = await ensureStudentPermission({
      studentId,
      permissionKey: 'tasks.propose',
    });
    if (!permission.ok) return res.status(403).json({ error: permission.error });

    let zIds = normalizeIdArray(zone_ids);
    let mIds = normalizeIdArray(marker_ids);
    if (!zIds.length && zone_id) zIds = [String(zone_id).trim()].filter(Boolean);
    if (!mIds.length && marker_id) mIds = [String(marker_id).trim()].filter(Boolean);

    const explicitMap = map_id !== undefined ? map_id : null;
    const loc = await validateTaskLocations(zIds, mIds, explicitMap);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const reqStudents = sanitizeRequiredStudents(required_students);
    const proposalDangerParsed = parseTaskDangerLevelFromClient(danger_level);
    if (proposalDangerParsed.error)
      return res.status(400).json({ error: proposalDangerParsed.error });
    const proposalDifficultyParsed = parseTaskDifficultyLevelFromClient(difficulty_level);
    if (proposalDifficultyParsed.error)
      return res.status(400).json({ error: proposalDifficultyParsed.error });
    const proposalImportanceParsed = parseTaskImportanceLevelFromClient(importance_level);
    if (proposalImportanceParsed.error)
      return res.status(400).json({ error: proposalImportanceParsed.error });

    let proposalDecodedImage = null;
    const bodyProposal = req.body || {};
    if (
      Object.prototype.hasOwnProperty.call(bodyProposal, 'imageData') &&
      bodyProposal.imageData != null &&
      String(bodyProposal.imageData).trim()
    ) {
      proposalDecodedImage = decodeTaskImageBuffer(bodyProposal.imageData);
      if (proposalDecodedImage.error)
        return res.status(400).json({ error: proposalDecodedImage.error });
    }

    const id = crypto.randomUUID();
    const proposer = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
    const baseDescription = description ? String(description).trim() : '';
    const finalDescription = [baseDescription, proposer ? `Proposition n3beur: ${proposer}` : '']
      .filter(Boolean)
      .join('\n\n');
    const proposalLivingNames = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'living_beings',
    )
      ? living_beings
      : undefined;
    // Écritures atomiques (même modèle que POST /api/tasks, audit §2.5) : INSERT tasks
    // + jointures + espèces + colonnes legacy + image dans UNE transaction.
    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO tasks (
      id, title, description, map_id, project_id, zone_id, marker_id,
      start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level, status, recurrence, created_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(title).trim(),
          finalDescription,
          loc.mapId,
          zIds[0] || null,
          mIds[0] || null,
          start_date || null,
          due_date || null,
          reqStudents,
          'single_done',
          proposalDangerParsed.level,
          proposalDifficultyParsed.level,
          proposalImportanceParsed.level,
          'proposed',
          null,
          new Date().toISOString(),
        ],
      );
      await setTaskZones(id, zIds, tx);
      await setTaskMarkers(id, mIds, tx);
      await setTaskTutorials(id, [], tx);
      await setTaskReferents(id, [], tx);
      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, 'living_beings') ||
        Object.prototype.hasOwnProperty.call(req.body || {}, 'species_ids')
      ) {
        await syncTaskSpecies(tx, id, req.body.species_ids, proposalLivingNames);
      }
      await syncLegacyLocationColumns(id, zIds, mIds, tx);
      if (proposalDecodedImage) {
        const rel = `tasks/${id}.${proposalDecodedImage.ext}`;
        try {
          writeBufferToDisk(rel, proposalDecodedImage.buffer);
          await tx.execute('UPDATE tasks SET image_path = ? WHERE id = ?', [rel, id]);
        } catch (imgErr) {
          try {
            deleteFile(rel);
          } catch (_) {
            /* ignore */
          }
          // Le rollback de la transaction supprime la tâche et ses jointures.
          throw imgErr;
        }
      }
    });
    const task = await getTaskWithAssignments(id);
    logAudit('propose_task', 'task', id, `${String(title).trim()} (${proposer})`, {
      req,
      actorUserType: 'student',
      actorUserId: studentId,
      payload: { proposer, student_id: studentId, required_students: reqStudents },
    });
    emitTasksChanged({ reason: 'propose_task', taskId: id, mapId: resolveTaskMapId(task) });
    res.status(201).json(task);
  }),
);

module.exports = router;
