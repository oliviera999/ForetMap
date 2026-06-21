'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ALLOWED_TASK_STATUSES,
  MAX_TASK_IMAGE_BYTES,
  asTrimmedString,
  normalizeOptionalString,
  resolveTaskMapId,
  parseTaskDangerLevelFromClient,
  parseTaskDifficultyLevelFromClient,
  parseTaskImportanceLevelFromClient,
  taskDangerLevelForResponse,
  taskDifficultyLevelForResponse,
  taskImportanceLevelForResponse,
  normalizeTaskLivingBeingsInput,
  serializeTaskLivingBeingsForDb,
  attachTaskLivingBeingsApiFields,
  taskImageExtensionFromBuffer,
  decodeTaskImageBuffer,
  attachTaskImagePublicFields,
  countDoneAssignments,
  normalizeDateOnly,
  currentLocalDateOnly,
  isTaskBeforeStartDate,
  sanitizeRequiredStudents,
  normalizeIdArray,
  normalizeTutorialIdArray,
  normalizeOptionalId,
  sameIdSet,
  referentPublicLabel,
  enrichTaskRow,
  trimName,
} = require('../lib/taskRouteHelpers');

const {
  canReadAllAssignments,
  canManageTasks,
  canValidateTasks,
  assertCanTeacherSetTaskStatus,
  canRunTeacherStyleTaskStudentAction,
  isVisitorRole,
} = require('../lib/taskAuthzHelpers');

function pngBuffer(extraBytes = 8) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(extraBytes, 0x01),
  ]);
}

function jpegBuffer(extraBytes = 12) {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extraBytes, 0x02)]);
}

function webpBuffer() {
  return Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x10, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
    Buffer.alloc(8, 0x03),
  ]);
}

describe('taskRouteHelpers — normalisations de chaînes et ids', () => {
  it('asTrimmedString : null/undefined → "", trim sinon', () => {
    assert.equal(asTrimmedString(null), '');
    assert.equal(asTrimmedString(undefined), '');
    assert.equal(asTrimmedString('  abc  '), 'abc');
    assert.equal(asTrimmedString(42), '42');
  });

  it('normalizeOptionalString : vide → null, sinon valeur trimée', () => {
    assert.equal(normalizeOptionalString('   '), null);
    assert.equal(normalizeOptionalString(null), null);
    assert.equal(normalizeOptionalString(' ok '), 'ok');
  });

  it('normalizeOptionalId : blancs → null, nombre → chaîne', () => {
    assert.equal(normalizeOptionalId(null), null);
    assert.equal(normalizeOptionalId('   '), null);
    assert.equal(normalizeOptionalId(' z1 '), 'z1');
    assert.equal(normalizeOptionalId(42), '42');
  });

  it('normalizeIdArray : déduplique, trim, ignore les vides et non-tableaux', () => {
    assert.deepEqual(normalizeIdArray('pas-un-tableau'), []);
    assert.deepEqual(normalizeIdArray([' a ', 'a', '', null, 'b']), ['a', 'b']);
  });

  it('normalizeTutorialIdArray : entiers > 0 dédupliqués, le reste ignoré', () => {
    assert.deepEqual(normalizeTutorialIdArray(undefined), []);
    assert.deepEqual(normalizeTutorialIdArray(['3', 3, 'x', -1, 0, '2']), [3, 2]);
  });

  it('sameIdSet : insensible à l’ordre, sensible au contenu', () => {
    assert.equal(sameIdSet(['a', 'b'], ['b', 'a']), true);
    assert.equal(sameIdSet(['a'], ['a', 'b']), false);
    assert.equal(sameIdSet(['a', 'b'], ['a', 'c']), false);
    assert.equal(sameIdSet([], []), true);
  });

  it('trimName : null → "", trim sinon', () => {
    assert.equal(trimName(null), '');
    assert.equal(trimName('  Léa  '), 'Léa');
  });
});

describe('taskRouteHelpers — niveaux (danger / difficulté / importance)', () => {
  it('parse côté client : absent ou vide → { level: null }', () => {
    assert.deepEqual(parseTaskDangerLevelFromClient(undefined), { level: null });
    assert.deepEqual(parseTaskDangerLevelFromClient(null), { level: null });
    assert.deepEqual(parseTaskDangerLevelFromClient('   '), { level: null });
  });

  it('parse côté client : casse ignorée, valeur inconnue → erreur', () => {
    assert.deepEqual(parseTaskDangerLevelFromClient('SAFE'), { level: 'safe' });
    assert.equal(parseTaskDangerLevelFromClient('bogus').error, 'Niveau de danger invalide');
    assert.deepEqual(parseTaskDifficultyLevelFromClient(' Hard '), { level: 'hard' });
    assert.equal(parseTaskDifficultyLevelFromClient('xxl').error, 'Niveau de difficulté invalide');
    assert.deepEqual(parseTaskImportanceLevelFromClient('Absolute'), { level: 'absolute' });
    assert.equal(parseTaskImportanceLevelFromClient('zzz').error, "Degré d'importance invalide");
  });

  it('valeurs BDD → réponse API : null, normalisé ou null si inconnu', () => {
    assert.equal(taskDangerLevelForResponse(null), null);
    assert.equal(taskDangerLevelForResponse('DANGEROUS'), 'dangerous');
    assert.equal(taskDangerLevelForResponse('weird'), null);
    assert.equal(taskDifficultyLevelForResponse(' very_hard '), 'very_hard');
    assert.equal(taskDifficultyLevelForResponse(''), null);
    assert.equal(taskImportanceLevelForResponse('not_important'), 'not_important');
    assert.equal(taskImportanceLevelForResponse('???'), null);
  });

  it('ALLOWED_TASK_STATUSES expose les six statuts métier', () => {
    assert.deepEqual([...ALLOWED_TASK_STATUSES].sort(), [
      'available',
      'done',
      'in_progress',
      'on_hold',
      'proposed',
      'validated',
    ]);
  });
});

describe('taskRouteHelpers — êtres vivants (living_beings)', () => {
  it('normalizeTaskLivingBeingsInput : tableau trimé/dédupliqué', () => {
    assert.deepEqual(normalizeTaskLivingBeingsInput([' renard ', 'renard', '', 'hibou']), [
      'renard',
      'hibou',
    ]);
  });

  it('normalizeTaskLivingBeingsInput : chaîne JSON ou CSV, fallback si vide', () => {
    assert.deepEqual(normalizeTaskLivingBeingsInput('["a","b","a"]'), ['a', 'b']);
    assert.deepEqual(normalizeTaskLivingBeingsInput('a, b ,a'), ['a', 'b']);
    assert.deepEqual(normalizeTaskLivingBeingsInput([], ' chêne '), ['chêne']);
    assert.deepEqual(normalizeTaskLivingBeingsInput(undefined), []);
  });

  it('serializeTaskLivingBeingsForDb : vide → null, sinon JSON', () => {
    assert.equal(serializeTaskLivingBeingsForDb([]), null);
    assert.equal(serializeTaskLivingBeingsForDb(['a', 'a', 'b']), '["a","b"]');
  });

  it('attachTaskLivingBeingsApiFields : remplace living_beings par living_beings_list', () => {
    const task = { living_beings: '["lynx"]' };
    attachTaskLivingBeingsApiFields(task);
    assert.deepEqual(task.living_beings_list, ['lynx']);
    assert.equal('living_beings' in task, false);
    assert.doesNotThrow(() => attachTaskLivingBeingsApiFields(null));
  });
});

describe('taskRouteHelpers — image de tâche', () => {
  it('taskImageExtensionFromBuffer : signatures JPEG/PNG/WebP, sinon null', () => {
    assert.equal(taskImageExtensionFromBuffer(jpegBuffer()), 'jpg');
    assert.equal(taskImageExtensionFromBuffer(pngBuffer()), 'png');
    assert.equal(taskImageExtensionFromBuffer(webpBuffer()), 'webp');
    assert.equal(taskImageExtensionFromBuffer(Buffer.alloc(20, 0x00)), null);
    assert.equal(taskImageExtensionFromBuffer(Buffer.from([0xff, 0xd8])), null); // < 12 octets
    assert.equal(taskImageExtensionFromBuffer(null), null);
  });

  it('decodeTaskImageBuffer : data URL PNG valide → buffer + ext', () => {
    const png = pngBuffer();
    const res = decodeTaskImageBuffer(`data:image/png;base64,${png.toString('base64')}`);
    assert.equal(res.error, undefined);
    assert.equal(res.ext, 'png');
    assert.equal(Buffer.compare(res.buffer, png), 0);
  });

  it('decodeTaskImageBuffer : base64 nu (sans préfixe data URL) accepté', () => {
    const res = decodeTaskImageBuffer(jpegBuffer().toString('base64'));
    assert.equal(res.ext, 'jpg');
  });

  it('decodeTaskImageBuffer : entrées vides → "Image requise"', () => {
    assert.equal(decodeTaskImageBuffer(null).error, 'Image requise');
    assert.equal(decodeTaskImageBuffer('data:image/png;base64,   ').error, 'Image requise');
  });

  it('decodeTaskImageBuffer : trop volumineuse ou format inconnu → erreur', () => {
    const big = Buffer.concat([pngBuffer(), Buffer.alloc(MAX_TASK_IMAGE_BYTES, 0x00)]);
    assert.equal(
      decodeTaskImageBuffer(big.toString('base64')).error,
      'Image trop volumineuse (max 4 Mo après décodage)',
    );
    const notImage = Buffer.alloc(32, 0x42);
    assert.equal(
      decodeTaskImageBuffer(notImage.toString('base64')).error,
      'Format image non supporté (JPEG, PNG ou WebP)',
    );
  });

  it('attachTaskImagePublicFields : chemin sûr → /uploads, sinon route API, absent → null', () => {
    const safe = { id: 't1', image_path: 'tasks/t1.png' };
    attachTaskImagePublicFields(safe);
    assert.equal(safe.image_url, '/uploads/tasks/t1.png');
    assert.equal('image_path' in safe, false);

    const unsafe = { id: 't 2', image_path: 'tasks/../secret.png' };
    attachTaskImagePublicFields(unsafe);
    assert.equal(unsafe.image_url, '/api/tasks/t%202/image');

    const none = { id: 't3', image_path: null };
    attachTaskImagePublicFields(none);
    assert.equal(none.image_url, null);

    assert.doesNotThrow(() => attachTaskImagePublicFields(null));
  });
});

describe('taskRouteHelpers — dates et avancement', () => {
  it('normalizeDateOnly : YYYY-MM-DD conservé, datetime tronqué, invalide → null', () => {
    assert.equal(normalizeDateOnly('2026-06-12'), '2026-06-12');
    assert.equal(normalizeDateOnly('2026-06-12T08:30:00.000Z'), '2026-06-12');
    assert.equal(normalizeDateOnly('pas-une-date'), null);
    assert.equal(normalizeDateOnly(''), null);
  });

  it('currentLocalDateOnly : format YYYY-MM-DD', () => {
    assert.match(currentLocalDateOnly(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('isTaskBeforeStartDate : vrai seulement si date future et statut ouvert', () => {
    assert.equal(isTaskBeforeStartDate({ status: 'available', start_date: '2999-01-01' }), true);
    assert.equal(isTaskBeforeStartDate({ status: 'done', start_date: '2999-01-01' }), false);
    assert.equal(isTaskBeforeStartDate({ status: 'validated', start_date: '2999-01-01' }), false);
    assert.equal(isTaskBeforeStartDate({ status: 'proposed', start_date: '2999-01-01' }), false);
    assert.equal(isTaskBeforeStartDate({ status: 'available', start_date: '2000-01-01' }), false);
    assert.equal(isTaskBeforeStartDate({ status: 'available' }), false);
  });

  it('countDoneAssignments : compte les done_at, tolère non-tableau', () => {
    assert.equal(countDoneAssignments('x'), 0);
    assert.equal(
      countDoneAssignments([{ done_at: 'd' }, { done_at: null }, {}, { done_at: 'e' }]),
      2,
    );
  });

  it('sanitizeRequiredStudents : entier ≥ 1, sinon 1', () => {
    assert.equal(sanitizeRequiredStudents('3'), 3);
    assert.equal(sanitizeRequiredStudents(0), 1);
    assert.equal(sanitizeRequiredStudents(-5), 1);
    assert.equal(sanitizeRequiredStudents('abc'), 1);
  });
});

describe('taskRouteHelpers — sérialisation tâche', () => {
  it('resolveTaskMapId : priorité map_id_resolved puis map_id puis liens', () => {
    assert.equal(resolveTaskMapId(null), null);
    assert.equal(resolveTaskMapId({}), null);
    assert.equal(resolveTaskMapId({ map_id_resolved: 'm1', map_id: 'm2' }), 'm1');
    assert.equal(resolveTaskMapId({ zone_map_id: 'mz', marker_map_id: 'mm' }), 'mz');
    assert.equal(resolveTaskMapId({ project_map_id: 'mp' }), 'mp');
  });

  it('referentPublicLabel : display_name > prénom nom > uid > "Utilisateur"', () => {
    assert.equal(referentPublicLabel({ display_name: ' Mme A ', first_name: 'B' }), 'Mme A');
    assert.equal(referentPublicLabel({ first_name: ' Léa ', last_name: ' Dupont ' }), 'Léa Dupont');
    assert.equal(referentPublicLabel({ uid: 'u42' }), 'u42');
    assert.equal(referentPublicLabel({}), 'Utilisateur');
  });

  it('enrichTaskRow : ids/objets liés et carte résolue depuis les liens', () => {
    const task = { map_id: 'fallback' };
    enrichTaskRow(
      task,
      [{ id: 'z1', name: 'Clairière', map_id: 'm1' }],
      [{ id: 'k1', label: 'Repère', map_id: 'm1' }],
      [
        {
          id: '7',
          title: 'Tuto',
          slug: 's',
          type: 'video',
          source_url: null,
          source_file_path: null,
        },
      ],
      [{ id: 9, user_type: 'teacher', display_name: 'Prof X', role_slug: 'prof' }],
    );
    assert.deepEqual(task.zone_ids, ['z1']);
    assert.deepEqual(task.marker_ids, ['k1']);
    assert.deepEqual(task.tutorial_ids, [7]);
    assert.deepEqual(task.referent_user_ids, ['9']);
    assert.equal(task.referents_linked[0].label, 'Prof X');
    assert.equal(task.map_id_resolved, 'm1');
    assert.equal(task.zone_name, 'Clairière');
    assert.equal(task.marker_label, 'Repère');
  });

  it('enrichTaskRow : sans lien, map_id de la tâche et legacy conservés', () => {
    const task = { map_id: 'm9', zone_name: 'Ancienne', marker_label: 'Vieux' };
    enrichTaskRow(task, [], [], [], []);
    assert.equal(task.map_id_resolved, 'm9');
    assert.equal(task.zone_name, 'Ancienne');
    assert.equal(task.marker_label, 'Vieux');
    assert.deepEqual(task.zones_linked, []);
  });
});

describe('taskAuthzHelpers — contrôles d’accès purs', () => {
  it('canReadAllAssignments : permissions de lecture globale ou groupe', () => {
    assert.equal(canReadAllAssignments({ permissions: ['tasks.manage'] }), true);
    assert.equal(canReadAllAssignments({ permissions: ['stats.read.group'] }), true);
    assert.equal(canReadAllAssignments({ permissions: ['tasks.assign_self'] }), false);
    assert.equal(canReadAllAssignments(null), false);
  });

  it('canManageTasks / canValidateTasks : élévation requise sauf admin natif', () => {
    assert.equal(canManageTasks({ permissions: ['tasks.manage'], elevated: true }), true);
    assert.equal(
      canManageTasks({ permissions: ['tasks.manage'], elevated: false, roleSlug: 'prof' }),
      false,
    );
    assert.equal(canManageTasks({ permissions: ['tasks.manage'], roleSlug: 'admin' }), true);
    assert.equal(canValidateTasks({ permissions: ['tasks.validate'], elevated: true }), true);
    assert.equal(canValidateTasks({ permissions: [], elevated: true }), false);
  });

  it('assertCanTeacherSetTaskStatus : validated exige tasks.validate', () => {
    assert.deepEqual(
      assertCanTeacherSetTaskStatus(
        { permissions: ['tasks.validate'], elevated: true },
        'validated',
      ),
      { ok: true },
    );
    const elevNeeded = assertCanTeacherSetTaskStatus(
      { permissions: [], elevatedPermissions: ['tasks.validate'] },
      'validated',
    );
    assert.deepEqual(elevNeeded, { ok: false, status: 403, error: 'Élévation PIN requise' });
    const refused = assertCanTeacherSetTaskStatus({ permissions: [] }, 'validated');
    assert.deepEqual(refused, { ok: false, status: 403, error: 'Permission insuffisante' });
  });

  it('assertCanTeacherSetTaskStatus : autres statuts exigent tasks.manage', () => {
    assert.deepEqual(
      assertCanTeacherSetTaskStatus({ permissions: ['tasks.manage'], elevated: true }, 'done'),
      { ok: true },
    );
    const elevNeeded = assertCanTeacherSetTaskStatus(
      { permissions: [], elevatedPermissions: ['tasks.manage'] },
      'in_progress',
    );
    assert.deepEqual(elevNeeded, { ok: false, status: 403, error: 'Élévation PIN requise' });
    assert.equal(assertCanTeacherSetTaskStatus({ permissions: [] }, 'done').ok, false);
  });

  it('canRunTeacherStyleTaskStudentAction : manage élevé ou tasks.validate brut', () => {
    assert.equal(canRunTeacherStyleTaskStudentAction(null), false);
    assert.equal(
      canRunTeacherStyleTaskStudentAction({ permissions: ['tasks.manage'], elevated: true }),
      true,
    );
    assert.equal(canRunTeacherStyleTaskStudentAction({ permissions: ['tasks.validate'] }), true);
    assert.equal(
      canRunTeacherStyleTaskStudentAction({ permissions: ['tasks.assign_self'] }),
      false,
    );
  });

  it('isVisitorRole : slug visiteur insensible à la casse', () => {
    assert.equal(isVisitorRole({ roleSlug: 'Visiteur' }), true);
    assert.equal(isVisitorRole({ roleSlug: 'prof' }), false);
    assert.equal(isVisitorRole(null), false);
  });
});
