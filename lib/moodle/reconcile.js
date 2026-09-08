'use strict';

/**
 * Comparaison à trois (section 9) — fonctions **pures**, sans base ni réseau.
 *
 * Pour un groupe synchronisé, trois ensembles de membres (`users.id`) :
 *  - M : l'état Moodle lu à cette exécution ;
 *  - F : l'état ForetMap lu en base ;
 *  - H : le dernier état commun (`external_groups.members_json`, derrière `members_hash`).
 *
 * Et une carte `tracked` : les appartenances que la synchronisation suit, avec leur provenance
 * (`sync` = posée par elle, `manual` = adoptée : posée à la main, présente aussi dans Moodle).
 *
 * Table de décision, membre par membre (les décisions s'appliquent au **reflet**) :
 *
 * | dans le maître | dans le reflet | dans H          | décision                                               |
 * | -------------- | -------------- | --------------- | ------------------------------------------------------ |
 * | oui            | oui            | —               | accord : `adopt` si non suivie (I-8 : rien sinon)      |
 * | oui            | non            | oui, suivie     | le reflet a bougé → `conflict_removed` (sortant si push)|
 * | oui            | non            | non             | le maître a bougé → `add`                              |
 * | non            | oui            | suivie `sync`   | le maître a bougé → `remove`                           |
 * | non            | oui            | suivie `manual` | divergence déjà connue → rien (I-4 : on garde l'élève) |
 * | non            | oui            | non suivie      | le reflet a bougé → `conflict_added` (sortant si push) |
 * | non            | non            | suivie          | suivi périmé → `untrack`                               |
 *
 * Exception unique et explicite (section 9) : un groupe `master = 'foretmap'` qui est un
 * **miroir d'équipe** est reconstruit à l'identique sans conflit (`add` / `remove` vers Moodle) ;
 * une retouche faite dans Moodle est tout de même **signalée** (`notices`), jamais silencieuse.
 */

const crypto = require('node:crypto');

/** SHA-256 de la liste triée des `users.id`, jointe par `\n` (section 9). */
function membersHashOf(userIds) {
  const sorted = [...new Set([...userIds].map(String))].sort();
  return crypto.createHash('sha256').update(sorted.join('\n')).digest('hex');
}

function toSet(value) {
  if (value instanceof Set) return new Set([...value].map(String));
  if (value instanceof Map) return new Set([...value.keys()].map(String));
  return new Set((value || []).map(String));
}

/**
 * @param {object} args
 * @param {Iterable<string>} args.moodle   M — `users.id` rapprochés présents dans la cohorte
 * @param {Iterable<string>} args.foretmap F — `users.id` présents dans le groupe ForetMap
 * @param {Iterable<string>} args.last     H — dernier état commun
 * @param {Map<string,'sync'|'manual'>} args.tracked appartenances suivies
 * @param {'moodle'|'foretmap'} [args.master]
 * @param {boolean} [args.pushMembership] le reflet est autorisé à écrire vers le maître (n3)
 * @param {boolean} [args.teamMirror] groupe miroir d'équipe (exception section 9)
 * @param {(userId: string) => boolean} [args.isEligible] filtre (élèves non exemptés) pour les
 *        décisions qui concernent un compte déjà présent côté ForetMap
 * @returns {{ decisions: Array<{ userId: string, decision: string, source?: string }>, notices: Array<object> }}
 */
function reconcileMembers({
  moodle,
  foretmap,
  last,
  tracked,
  master = 'moodle',
  pushMembership = false,
  teamMirror = false,
  isEligible = () => true,
}) {
  const M = toSet(moodle);
  const F = toSet(foretmap);
  const H = toSet(last);
  const T = tracked instanceof Map ? tracked : new Map(Object.entries(tracked || {}));
  const decisions = [];
  const notices = [];
  // Les décisions `add` / `remove` / `adopt` s'appliquent toujours au **reflet** : ForetMap quand
  // Moodle est maître (cohortes), Moodle quand ForetMap est maître (miroirs d'équipe, M4).
  const masterSet = master === 'foretmap' ? F : M;
  const mirrorSet = master === 'foretmap' ? M : F;
  const mirrorRebuild = master === 'foretmap' && teamMirror;

  for (const userId of masterSet) {
    if (mirrorSet.has(userId)) {
      if (!T.has(userId)) decisions.push({ userId, decision: 'adopt' });
      continue;
    }
    if (H.has(userId) && T.has(userId)) {
      // Dans le maître et dans le dernier état commun, plus dans le reflet : le reflet a bougé.
      if (mirrorRebuild) {
        notices.push({
          code: 'team_mirror_overwritten',
          userId,
          message: 'Retrait fait dans Moodle écrasé par le miroir d’équipe',
        });
        decisions.push({ userId, decision: 'add' });
        continue;
      }
      if (!isEligible(userId)) continue;
      decisions.push({
        userId,
        decision: pushMembership ? 'outbound_remove' : 'conflict_removed',
        source: T.get(userId),
      });
      continue;
    }
    decisions.push({ userId, decision: 'add' });
  }

  for (const userId of mirrorSet) {
    if (masterSet.has(userId)) continue;
    const source = T.get(userId);
    if (source === 'sync') {
      decisions.push({ userId, decision: 'remove', source });
      continue;
    }
    if (source === 'manual') {
      // Appartenance posée à la main et déjà connue (adoptée, ou divergence acceptée par
      // « ignorer ») : l'élève reste, rien à signaler de nouveau (I-4).
      continue;
    }
    if (!isEligible(userId)) continue;
    if (mirrorRebuild) {
      notices.push({
        code: 'team_mirror_overwritten',
        userId,
        message: 'Ajout fait dans Moodle écrasé par le miroir d’équipe',
      });
      decisions.push({ userId, decision: 'remove', source: null });
      continue;
    }
    decisions.push({ userId, decision: pushMembership ? 'outbound_add' : 'conflict_added' });
  }

  // Suivi périmé : le membre n'est plus ni dans le maître ni dans le reflet.
  for (const [userId, source] of T) {
    if (masterSet.has(String(userId)) || mirrorSet.has(String(userId))) continue;
    decisions.push({ userId: String(userId), decision: 'untrack', source });
  }

  return { decisions, notices };
}

/**
 * Comparaison à trois sur le **nom** du groupe.
 *
 * @param {{ moodle: string, foretmap: string|null, last: string|null, master?: string }} args
 * @returns {'noop'|'rename'|'conflict'}
 */
function reconcileName({ moodle, foretmap, last, master = 'moodle' }) {
  const m = String(moodle ?? '').trim();
  const f = foretmap == null ? null : String(foretmap).trim();
  const h = last == null ? null : String(last).trim();
  if (f == null) return 'noop';
  if (m === f) return 'noop';
  if (master === 'foretmap') return 'noop'; // le nom vit côté ForetMap (miroirs) : rien à réaligner ici
  const moodleChanged = h == null || m !== h;
  const foretmapChanged = h != null && f !== h;
  if (moodleChanged && !foretmapChanged) return 'rename';
  return 'conflict';
}

module.exports = { reconcileMembers, reconcileName, membersHashOf };
