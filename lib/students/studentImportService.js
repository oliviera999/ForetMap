'use strict';

/**
 * Import de comptes (élèves, personnels, enseignants) depuis un fichier CSV / XLSX —
 * `POST /api/students/import`.
 *
 * Extrait de `routes/students.js` (piste B, étape B6 ; ligne 14 du § 3.3 de
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`) **sans changement de comportement** : même
 * rapport, mêmes écritures, dans le même ordre (caractérisation :
 * `tests/students-import-characterization.test.js`). Le routeur ne garde que le HTTP.
 *
 * Déroulé, une étape par fonction :
 *   1. options (stratégie pour les comptes existants, mots de passe faibles) ;
 *   2. contexte (comptes existants indexés, profils importables, planchers de mot de passe) ;
 *   3. validation ligne à ligne, puis fusion des doublons du fichier ;
 *   4. plan : création ou mise à jour, contrôles de périmètre, de profil et d'unicité ;
 *   5. aperçu (`dryRun`) ou écriture, puis rattachement aux groupes ;
 *   6. journal d'audit et signal temps réel.
 *
 * Lecture du fichier : `lib/importRows.js` (`resolveImportRows`) ; règles de ligne :
 * `lib/studentRouteHelpers.js` ; groupes : `lib/groupImport.js`.
 */

const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { queryAll, execute } = require('../../database');
const { logAudit } = require('../auditLog');
const { emitStudentsChanged } = require('../realtime');
const { setAssignedRole, recomputeUserRole } = require('../effectiveRole');
const { checkRoleGrantAllowed, checkRoleAssignmentAllowed } = require('../rbacRoleAssignment');
const { canBypassGroupScope, canAccessStudentId } = require('../groupScope');
const { getPasswordMinLengthFor } = require('../passwordReset');
const { getSettingValue } = require('../settings');
const { bumpUserTokenEpoch } = require('../auth/tokenEpoch');
const { loadGroupsIndex, attachUserToGroupRefs, previewGroupRefs } = require('../groupImport');
const { resolveImportRows } = require('../importRows');
const { nowDbTimestamp } = require('../shared/isoTimestamp');
const {
  MAX_IMPORT_ROWS,
  asTrimmedString,
  hasOwn,
  buildImportStudentPayload,
  validateImportStudentPayload,
  mergeDuplicateStudentImportItems,
  buildRoleAliasesFromDbRows,
  normalizeImportExistingStrategy,
  shouldKeepExistingImportRole,
  resolveImportProfileUpdates,
} = require('../studentRouteHelpers');

function rejected(status, error) {
  return { ok: false, status, error };
}

/** « Ligne 8 » / « Lignes 8, 11 » : préfixe des messages d'information du rapport. */
function rowsPrefix(rows) {
  return rows.length > 1 ? 'Lignes' : 'Ligne';
}

/**
 * Étape 1 — Choix ponctuel dans le panneau d'import, sinon le réglage de l'établissement.
 * @returns {Promise<{ ok: false, status: number, error: string } | { ok: true, existingStrategy: string, allowWeakPasswords: boolean }>}
 */
async function resolveImportOptions(body) {
  const requestedStrategy = body?.existingStrategy;
  const hasRequestedStrategy = requestedStrategy != null && String(requestedStrategy).trim() !== '';
  if (hasRequestedStrategy && !normalizeImportExistingStrategy(requestedStrategy)) {
    return rejected(400, 'existingStrategy invalide (update, fill ou skip attendu)');
  }
  const existingStrategy = hasRequestedStrategy
    ? normalizeImportExistingStrategy(requestedStrategy)
    : normalizeImportExistingStrategy(
        await getSettingValue('students.import.existing_strategy', 'update'),
      ) || 'update';
  const allowWeakPasswords = !!(await getSettingValue(
    'students.import.allow_weak_passwords',
    false,
  ));
  return { ok: true, existingStrategy, allowWeakPasswords };
}

function createStudentImportReport({ dryRun, received, existingStrategy, allowWeakPasswords }) {
  return {
    dryRun,
    options: { existingStrategy, allowWeakPasswords },
    totals: {
      received,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_existing: 0,
      skipped_invalid: 0,
      merged_duplicates: 0,
    },
    preview: [],
    errors: [],
    infos: [],
    // Contrat explicite : pas de filtre domaines OAuth / Moodle sur les e-mails du fichier.
    emailDomainRestrictionsApplied: false,
  };
}

/**
 * Étape 2 — Comptes existants indexés (appariement, homonymes, unicité), profils importables
 * et planchers de mot de passe.
 */
async function loadImportContext(actor, { allowWeakPasswords }) {
  const existingUsers = await queryAll(
    `SELECT u.id, u.user_type, u.first_name, u.last_name, u.pseudo, u.email,
            u.display_name, u.description,
            (u.password_hash IS NOT NULL AND u.password_hash <> '') AS has_password,
            r.slug AS role_slug, r.\`rank\` AS role_rank, ra.\`rank\` AS assigned_role_rank
       FROM users u
       LEFT JOIN user_roles ur
         ON ur.user_type = u.user_type AND ur.user_id = u.id AND ur.is_primary = 1
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN roles ra ON ra.id = u.assigned_role_id
      WHERE u.user_type IN ('student', 'teacher')`,
  );
  // Périmètre de l'acteur : sans vue globale, seuls les comptes de ses groupes sont
  // modifiables par le fichier (CDG-02) ; un compte enseignant existant ne l'est que par un
  // administrateur (CDG-03).
  const bypassScope = canBypassGroupScope(actor);
  const actorIsAdmin = String(actor?.roleSlug || '').toLowerCase() === 'admin';
  const existingByName = new Map(
    existingUsers.map((u) => [
      `${asTrimmedString(u.user_type).toLowerCase()}|${asTrimmedString(u.first_name).toLowerCase()}|${asTrimmedString(u.last_name).toLowerCase()}`,
      u,
    ]),
  );
  /*
   * Index « prénom + nom », tous types de compte confondus. L'appariement, lui, reste sur
   * `type|prénom|nom` — deux personnes distinctes peuvent être homonymes de part et d'autre.
   * Cet index sert uniquement à **signaler** une création qui ressemble à un doublon : c'est
   * la forme qu'avait prise la bascule des personnels en compte enseignant (le fichier les
   * décrivait comme élèves, plus aucune ligne ne retrouvait son compte, et l'import repartait
   * en création). Un signalement, pas un refus : bloquer priverait un vrai homonyme de compte.
   */
  const existingByNameAnyType = new Map();
  for (const u of existingUsers) {
    const key = `${asTrimmedString(u.first_name).toLowerCase()}|${asTrimmedString(u.last_name).toLowerCase()}`;
    if (!existingByNameAnyType.has(key)) existingByNameAnyType.set(key, []);
    existingByNameAnyType.get(key).push(u);
  }
  const pseudoOwner = new Map();
  const emailOwner = new Map();
  for (const u of existingUsers) {
    const p = asTrimmedString(u.pseudo).toLowerCase();
    const e = asTrimmedString(u.email).toLowerCase();
    if (p) pseudoOwner.set(p, u.id);
    if (e) emailOwner.set(e, u.id);
  }

  // Profils importables : tous les profils ForetMap (système et sur mesure), hors jeu G&L ;
  // chargés avant la validation des lignes pour que la colonne Rôle accepte aussi le **nom
  // affiché** du profil — renommable par un administrateur — et pas seulement son slug.
  const roleRows = await queryAll(
    "SELECT slug, id, display_name, `rank` FROM roles WHERE slug NOT LIKE 'gl\\_%'",
  );
  const roleIdBySlug = new Map();
  const roleLabelBySlug = new Map();
  const rolesBySlug = new Map();
  for (const r of roleRows) {
    roleIdBySlug.set(r.slug, r.id);
    rolesBySlug.set(r.slug, r);
    if (asTrimmedString(r.display_name))
      roleLabelBySlug.set(r.slug, asTrimmedString(r.display_name));
  }
  const roleAliases = buildRoleAliasesFromDbRows(roleRows);
  const knownRoleSlugs = new Set(roleIdBySlug.keys());

  const minPasswordStudent = await getPasswordMinLengthFor('student');
  const minPasswordTeacher = await getPasswordMinLengthFor('teacher');
  const passwordOpts = {
    minPasswordStudent,
    minPasswordTeacher,
    allowWeakPasswords,
    // Mot de passe requis seulement à la création ; vide à la mise à jour = inchangé.
    passwordRequired: false,
    knownRoleSlugs,
  };
  return {
    actor,
    bypassScope,
    actorIsAdmin,
    existingByName,
    existingByNameAnyType,
    pseudoOwner,
    emailOwner,
    roleIdBySlug,
    roleLabelBySlug,
    rolesBySlug,
    roleAliases,
    passwordOpts,
  };
}

/**
 * Étape 3 — Validation ligne à ligne (le numéro de ligne compte l'en-tête), puis fusion des
 * lignes décrivant le même compte.
 * @returns {Array<{ payload: object, rowNumber: number }>} lignes fusionnées
 */
function validateAndMergeRows(rawRows, ctx, report) {
  const candidateRows = [];
  /** Lignes acceptées dont la colonne Rôle était vide → profil par défaut. */
  const defaultedRoleRows = [];
  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const payload = buildImportStudentPayload(row, {
      roleAliases: ctx.roleAliases,
      rolesBySlug: ctx.rolesBySlug,
    });
    const errors = validateImportStudentPayload(payload, rowNumber, ctx.passwordOpts);

    if (!errors.length && payload.roleSlug) {
      const grant = checkRoleGrantAllowed(ctx.actor, ctx.rolesBySlug.get(payload.roleSlug));
      if (!grant.ok) errors.push({ row: rowNumber, field: 'role', error: grant.error });
    }

    if (errors.length > 0) {
      report.totals.skipped_invalid += 1;
      report.errors.push(...errors);
      return;
    }

    if (!payload.roleInput) defaultedRoleRows.push(rowNumber);
    candidateRows.push({ payload, rowNumber });
  });

  if (defaultedRoleRows.length > 0) {
    const defaultLabel = ctx.roleLabelBySlug.get('eleve_novice') || 'eleve_novice';
    report.infos.push({
      code: 'role_defaulted',
      rows: [...defaultedRoleRows],
      message: `${rowsPrefix(defaultedRoleRows)} ${defaultedRoleRows.join(', ')} : colonne Rôle vide → profil « ${defaultLabel} » (eleve_novice) par défaut.`,
    });
  }

  const { items: mergedRows, infos: mergeInfos } = mergeDuplicateStudentImportItems(candidateRows);
  report.infos.push(...mergeInfos);
  report.totals.merged_duplicates = mergeInfos.reduce(
    (acc, info) => acc + Math.max(0, (info.rows?.length || 0) - 1),
    0,
  );
  return mergedRows;
}

/**
 * Refus d'une ligne sur compte existant (stratégie, périmètre, compte protégé, propre compte)
 * ou d'une création sans mot de passe. Renvoie l'erreur à inscrire, ou `null`.
 */
async function rejectRowTarget({ payload, rowNumber, existing, existingStrategy }, ctx) {
  if (existing && existingStrategy === 'skip') {
    return {
      counter: 'skipped_existing',
      error: {
        row: rowNumber,
        field: 'name',
        error: 'Utilisateur déjà existant (type de compte + prénom + nom)',
      },
    };
  }
  if (!existing && !payload.password) {
    return {
      counter: 'skipped_invalid',
      error: { row: rowNumber, field: 'password', error: 'Mot de passe requis' },
    };
  }
  /*
   * Un compte enseignant existant ne se modifie que par un administrateur (CDG-03) —
   * **sauf** s'il porte le profil « Personnel ». Ce profil est un compte enseignant depuis
   * le réalignement du 22/09/2026, mais il n'a aucun droit d'encadrement : réserver la
   * tenue du fichier des personnels au seul administrateur reviendrait à protéger un agent
   * d'entretien comme on protège un n3boss. Un changement de profil reste soumis à
   * `checkRoleAssignmentAllowed` un peu plus bas.
   */
  const existingIsProtectedTeacher =
    existing &&
    existing.user_type === 'teacher' &&
    String(existing.role_slug || '').toLowerCase() !== 'personnel';
  if (existingIsProtectedTeacher && !ctx.actorIsAdmin) {
    return {
      counter: 'skipped_invalid',
      error: {
        row: rowNumber,
        field: 'name',
        error: 'Seul un administrateur peut modifier un compte enseignant existant',
      },
    };
  }
  if (
    existing &&
    existing.user_type === 'student' &&
    !ctx.bypassScope &&
    !(await canAccessStudentId(ctx.actor, existing.id))
  ) {
    return {
      counter: 'skipped_invalid',
      error: {
        row: rowNumber,
        field: 'name',
        error: 'Compte hors de votre périmètre (élève d’une autre classe)',
      },
    };
  }
  if (existing && String(existing.id) === String(ctx.actor?.userId)) {
    return {
      counter: 'skipped_invalid',
      error: {
        row: rowNumber,
        field: 'name',
        error: 'Votre propre compte ne se modifie pas par import',
      },
    };
  }
  return null;
}

/**
 * Cellule Rôle vide sur un compte existant = profil inchangé (CDG-23) ; un profil de rang
 * inférieur ou égal au profil actuel (effectif ou attribué) aussi : un ré-import ne
 * rétrograde jamais un compte.
 * @returns {{ roleChangeRequested: boolean, keptHigherRole: boolean }}
 */
function resolveRoleChange(payload, existing, ctx) {
  let roleChangeRequested = !!payload.roleInput;
  let keptHigherRole = false;
  if (existing && roleChangeRequested) {
    const existingRanks = [existing.role_rank, existing.assigned_role_rank]
      .filter((r) => r != null)
      .map(Number)
      .filter(Number.isFinite);
    const existingRank = existingRanks.length ? Math.max(...existingRanks) : null;
    const importedRank = ctx.rolesBySlug.get(payload.roleSlug)?.rank;
    if (shouldKeepExistingImportRole(existingRank, importedRank)) {
      roleChangeRequested = false;
      if (existing.role_slug && existing.role_slug !== payload.roleSlug) keptHigherRole = true;
    }
  }
  return { roleChangeRequested, keptHigherRole };
}

/** Pseudo et e-mail écrits par la ligne, uniques dans la base comme dans le fichier. */
function checkRowUniqueness({ rowNumber, existing, writtenPseudo, writtenEmail }, ctx) {
  const uniquenessErrors = [];
  if (writtenPseudo) {
    const ownerId = ctx.pseudoOwner.get(writtenPseudo.toLowerCase());
    if (ownerId && (!existing || ownerId !== existing.id)) {
      uniquenessErrors.push({ row: rowNumber, field: 'pseudo', error: 'Pseudo déjà utilisé' });
    }
  }
  if (writtenEmail) {
    const ownerId = ctx.emailOwner.get(writtenEmail.toLowerCase());
    if (ownerId && (!existing || ownerId !== existing.id)) {
      uniquenessErrors.push({ row: rowNumber, field: 'email', error: 'Email déjà utilisé' });
    }
  }
  return uniquenessErrors;
}

function previewEntry(rowItem, { existing, roleChangeRequested, profileUpdates }) {
  const { payload } = rowItem;
  return {
    row: rowItem.rowNumber,
    action: existing ? 'update' : 'create',
    role_slug: existing && !roleChangeRequested ? existing.role_slug || null : payload.roleSlug,
    user_type: payload.userType,
    first_name: payload.firstName,
    last_name: payload.lastName,
    groups: (payload.groupRefs || []).map((r) => r.path.join(' > ')).join(' | ') || null,
    ...(existing
      ? {
          fields: Object.keys(profileUpdates).filter((k) => k !== 'display_name'),
          role_kept: !roleChangeRequested && !!payload.roleInput,
        }
      : {}),
  };
}

/**
 * Étape 4 — Plan de chaque ligne fusionnée : création ou mise à jour, ou refus inscrit au
 * rapport. Les contrôles asynchrones (périmètre, changement de profil) sont faits ligne après
 * ligne, dans l'ordre du fichier.
 */
async function planRows(mergedRows, ctx, report, { existingStrategy }) {
  const validRows = [];
  /** Comptes existants dont le profil actuel, plus élevé, est conservé. */
  const keptHigherRoleRows = [];
  /** Lignes créées alors qu'un homonyme existe sous l'autre type de compte. */
  const crossTypeHomonymRows = [];
  for (const rowItem of mergedRows) {
    const { payload, rowNumber } = rowItem;
    const keyByName = `${payload.userType}|${payload.firstName.toLowerCase()}|${payload.lastName.toLowerCase()}`;
    const existing = ctx.existingByName.get(keyByName) || null;

    const refusal = await rejectRowTarget({ payload, rowNumber, existing, existingStrategy }, ctx);
    if (refusal) {
      report.totals[refusal.counter] += 1;
      report.errors.push(refusal.error);
      continue;
    }

    const { roleChangeRequested, keptHigherRole } = resolveRoleChange(payload, existing, ctx);
    if (keptHigherRole) keptHigherRoleRows.push(rowNumber);
    if (existing && roleChangeRequested) {
      const roleCheck = await checkRoleAssignmentAllowed({
        actor: ctx.actor,
        userType: existing.user_type,
        userId: existing.id,
        nextRole: ctx.rolesBySlug.get(payload.roleSlug),
      });
      if (!roleCheck.ok) {
        report.totals.skipped_invalid += 1;
        report.errors.push({ row: rowNumber, field: 'role', error: roleCheck.error });
        continue;
      }
    }

    const profileUpdates = existing
      ? resolveImportProfileUpdates(existing, payload, existingStrategy)
      : null;
    const writtenPseudo = existing ? profileUpdates.pseudo : payload.pseudo;
    const writtenEmail = existing ? profileUpdates.email : payload.email;

    const uniquenessErrors = checkRowUniqueness(
      { rowNumber, existing, writtenPseudo, writtenEmail },
      ctx,
    );
    if (uniquenessErrors.length > 0) {
      report.totals.skipped_invalid += 1;
      report.errors.push(...uniquenessErrors);
      continue;
    }

    if (writtenPseudo) {
      ctx.pseudoOwner.set(writtenPseudo.toLowerCase(), existing?.id || '__pending__');
    }
    if (writtenEmail) {
      ctx.emailOwner.set(writtenEmail.toLowerCase(), existing?.id || '__pending__');
    }
    if (!existing) {
      const homonyms = ctx.existingByNameAnyType.get(
        `${payload.firstName.toLowerCase()}|${payload.lastName.toLowerCase()}`,
      );
      if (Array.isArray(homonyms) && homonyms.length > 0) crossTypeHomonymRows.push(rowNumber);
    }

    validRows.push({
      ...rowItem,
      existing,
      action: existing ? 'update' : 'create',
      roleChangeRequested,
      profileUpdates,
    });
    if (report.preview.length < 20) {
      report.preview.push(previewEntry(rowItem, { existing, roleChangeRequested, profileUpdates }));
    }
  }

  if (keptHigherRoleRows.length > 0) {
    report.infos.push({
      code: 'role_kept_higher',
      rows: [...keptHigherRoleRows],
      message:
        `${rowsPrefix(keptHigherRoleRows)} ${keptHigherRoleRows.join(', ')} : le compte a déjà un profil de niveau ` +
        'supérieur ou égal à celui du fichier — son profil actuel est conservé.',
    });
  }

  if (crossTypeHomonymRows.length > 0) {
    report.infos.push({
      code: 'cross_type_homonym',
      rows: [...crossTypeHomonymRows],
      message:
        `${rowsPrefix(crossTypeHomonymRows)} ${crossTypeHomonymRows.join(', ')} : un compte du même prénom et nom existe ` +
        'déjà sous l’autre type de compte. L’import va créer un compte séparé. S’il s’agit ' +
        'de la même personne, corrigez la colonne Rôle du fichier (le type de compte en ' +
        'découle) plutôt que de créer un doublon.',
    });
  }
  return validRows;
}

/**
 * Étape 5a — L'aperçu simule aussi les groupes : ceux qui seraient créés, et les références
 * qui seraient refusées (hors périmètre, groupe inactif) — sans rien écrire (CDG-51).
 */
async function previewImportGroups(validRows, actor, report) {
  const groupsIndex = await loadGroupsIndex();
  const toCreate = new Set();
  for (const rowItem of validRows) {
    const refs = rowItem.payload.groupRefs || [];
    if (refs.length === 0) continue;
    const preview = await previewGroupRefs(actor, refs, groupsIndex);
    for (const path of preview.toCreate) toCreate.add(path);
    for (const errMsg of preview.errors) {
      report.errors.push({ row: rowItem.rowNumber, field: 'groups', error: errMsg });
    }
  }
  report.totals.groups_to_create = toCreate.size;
  if (toCreate.size > 0) {
    report.infos.push({
      code: 'groups_to_create',
      message: `Groupes qui seraient créés : ${[...toCreate].join(', ')}.`,
    });
  }
}

/** Mise à jour d'un compte existant : champs retenus, mot de passe (sessions révoquées), profil. */
async function updateImportedAccount({ existing, profileUpdates, roleChangeRequested, roleId }) {
  const sets = ['updated_at = NOW()'];
  const params = [];
  for (const col of ['display_name', 'email', 'pseudo', 'description']) {
    if (hasOwn(profileUpdates, col)) {
      sets.push(`${col} = ?`);
      params.push(profileUpdates[col]);
    }
  }
  let passwordChanged = false;
  if (profileUpdates.password) {
    const hash = await bcrypt.hash(profileUpdates.password, 10);
    sets.push('password_hash = ?');
    params.push(hash);
    passwordChanged = true;
  }
  params.push(existing.id);
  await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  if (passwordChanged) {
    await bumpUserTokenEpoch(existing.id);
  }
  if (roleChangeRequested && roleId != null) {
    await setAssignedRole(existing.id, roleId);
  }
}

/** Création d'un compte local, profil effectif posé aussitôt. @returns {Promise<string>} id */
async function createImportedAccount({ payload, roleId, displayName }) {
  const hash = await bcrypt.hash(payload.password, 10);
  const id = crypto.randomUUID();
  const now = nowDbTimestamp();
  await execute(
    `INSERT INTO users
      (id, user_type, assigned_role_id, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, 'local', 1, ?, NOW(), NOW())`,
    [
      id,
      payload.userType,
      roleId ?? null,
      payload.email,
      payload.pseudo,
      payload.firstName,
      payload.lastName,
      displayName,
      payload.description,
      hash,
      now,
    ],
  );
  // Profil effectif posé aussitôt : une panne plus loin dans la boucle ne laisse pas de
  // compte sans profil (CDG-51) ; le rattachement aux groupes, plus bas, recalcule.
  await recomputeUserRole(id);
  return id;
}

/**
 * Étape 5b — Écriture ligne à ligne. Un conflit d'unicité révélé par la base (course avec
 * une autre écriture) est inscrit au rapport ; toute autre erreur interrompt l'import.
 * @returns {Promise<Array<{ id: string, userType: string, groupRefs: object[], rowNumber: number }>>}
 */
async function writeImportedAccounts(validRows, ctx, report) {
  const usersForGroups = [];
  for (const rowItem of validRows) {
    const { payload, rowNumber, action, existing, roleChangeRequested, profileUpdates } = rowItem;
    const roleId = ctx.roleIdBySlug.get(payload.roleSlug);
    const displayName = `${payload.firstName} ${payload.lastName}`.trim();
    const hasGroups = Array.isArray(payload.groupRefs) && payload.groupRefs.length > 0;

    try {
      if (action === 'update' && existing?.id) {
        await updateImportedAccount({ existing, profileUpdates, roleChangeRequested, roleId });
        report.totals.updated += 1;
        if (hasGroups) {
          usersForGroups.push({
            id: existing.id,
            userType: payload.userType,
            groupRefs: payload.groupRefs,
            rowNumber,
          });
        }
        continue;
      }

      const id = await createImportedAccount({ payload, roleId, displayName });
      report.totals.created += 1;
      if (hasGroups) {
        usersForGroups.push({
          id,
          userType: payload.userType,
          groupRefs: payload.groupRefs,
          rowNumber,
        });
      }
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        report.totals.skipped_existing += 1;
        report.errors.push({
          row: rowNumber,
          field: 'unique',
          error: `Conflit d'unicité pour ${payload.firstName} ${payload.lastName}`,
        });
        continue;
      }
      throw err;
    }
  }
  return usersForGroups;
}

/** Étape 5c — Rattachement aux groupes (créés au besoin, dans le périmètre de l'acteur). */
async function attachImportedAccountsToGroups(usersForGroups, actor, report) {
  if (usersForGroups.length === 0) return;
  const groupsIndex = await loadGroupsIndex();
  for (const item of usersForGroups) {
    const attach = await attachUserToGroupRefs(
      actor,
      item.id,
      item.userType,
      item.groupRefs,
      groupsIndex,
    );
    report.totals.groups_created += attach.created.length;
    report.totals.groups_attached += attach.attached.length;
    for (const errMsg of attach.errors) {
      report.errors.push({
        row: item.rowNumber,
        field: 'groups',
        error: errMsg,
      });
    }
  }
}

/**
 * Import d'un fichier de comptes.
 *
 * @param {object} params
 * @param {object} params.body corps de la requête (`fileDataBase64`, `fileName`, `dryRun`,
 *   `existingStrategy`)
 * @param {object} params.actor `req.auth` de l'acteur (périmètre, profils attribuables)
 * @param {object} [params.auditReq] requête transmise telle quelle au journal d'audit
 * @returns {Promise<{ ok: false, status: number, error: string } | { ok: true, report: object }>}
 *   Une erreur de lecture du fichier (« Fichier requis »…) est levée, comme avant.
 */
async function importStudentAccounts({ body, actor, auditReq }) {
  const dryRun = !!body?.dryRun;
  const rawRows = await resolveImportRows(body || {});
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return rejected(400, 'Aucune ligne importable détectée');
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    return rejected(400, `Import limité à ${MAX_IMPORT_ROWS} lignes`);
  }
  const options = await resolveImportOptions(body);
  if (!options.ok) return options;
  const { existingStrategy, allowWeakPasswords } = options;

  const report = createStudentImportReport({
    dryRun,
    received: rawRows.length,
    existingStrategy,
    allowWeakPasswords,
  });
  const ctx = await loadImportContext(actor, { allowWeakPasswords });
  const mergedRows = validateAndMergeRows(rawRows, ctx, report);
  const validRows = await planRows(mergedRows, ctx, report, { existingStrategy });

  report.totals.valid = validRows.length;
  report.totals.groups_created = 0;
  report.totals.groups_attached = 0;

  if (dryRun && validRows.length > 0) await previewImportGroups(validRows, actor, report);
  if (dryRun || validRows.length === 0) return { ok: true, report };

  const usersForGroups = await writeImportedAccounts(validRows, ctx, report);
  await attachImportedAccountsToGroups(usersForGroups, actor, report);

  if (report.totals.created > 0 || report.totals.updated > 0) {
    logAudit(
      'students_import',
      'user',
      null,
      `Import de ${report.totals.created} compte(s) créé(s), ${report.totals.updated} mis à jour`,
      {
        req: auditReq,
        payload: { report: report.totals, options: report.options },
      },
    );
    emitStudentsChanged({
      reason: 'students_import',
      created: report.totals.created,
      updated: report.totals.updated,
    });
  }
  return { ok: true, report };
}

module.exports = { importStudentAccounts };
