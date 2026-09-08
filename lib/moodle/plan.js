'use strict';

/**
 * Calcul du plan d'écritures (section 12.1, étape 4) — module pur.
 *
 * Entrées : la lecture Moodle (`snapshot.js`), les décisions de rapprochement (`matching.js`),
 * l'état local (`localState.js`) et les réglages. Sortie : la liste **complète** des écritures
 * envisagées, cohorte par cohorte, plus les listes d'information du rapport (section 14.4) et
 * les conflits détectés par la comparaison à trois (section 9), **sans rien écrire**.
 *
 * Genres d'action (`kind`) :
 *  - `user.create`, `user.link`, `user.deactivate`
 *  - `group.ensure`, `group.rename`
 *  - `group.member.add`, `group.member.adopt` (déjà présent, posé à la main), `group.member.remove`
 *  - `gl_class.ensure`, `gl_player.ensure`, `gl_player.move`
 *  - sortants (vers Moodle, `push_membership`) : `cohort.member.add`, `cohort.member.remove`
 *
 * La comparaison à trois (M = Moodle, F = ForetMap, H = dernier état commun) est déléguée aux
 * fonctions pures de `reconcile.js` (table de décision de la section 9) ; ce module traduit
 * chaque décision en action, sortant ou conflit. Un membre ajouté à la main dans un groupe
 * miroir reste en place (I-4) : le conflit `member_added_on_mirror` attend la décision d'un
 * administrateur, sauf `push_membership` où l'ajout part vers Moodle.
 */

const { isSuspended, candidateView } = require('./matching');
const { reconcileMembers, reconcileName } = require('./reconcile');

const REPORT_LIST_CAP = 500;

function userView(user) {
  if (!user) return null;
  return candidateView(user);
}

function memberView(member) {
  if (!member) return null;
  return {
    externalId: String(member.id),
    username: member.username || null,
    firstName: member.firstname || '',
    lastName: member.lastname || '',
    email: member.email || '',
    suspended: isSuspended(member),
  };
}

function cap(list) {
  return list.length > REPORT_LIST_CAP ? list.slice(0, REPORT_LIST_CAP) : list;
}

/**
 * @param {object} args
 * @param {object} args.snapshot lecture Moodle
 * @param {Map<string, object>} args.decisions décisions de rapprochement par `external_id`
 * @param {object} args.local état local
 */
function buildPlan({ snapshot, decisions, local }) {
  const actions = [];
  const outbound = [];
  const conflicts = [];
  const cohorts = [];
  const lists = {
    creations: [],
    emailMatches: [],
    nameMatches: [],
    deactivations: [],
    probableDuplicates: [],
    emailConflicts: [],
    pendingMatches: [],
    skippedNoCreate: [],
    exempt: [],
    suspendedLinked: [],
    inactiveInCohort: [],
    offMoodle: [],
    playersWithoutIdentity: [],
    unmatchedCohorts: (snapshot.unmatchedCohorts || []).map((c) => ({ ...c })),
    unknownRequestedCohortIds: [...(snapshot.unknownRequestedCohortIds || [])],
    alerts: [],
  };
  const emptiedCohorts = [];

  const createdExternalIds = new Set();
  const linkedExternalIds = new Set();
  const glClassMembership = new Map(); // userId → [idnumber] (A6 : deux classes joueuses)
  const seenInScope = new Set(); // users.id (ou `ext:<id>`) présents dans une cohorte du périmètre
  const inScopeExternalGroupIds = new Set();

  const push = (action) => {
    actions.push(action);
    return action;
  };

  for (const cohort of snapshot.cohorts) {
    const policy = cohort.policy;
    const eg = local.externalGroupsByKey.get(`cohort:${cohort.id}`) || null;
    if (eg) inScopeExternalGroupIds.add(Number(eg.id));
    const cohortEntry = {
      cohortId: cohort.id,
      idnumber: cohort.idnumber,
      name: cohort.name,
      policyKey: policy.key,
      moodleMemberCount: cohort.memberIds.length,
      groupId: eg?.group_id || null,
      glClassId: null,
      actions: 0,
      skipped: false,
    };
    cohorts.push(cohortEntry);

    if (eg && Number(eg.group_sync_exempt) === 1) {
      cohortEntry.skipped = true;
      lists.alerts.push({
        code: 'group_exempt',
        cohort: cohort.idnumber,
        message: `Le groupe lié à la cohorte ${cohort.idnumber} est marqué hors synchronisation : cohorte ignorée`,
      });
      continue;
    }

    const groupRef = eg?.group_id ? { groupId: eg.group_id } : { newGroupFor: cohort.idnumber };
    const groupExists = Boolean(eg?.group_id && eg.group_name != null);
    if (!groupExists) {
      push({
        kind: 'group.ensure',
        cohort: cohort.idnumber,
        cohortId: cohort.id,
        payload: {
          externalGroupId: eg?.id || null,
          name: cohort.name,
          idnumber: cohort.idnumber,
          groupKind: policy.group_kind,
          roleSlug: policy.role,
          n3beur: Boolean(policy.n3beur),
          policyKey: policy.key,
        },
      });
    } else {
      const nameDecision = reconcileName({
        moodle: cohort.name,
        foretmap: eg.group_name,
        last: eg.external_name,
        master: eg.master,
      });
      if (nameDecision === 'rename') {
        push({
          kind: 'group.rename',
          cohort: cohort.idnumber,
          cohortId: cohort.id,
          payload: { groupId: eg.group_id, from: eg.group_name, to: cohort.name },
        });
      } else if (nameDecision === 'conflict') {
        conflicts.push({
          cohort: cohort.idnumber,
          externalGroupId: eg.id,
          userId: null,
          kind: 'name_changed',
          moodleState: cohort.name,
          foretmapState: eg.group_name,
          member: null,
          user: null,
        });
      }
    }

    let glClass = null;
    if (policy.gl_class) {
      glClass =
        (eg?.gl_class_id && local.glClassesById.get(Number(eg.gl_class_id))) ||
        (eg?.group_id && local.glClassesByGroupId.get(String(eg.group_id))) ||
        null;
      cohortEntry.glClassId = glClass ? Number(glClass.id) : null;
      if (!glClass) {
        push({
          kind: 'gl_class.ensure',
          cohort: cohort.idnumber,
          cohortId: cohort.id,
          payload: { name: cohort.name, ...groupRef },
        });
      }
    }

    // --- Membres désirés (F cible) -----------------------------------------------------------
    const desired = new Map(); // userId | ext:<id> → { externalId, member, user? }
    for (const externalId of cohort.memberIds) {
      const member = snapshot.users.get(externalId);
      const decision = decisions.get(externalId);
      if (!member || !decision) {
        lists.alerts.push({
          code: 'member_details_missing',
          cohort: cohort.idnumber,
          externalId,
          message: `Détails introuvables pour le membre Moodle ${externalId} de ${cohort.idnumber}`,
        });
        continue;
      }
      const suspended = isSuspended(member);
      switch (decision.rule) {
        case 'exempt':
          lists.exempt.push({
            cohort: cohort.idnumber,
            member: memberView(member),
            user: userView(decision.user),
          });
          if (decision.userId) seenInScope.add(String(decision.userId));
          break;
        case 'conflict':
          lists.emailConflicts.push({
            cohort: cohort.idnumber,
            reason: decision.reason,
            member: memberView(member),
            candidates: decision.candidates || [],
          });
          break;
        case 'pending':
          lists.pendingMatches.push({
            cohort: cohort.idnumber,
            reason: decision.reason,
            member: memberView(member),
            candidates: decision.candidates || [],
          });
          break;
        case 'skipped':
          lists.skippedNoCreate.push({ cohort: cohort.idnumber, member: memberView(member) });
          break;
        case 'create': {
          if (suspended) break; // On ne crée pas un compte pour un membre suspendu.
          if (!createdExternalIds.has(externalId)) {
            createdExternalIds.add(externalId);
            push({
              kind: 'user.create',
              cohort: cohort.idnumber,
              cohortId: cohort.id,
              externalId,
              payload: {
                firstName: member.firstname,
                lastName: member.lastname,
                email: member.email,
                username: member.username,
                idnumber: member.idnumber,
              },
            });
            lists.creations.push({ cohort: cohort.idnumber, member: memberView(member) });
          }
          desired.set(`ext:${externalId}`, { externalId, member, user: null });
          seenInScope.add(`ext:${externalId}`);
          break;
        }
        case 'identity':
        case 'email':
        case 'name': {
          const userId = String(decision.userId);
          const user = decision.user || local.usersById.get(userId) || null;
          seenInScope.add(userId);
          if (decision.rule !== 'identity' && !linkedExternalIds.has(externalId)) {
            linkedExternalIds.add(externalId);
            push({
              kind: 'user.link',
              cohort: cohort.idnumber,
              cohortId: cohort.id,
              externalId,
              userId,
              payload: {
                rule: decision.rule,
                username: member.username,
                idnumber: member.idnumber,
                email: member.email,
                firstName: member.firstname,
                lastName: member.lastname,
                fillEmail: !user?.email,
                fillFirstName: !user?.first_name,
                fillLastName: !user?.last_name,
                wasBridge: String(user?.auth_provider || '') === 'gl_bridge',
              },
            });
            const view = {
              cohort: cohort.idnumber,
              member: memberView(member),
              user: userView(user),
            };
            if (decision.rule === 'email') {
              lists.emailMatches.push(view);
              for (const dup of decision.probableDuplicates || []) {
                lists.probableDuplicates.push({ ...view, duplicate: dup });
              }
            } else {
              lists.nameMatches.push(view);
            }
          }
          if (suspended) {
            if (decision.identity?.origin === 'created') {
              // Désactivation décidée plus bas (règle globale), on note seulement la raison.
              lists.suspendedLinked.push({
                cohort: cohort.idnumber,
                member: memberView(member),
                user: userView(user),
                createdBySync: true,
              });
            } else {
              lists.suspendedLinked.push({
                cohort: cohort.idnumber,
                member: memberView(member),
                user: userView(user),
                createdBySync: false,
              });
            }
            break;
          }
          if (user && Number(user.is_active) !== 1) {
            lists.inactiveInCohort.push({
              cohort: cohort.idnumber,
              member: memberView(member),
              user: userView(user),
            });
          }
          desired.set(userId, { externalId, member, user });
          break;
        }
        default:
          break;
      }
    }

    // --- Comparaison à trois sur les appartenances ------------------------------------------
    const realMembers = eg?.group_id
      ? local.groupMembersByGroupId.get(String(eg.group_id)) || new Set()
      : new Set();
    const syncMembers = eg?.syncMembers || new Map();
    const lastMembers = new Set(eg?.lastMembers || []);
    const isEligible = (userId) => {
      const user = local.usersById.get(userId);
      return Boolean(user) && Number(user.sync_exempt) !== 1 && user.user_type === 'student';
    };
    const reconciled = reconcileMembers({
      moodle: [...desired.keys()].filter((k) => !k.startsWith('ext:')),
      foretmap: realMembers,
      last: lastMembers,
      tracked: syncMembers,
      master: eg?.master || 'moodle',
      pushMembership: Boolean(policy.push_membership),
      teamMirror: false,
      isEligible,
    });
    const memberDecision = new Map(reconciled.decisions.map((d) => [d.userId, d]));
    for (const notice of reconciled.notices) {
      lists.alerts.push({
        code: notice.code,
        cohort: cohort.idnumber,
        userId: notice.userId,
        message: notice.message,
      });
    }

    for (const [key, entry] of desired) {
      if (key.startsWith('ext:')) {
        push({
          kind: 'group.member.add',
          cohort: cohort.idnumber,
          cohortId: cohort.id,
          externalId: entry.externalId,
          userRef: key,
          payload: { ...groupRef },
        });
        if (policy.gl_class) {
          push({
            kind: 'gl_player.ensure',
            cohort: cohort.idnumber,
            cohortId: cohort.id,
            externalId: entry.externalId,
            userRef: key,
            payload: {
              glClassId: glClass ? Number(glClass.id) : null,
              newClassFor: glClass ? null : cohort.idnumber,
            },
          });
        }
        continue;
      }
      const userId = key;
      const decision = memberDecision.get(userId)?.decision || 'noop';
      switch (decision) {
        case 'adopt':
          push({
            kind: 'group.member.adopt',
            cohort: cohort.idnumber,
            cohortId: cohort.id,
            userId,
            payload: { ...groupRef },
          });
          break;
        case 'add':
          push({
            kind: 'group.member.add',
            cohort: cohort.idnumber,
            cohortId: cohort.id,
            externalId: entry.externalId,
            userId,
            payload: { ...groupRef },
          });
          break;
        case 'outbound_remove': {
          // Le reflet a bougé (retiré à la main côté ForetMap) et il a le droit d'écrire vers Moodle.
          const identity = local.identitiesByUserId.get(userId);
          outbound.push({
            kind: 'cohort.member.remove',
            cohort: cohort.idnumber,
            cohortId: cohort.id,
            userId,
            payload: { moodleUserId: identity ? String(identity.external_id) : entry.externalId },
          });
          break;
        }
        case 'conflict_removed':
          conflicts.push({
            cohort: cohort.idnumber,
            externalGroupId: eg?.id || null,
            userId,
            kind: 'member_removed_on_mirror',
            moodleState: 'member',
            foretmapState: 'absent',
            member: memberView(entry.member),
            user: userView(entry.user),
          });
          break;
        default:
          break; // accord des deux côtés, appartenance déjà suivie (I-8)
      }

      if (policy.gl_class) {
        const list = glClassMembership.get(userId) || [];
        list.push(cohort.idnumber);
        glClassMembership.set(userId, list);
        const player = local.playersByUserId.get(userId) || null;
        if (!player) {
          push({
            kind: 'gl_player.ensure',
            cohort: cohort.idnumber,
            cohortId: cohort.id,
            userId,
            payload: {
              glClassId: glClass ? Number(glClass.id) : null,
              newClassFor: glClass ? null : cohort.idnumber,
            },
          });
        } else if (glClass && Number(player.class_id) !== Number(glClass.id)) {
          if (Number(player.in_live_game) === 1) {
            lists.alerts.push({
              code: 'player_in_live_game',
              cohort: cohort.idnumber,
              userId,
              message: `Le joueur lié au compte ${userId} change de classe mais joue une partie en cours : déplacement différé (I-10)`,
            });
          } else {
            push({
              kind: 'gl_player.move',
              cohort: cohort.idnumber,
              cohortId: cohort.id,
              userId,
              payload: {
                playerId: Number(player.id),
                fromClassId: Number(player.class_id),
                toClassId: Number(glClass.id),
              },
            });
          }
        } else if (!glClass && player) {
          // La classe sera créée par `gl_class.ensure` ; le joueur y sera déplacé à l'application.
          if (Number(player.in_live_game) !== 1) {
            push({
              kind: 'gl_player.move',
              cohort: cohort.idnumber,
              cohortId: cohort.id,
              userId,
              payload: {
                playerId: Number(player.id),
                fromClassId: Number(player.class_id),
                toClassId: null,
                newClassFor: cohort.idnumber,
              },
            });
          }
        }
      }
    }

    // Appartenances suivies dont le membre a quitté la cohorte : `remove` retire une appartenance
    // posée par la synchronisation ; `untrack` oublie seulement un suivi périmé (I-4).
    for (const d of reconciled.decisions) {
      if (d.decision !== 'remove' && d.decision !== 'untrack') continue;
      const user = local.usersById.get(d.userId);
      if (user && Number(user.sync_exempt) === 1) continue;
      push({
        kind: 'group.member.remove',
        cohort: cohort.idnumber,
        cohortId: cohort.id,
        userId: d.userId,
        payload: {
          groupId: eg.group_id,
          inGroup: realMembers.has(d.userId),
          source: d.source,
          keepMembership: d.decision !== 'remove',
        },
      });
    }

    // Membres ajoutés à la main côté ForetMap, absents de Moodle : le reflet a bougé.
    for (const d of reconciled.decisions) {
      if (d.decision !== 'outbound_add' && d.decision !== 'conflict_added') continue;
      if (!eg?.group_id) continue;
      const userId = d.userId;
      const user = local.usersById.get(userId) || null;
      if (d.decision === 'outbound_add') {
        const identity = local.identitiesByUserId.get(userId);
        if (!identity) {
          lists.alerts.push({
            code: 'push_membership_without_identity',
            cohort: cohort.idnumber,
            userId,
            message: `Membre ajouté dans ForetMap sans identité Moodle : impossible de l’inscrire à la cohorte ${cohort.idnumber}`,
          });
          continue;
        }
        outbound.push({
          kind: 'cohort.member.add',
          cohort: cohort.idnumber,
          cohortId: cohort.id,
          userId,
          payload: { moodleUserId: String(identity.external_id) },
        });
      } else {
        conflicts.push({
          cohort: cohort.idnumber,
          externalGroupId: eg.id,
          userId,
          kind: 'member_added_on_mirror',
          moodleState: 'absent',
          foretmapState: 'member',
          member: null,
          user: userView(user),
        });
      }
    }

    if (eg && (eg.lastMembers || []).length > 0 && cohort.memberIds.length === 0) {
      emptiedCohorts.push({ cohort: cohort.idnumber, previousCount: eg.lastMembers.length });
    }

    cohortEntry.actions = actions.filter((a) => a.cohortId === cohort.id).length;
  }

  // A6 : un même compte dans deux cohortes joueuses → alerte, pas de seconde classe.
  for (const [userId, idnumbers] of glClassMembership) {
    if (idnumbers.length > 1) {
      lists.alerts.push({
        code: 'player_in_two_gl_cohorts',
        userId,
        cohorts: idnumbers,
        message: `Le compte ${userId} appartient à deux cohortes joueuses (${idnumbers.join(', ')}) : classe G&L inchangée`,
      });
      for (let i = actions.length - 1; i >= 0; i -= 1) {
        const a = actions[i];
        if ((a.kind === 'gl_player.move' || a.kind === 'gl_player.ensure') && a.userId === userId) {
          actions.splice(i, 1);
        }
      }
    }
  }

  // --- Désactivations (I-4 : comptes créés par la synchronisation seulement) -----------------
  const suspendedCreated = new Set(
    lists.suspendedLinked.filter((s) => s.createdBySync).map((s) => String(s.user?.userId)),
  );
  for (const identity of local.identitiesByExternalId.values()) {
    if (identity.origin !== 'created') continue;
    const user = identity.user;
    if (!user || Number(user.is_active) !== 1 || Number(user.sync_exempt) === 1) continue;
    const userId = String(user.id);
    const wasInScope = local.externalGroups.some(
      (g) => inScopeExternalGroupIds.has(Number(g.id)) && g.syncMembers.get(userId) === 'sync',
    );
    const stillKnownElsewhere = local.externalGroups.some(
      (g) => !inScopeExternalGroupIds.has(Number(g.id)) && g.syncMembers.get(userId) === 'sync',
    );
    const gone = wasInScope && !seenInScope.has(userId) && !stillKnownElsewhere;
    const suspended = suspendedCreated.has(userId);
    if (gone || suspended) {
      push({
        kind: 'user.deactivate',
        cohort: null,
        cohortId: null,
        userId,
        payload: { reason: suspended ? 'suspended_in_moodle' : 'gone_from_cohorts' },
      });
      lists.deactivations.push({
        user: userView(user),
        reason: suspended ? 'suspended_in_moodle' : 'gone_from_cohorts',
      });
    }
  }

  // --- Informations (section 11 : jamais des écritures) ---------------------------------------
  for (const user of local.users) {
    if (user.user_type !== 'student' || Number(user.is_active) !== 1) continue;
    if (local.identitiesByUserId.has(String(user.id))) continue;
    lists.offMoodle.push(userView(user));
  }
  for (const [userId, player] of local.playersByUserId) {
    if (local.identitiesByUserId.has(userId)) continue;
    const user = local.usersById.get(userId);
    lists.playersWithoutIdentity.push({
      playerId: Number(player.id),
      classId: Number(player.class_id),
      user: userView(user),
    });
  }

  const counts = {
    actions: actions.length,
    outbound: outbound.length,
    conflicts: conflicts.length,
    creations: lists.creations.length,
    emailMatches: lists.emailMatches.length,
    nameMatches: lists.nameMatches.length,
    deactivations: lists.deactivations.length,
    probableDuplicates: lists.probableDuplicates.length,
    emailConflicts: lists.emailConflicts.length,
    pendingMatches: lists.pendingMatches.length,
    offMoodle: lists.offMoodle.length,
    playersWithoutIdentity: lists.playersWithoutIdentity.length,
    unmatchedCohorts: lists.unmatchedCohorts.length,
    membersProcessed: [...new Set(snapshot.cohorts.flatMap((c) => c.memberIds))].length,
    outboundRemovals: outbound.filter((o) => o.kind === 'cohort.member.remove').length,
    groupAdds: actions.filter((a) => a.kind === 'group.member.add').length,
    groupRemoves: actions.filter(
      (a) => a.kind === 'group.member.remove' && !a.payload.keepMembership,
    ).length,
    alerts: lists.alerts.length,
  };

  const cappedLists = {};
  for (const [key, list] of Object.entries(lists)) cappedLists[key] = cap(list);

  return { cohorts, actions, outbound, conflicts, lists: cappedLists, counts, emptiedCohorts };
}

module.exports = { buildPlan, REPORT_LIST_CAP };
