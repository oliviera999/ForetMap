'use strict';

/**
 * « Tenir à deux » v2 — fenêtres, limites et pot des sorts du grimoire v2 (spec § 10).
 *
 * - Fenêtre : quand un sort est lançable (`gl_spells.fenetre`, vocabulaire de `sorts.json`).
 *   Un sort hors fenêtre est refusé 409 `SPELL_FENETRE` **avec le message de la fenêtre**.
 * - Limite : `limite_json = { par: tour|seance|chapitre|trimestre|annee, n, portee: equipe|partie|eleve }`,
 *   comptée sur les brouillons `status = 'cast'` du même sort. Un tour = une séance (§ 14).
 *   **Aucun quota global.**
 * - Pot : répartition à parts égales entre membres présents non en retrait, reste au plus riche
 *   dans la ressource (égalité : plus petit identifiant), un membre à 0 ne verse pas.
 */

const { trimestreOf, anneeScolaireOf } = require('./glTenir');

const FENETRES = Object.freeze({
  avant_jet: {
    message: 'Ce sort se lance en phase « jeu », avant le jet de l’équipe.',
    check: (c) => c.phase === 'jeu' && !c.teamRolled,
  },
  apres_jet: {
    message:
      'Ce sort se lance en phase « jeu », juste après le jet de l’équipe — avant qu’une autre équipe ne joue.',
    // C1/C2 (simulation du 7 novembre 2026) : le dernier jet du tour doit être celui de l'équipe
    // (aucune autre équipe n'a joué depuis). Sans jet enregistré dans le tour, seul `teamRolled`
    // tranche (tours antérieurs à la colonne `dernier_jet_json`).
    check: (c) =>
      c.phase === 'jeu' &&
      c.teamRolled &&
      (c.dernierJetTeamId == null || c.teamId == null || c.dernierJetTeamId === c.teamId),
  },
  jeu: {
    message: 'Ce sort se lance pendant la phase « jeu ».',
    check: (c) => c.phase === 'jeu',
  },
  jeu_avant_fouille: {
    message: 'Ce sort se lance pendant la phase « jeu », avant une fouille de l’équipe.',
    check: (c) => c.phase === 'jeu',
  },
  avant_jets_pacte: {
    message: 'Ce sort se lance en phase « jeu », avant les jets des deux équipes du pacte.',
    check: (c) => c.phase === 'jeu' && !c.teamRolled && !c.partnerRolled,
  },
  activite: {
    message: 'Ce sort se lance pendant l’activité de classe (file du prof).',
    check: (c) => c.gameLive,
  },
  seuil: {
    message: 'Ce sort se lance au seuil (hors phase « jeu »).',
    check: (c) => c.phase !== 'jeu',
  },
  seuil_veillee: {
    message: 'Ce sort se lance au seuil ou en veillée (hors phase « jeu »).',
    check: (c) => c.phase !== 'jeu',
  },
  fin_seance: {
    message: 'Ce sort se lance à la fin de la séance (phase « souffle » ou tour clos).',
    check: (c) => c.phase === 'souffle' || c.phase === 'clos' || c.phase == null,
  },
  trimestre_3: {
    message: 'Ce sort se lance au troisième trimestre.',
    check: (c) => c.trimestre === 3,
  },
});

function fail(code, status, extra = {}) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function fenetreMessage(fenetre) {
  return FENETRES[String(fenetre || '')]?.message || 'Ce sort n’est pas lançable maintenant.';
}

/**
 * @param {object} p
 * @param {object} p.spell `{ fenetre }`
 * @param {object|null} p.round vue du tour (`phase`)
 * @param {boolean} p.teamRolled l'équipe a jeté les dés ce tour
 * @param {boolean} [p.partnerRolled]
 * @param {object} [p.resolved] réglages résolus (trimestres)
 * @param {number|null} [p.teamId] équipe lanceuse (fenêtre « après le jet » : dernier jet du tour)
 */
function assertFenetre({
  spell,
  round,
  teamRolled,
  partnerRolled = false,
  resolved = null,
  now = new Date(),
  gameLive = true,
  teamId = null,
}) {
  const fenetre = String(spell?.fenetre || '');
  if (!fenetre) return;
  const def = FENETRES[fenetre];
  if (!def) return;
  const ctx = {
    phase: round?.phase || null,
    teamRolled: !!teamRolled,
    partnerRolled: !!partnerRolled,
    trimestre: trimestreOf(now, resolved),
    gameLive,
    teamId: teamId != null ? Number(teamId) : null,
    dernierJetTeamId: round?.dernierJet?.teamId != null ? Number(round.dernierJet.teamId) : null,
  };
  if (!def.check(ctx)) throw fail('SPELL_FENETRE', 409, { message: def.message, fenetre });
}

function parseLimite(raw) {
  if (!raw) return null;
  try {
    const v = typeof raw === 'object' ? raw : JSON.parse(String(raw));
    if (!v || typeof v !== 'object') return null;
    const n = Number(v.n);
    return {
      par: String(v.par || 'tour'),
      n: Number.isInteger(n) && n > 0 ? n : 1,
      portee: String(v.portee || 'equipe'),
    };
  } catch (_) {
    return null;
  }
}

/** Bornes de dates d'un trimestre (`resolved.trimestres`) ou d'une année scolaire. */
function periodBounds(par, now, resolved) {
  const d = now instanceof Date ? now : new Date(now);
  if (par === 'trimestre') {
    const t = trimestreOf(d, resolved);
    const trimestres = resolved?.trimestres || {};
    const range = trimestres[String(t)];
    if (!range) return null;
    const year = d.getFullYear();
    const toDate = (md, y) => new Date(`${y}-${md}T00:00:00`);
    let start = toDate(range[0], year);
    let end = toDate(range[1], year);
    if (start > d) start = toDate(range[0], year - 1);
    if (end < start) end = toDate(range[1], year + 1);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (par === 'annee') {
    const [y] = anneeScolaireOf(d).split('-').map(Number);
    return { start: new Date(`${y}-08-01T00:00:00`), end: new Date(`${y + 1}-08-01T00:00:00`) };
  }
  return null;
}

/**
 * Compte les lancements (`status = 'cast'`) du même sort dans la période et la portée, et
 * refuse 409 `SPELL_LIMITE` au-delà de `n`.
 */
async function assertLimite(
  db,
  { spell, gameId, teamId, playerId = null, roundNumber = 0, resolved = null, now = new Date() },
) {
  const limite = parseLimite(spell?.limiteJson ?? spell?.limite_json ?? spell?.limite);
  if (!limite) return { limite: null, count: 0 };
  const where = ['spell_code = ?', "status = 'cast'"];
  const params = [spell.spellCode || spell.spell_code || spell.code];
  switch (limite.par) {
    case 'tour':
    case 'seance':
      where.push('game_id = ?', 'cast_round_number = ?');
      params.push(gameId, Number(roundNumber) || 0);
      break;
    case 'chapitre':
      where.push('game_id = ?');
      params.push(gameId);
      break;
    case 'trimestre':
    case 'annee': {
      const bounds = periodBounds(limite.par, now, resolved);
      if (bounds) {
        where.push('cast_at >= ? AND cast_at < ?');
        params.push(bounds.start, bounds.end);
      } else if (limite.portee !== 'partie') {
        // Date hors des trimestres configurés : on ne compte pas « depuis toujours »,
        // la période se replie sur le chapitre en cours (la portée `partie` l'ajoute déjà).
        where.push('game_id = ?');
        params.push(gameId);
      }
      break;
    }
    default:
      where.push('game_id = ?');
      params.push(gameId);
  }
  if (limite.portee === 'equipe') {
    where.push('team_id = ?');
    params.push(teamId);
  } else if (limite.portee === 'eleve') {
    if (playerId == null) throw fail('SPELL_LIMITE_ELEVE', 400);
    where.push('player_id = ?');
    params.push(playerId);
  } else if (limite.portee === 'partie' && !['tour', 'seance', 'chapitre'].includes(limite.par)) {
    where.push('game_id = ?');
    params.push(gameId);
  }
  const row = await db.queryOne(
    `SELECT COUNT(*) AS c FROM gl_spell_cast_drafts WHERE ${where.join(' AND ')}`,
    params,
  );
  const count = Number(row?.c) || 0;
  if (count >= limite.n) {
    throw fail('SPELL_LIMITE', 409, {
      limite,
      count,
      message: limiteMessage(limite),
    });
  }
  return { limite, count };
}

function limiteMessage(limite) {
  if (!limite) return '';
  const par =
    {
      tour: 'par tour',
      seance: 'par séance',
      chapitre: 'par chapitre',
      trimestre: 'par trimestre',
      annee: 'par année',
    }[limite.par] || `par ${limite.par}`;
  const portee =
    { equipe: 'et par équipe', partie: 'pour toute la partie', eleve: 'et par élève' }[
      limite.portee
    ] || '';
  return `Limite atteinte : ${limite.n} fois ${par} ${portee}`.trim();
}

/**
 * Pot d'un sort : parts égales entre `members` (`{ playerId, health, power }`, déjà filtrés :
 * présents, non en retrait), reste au plus riche dans la ressource (égalité → plus petit id),
 * un membre à 0 ne verse pas ; une part dépassant le solde est reportée sur les suivants.
 * @returns {Array<{ playerId, amount }>}
 */
function suggestContributions({ members, ressource, cout }) {
  const list = (members || [])
    .map((m) => ({
      playerId: Number(m.playerId),
      solde: Math.max(
        0,
        Number(ressource === 'power' ? (m.power ?? m.powerPoints) : (m.health ?? m.healthPoints)) ||
          0,
      ),
    }))
    .filter((m) => Number.isInteger(m.playerId));
  const total = Math.max(0, Number(cout) || 0);
  const out = new Map(list.map((m) => [m.playerId, 0]));
  if (!list.length || !total) return [...out].map(([playerId, amount]) => ({ playerId, amount }));
  const payers = list.filter((m) => m.solde > 0);
  if (!payers.length) return [...out].map(([playerId, amount]) => ({ playerId, amount }));
  const base = Math.floor(total / payers.length);
  let remaining = total;
  for (const m of payers) {
    const part = Math.min(base, m.solde);
    out.set(m.playerId, part);
    remaining -= part;
  }
  // Reste : une unité à la fois, du plus riche (solde restant) au moins riche, en boucle.
  const byRichest = () =>
    payers
      .map((m) => ({ ...m, reste: m.solde - out.get(m.playerId) }))
      .filter((m) => m.reste > 0)
      .sort((a, b) => b.reste - a.reste || a.playerId - b.playerId);
  let guard = 0;
  while (remaining > 0 && guard < 1000) {
    const candidates = byRichest();
    if (!candidates.length) break;
    for (const c of candidates) {
      if (remaining <= 0) break;
      out.set(c.playerId, out.get(c.playerId) + 1);
      remaining -= 1;
    }
    guard += 1;
  }
  return [...out].map(([playerId, amount]) => ({ playerId, amount }));
}

module.exports = {
  FENETRES,
  fenetreMessage,
  assertFenetre,
  parseLimite,
  assertLimite,
  limiteMessage,
  suggestContributions,
  periodBounds,
};
