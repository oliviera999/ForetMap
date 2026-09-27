'use strict';

/**
 * Service « tâches » — règles métier de la **mise à jour d'une tâche** (piste B, étape B5 de
 * l'audit du 25/09/2026, `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md` § 3.3 ligne 6).
 *
 * Il décompose l'ancien handler `PUT /api/tasks/:id` (≈ 460 lignes, complexité ESLint 114) en
 * étapes nommées, **sans changer le comportement** : mêmes statuts, mêmes messages, même ordre
 * des contrôles, mêmes effets de bord (tests : `tests/tasks-put-characterization.test.js`).
 *
 *   1. tâche modifiable (404, 409)            5. champs scalaires (statut, mode, niveaux, dates)
 *   2. qui modifie ? (403)                    6. transition de lieux (validation, reprise)
 *   3. quels champs lui sont permis ? (403)   7. image (décodée AVANT toute écriture)
 *   4. lieux puis rattachements (400)         8. écriture atomique, puis effets publiés
 *
 * Accès aux données : `lib/tasks/taskQueries.js` (dépôt de référence, exécuteur `dbx`).
 * Aucune dépendance à Express : les refus sont levés en `TaskRuleError` (statut HTTP + message),
 * que la route traduit en `{ error }`. La requête d'origine n'est transmise qu'au journal
 * d'audit (`auditReq`), qui en tire l'adresse IP et l'acteur — le service n'y lit rien d'autre.
 */

const crypto = require('node:crypto');
const { withTransaction } = require('../../database');
const { deleteFile, writeBufferToDisk } = require('../uploads');
const logger = require('../logger');
const { logAudit } = require('../auditLog');
const { emitTasksChanged } = require('../realtime');
const { getActor } = require('../shared/participationGuards');
const { fireAndForget, notifyTaskStatusChange } = require('../notificationEvents');
const { syncTaskProjectCompletionForProjects } = require('../syncTaskProjectCompletion');
const { syncTaskSpecies } = require('../speciesJunction');
const { syncProgressionForValidatedTask } = require('../rbac');
const { normalizeTaskStatusForRead, normalizeTaskCompletionMode } = require('../taskStatusRecalc');
const { normalizeImportTaskStatus } = require('./taskImport');
const {
  recalculateTaskStatus,
  validateTaskLocations,
  setTaskZones,
  setTaskMarkers,
  setTaskTutorials,
  setTaskReferents,
  syncLegacyLocationColumns,
  getTaskProposerStudentId,
  getTaskWithAssignments,
  getTaskRowById,
  getTaskProject,
  getTaskZoneIds,
  getTaskMarkerIds,
  getTaskTutorialIds,
  getTaskReferentIds,
  findActiveReferentUsers,
  findActiveTutorialIds,
  findPedagoSessionByKey,
  hasRecurrenceTemplateColumns,
  persistDetachedLocationsSnapshot,
  setTaskRecurrenceAnchor,
  updateTaskEditableFields,
  markTaskValidatedNow,
  setTaskImagePath,
} = require('./taskQueries');
const {
  resolveTaskMapId,
  parseTaskDangerLevelFromClient,
  parseTaskDifficultyLevelFromClient,
  parseTaskImportanceLevelFromClient,
  decodeTaskImageBuffer,
  sanitizeRequiredStudents,
  normalizeIdArray,
  normalizeTutorialIdArray,
  normalizeOptionalId,
  normalizeTaskDateInput,
  validateTaskDateRange,
} = require('../taskRouteHelpers');
const {
  canManageTasks,
  canValidateTasks,
  assertCanTeacherSetTaskStatus,
} = require('../taskAuthzHelpers');
const { parseTemplateIdArray } = require('../recurringTasks');

const MAX_TASK_REFERENTS = 15;

/** Récurrences acceptées par l'API (et seules à engendrer une occurrence suivante). */
const RECURRENCE_WITH_TEMPLATE_LOCS = new Set(['weekly', 'biweekly', 'monthly']);

/** Champs qu'un proposeur n3beur ne peut pas toucher sur sa proposition. */
const PROPOSER_FORBIDDEN_FIELDS = [
  'status',
  'project_id',
  'tutorial_ids',
  'referent_user_ids',
  'recurrence',
  'completion_mode',
  'pedago_session_id',
];

const VALIDATE_ONLY_FIELDS_ERROR =
  'Ce profil ne peut modifier que la validation des tâches (bouton Validée ou POST /validate).';

/** Refus métier : `status` HTTP et message renvoyé tel quel au client (`{ error }`). */
class TaskRuleError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'TaskRuleError';
    this.status = status;
  }
}

function fail(status, message) {
  throw new TaskRuleError(status, message);
}

/**
 * `hasOwnProperty` strict : lève sur un corps `undefined`, comme le faisait la déstructuration
 * de l'ancien handler (corps absent → 500, comportement figé par les tests de caractérisation).
 */
function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

// --- Validations réutilisées par la création (POST) et la mise à jour (PUT) ------------------

/**
 * Normalise `recurrence` (liste blanche).
 * @returns {{ value: string|null } | { error: string }}
 */
function normalizeTaskRecurrenceInput(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  const r = String(raw).trim().toLowerCase();
  if (!r) return { value: null };
  if (!RECURRENCE_WITH_TEMPLATE_LOCS.has(r)) {
    return { error: 'Récurrence invalide (weekly, biweekly ou monthly)' };
  }
  return { value: r };
}

/** Projet existant et sur la même carte que la tâche. */
async function validateTaskProject(projectId, resolvedMapId) {
  if (!projectId) return { projectId: null, mapId: resolvedMapId || null };
  const project = await getTaskProject(projectId);
  if (!project) return { error: 'Projet introuvable' };
  if (resolvedMapId && project.map_id !== resolvedMapId) {
    return { error: 'Le projet doit appartenir à la même carte que la tâche' };
  }
  return { projectId: project.id, mapId: resolvedMapId || project.map_id };
}

async function validateReferentUserIds(userIds) {
  if (!userIds.length) return { userIds };
  if (userIds.length > MAX_TASK_REFERENTS) {
    return { error: `Au plus ${MAX_TASK_REFERENTS} référents par tâche` };
  }
  const rows = await findActiveReferentUsers(userIds);
  const existing = new Map(rows.map((r) => [String(r.id), r.user_type]));
  for (const uid of userIds) {
    if (!existing.has(String(uid))) return { error: 'Référent introuvable ou compte inactif' };
  }
  return { userIds };
}

async function validateTutorialIds(tutorialIds) {
  if (!tutorialIds.length) return { tutorialIds };
  const rows = await findActiveTutorialIds(tutorialIds);
  const existing = new Set(rows.map((r) => Number(r.id)));
  for (const tid of tutorialIds) {
    if (!existing.has(Number(tid))) return { error: 'Tutoriel introuvable' };
  }
  return { tutorialIds };
}

/** Séance pédagogique liée (optionnelle) : vide → null ; sinon doit exister (id ou slug). */
async function validatePedagoSessionId(raw) {
  const key = raw == null ? '' : String(raw).trim();
  if (!key) return { sessionId: null };
  const row = await findPedagoSessionByKey(key);
  if (!row) return { error: 'Séance pédagogique introuvable' };
  return { sessionId: String(row.id) };
}

/**
 * Lieux à rendre à une tâche qui quitte l'état « validée », lus dans la mémoire posée au
 * moment du détachement.
 *
 * Prudence volontaire : un lieu supprimé depuis la validation, ou qui a changé de carte,
 * est simplement laissé de côté, et une mémoire inexploitable ne rend rien. Rendre un lieu
 * est un **confort de reprise**, jamais une raison de refuser le changement de statut que le
 * professeur a demandé.
 *
 * @returns {Promise<{ zoneIds: string[], markerIds: string[] }>} vide si rien à rendre.
 */
async function restoreDetachedLocations(task, explicitMapId) {
  const vide = { zoneIds: [], markerIds: [] };
  if (!(await hasRecurrenceTemplateColumns())) return vide;
  const zoneIds = parseTemplateIdArray(task.recurrence_template_zone_ids);
  const markerIds = parseTemplateIdArray(task.recurrence_template_marker_ids);
  if (!zoneIds.length && !markerIds.length) return vide;
  const check = await validateTaskLocations(zoneIds, markerIds, explicitMapId);
  if (check.error) {
    logger.warn(
      { taskId: task.id, reason: check.error },
      'Lieux mémorisés inexploitables — tâche remise à un statut actif sans lieu',
    );
    return vide;
  }
  return { zoneIds, markerIds };
}

// --- Étapes de la mise à jour ----------------------------------------------------------------

/** 1. La tâche existe et n'est pas archivée. */
async function loadEditableTask(taskId) {
  const task = await getTaskRowById(taskId);
  if (!task) fail(404, 'Tâche introuvable');
  if (task.archived_at != null) fail(409, 'Désarchivez la tâche avant de la modifier');
  return task;
}

/**
 * 2. Qui modifie : un enseignant (gestion et/ou validation), ou l'élève auteur d'une
 * proposition encore au statut « proposée ». Tout autre appelant est refusé.
 */
async function resolveTaskEditor(task, auth) {
  const canManage = canManageTasks(auth);
  const canValidate = canValidateTasks(auth);
  const isStudentSession = auth?.userType === 'student' && !!auth?.userId;
  const proposerStudentId = await getTaskProposerStudentId(task.id);
  const isProposer =
    isStudentSession &&
    String(task.status || '') === 'proposed' &&
    !!proposerStudentId &&
    String(proposerStudentId) === String(auth.userId);
  if (!canManage && !canValidate && !isProposer) fail(403, 'Accès refusé');
  return { canManage, canValidate, isTeacher: canManage || canValidate, isProposer };
}

/** 3. Champs permis : « validation seule » ne touche qu'au statut ; le proposeur, pas aux réglages. */
function assertEditableFields(editor, body) {
  const safeBody = body || {};
  if (editor.canValidate && !editor.canManage) {
    const disallowed = Object.keys(safeBody).filter((k) => k !== 'status' && has(safeBody, k));
    if (disallowed.length) fail(403, VALIDATE_ONLY_FIELDS_ERROR);
    if (!has(safeBody, 'status')) fail(403, 'Accès refusé');
  }
  if (editor.isProposer && PROPOSER_FORBIDDEN_FIELDS.some((key) => has(safeBody, key))) {
    fail(403, 'Champ non modifiable sur une proposition n3beur');
  }
}

/** Liste d'identifiants de lieux : `*_ids` prime sur le champ unitaire hérité, sinon l'existant. */
async function pickLocationIds(body, listKey, singleKey, readCurrent) {
  if (has(body, listKey)) return normalizeIdArray(body[listKey]);
  if (has(body, singleKey)) {
    const single = body[singleKey];
    return single ? [String(single).trim()] : [];
  }
  return readCurrent();
}

/** 4a. Lieux demandés (ou conservés) et carte résolue. */
async function resolveNextLocations(task, body) {
  const zoneIds = await pickLocationIds(body, 'zone_ids', 'zone_id', () => getTaskZoneIds(task.id));
  const markerIds = await pickLocationIds(body, 'marker_ids', 'marker_id', () =>
    getTaskMarkerIds(task.id),
  );
  const explicitMap = has(body, 'map_id') ? body.map_id : task.map_id;
  const loc = await validateTaskLocations(zoneIds, markerIds, explicitMap);
  if (loc.error) fail(400, loc.error);
  return { zoneIds, markerIds, explicitMap, mapId: loc.mapId };
}

/** Un champ de rattachement n'est modifiable que par la gestion (`tasks.manage`). */
function managerSets(editor, body, key) {
  return editor.canManage && has(body, key);
}

/** 4b. Projet, groupe, tutoriels, référents, séance — dans l'ordre historique des contrôles. */
async function resolveNextRelations(task, body, editor, mapId) {
  const nextProjectId = managerSets(editor, body, 'project_id')
    ? normalizeOptionalId(body.project_id)
    : task.project_id || null;
  const project = await validateTaskProject(nextProjectId, mapId);
  if (project.error) fail(400, project.error);

  const groupId = managerSets(editor, body, 'group_id')
    ? normalizeOptionalId(body.group_id)
    : normalizeOptionalId(task.group_id);

  const tutorialIds = managerSets(editor, body, 'tutorial_ids')
    ? normalizeTutorialIdArray(body.tutorial_ids)
    : await getTaskTutorialIds(task.id);
  const tutorials = await validateTutorialIds(tutorialIds);
  if (tutorials.error) fail(400, tutorials.error);

  const referentIds = managerSets(editor, body, 'referent_user_ids')
    ? normalizeIdArray(body.referent_user_ids)
    : await getTaskReferentIds(task.id);
  const referents = await validateReferentUserIds(referentIds);
  if (referents.error) fail(400, referents.error);

  let pedagoSessionId = task.pedago_session_id || null;
  if (managerSets(editor, body, 'pedago_session_id')) {
    const session = await validatePedagoSessionId(body.pedago_session_id);
    if (session.error) fail(400, session.error);
    pedagoSessionId = session.sessionId;
  }
  return {
    projectId: project.projectId,
    mapId: project.mapId,
    groupId,
    tutorialIds,
    referentIds: referents.userIds,
    pedagoSessionId,
  };
}

/** 5a. Statut : seul un enseignant le fixe ; sinon le statut courant, normalisé. */
function resolveNextStatus(task, body, editor, auth) {
  const teacherSetsStatus = editor.isTeacher && has(body, 'status');
  const status = teacherSetsStatus
    ? normalizeImportTaskStatus(body.status)
    : normalizeTaskStatusForRead(task.status);
  if (!status) fail(400, 'Statut invalide');
  if (teacherSetsStatus) {
    const statusAuth = assertCanTeacherSetTaskStatus(auth, status);
    if (!statusAuth.ok) fail(statusAuth.status, statusAuth.error);
  }
  return status;
}

/** Valeur d'un champ parsé : l'existant si absent du corps, sinon le résultat du parseur (ou 400). */
function pickParsed(body, key, parse, currentValue) {
  if (!has(body, key)) return currentValue;
  const parsed = parse(body[key]);
  if (parsed.error) fail(400, parsed.error);
  return parsed.value;
}

const parseDanger = (v) => {
  const p = parseTaskDangerLevelFromClient(v);
  return p.error ? p : { value: p.level };
};
const parseDifficulty = (v) => {
  const p = parseTaskDifficultyLevelFromClient(v);
  return p.error ? p : { value: p.level };
};
const parseImportance = (v) => {
  const p = parseTaskImportanceLevelFromClient(v);
  return p.error ? p : { value: p.level };
};

/** 5b. Champs scalaires, dans l'ordre historique des contrôles (statut d'abord, dates en dernier). */
function resolveNextScalars(task, body, editor, auth) {
  const requiredStudents =
    body.required_students != null
      ? sanitizeRequiredStudents(body.required_students)
      : task.required_students;
  const status = resolveNextStatus(task, body, editor, auth);
  const completionMode = managerSets(editor, body, 'completion_mode')
    ? normalizeTaskCompletionMode(body.completion_mode)
    : normalizeTaskCompletionMode(task.completion_mode) || 'single_done';
  if (!completionMode) fail(400, 'Mode de validation invalide');

  const dangerLevel = pickParsed(body, 'danger_level', parseDanger, task.danger_level);
  const difficultyLevel = pickParsed(
    body,
    'difficulty_level',
    parseDifficulty,
    task.difficulty_level,
  );
  const importanceLevel = pickParsed(
    body,
    'importance_level',
    parseImportance,
    task.importance_level,
  );
  const recurrence = editor.canManage
    ? pickParsed(body, 'recurrence', normalizeTaskRecurrenceInput, task.recurrence || null)
    : task.recurrence || null;
  const startDate = pickParsed(
    body,
    'start_date',
    (v) => normalizeTaskDateInput(v, 'Date de début'),
    task.start_date || null,
  );
  const dueDate = pickParsed(
    body,
    'due_date',
    (v) => normalizeTaskDateInput(v, "Date d'échéance"),
    task.due_date || null,
  );
  // Contrôle sur les valeurs EFFECTIVES : n'envoyer qu'une des deux dates ne doit pas
  // permettre d'inverser le couple déjà en base. Mais seulement si ce PUT touche aux
  // dates : une tâche héritée déjà incohérente doit rester modifiable sur ses autres champs,
  // sinon elle devient impossible à corriger.
  if (has(body, 'start_date') || has(body, 'due_date')) {
    const rangeError = validateTaskDateRange(startDate, dueDate);
    if (rangeError) fail(400, rangeError.error);
  }
  return {
    requiredStudents,
    status,
    completionMode,
    dangerLevel,
    difficultyLevel,
    importanceLevel,
    recurrence,
    startDate,
    dueDate,
  };
}

function submitsLocations(body) {
  return (
    has(body, 'zone_ids') ||
    has(body, 'zone_id') ||
    has(body, 'marker_ids') ||
    has(body, 'marker_id')
  );
}

/**
 * 6. Transition de lieux liée au statut.
 *
 * Règle métier : une tâche validée n'est liée à aucune zone ni repère ; la mémoire de ses
 * lieux est posée DANS la transaction d'écriture. Une tâche qui quitte « validée » retrouve
 * ces lieux — sans quoi elle redevenait « à faire » **sans lieu**, donc sans pastille et
 * invisible sur la carte. Des lieux soumis dans le même PUT restent prioritaires : c'est une
 * décision du professeur, pas un état hérité.
 *
 * Il n'y a pas de quatrième cas : une tâche qui **reste** validée repasse par la première
 * branche (ses lieux sont remis à vide). Le refus « Impossible de lier une tâche validée à des
 * zones ou repères » n'avait plus de chemin pour se produire et a été retiré.
 */
async function planLocationTransition(task, body, nextStatus, locations) {
  const currentStatus = normalizeTaskStatusForRead(task.status);
  const becameValidated = nextStatus === 'validated' && currentStatus !== 'validated';
  const leftValidated = currentStatus === 'validated' && nextStatus !== 'validated';
  const currentZoneIds = await getTaskZoneIds(task.id);
  const currentMarkerIds = await getTaskMarkerIds(task.id);
  const snapshot = {
    zoneIds: locations.zoneIds.length ? locations.zoneIds : currentZoneIds,
    markerIds: locations.markerIds.length ? locations.markerIds : currentMarkerIds,
  };
  let { zoneIds, markerIds } = locations;
  if (nextStatus === 'validated') {
    zoneIds = [];
    markerIds = [];
  } else if (leftValidated && !submitsLocations(body) && !zoneIds.length && !markerIds.length) {
    ({ zoneIds, markerIds } = await restoreDetachedLocations(task, locations.explicitMap));
  }
  return { currentStatus, becameValidated, zoneIds, markerIds, snapshot };
}

/** 7. Image : décodée AVANT toute écriture — un payload invalide répond 400 sans rien modifier. */
function resolveImageChange(body) {
  const hasNewImage =
    has(body, 'imageData') && body.imageData != null && String(body.imageData).trim();
  if (hasNewImage) {
    const decoded = decodeTaskImageBuffer(body.imageData);
    if (decoded.error) fail(400, decoded.error);
    return { decodedImage: decoded, removeImage: false };
  }
  const removeImage = has(body, 'remove_task_image') && body.remove_task_image === true;
  return { decodedImage: null, removeImage };
}

/** Écrit la nouvelle image dans la transaction ; retourne le chemin devenu obsolète. */
async function writeTaskImage(task, decodedImage, tx) {
  const oldPath = task.image_path || null;
  const rel = `tasks/${task.id}.${decodedImage.ext}`;
  try {
    await writeBufferToDisk(rel, decodedImage.buffer);
    await setTaskImagePath(task.id, rel, tx);
  } catch (imgErr) {
    try {
      deleteFile(rel);
    } catch (_) {
      /* ignore */
    }
    // Le rollback de la transaction annule l'UPDATE et les jointures.
    throw imgErr;
  }
  return oldPath && oldPath !== rel ? oldPath : null;
}

/** Remet le statut en accord avec l'avancement quand SEUL le mode de validation change. */
function shouldRecalculateStatus(editor, body) {
  return managerSets(editor, body, 'completion_mode') && !has(body, 'status');
}

/** Valeurs de l'UPDATE unique de `tasks` (titre et description conservés s'ils valent null). */
function buildEditableFields(task, body, plan) {
  const { scalars, relations, transition } = plan;
  return {
    title: body.title ?? task.title,
    description: body.description ?? task.description,
    mapId: relations.mapId,
    projectId: relations.projectId,
    groupId: relations.groupId,
    zoneId: transition.zoneIds[0] || null,
    markerId: transition.markerIds[0] || null,
    startDate: scalars.startDate,
    dueDate: scalars.dueDate,
    requiredStudents: scalars.requiredStudents,
    status: scalars.status,
    completionMode: scalars.completionMode,
    dangerLevel: scalars.dangerLevel,
    difficultyLevel: scalars.difficultyLevel,
    importanceLevel: scalars.importanceLevel,
    recurrence: scalars.recurrence,
    // Une série naît à la première récurrence et n'est jamais écrasée (COALESCE côté SQL).
    recurrenceSeriesId:
      scalars.recurrence && !task.recurrence_series_id
        ? crypto.randomUUID()
        : task.recurrence_series_id || null,
    pedagoSessionId: relations.pedagoSessionId,
  };
}

/** Ligne `tasks` : mémoire des lieux, ancre de récurrence, champs, horodatage, recalcul. */
async function writeTaskRow(tx, task, body, editor, plan) {
  const { scalars, transition } = plan;
  if (transition.becameValidated) {
    const { zoneIds, markerIds } = transition.snapshot;
    await persistDetachedLocationsSnapshot(task.id, zoneIds, markerIds, tx);
  }
  // Reprise en main du rythme : déplacer la date de départ d'une tâche récurrente redéfinit
  // l'ancre de sa série (migration 258). Le calendrier scolaire, lui, décale une occurrence
  // sans jamais toucher à l'ancre. Sans date de départ, l'ancre est effacée : elle sera
  // reprise de la date de création au prochain passage du job.
  const startDateChanged = String(task.start_date || '') !== String(scalars.startDate || '');
  if (String(scalars.recurrence || '').trim() && startDateChanged) {
    await setTaskRecurrenceAnchor(task.id, scalars.startDate, tx);
  }
  await updateTaskEditableFields(task.id, buildEditableFields(task, body, plan), tx);
  // Horodatage posé à chaque ENTRÉE dans le statut `validated`.
  if (transition.becameValidated) await markTaskValidatedNow(task.id, tx);
  if (shouldRecalculateStatus(editor, body)) {
    await recalculateTaskStatus(
      { id: task.id, status: scalars.status, completion_mode: scalars.completionMode },
      tx,
    );
  }
}

/** Jointures (lieux, tutoriels, référents, espèces) et colonnes de lieu héritées. */
async function writeTaskLinks(tx, task, body, plan) {
  const { relations, transition } = plan;
  await setTaskZones(task.id, transition.zoneIds, tx);
  await setTaskMarkers(task.id, transition.markerIds, tx);
  await setTaskTutorials(task.id, relations.tutorialIds, tx);
  await setTaskReferents(task.id, relations.referentIds, tx);
  if (has(body, 'living_beings') || has(body, 'species_ids')) {
    await syncTaskSpecies(tx, task.id, body.species_ids, body.living_beings);
  }
  await syncLegacyLocationColumns(task.id, transition.zoneIds, transition.markerIds, tx);
}

/** Image : nouvelle, retirée ou inchangée ; retourne le chemin devenu obsolète. */
async function writeTaskImageChange(tx, task, image) {
  if (image.decodedImage) return writeTaskImage(task, image.decodedImage, tx);
  if (image.removeImage && task.image_path) {
    await setTaskImagePath(task.id, null, tx);
    return task.image_path;
  }
  return null;
}

/**
 * 8a. Écritures atomiques (même garantie que la création, audit § 2.5) : UPDATE `tasks` +
 * jointures + colonnes héritées + espèces + image dans UNE transaction — un échec au milieu
 * ne doit pas laisser statut et carte désynchronisés des jonctions.
 * @returns {Promise<string|null>} image devenue obsolète, à supprimer APRÈS commit
 */
async function persistTaskUpdate(task, body, editor, plan) {
  let obsoleteImagePath = null;
  await withTransaction(async (tx) => {
    await writeTaskRow(tx, task, body, editor, plan);
    await writeTaskLinks(tx, task, body, plan);
    obsoleteImagePath = await writeTaskImageChange(tx, task, plan.image);
  });
  return obsoleteImagePath;
}

/** 8b. Effets publiés après commit : fichier obsolète, journal, temps réel, projets, progression, notifications. */
async function publishTaskUpdate({ task, editor, auth, auditReq, plan, obsoleteImagePath }) {
  // Suppression du fichier obsolète APRÈS commit : un rollback ne doit pas perdre l'image.
  if (obsoleteImagePath) {
    try {
      deleteFile(obsoleteImagePath);
    } catch (_) {
      /* ignore */
    }
  }
  const { relations, transition } = plan;
  const previousProjectId =
    task.project_id != null && String(task.project_id).trim()
      ? String(task.project_id).trim()
      : null;
  const updated = await getTaskWithAssignments(task.id);
  logAudit('update_task', 'task', task.id, updated.title, {
    req: auditReq,
    actorUserType: editor.isProposer ? 'student' : undefined,
    actorUserId: editor.isProposer ? String(auth.userId) : undefined,
    payload: {
      status: updated.status,
      completion_mode: updated.completion_mode,
      required_students: updated.required_students,
      project_id: updated.project_id || null,
      proposer_edit: editor.isProposer,
    },
  });
  emitTasksChanged({
    reason: 'update_task',
    taskId: task.id,
    projectId: relations.projectId || null,
    mapId: resolveTaskMapId(updated),
  });
  await syncTaskProjectCompletionForProjects([previousProjectId, relations.projectId]);
  if (transition.becameValidated) await syncProgressionForValidatedTask(task.id);
  if (!editor.isProposer) {
    const actor = getActor(auth);
    fireAndForget(
      () =>
        notifyTaskStatusChange({
          task: updated,
          previousStatus: transition.currentStatus,
          actorUserId: actor?.userId || null,
        }),
      { taskId: task.id },
    );
  }
  return updated;
}

/**
 * Met à jour une tâche (contrat de `PUT /api/tasks/:id`).
 *
 * @param {{ taskId: string, body: object|undefined, auth: object|null, auditReq?: object }} input
 *   `auth` : charge d'authentification optionnelle déjà lue (ou `null`) ; `auditReq` : requête
 *   d'origine, transmise telle quelle au journal d'audit.
 * @returns {Promise<object>} la tâche relue (forme de `GET /api/tasks/:id`)
 * @throws {TaskRuleError} refus métier (400, 403, 404, 409) ; toute autre erreur est une panne
 */
async function updateTask({ taskId, body, auth, auditReq = null }) {
  const task = await loadEditableTask(taskId);
  const editor = await resolveTaskEditor(task, auth);
  assertEditableFields(editor, body);

  // Aligné sur la création (« Titre requis ») : une mise à jour ne vide pas le titre.
  // (Sur un corps absent, cette lecture lève comme la déstructuration historique : 500.)
  const { title } = body;
  if (title !== undefined && !String(title ?? '').trim()) fail(400, 'Titre requis');

  const locations = await resolveNextLocations(task, body);
  const relations = await resolveNextRelations(task, body, editor, locations.mapId);
  const scalars = resolveNextScalars(task, body, editor, auth);
  const transition = await planLocationTransition(task, body, scalars.status, locations);
  const image = resolveImageChange(body);

  const plan = { scalars, relations, transition, image };
  const obsoleteImagePath = await persistTaskUpdate(task, body, editor, plan);
  return publishTaskUpdate({ task, editor, auth, auditReq, plan, obsoleteImagePath });
}

module.exports = {
  TaskRuleError,
  MAX_TASK_REFERENTS,
  updateTask,
  normalizeTaskRecurrenceInput,
  validateTaskProject,
  validateReferentUserIds,
  validateTutorialIds,
  validatePedagoSessionId,
  restoreDetachedLocations,
};
