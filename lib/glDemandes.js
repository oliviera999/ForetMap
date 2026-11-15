'use strict';

/**
 * « Tenir à deux » — demandes au prof (`gl_game_demandes`, migration 348).
 *
 * Tout flux qui attend un geste du prof écrit ici une ligne : la console les lit en **file
 * unique**, la plus ancienne en haut. Garde-fou 11 : aucune demande ne reste en attente sans
 * sortie automatique — `annulerDemandesTx` les ferme au changement de phase, à la clôture du
 * tour et au Seuil (`lib/glTour.js`, `lib/glSeuil.js`).
 *
 * Une demande pointe sa source par (`kind`, `ref_id`) : l'identifiant de la saisie de dés, du
 * brouillon de sort, du défi… Créer deux fois la même demande en attente ne fait rien. Aucune
 * donnée d'élève dans `payload_json` (équipes, codes, libellés seulement).
 */

/** Familles de demandes, dans l'ordre de leur libellé à l'écran. */
const DEMANDE_KINDS = Object.freeze([
  'des_a_valider',
  'jet_en_suspens',
  'sort_a_appliquer',
  'nommer',
  'plume',
  'chimere',
  'presence_a_confirmer',
  'defi_case',
]);

/** Demandes qui ne survivent pas à la sortie de la phase `jeu` (elles n'ont plus d'objet). */
const KINDS_DE_LA_PHASE_JEU = Object.freeze([
  'des_a_valider',
  'jet_en_suspens',
  'presence_a_confirmer',
]);

function parsePayload(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function formatDemande(row) {
  return {
    id: Number(row.id),
    gameId: Number(row.game_id),
    roundNumber: Number(row.round_number) || 0,
    teamId: row.team_id != null ? Number(row.team_id) : null,
    kind: String(row.kind),
    refId: row.ref_id != null ? String(row.ref_id) : null,
    payload: parsePayload(row.payload_json),
    statut: String(row.statut),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
  };
}

/**
 * Crée une demande en attente (idempotent sur `kind` + `refId` tant qu'elle attend).
 * @returns {Promise<number>} identifiant de la demande
 */
async function creerDemandeTx(
  tx,
  { gameId, roundNumber = 0, teamId = null, kind, refId = null, payload = null },
) {
  if (!DEMANDE_KINDS.includes(String(kind))) throw new Error(`Demande inconnue : ${kind}`);
  const ref = refId != null ? String(refId) : null;
  if (ref != null) {
    const existing = await tx.queryOne(
      `SELECT id FROM gl_game_demandes
        WHERE game_id = ? AND kind = ? AND ref_id = ? AND statut = 'en_attente' LIMIT 1`,
      [gameId, kind, ref],
    );
    if (existing) return Number(existing.id);
  }
  const result = await tx.execute(
    `INSERT INTO gl_game_demandes (game_id, round_number, team_id, kind, ref_id, payload_json, statut, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'en_attente', NOW())`,
    [gameId, Number(roundNumber) || 0, teamId, kind, ref, payload ? JSON.stringify(payload) : null],
  );
  return Number(result.insertId);
}

/**
 * Une demande n'a de sens que tant que la partie se joue : après le Seuil (partie close), plus
 * rien ne la fermerait. Les sources qui restent ouvertes après la clôture (chimère, page
 * vierge) passent par ici : la proposition reste à relire dans son panneau, sans ligne de file.
 * @returns {Promise<number|null>} identifiant de la demande, ou `null` si la partie est close
 */
async function creerDemandeSiPartieEnCoursTx(tx, demande) {
  const game = await tx.queryOne('SELECT status FROM gl_games WHERE id = ? LIMIT 1', [
    demande.gameId,
  ]);
  if (!game || !['live', 'paused'].includes(String(game.status))) return null;
  return creerDemandeTx(tx, demande);
}

/** Ferme la demande d'une source (`traitee` par défaut). Renvoie le nombre de lignes fermées. */
async function resoudreDemandeTx(tx, { gameId, kind, refId, statut = 'traitee' }) {
  const result = await tx.execute(
    `UPDATE gl_game_demandes SET statut = ?, resolved_at = NOW()
      WHERE game_id = ? AND kind = ? AND ref_id = ? AND statut = 'en_attente'`,
    [statut === 'annulee' ? 'annulee' : 'traitee', gameId, kind, String(refId)],
  );
  return Number(result?.affectedRows || 0);
}

/**
 * Sortie automatique : annule les demandes en attente d'une partie (toutes, ou celles des
 * familles données ; `roundNumber` borne à un tour).
 * @returns {Promise<number>} nombre de demandes annulées
 */
async function annulerDemandesTx(tx, { gameId, kinds = null, roundNumber = null }) {
  const where = ['game_id = ?', "statut = 'en_attente'"];
  const params = [gameId];
  if (Array.isArray(kinds) && kinds.length) {
    where.push(`kind IN (${kinds.map(() => '?').join(', ')})`);
    params.push(...kinds);
  }
  if (roundNumber != null) {
    where.push('round_number = ?');
    params.push(Number(roundNumber) || 0);
  }
  const result = await tx.execute(
    `UPDATE gl_game_demandes SET statut = 'annulee', resolved_at = NOW() WHERE ${where.join(' AND ')}`,
    params,
  );
  return Number(result?.affectedRows || 0);
}

/** Demandes d'une partie, la plus ancienne en haut (`statut` : `en_attente` par défaut). */
async function listDemandes(db, gameId, { statut = 'en_attente' } = {}) {
  const rows = await db.queryAll(
    `SELECT id, game_id, round_number, team_id, kind, ref_id, payload_json, statut, created_at, resolved_at
       FROM gl_game_demandes
      WHERE game_id = ? ${statut ? 'AND statut = ?' : ''}
      ORDER BY created_at ASC, id ASC`,
    statut ? [gameId, statut] : [gameId],
  );
  return rows.map(formatDemande);
}

async function compterDemandesEnAttente(db, gameId) {
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_demandes WHERE game_id = ? AND statut = 'en_attente'",
    [gameId],
  );
  return Number(row?.n) || 0;
}

/** Libellé d'une famille de demandes et de son bouton principal (console du prof). */
const DEMANDE_LIBELLES = Object.freeze({
  des_a_valider: { titre: 'Dés à valider', action: 'Valider le jet' },
  jet_en_suspens: { titre: 'Jet en suspens', action: 'Appliquer la case' },
  sort_a_appliquer: { titre: 'Sort à appliquer', action: 'Effet appliqué' },
  nommer: { titre: 'Nommer : page à réparer', action: 'Effet appliqué' },
  plume: { titre: 'Page vierge à relire', action: 'Relire' },
  chimere: { titre: 'Chimère à relire', action: 'Relire' },
  presence_a_confirmer: { titre: 'Présences à confirmer', action: 'Tout le monde est là' },
  defi_case: { titre: 'Défi à juger', action: 'Relevé' },
});

/**
 * File unique du prof : les demandes en attente, la plus ancienne en haut, chacune avec son
 * libellé, son détail et le nom de son équipe. Lecture seule ; les textes d'élèves (titre d'une
 * page vierge, nom d'une chimère) sont lus à la source, jamais recopiés dans la demande.
 */
async function buildFileDuProf(db, gameId) {
  const demandes = await listDemandes(db, gameId);
  if (!demandes.length) return [];
  const teams = await db.queryAll('SELECT id, name FROM gl_teams WHERE game_id = ?', [gameId]);
  const nomEquipe = new Map(teams.map((t) => [Number(t.id), String(t.name)]));
  const out = [];
  for (const d of demandes) {
    const libelle = DEMANDE_LIBELLES[d.kind] || { titre: d.kind, action: 'Traiter' };
    const p = d.payload || {};
    let detail = '';
    if (d.kind === 'des_a_valider') {
      detail = Array.isArray(p.faces) ? `${p.faces.join(' + ')} = ${p.total}` : '';
    } else if (d.kind === 'jet_en_suspens') {
      detail = `jet de ${p.total ?? '?'}${p.label ? ` → « ${p.label} »` : ''}`;
    } else if (d.kind === 'sort_a_appliquer' || d.kind === 'nommer') {
      detail = [p.spellName || p.spellCode, p.effetCourt].filter(Boolean).join(' — ');
    } else if (d.kind === 'plume') {
      const row = await db.queryOne('SELECT titre FROM gl_voyageur_plumes WHERE id = ? LIMIT 1', [
        Number(d.refId),
      ]);
      detail = row?.titre ? `« ${row.titre} »` : '';
    } else if (d.kind === 'chimere') {
      const row = await db.queryOne('SELECT nom FROM gl_game_chimeres WHERE id = ? LIMIT 1', [
        Number(d.refId),
      ]);
      detail = row?.nom ? `« ${row.nom} »` : '';
    } else if (d.kind === 'defi_case') {
      detail = p.titre ? `« ${p.titre} »` : '';
      // Le critère n'existe que dans la file du prof : lu au catalogue, pour juger à voix haute.
      const defi = await db.queryOne(
        'SELECT consigne, critere, duree_s FROM gl_tenir_defis_cases WHERE code = ? LIMIT 1',
        [String(p.code || '')],
      );
      if (defi) {
        p.consigne = defi.consigne != null ? String(defi.consigne) : null;
        p.critere = defi.critere != null ? String(defi.critere) : null;
        p.dureeS = Number(defi.duree_s) || p.dureeS || 60;
      }
    }
    out.push({
      id: d.id,
      kind: d.kind,
      refId: d.refId,
      teamId: d.teamId,
      teamName: d.teamId != null ? nomEquipe.get(Number(d.teamId)) || null : null,
      roundNumber: d.roundNumber,
      createdAt: d.createdAt,
      titre: libelle.titre,
      action: libelle.action,
      detail,
      payload: p,
    });
  }
  return out;
}

module.exports = {
  DEMANDE_LIBELLES,
  buildFileDuProf,
  DEMANDE_KINDS,
  KINDS_DE_LA_PHASE_JEU,
  creerDemandeSiPartieEnCoursTx,
  formatDemande,
  creerDemandeTx,
  resoudreDemandeTx,
  annulerDemandesTx,
  listDemandes,
  compterDemandesEnAttente,
};
