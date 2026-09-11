'use strict';

/**
 * Rapprochement des identités Moodle ↔ comptes `users` (section 8 du chantier Moodle).
 *
 * Module pur : il reçoit les membres Moodle et un état local déjà chargé (`localState.js`),
 * ne touche pas à la base et rend, pour chaque membre, une décision motivée. L'ordre des
 * règles est celui de la section 8.1 — arrêt à la première correspondance :
 *
 *  1. identité externe connue `(provider, issuer, external_id)` ;
 *  2. e-mail égal (insensible à la casse) sur tous les types de compte — un e-mail porté par
 *     un compte enseignant est un **conflit**, pas une correspondance ;
 *  3. prénom + nom normalisés, **uniques des deux côtés** ; homonymes ⇒ en attente ;
 *  4. création si la politique de la cohorte le permit (`create_accounts`).
 *
 * Contrôles amont (8.3) : problèmes **par membre** (`runUpstreamChecks`) — les comptes
 * concernés sont laissés de côté ; le reste de l'exécution continue.
 */

/** Minuscules, sans accents, séparateurs réduits à un espace, bords supprimés. */
function normalizeNamePart(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s\-_'’.]+/g, ' ')
    .trim();
}

/** Clé de comparaison « prénom nom » ; vide si l'un des deux manque. */
function normalizePersonName(firstName, lastName) {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  if (!first || !last) return '';
  return `${first} ${last}`;
}

function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  return at >= 0
    ? String(email)
        .slice(at + 1)
        .toLowerCase()
    : '';
}

function isSuspended(member) {
  return Number(member?.suspended || 0) === 1 || member?.suspended === true;
}

/**
 * Contrôles amont (8.3). Chaque problème écarte **ce** membre Moodle ; l'exécution
 * continue pour les autres. Un membre **déjà lié** sans e-mail n'est pas écarté (le
 * rapprochement par identité suffit pour les appartenances de groupe).
 *
 * @param {object} args
 * @param {object[]} args.members membres Moodle dédoublonnés (un par `id`)
 * @param {string[]} [args.emailDomains]
 * @param {Set<string>|null} [args.linkedExternalIds] `external_id` déjà reconnus localement
 * @returns {{ skips: Array<{ code: string, message: string, externalId?: number|string }> }}
 */
function runUpstreamChecks({ members, emailDomains = [], linkedExternalIds = null }) {
  const skips = [];
  const byEmail = new Map();
  const domains = (emailDomains || []).map((d) => String(d).toLowerCase());
  const linked = linkedExternalIds instanceof Set ? linkedExternalIds : null;
  for (const member of members || []) {
    const email = normalizeEmail(member.email);
    if (!email) {
      if (!isSuspended(member) && !linked?.has(String(member.id))) {
        skips.push({
          code: 'member_without_email',
          externalId: member.id,
          message: `Le membre Moodle ${member.id} (${member.username || '?'}) n’a pas d’e-mail — laissé de côté`,
        });
      }
      continue;
    }
    if (domains.length && !domains.includes(emailDomain(email))) {
      skips.push({
        code: 'email_domain_not_allowed',
        externalId: member.id,
        message: `E-mail hors des domaines autorisés pour le membre Moodle ${member.id} (${emailDomain(email)}) — laissé de côté`,
      });
      continue;
    }
    if (byEmail.has(email)) {
      const otherId = byEmail.get(email);
      skips.push({
        code: 'duplicate_email',
        externalId: member.id,
        message: `Deux membres Moodle portent le même e-mail (${otherId} et ${member.id}) — les deux sont laissés de côté`,
      });
      // Le premier porteur est aussi écarté (décision ambiguë).
      if (
        !skips.some((s) => String(s.externalId) === String(otherId) && s.code === 'duplicate_email')
      ) {
        skips.push({
          code: 'duplicate_email',
          externalId: otherId,
          message: `Deux membres Moodle portent le même e-mail (${otherId} et ${member.id}) — les deux sont laissés de côté`,
        });
      }
    } else {
      byEmail.set(email, member.id);
    }
  }
  return { skips };
}

/**
 * Compte, pour la population Moodle traitée, les porteurs de chaque nom normalisé.
 * @returns {Map<string, number>}
 */
function countMoodleNames(members) {
  const counts = new Map();
  for (const member of members || []) {
    const key = normalizePersonName(member.firstname, member.lastname);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function candidateView(user) {
  return {
    userId: user.id,
    userType: user.user_type,
    email: user.email || null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    pseudo: user.pseudo || null,
    isActive: Number(user.is_active) === 1,
    authProvider: user.auth_provider || null,
  };
}

/**
 * Rapproche une liste de membres Moodle.
 *
 * @param {object} args
 * @param {object[]} args.members membres Moodle (`id`, `username`, `firstname`, `lastname`, `email`, `suspended`)
 * @param {Map<string, object>} args.identitiesByExternalId `external_id` → `{ user_id, origin, user }`
 * @param {Map<string, object>} args.identitiesByUserId `user_id` → identité (pour refuser un compte déjà lié à un autre membre)
 * @param {Map<string, object[]>} args.usersByEmail e-mail normalisé → comptes (tous types)
 * @param {Map<string, object[]>} args.studentsByName nom normalisé → comptes élèves
 * @param {(member: object) => boolean} args.canCreate la politique d'au moins une cohorte du membre autorise la création
 * @returns {Map<string, object>} `external_id` → décision
 */
function matchMembers({
  members,
  identitiesByExternalId,
  identitiesByUserId,
  usersByEmail,
  studentsByName,
  canCreate = () => false,
}) {
  const decisions = new Map();
  const moodleNameCounts = countMoodleNames(members);

  for (const member of members || []) {
    const externalId = String(member.id);
    const email = normalizeEmail(member.email);
    const nameKey = normalizePersonName(member.firstname, member.lastname);
    const base = { externalId, member, email, nameKey };

    // 1. Identité externe connue.
    const identity = identitiesByExternalId.get(externalId);
    if (identity) {
      const user = identity.user || null;
      if (user && Number(user.sync_exempt) === 1) {
        decisions.set(externalId, { ...base, rule: 'exempt', userId: user.id, user, identity });
      } else {
        decisions.set(externalId, {
          ...base,
          rule: 'identity',
          userId: identity.user_id,
          user,
          identity,
        });
      }
      continue;
    }

    // 2. E-mail.
    const emailUsers = email ? usersByEmail.get(email) || [] : [];
    if (emailUsers.length) {
      const teacher = emailUsers.find((u) => u.user_type !== 'student');
      if (teacher || emailUsers.length > 1) {
        decisions.set(externalId, {
          ...base,
          rule: 'conflict',
          reason: teacher ? 'email_on_teacher_account' : 'email_on_several_accounts',
          candidates: emailUsers.map(candidateView),
        });
        continue;
      }
      const user = emailUsers[0];
      const otherIdentity = identitiesByUserId.get(String(user.id));
      if (otherIdentity && String(otherIdentity.external_id) !== externalId) {
        decisions.set(externalId, {
          ...base,
          rule: 'conflict',
          reason: 'account_linked_to_other_member',
          candidates: [candidateView(user)],
        });
        continue;
      }
      if (Number(user.sync_exempt) === 1) {
        decisions.set(externalId, { ...base, rule: 'exempt', userId: user.id, user });
        continue;
      }
      const homonyms = (nameKey ? studentsByName.get(nameKey) || [] : []).filter(
        (u) => String(u.id) !== String(user.id),
      );
      decisions.set(externalId, {
        ...base,
        rule: 'email',
        userId: user.id,
        user,
        probableDuplicates: homonyms.map(candidateView),
      });
      continue;
    }

    // 3. Prénom + nom, uniques des deux côtés.
    if (nameKey) {
      const localCandidates = (studentsByName.get(nameKey) || []).filter(
        (u) => !identitiesByUserId.has(String(u.id)),
      );
      const uniqueMoodleSide = (moodleNameCounts.get(nameKey) || 0) === 1;
      if (localCandidates.length === 1 && uniqueMoodleSide) {
        const user = localCandidates[0];
        if (Number(user.sync_exempt) === 1) {
          decisions.set(externalId, { ...base, rule: 'exempt', userId: user.id, user });
        } else {
          decisions.set(externalId, { ...base, rule: 'name', userId: user.id, user });
        }
        continue;
      }
      if (localCandidates.length >= 1) {
        decisions.set(externalId, {
          ...base,
          rule: 'pending',
          reason: uniqueMoodleSide ? 'several_local_homonyms' : 'moodle_homonyms',
          candidates: localCandidates.map(candidateView),
        });
        continue;
      }
    }

    // 4. Création.
    if (canCreate(member)) {
      decisions.set(externalId, { ...base, rule: 'create' });
    } else {
      decisions.set(externalId, { ...base, rule: 'skipped', reason: 'policy_forbids_create' });
    }
  }
  return decisions;
}

module.exports = {
  normalizeNamePart,
  normalizePersonName,
  normalizeEmail,
  emailDomain,
  isSuspended,
  runUpstreamChecks,
  countMoodleNames,
  candidateView,
  matchMembers,
};
