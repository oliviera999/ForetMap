#!/usr/bin/env node
'use strict';

/**
 * Cycle de fin d'année : suppression des comptes ÉLÈVES inactifs (RG2 de
 * `docs/AUDIT_SECURITE_RGPD_2026-09-30.md` — conservation limitée, RGPD art. 5-1-e).
 *
 *   node scripts/purge-inactive-accounts.js                  # à blanc : liste, ne supprime rien
 *   node scripts/purge-inactive-accounts.js --months=13      # seuil (défaut 13 mois)
 *   node scripts/purge-inactive-accounts.js --apply          # supprime les comptes listés
 *   node scripts/purge-inactive-accounts.js --apply --limit=50
 *
 * Un compte est **inactif** quand sa dernière activité — la plus récente de sa dernière
 * connexion (`users.last_seen`), de sa création, et de la dernière visite de son joueur
 * Gnomes & Licornes lié (`gl_players.last_seen`) — remonte à plus de N mois. Seuls les
 * comptes `student` sont concernés : un enseignant se supprime depuis sa fiche.
 *
 * La suppression passe par le **même chemin** que l'effacement d'un élève depuis
 * l'application (`lib/studentDeletion.js` → registre des nettoyeurs) : forum, commentaires,
 * tâches, observations, carnet et leurs fichiers, joueur G&L lié, traces de journaux. Un
 * compte retenu (joueur G&L dans une partie en cours) est signalé et laissé en place.
 *
 * Journal : une ligne par compte sur la sortie standard (identifiant seulement, jamais le
 * nom) et une entrée `purge_inactive_account` au journal d'audit pour chaque suppression.
 *
 * À BLANC PAR DÉFAUT, et **sans cron automatique** : c'est un geste d'administration de fin
 * d'année (juillet), après vérification de la liste (voir docs/EXPLOITATION.md et
 * docs/CRONTAB.md).
 */

const DEFAULT_INACTIVE_MONTHS = 13;
/** En deçà, un élève absent un trimestre perdrait son compte : refusé. */
const MIN_INACTIVE_MONTHS = 6;

function parseArgs(argv) {
  const out = { apply: false, months: DEFAULT_INACTIVE_MONTHS, limit: null };
  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--months=')) {
      out.months = Number.parseInt(arg.slice('--months='.length), 10);
    } else if (arg.startsWith('--limit=')) {
      out.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    }
  }
  return out;
}

function assertMonths(months) {
  if (!Number.isInteger(months) || months < MIN_INACTIVE_MONTHS) {
    throw new Error(
      `Seuil d'inactivité invalide (${months}). Minimum ${MIN_INACTIVE_MONTHS} mois — un seuil ` +
        'plus court supprimerait des élèves simplement absents un trimestre.',
    );
  }
}

/**
 * Requête des comptes élèves inactifs depuis `months` mois (paramètre SQL, jamais interpolé).
 * La dernière activité retenue est la plus récente des trois dates.
 */
const INACTIVE_STUDENTS_SQL = `
  SELECT u.id,
         GREATEST(
           COALESCE(u.last_seen, u.created_at, '1970-01-01'),
           COALESCE(u.created_at, '1970-01-01'),
           COALESCE(MAX(p.last_seen), '1970-01-01')
         ) AS last_activity
    FROM users u
    LEFT JOIN gl_players p ON p.linked_foretmap_user_id = u.id
   WHERE u.user_type = 'student'
   GROUP BY u.id, u.last_seen, u.created_at
  HAVING last_activity < (NOW() - INTERVAL ? MONTH)
   ORDER BY last_activity ASC, u.id ASC`;

function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

/**
 * Liste puis (avec `apply`) supprime les comptes. Injectable pour les tests.
 * @returns {Promise<{ candidates: number, deleted: string[], refused: Array<{ id: string, reason: string }> }>}
 */
async function purgeInactiveAccounts(
  { months = DEFAULT_INACTIVE_MONTHS, apply = false, limit = null } = {},
  deps = {},
) {
  assertMonths(months);
  const queryAll = deps.queryAll || require('../database').queryAll;
  const deleteStudentById =
    deps.deleteStudentById || require('../lib/studentDeletion').deleteStudentById;
  const logAudit = deps.logAudit || require('../lib/auditLog').logAudit;
  const log = deps.log || ((line) => console.log(line));

  const rows = await queryAll(INACTIVE_STUDENTS_SQL, [months]);
  const selected = Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows;
  log(
    `[purge-inactifs] ${rows.length} compte(s) élève inactif(s) depuis plus de ${months} mois` +
      (selected.length !== rows.length ? ` — ${selected.length} traité(s) (--limit).` : '.'),
  );

  const deleted = [];
  const refused = [];
  for (const row of selected) {
    const id = String(row.id);
    const since = formatDate(row.last_activity);
    if (!apply) {
      log(`[purge-inactifs] à supprimer : ${id} (dernière activité ${since})`);
      continue;
    }
    const result = await deleteStudentById(id);
    if (result?.ok) {
      deleted.push(id);
      log(`[purge-inactifs] supprimé : ${id} (dernière activité ${since})`);
      await logAudit('purge_inactive_account', 'student', id, id, {
        payload: { inactive_months: months, last_activity: since },
      });
    } else {
      const reason = String(result?.reason || 'inconnu');
      refused.push({ id, reason });
      log(`[purge-inactifs] conservé : ${id} — suppression refusée (${reason})`);
    }
  }
  if (!apply) {
    log('[purge-inactifs] Exécution à blanc — rien n’a été supprimé. Relancer avec --apply.');
  } else {
    log(
      `[purge-inactifs] Terminé — ${deleted.length} compte(s) supprimé(s), ` +
        `${refused.length} conservé(s).`,
    );
  }
  return { candidates: rows.length, deleted, refused };
}

async function main() {
  const { endPool } = require('../database');
  const options = parseArgs(process.argv.slice(2));
  try {
    await purgeInactiveAccounts(options);
  } finally {
    await endPool().catch(() => {});
  }
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[purge-inactifs] Erreur: ${err?.message || err}`);
      process.exit(1);
    });
}

module.exports = {
  DEFAULT_INACTIVE_MONTHS,
  MIN_INACTIVE_MONTHS,
  INACTIVE_STUDENTS_SQL,
  parseArgs,
  assertMonths,
  purgeInactiveAccounts,
};
