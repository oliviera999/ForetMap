'use strict';

/**
 * Purge des comptes arrivés au terme de leur durée de conservation (critères :
 * `lib/retention/policy.js`), commune aux élèves et aux personnels.
 *
 * Garde-fous, dans l'ordre :
 *   - jamais un compte qui porte le profil `admin` (profil principal, secondaire ou attribué) ;
 *   - jamais un compte actif depuis moins de 12 mois (dernière activité, voir policy.js) ;
 *   - au-delà du seuil (`--max-accounts`, défaut 200), rien n'est supprimé : la catégorie est
 *     bloquée et l'exécution alerte (une anomalie de données ne vide pas la base d'un coup) ;
 *   - chaque compte est revérifié juste avant sa suppression (réactivé ou reconnecté entre-
 *     temps : conservé) ;
 *   - suppression par le chemin applicatif (`deleteStudentById`, `deleteTeacherById`) : une
 *     transaction par compte, effacement en cascade cohérent (forum, commentaires, tâches,
 *     carnet, fichiers, joueur du jeu lié, traces de journaux) ; un compte que ce chemin refuse
 *     (partie de jeu en cours, dernier administrateur…) est conservé et compté.
 *
 * Reprise sûre : chaque exécution recalcule la liste ; un compte supprimé n'y est plus, une
 * transaction interrompue est annulée par la base.
 *
 * La sortie et le journal de purge ne portent que des comptages et des motifs techniques :
 * jamais d'identifiant, de nom ni d'adresse. Chaque suppression est inscrite au journal
 * d'audit (`retention_purge_account`, identifiant seulement — comme tout effacement).
 */

const { ACCOUNT_RETENTION_MONTHS, presumedDepartureCutoff } = require('./policy');

/** Dernière activité d'un compte `u` (voir policy.js). */
const LAST_ACTIVITY_SQL = `GREATEST(
           COALESCE(u.last_seen, u.created_at),
           u.created_at,
           COALESCE((SELECT MAX(p.last_seen) FROM gl_players p
                      WHERE p.linked_foretmap_user_id = u.id), u.created_at),
           COALESCE((SELECT MAX(v.last_seen_at) FROM user_product_visits v
                      WHERE v.user_id = u.id), u.created_at)
         )`;

/** Jamais un compte qui porte le profil administrateur, à quelque titre que ce soit. */
const NOT_ADMIN_SQL = `NOT EXISTS (SELECT 1 FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
                       WHERE ur.user_id = u.id AND r.slug = 'admin')
     AND NOT EXISTS (SELECT 1 FROM roles ra WHERE ra.id = u.assigned_role_id AND ra.slug = 'admin')`;

/**
 * Requête des comptes à supprimer (ou, `review`, des comptes à revoir : sans activité depuis
 * une année scolaire mais sans départ constaté). Tous les paramètres sont liés (`?`) ; seule la
 * taille de lot, entier validé, est écrite dans le texte.
 * @param {{ userType: 'student'|'teacher', presumedCutoff: string|null, onlyId?: string|null,
 *   afterId?: string, limit?: number|null, extraExclusion?: string, review?: boolean }} spec
 * @returns {{ sql: string, params: any[] }}
 */
function buildAccountQuery({
  userType,
  presumedCutoff,
  onlyId = null,
  afterId = '',
  limit = null,
  extraExclusion = '',
  review = false,
}) {
  if (limit != null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(`Taille de lot invalide : ${limit}`);
  }
  const months = ACCOUNT_RETENTION_MONTHS;
  let selection;
  const params = [months, userType, onlyId != null ? String(onlyId) : String(afterId), months];
  if (review) {
    selection = "c.criterion = 'sans_activite' AND c.last_activity < ?";
    params.push(presumedCutoff);
  } else if (presumedCutoff) {
    selection = "(c.criterion = 'depart_constate' OR c.last_activity < ?)";
    params.push(presumedCutoff);
  } else {
    selection = "c.criterion = 'depart_constate'";
  }
  const sql = `
    SELECT c.id, c.criterion FROM (
      SELECT u.id,
             CASE WHEN u.is_active = 0 AND u.deactivated_at IS NOT NULL
                       AND u.deactivated_at < (NOW() - INTERVAL ? MONTH)
                  THEN 'depart_constate' ELSE 'sans_activite' END AS criterion,
             ${LAST_ACTIVITY_SQL} AS last_activity
        FROM users u
       WHERE u.user_type = ?
         AND ${NOT_ADMIN_SQL}
         ${extraExclusion}
         AND ${onlyId != null ? 'u.id = ?' : 'u.id > ?'}
    ) c
    WHERE c.last_activity < (NOW() - INTERVAL ? MONTH)
      AND ${selection}
    ORDER BY c.id${limit ? ` LIMIT ${limit}` : ''}`;
  return { sql, params };
}

/** Tous les comptes de la requête, par lots (pagination sur l'identifiant). */
async function collectAccounts(db, spec, batchSize) {
  const out = [];
  let afterId = '';
  for (;;) {
    const { sql, params } = buildAccountQuery({ ...spec, afterId, limit: batchSize });
    const rows = await db.queryAll(sql, params);
    for (const row of rows) out.push({ id: String(row.id), criterion: String(row.criterion) });
    if (rows.length < batchSize) return out;
    afterId = String(rows[rows.length - 1].id);
  }
}

/** Le compte remplit-il toujours les critères (revérification avant suppression) ? */
async function isStillCandidate(db, spec, id) {
  const { sql, params } = buildAccountQuery({ ...spec, onlyId: id });
  const rows = await db.queryAll(sql, params);
  return rows[0] ? String(rows[0].criterion) : null;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

function describeReasons(reasons) {
  const entries = Object.entries(reasons);
  return entries.length ? ` (motifs : ${entries.map(([k, n]) => `${k} ${n}`).join(', ')})` : '';
}

/**
 * @param {{ apply: boolean, db: object, options: object, log: Function, now: Function }} ctx
 * @param {{ userType: 'student'|'teacher', presumed: boolean, review?: boolean,
 *   extraExclusion?: string, auditTargetType: string,
 *   deleteAccount: (id: string) => Promise<{ ok: boolean, reason?: string }>,
 *   logAudit?: Function }} spec
 */
async function purgeAccounts(ctx, spec) {
  const { apply, db, options, log } = ctx;
  const cutoff = presumedDepartureCutoff(ctx.now ? ctx.now() : Date.now());
  const querySpec = {
    userType: spec.userType,
    presumedCutoff: spec.presumed ? cutoff : null,
    extraExclusion: spec.extraExclusion || '',
  };
  const batchSize = options.accountBatchSize;
  const candidates = await collectAccounts(db, querySpec, batchSize);
  const byCriterion = countBy(candidates, 'criterion');
  const counts = {
    candidats: candidates.length,
    depart_constate: byCriterion.depart_constate || 0,
    sans_activite: byCriterion.sans_activite || 0,
    date_limite_depart_presume: spec.presumed ? cutoff : null,
    seuil: options.maxAccounts,
  };
  if (spec.review) {
    const review = await collectAccounts(
      db,
      { ...querySpec, presumedCutoff: cutoff, review: true },
      batchSize,
    );
    counts.a_revoir = review.length;
  }

  log(
    `${candidates.length} compte(s) au terme de leur durée de conservation ` +
      `(départ constaté depuis plus de 12 mois : ${counts.depart_constate}` +
      (spec.presumed
        ? ` ; sans activité depuis l’année scolaire close avant le ${cutoff} : ${counts.sans_activite}`
        : '') +
      ')' +
      (spec.review
        ? ` ; ${counts.a_revoir} compte(s) sans activité depuis plus d’une année scolaire mais non désactivé(s), à revoir.`
        : '.'),
  );

  if (candidates.length > options.maxAccounts) {
    log(
      `SEUIL DÉPASSÉ : ${candidates.length} compte(s) pour un seuil de ${options.maxAccounts} — ` +
        'rien n’est supprimé. Relire la simulation, puis relancer avec --max-accounts=N ' +
        '(ou FORETMAP_RETENTION_MAX_ACCOUNTS).',
    );
    return { counts: { ...counts, bloque: true, supprimes: 0 }, blocked: true };
  }
  if (!apply) return { counts };

  const logAudit = spec.logAudit || require('../auditLog').logAudit;
  let deleted = 0;
  const kept = {};
  for (let i = 0; i < candidates.length; i += batchSize) {
    for (const candidate of candidates.slice(i, i + batchSize)) {
      const criterion = await isStillCandidate(db, querySpec, candidate.id);
      if (!criterion) {
        kept.plus_candidat = (kept.plus_candidat || 0) + 1;
        continue;
      }
      const result = await spec.deleteAccount(candidate.id);
      if (result?.ok) {
        deleted += 1;
        await logAudit(
          'retention_purge_account',
          spec.auditTargetType,
          candidate.id,
          candidate.id,
          {
            payload: {
              user_type: spec.userType,
              criterion,
              retention_months: ACCOUNT_RETENTION_MONTHS,
            },
          },
        );
      } else {
        const reason = String(result?.reason || 'refus');
        kept[reason] = (kept[reason] || 0) + 1;
      }
    }
  }
  const keptTotal = Object.values(kept).reduce((a, b) => a + b, 0);
  log(`${deleted} compte(s) supprimé(s), ${keptTotal} conservé(s)${describeReasons(kept)}.`);
  return { counts: { ...counts, supprimes: deleted, conserves: kept } };
}

module.exports = {
  LAST_ACTIVITY_SQL,
  NOT_ADMIN_SQL,
  buildAccountQuery,
  collectAccounts,
  isStillCandidate,
  purgeAccounts,
};
