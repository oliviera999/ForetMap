'use strict';

/**
 * « Tenir à deux » — Lettre (`SL048`) et Mentorat (`SL027`), ensemble unifié (M23, L7).
 *
 * Les deux sorts se paient **une fois** et ne se remboursent jamais ; un « pas encore » du prof
 * se rejoue sans repayer. Garde-fou « une erreur ne coûte rien » : la ressource est déjà
 * dépensée, le prof ne retire rien de plus, l'élève réécrit ou repasse quand il veut.
 *
 * - **Lettre** : une ligne `gl_voyageur_plumes` (`source = 'lettre'`), états
 *   `a_ecrire → proposee → validee`, ou `pas_encore → proposee` autant de fois qu'il le faut.
 *   Validée, c'est une page du voyageur **en marge** du carnet : elle ne compte pas pour le
 *   carnet complet (`lib/glChasse.js › verifierCarnetCompletTx` ne lit que les zones).
 * - **Mentorat** : une ligne `gl_game_mentorats`, états `prevu → valide`, ou
 *   `pas_encore → prevu` à une autre séance. **Un seul par séance et par classe.** Un Mentorat
 *   que le prof n'a pas écouté ne reste pas en attente : à l'ouverture d'une séance plus
 *   tardive ou au camp, il repasse en `pas_encore` (garde-fou 11), sans rien coûter — et
 *   l'élève lit un texte neutre (`MENTORAT_REPORTE`), jamais le retour d'une écoute qui n'a
 *   pas eu lieu.
 * - Une Lettre en relecture suit son auteur : écrite ou encore à relire quand sa partie est
 *   close, elle rejoint la file du prof de la partie où l'élève joue (`rattacherLettresTx`).
 *
 * Les textes (amorces, consigne, retours) viennent du catalogue : `effet_auto_json` du sort
 * dans `data/gl/tenir/sorts.json`. Le critère et les points de relecture ne sortent que dans la
 * file du prof.
 */

const { insertGameEvent } = require('./glGameEvents');

const MENTORAT_DEJA_PREVU = 'Un Mentorat est déjà prévu aujourd’hui.';
const MENTORAT_DEJA_PAYE = 'Ton Mentorat est déjà payé : retente-le sans rien repayer.';
const LETTRE_DEJA_PAYEE = 'Ta Lettre est déjà payée : écris-la sans rien repayer.';
/** Mentorat reporté d'office (le prof n'a pas pu l'écouter) : rien à corriger, rien à repayer. */
const MENTORAT_REPORTE =
  'Ton Mentorat n’a pas pu passer cette fois. Retente-le quand tu veux, sans rien repayer.';
/** Lettre et Mentorat se jouent depuis le Seuil : sans lui, on refuse avant de débiter. */
const SEUIL_FERME = 'Ce sort se joue depuis ton Seuil, qui est fermé pour l’instant.';

const LETTRE_EN_COURS = Object.freeze(['a_ecrire', 'proposee', 'pas_encore']);
const MENTORAT_EN_COURS = Object.freeze(['prevu', 'pas_encore']);

function fail(code, status, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

/** Refus d'un sort avant tout débit : même forme que `SPELL_LIMITE` (409, message à afficher). */
function refusSansDebit(message) {
  return fail('SPELL_LIMITE', 409, message);
}

function cleanText(v, max) {
  return String(v || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseJson(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(String(raw));
    return v && typeof v === 'object' ? v : null;
  } catch (_) {
    return null;
  }
}

function tableAbsente(err) {
  return err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1054;
}

/** Textes du catalogue pour un type d'effet (`lettre` | `mentorat`) ; objet vide à défaut. */
async function loadTextes(db, type) {
  try {
    const rows = await db.queryAll(
      `SELECT spell_code, cout, effet_auto_json FROM gl_spells
        WHERE tenir_v2 = 1 AND effet_auto_json IS NOT NULL AND effet_auto_json LIKE ?`,
      [`%"${type}"%`],
    );
    for (const row of rows || []) {
      const effet = parseJson(row.effet_auto_json);
      if (String(effet?.type || '') === type) {
        return { ...effet, spellCode: String(row.spell_code), cout: Number(row.cout) || 0 };
      }
    }
  } catch (err) {
    if (!tableAbsente(err)) throw err;
  }
  return {};
}

/**
 * Séance où un Mentorat sera écouté : celle du tour ouvert, ou la suivante quand le tour est
 * clos (sort lancé en veillée, entre deux séances).
 */
async function seanceCourante(db, gameId) {
  const row = await db.queryOne(
    `SELECT g.current_round_number AS n, r.phase
       FROM gl_games g
       LEFT JOIN gl_game_rounds r ON r.game_id = g.id AND r.round_number = g.current_round_number
      WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  const n = Number(row?.n) || 0;
  if (n <= 0) return 1;
  return String(row?.phase || '') === 'clos' ? n + 1 : n;
}

// ---------------------------------------------------------------------
// Contrôle avant débit
// ---------------------------------------------------------------------

/**
 * Rejoué à la création du pot et au lancement, **avant tout débit** :
 * - Mentorat : un seul par séance et par classe (« Un Mentorat est déjà prévu aujourd'hui. ») ;
 *   un élève dont le Mentorat est payé (prévu, ou à retenter) ne repaie pas ;
 * - Lettre : un élève dont la Lettre est payée (à écrire, en relecture, à réécrire) ne repaie pas.
 * Sans `playerId` (écran d'équipe), seul le contrôle de classe s'applique.
 * @throws 409 `SPELL_LIMITE`
 */
async function assertSortPersonnelLibre(db, { gameId, type, playerId = null }) {
  if (type !== 'lettre' && type !== 'mentorat') return;
  // La page s'écrit et le Mentorat se retente au Seuil : module coupé, l'élève paierait un sort
  // qu'il ne pourrait pas jouer.
  const modules = await require('./glSettings').getGlModulesSettings();
  if (modules && modules.voyageurEnabled === false) {
    throw fail('SPELL_SANS_OBJET', 409, SEUIL_FERME);
  }
  try {
    if (type === 'lettre') {
      if (playerId == null) return;
      const row = await db.queryOne(
        `SELECT id FROM gl_voyageur_plumes
          WHERE player_id = ? AND source = 'lettre' AND statut IN (${LETTRE_EN_COURS.map(() => '?').join(', ')})
          LIMIT 1`,
        [Number(playerId), ...LETTRE_EN_COURS],
      );
      if (row) throw refusSansDebit(LETTRE_DEJA_PAYEE);
      return;
    }
    if (playerId != null) {
      const mien = await db.queryOne(
        `SELECT id FROM gl_game_mentorats
          WHERE player_id = ? AND statut IN (${MENTORAT_EN_COURS.map(() => '?').join(', ')}) LIMIT 1`,
        [Number(playerId), ...MENTORAT_EN_COURS],
      );
      if (mien) throw refusSansDebit(MENTORAT_DEJA_PAYE);
    }
    const seance = await seanceCourante(db, gameId);
    const pris = await db.queryOne(
      'SELECT id FROM gl_game_mentorats WHERE game_id = ? AND seance = ? LIMIT 1',
      [gameId, seance],
    );
    if (pris) throw refusSansDebit(MENTORAT_DEJA_PREVU);
  } catch (err) {
    if (!tableAbsente(err)) throw err;
  }
}

// ---------------------------------------------------------------------
// Effets au lancement (dans la transaction du débit)
// ---------------------------------------------------------------------

/** Lettre payée : la page attend d'être écrite (`a_ecrire`). */
async function ouvrirLettreTx(tx, { gameId, playerId, draftId }) {
  if (!(Number(playerId) > 0)) throw fail('SPELL_LIMITE_ELEVE', 400);
  const dejaPayee = await tx.queryOne(
    `SELECT id FROM gl_voyageur_plumes
      WHERE player_id = ? AND source = 'lettre' AND statut IN (${LETTRE_EN_COURS.map(() => '?').join(', ')})
      LIMIT 1 FOR UPDATE`,
    [Number(playerId), ...LETTRE_EN_COURS],
  );
  if (dejaPayee) throw refusSansDebit(LETTRE_DEJA_PAYEE);
  const r = await tx.execute(
    `INSERT INTO gl_voyageur_plumes (player_id, game_id, draft_id, source, titre, texte, statut, created_at, updated_at)
     VALUES (?, ?, ?, 'lettre', '', '', 'a_ecrire', NOW(), NOW())`,
    [Number(playerId), gameId, draftId != null ? Number(draftId) : null],
  );
  return { lettreId: Number(r.insertId), statut: 'a_ecrire' };
}

/**
 * Mentorat payé : il entre dans la file du prof pour la séance. Le verrou de la partie sérialise
 * deux lancements simultanés — le second est refusé, sa transaction (donc son débit) annulée.
 */
async function ouvrirMentoratTx(tx, { gameId, teamId, playerId, draftId, spell = null }) {
  if (!(Number(playerId) > 0)) throw fail('SPELL_LIMITE_ELEVE', 400);
  await tx.queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1 FOR UPDATE', [gameId]);
  const seance = await seanceCourante(tx, gameId);
  const pris = await tx.queryOne(
    'SELECT id FROM gl_game_mentorats WHERE game_id = ? AND seance = ? LIMIT 1',
    [gameId, seance],
  );
  if (pris) throw refusSansDebit(MENTORAT_DEJA_PREVU);
  const mien = await tx.queryOne(
    `SELECT id FROM gl_game_mentorats
      WHERE player_id = ? AND statut IN (${MENTORAT_EN_COURS.map(() => '?').join(', ')}) LIMIT 1`,
    [Number(playerId), ...MENTORAT_EN_COURS],
  );
  if (mien) throw refusSansDebit(MENTORAT_DEJA_PAYE);
  const r = await tx.execute(
    `INSERT INTO gl_game_mentorats (game_id, team_id, player_id, draft_id, seance, statut, tentatives, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'prevu', 1, NOW(), NOW())`,
    [gameId, teamId, Number(playerId), draftId != null ? Number(draftId) : null, seance],
  );
  const mentoratId = Number(r.insertId);
  await demanderEcouteTx(tx, { gameId, teamId, mentoratId, seance, spell });
  return { mentoratId, seance, statut: 'prevu' };
}

async function demanderEcouteTx(tx, { gameId, teamId, mentoratId, seance, spell = null }) {
  await require('./glDemandes').creerDemandeTx(tx, {
    gameId,
    roundNumber: seance,
    teamId,
    kind: 'mentorat',
    refId: mentoratId,
    payload: {
      spellCode: spell?.spellCode || null,
      spellName: spell?.nom || 'Mentorat',
    },
  });
}

// ---------------------------------------------------------------------
// Lettre : écrire, réécrire
// ---------------------------------------------------------------------

function formatLettre(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    gameId: row.game_id != null ? Number(row.game_id) : null,
    statut: String(row.statut),
    amorce: row.amorce ? String(row.amorce) : null,
    titre: String(row.titre || ''),
    texte: String(row.texte || ''),
    piste: row.piste ? String(row.piste) : null,
  };
}

/**
 * L'élève écrit (ou réécrit) sa Lettre : `a_ecrire` ou `pas_encore` → `proposee`. Rien à payer.
 * @throws 404 `LETTRE_INTROUVABLE`, 409 `LETTRE_EN_RELECTURE`, 400 `LETTRE_TITRE` / `LETTRE_TEXTE`
 */
async function ecrireLettreTx(tx, { playerId, lettreId, amorce = null, titre, texte }) {
  const row = await tx.queryOne(
    "SELECT * FROM gl_voyageur_plumes WHERE id = ? AND player_id = ? AND source = 'lettre' LIMIT 1 FOR UPDATE",
    [Number(lettreId), Number(playerId)],
  );
  if (!row) throw fail('LETTRE_INTROUVABLE', 404, 'Cette Lettre est introuvable.');
  if (!['a_ecrire', 'pas_encore'].includes(String(row.statut))) {
    throw fail(
      'LETTRE_EN_RELECTURE',
      409,
      String(row.statut) === 'validee'
        ? 'Ta page est déjà entrée au carnet de la classe.'
        : 'Ta page est en relecture chez ton professeur.',
    );
  }
  const t = cleanText(titre, 160);
  const body = String(texte || '').trim();
  if (t.length < 3)
    throw fail('LETTRE_TITRE', 400, 'Donne un titre à ta page (3 lettres au moins).');
  if (body.length < 20 || body.length > 4000) {
    throw fail('LETTRE_TEXTE', 400, 'Écris entre 20 et 4000 caractères.');
  }
  const code = cleanText(amorce, 32) || null;
  // La Lettre suit son auteur : si la partie où elle a été payée est close, elle entre dans la
  // file du prof de la partie où l'élève joue aujourd'hui (sinon, à l'ouverture de sa
  // prochaine séance : `rattacherLettresTx`).
  const gameId = await partieDeRelectureTx(tx, { playerId, gameId: row.game_id });
  await tx.execute(
    `UPDATE gl_voyageur_plumes
        SET titre = ?, texte = ?, amorce = ?, statut = 'proposee', game_id = ?, updated_at = NOW()
      WHERE id = ?`,
    [t, body, code, gameId, Number(lettreId)],
  );
  if (gameId != null) {
    await require('./glDemandes').creerDemandeSiPartieEnCoursTx(tx, {
      gameId,
      kind: 'plume',
      refId: Number(lettreId),
    });
  }
  return formatLettre({
    ...row,
    game_id: gameId,
    titre: t,
    texte: body,
    amorce: code,
    statut: 'proposee',
  });
}

/**
 * Partie dont le prof relira la Lettre : celle où elle a été payée tant qu'elle est en cours,
 * sinon la partie en cours la plus récente où l'élève a une équipe ; à défaut, inchangée.
 */
async function partieDeRelectureTx(tx, { playerId, gameId }) {
  const origine = gameId != null ? Number(gameId) : null;
  if (origine != null) {
    const game = await tx.queryOne('SELECT status FROM gl_games WHERE id = ? LIMIT 1', [origine]);
    if (game && ['live', 'paused'].includes(String(game.status))) return origine;
  }
  const autre = await tx.queryOne(
    `SELECT g.id FROM gl_team_members m INNER JOIN gl_games g ON g.id = m.game_id
      WHERE m.player_id = ? AND g.status IN ('live', 'paused')
      ORDER BY g.id DESC LIMIT 1`,
    [Number(playerId)],
  );
  return autre ? Number(autre.id) : origine;
}

/**
 * Sortie automatique (garde-fou 11) : à l'ouverture d'une séance, les Lettres en relecture des
 * élèves de la partie dont la partie d'origine est close rejoignent la file du prof, ici. Une
 * Lettre payée ne reste jamais accrochée à une partie que plus personne n'ouvre.
 * @returns {Promise<number>} nombre de Lettres rattachées
 */
async function rattacherLettresTx(tx, { gameId }) {
  let rows = [];
  try {
    rows = await tx.queryAll(
      `SELECT p.id FROM gl_voyageur_plumes p
         INNER JOIN gl_team_members m ON m.player_id = p.player_id AND m.game_id = ?
         LEFT JOIN gl_games g ON g.id = p.game_id
        WHERE p.source = 'lettre' AND p.statut = 'proposee'
          AND (p.game_id IS NULL OR (p.game_id <> ? AND (g.id IS NULL OR g.status NOT IN ('live', 'paused'))))`,
      [gameId, gameId],
    );
  } catch (err) {
    if (tableAbsente(err)) return 0;
    throw err;
  }
  const demandes = require('./glDemandes');
  for (const row of rows) {
    await tx.execute(
      "UPDATE gl_voyageur_plumes SET game_id = ?, updated_at = NOW() WHERE id = ? AND statut = 'proposee'",
      [gameId, Number(row.id)],
    );
    await demandes.creerDemandeSiPartieEnCoursTx(tx, {
      gameId,
      kind: 'plume',
      refId: Number(row.id),
    });
  }
  return rows.length;
}

/** Lettre en cours de l'élève (la plus récente), ou la dernière validée ; `null` sinon. */
async function loadLettreDuJoueur(db, playerId) {
  try {
    const row = await db.queryOne(
      `SELECT * FROM gl_voyageur_plumes
        WHERE player_id = ? AND source = 'lettre'
        ORDER BY FIELD(statut, 'pas_encore', 'a_ecrire', 'proposee', 'validee', 'refusee'), id DESC
        LIMIT 1`,
      [Number(playerId)],
    );
    return formatLettre(row);
  } catch (err) {
    if (tableAbsente(err)) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------
// Mentorat : juger, retenter, reporter
// ---------------------------------------------------------------------

function formatMentorat(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    gameId: Number(row.game_id),
    teamId: row.team_id != null ? Number(row.team_id) : null,
    playerId: Number(row.player_id),
    seance: Number(row.seance) || 0,
    statut: String(row.statut),
    piste: row.piste ? String(row.piste) : null,
    tentatives: Number(row.tentatives) || 1,
    // Un « pas encore » sans jugement = report d'office (le prof n'a pas pu l'écouter).
    reporte: String(row.statut) === 'pas_encore' && row.juge_at == null,
    ...(row.pseudo !== undefined ? { pseudo: row.pseudo || null } : {}),
  };
}

async function loadMentoratDuJoueur(db, playerId) {
  try {
    const row = await db.queryOne(
      `SELECT * FROM gl_game_mentorats WHERE player_id = ?
        ORDER BY FIELD(statut, 'pas_encore', 'prevu', 'valide'), id DESC LIMIT 1`,
      [Number(playerId)],
    );
    return formatMentorat(row);
  } catch (err) {
    if (tableAbsente(err)) return null;
    throw err;
  }
}

async function listMentorats(db, gameId) {
  const rows = await db.queryAll(
    `SELECT m.*, p.pseudo FROM gl_game_mentorats m
       INNER JOIN gl_players p ON p.id = m.player_id
      WHERE m.game_id = ? ORDER BY m.id DESC LIMIT 200`,
    [gameId],
  );
  return rows.map(formatMentorat);
}

/**
 * Le prof juge un Mentorat écouté : `valider` (réussi) ou `pas_encore` (avec une piste). Dans
 * les deux cas rien n'est rendu ni retiré.
 * @throws 404 `MENTORAT_INTROUVABLE`, 409 `MENTORAT_DEJA_JUGE`
 */
async function jugerMentoratTx(tx, { gameId, mentoratId, decision, piste = null, actorId }) {
  const row = await tx.queryOne(
    'SELECT * FROM gl_game_mentorats WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE',
    [Number(mentoratId), gameId],
  );
  if (!row) throw fail('MENTORAT_INTROUVABLE', 404, 'Mentorat introuvable.');
  if (String(row.statut) !== 'prevu') {
    throw fail('MENTORAT_DEJA_JUGE', 409, 'Ce Mentorat est déjà jugé.');
  }
  const valide = decision === 'valider';
  await tx.execute(
    `UPDATE gl_game_mentorats
        SET statut = ?, piste = ?, juge_par = ?, juge_at = NOW(), updated_at = NOW()
      WHERE id = ?`,
    [
      valide ? 'valide' : 'pas_encore',
      valide ? null : cleanText(piste, 400) || null,
      String(actorId),
      Number(mentoratId),
    ],
  );
  await require('./glDemandes').resoudreDemandeTx(tx, {
    gameId,
    kind: 'mentorat',
    refId: Number(mentoratId),
  });
  const events = [];
  if (valide) {
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId: row.team_id != null ? Number(row.team_id) : null,
        actorType: 'mj',
        actorId: String(actorId),
        eventType: 'mentorat_valide',
        payload: { mentoratId: Number(mentoratId) },
      }),
    );
  }
  return {
    mentorat: formatMentorat({
      ...row,
      juge_at: row.juge_at || new Date(),
      statut: valide ? 'valide' : 'pas_encore',
      piste: valide ? null : cleanText(piste, 400) || null,
    }),
    events,
  };
}

/**
 * L'élève retente son Mentorat après un « pas encore », **sans repayer** : il rentre dans la
 * file du prof pour la séance, dans la partie où il joue aujourd'hui. Toujours un seul Mentorat
 * par séance et par classe — donc jamais le jour du « pas encore ».
 * @throws 404 `MENTORAT_INTROUVABLE`, 409 `MENTORAT_PAS_A_RETENTER`, 409 `SPELL_LIMITE`,
 *   403 `PLAYER_NOT_IN_GAME`
 */
async function retenterMentoratTx(tx, { gameId, playerId, mentoratId }) {
  const game = await tx.queryOne(
    'SELECT id, status FROM gl_games WHERE id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  if (!game || String(game.status) !== 'live')
    throw fail('GAME_NOT_LIVE', 409, 'Partie non lancée');
  const row = await tx.queryOne(
    'SELECT * FROM gl_game_mentorats WHERE id = ? AND player_id = ? LIMIT 1 FOR UPDATE',
    [Number(mentoratId), Number(playerId)],
  );
  if (!row) throw fail('MENTORAT_INTROUVABLE', 404, 'Mentorat introuvable.');
  if (String(row.statut) !== 'pas_encore') {
    throw fail('MENTORAT_PAS_A_RETENTER', 409, 'Ce Mentorat n’est pas à retenter.');
  }
  const membre = await tx.queryOne(
    'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
    [gameId, Number(playerId)],
  );
  if (!membre) throw fail('PLAYER_NOT_IN_GAME', 403, 'Tu ne joues pas dans cette partie.');
  const seance = await seanceCourante(tx, gameId);
  const pris = await tx.queryOne(
    'SELECT id FROM gl_game_mentorats WHERE game_id = ? AND seance = ? LIMIT 1',
    [gameId, seance],
  );
  if (pris) throw refusSansDebit(MENTORAT_DEJA_PREVU);
  await tx.execute(
    `UPDATE gl_game_mentorats
        SET game_id = ?, team_id = ?, seance = ?, statut = 'prevu', tentatives = tentatives + 1,
            updated_at = NOW()
      WHERE id = ?`,
    [gameId, Number(membre.team_id), seance, Number(mentoratId)],
  );
  await demanderEcouteTx(tx, {
    gameId,
    teamId: Number(membre.team_id),
    mentoratId: Number(mentoratId),
    seance,
  });
  return formatMentorat({
    ...row,
    game_id: gameId,
    team_id: membre.team_id,
    seance,
    statut: 'prevu',
    tentatives: (Number(row.tentatives) || 1) + 1,
  });
}

/**
 * Sortie automatique (garde-fou 11) : un Mentorat prévu que le prof n'a pas écouté ne reste pas
 * en attente. À l'ouverture d'une séance (`avantSeance` = son numéro), ceux des séances
 * passées repassent en « pas encore », sans piste ; au camp (`avantSeance` absent), tous.
 * L'élève retente sans repayer. Le jugement précédent est effacé : `juge_at` vide distingue un
 * report d'office d'un « pas encore » dit par le prof.
 * @returns {Promise<number>} nombre de Mentorats reportés
 */
async function reporterMentoratsTx(tx, { gameId, avantSeance = null }) {
  let rows = [];
  try {
    rows = await tx.queryAll(
      `SELECT id FROM gl_game_mentorats
        WHERE game_id = ? AND statut = 'prevu' ${avantSeance != null ? 'AND seance < ?' : ''}`,
      avantSeance != null ? [gameId, Number(avantSeance)] : [gameId],
    );
  } catch (err) {
    if (tableAbsente(err)) return 0;
    throw err;
  }
  const demandes = require('./glDemandes');
  for (const row of rows) {
    await tx.execute(
      "UPDATE gl_game_mentorats SET statut = 'pas_encore', piste = NULL, juge_par = NULL, juge_at = NULL, updated_at = NOW() WHERE id = ? AND statut = 'prevu'",
      [Number(row.id)],
    );
    await demandes.resoudreDemandeTx(tx, {
      gameId,
      kind: 'mentorat',
      refId: Number(row.id),
      statut: 'annulee',
    });
  }
  return rows.length;
}

// ---------------------------------------------------------------------
// Vue de l'élève (le Seuil)
// ---------------------------------------------------------------------

/**
 * Ce que l'élève voit de sa Lettre et de son Mentorat : l'état, la piste du prof, et les textes
 * du catalogue qui lui sont destinés (jamais le critère ni les points de relecture du prof).
 */
async function buildVueDuJoueur(db, playerId) {
  const [lettre, mentorat] = await Promise.all([
    loadLettreDuJoueur(db, playerId),
    loadMentoratDuJoueur(db, playerId),
  ]);
  const out = { lettre: null, mentorat: null };
  if (lettre && lettre.statut !== 'refusee') {
    const t = await loadTextes(db, 'lettre');
    out.lettre = {
      ...lettre,
      presentation: t.presentation || null,
      amorces: Array.isArray(t.amorces)
        ? t.amorces.map((a) => ({
            code: String(a.code || ''),
            titre: String(a.titre || ''),
            texte: String(a.texte || ''),
          }))
        : [],
      retour:
        lettre.statut === 'pas_encore'
          ? t.retour_pas_encore || null
          : lettre.statut === 'validee'
            ? t.retour_valide || null
            : null,
    };
  }
  if (mentorat) {
    const t = await loadTextes(db, 'mentorat');
    out.mentorat = {
      id: mentorat.id,
      gameId: mentorat.gameId,
      statut: mentorat.statut,
      piste: mentorat.piste,
      reporte: mentorat.reporte,
      consigne: t.consigne || null,
      retour: mentorat.reporte
        ? MENTORAT_REPORTE
        : mentorat.statut === 'pas_encore'
          ? t.retour_pas_encore || null
          : mentorat.statut === 'valide'
            ? t.retour_valide || null
            : null,
    };
  }
  return out;
}

module.exports = {
  MENTORAT_DEJA_PREVU,
  MENTORAT_DEJA_PAYE,
  LETTRE_DEJA_PAYEE,
  MENTORAT_REPORTE,
  SEUIL_FERME,
  loadTextes,
  seanceCourante,
  assertSortPersonnelLibre,
  ouvrirLettreTx,
  ouvrirMentoratTx,
  ecrireLettreTx,
  rattacherLettresTx,
  loadLettreDuJoueur,
  loadMentoratDuJoueur,
  listMentorats,
  jugerMentoratTx,
  retenterMentoratTx,
  reporterMentoratsTx,
  buildVueDuJoueur,
  formatLettre,
  formatMentorat,
};
