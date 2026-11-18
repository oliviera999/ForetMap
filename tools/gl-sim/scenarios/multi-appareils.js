'use strict';

/**
 * Scénario `multi-appareils` (ensemble unifié, PR 3, M13) : un chapitre 1 joué par **deux
 * tablettes par équipe**, équipes en parallèle. La première tablette de chaque équipe est
 * acceptée par le prof (« Tout accepter »), la seconde par la première. Pendant toute la partie,
 * les deux tablettes d'une équipe envoient **chaque geste au même instant, avec la même version
 * d'état** (`tools/gl-sim/equipe.js › appelADeuxAppareils`).
 *
 * Attendus, chacun une assertion du rapport :
 * - `DOUBLONS` : jamais deux gestes appliqués pour une même version (0 doublon) ;
 * - `LIVRE` : livre équilibré, invariants rejoués après chaque geste (0 invariant) ;
 * - `PERIMES` : la tablette en trop est bien refusée, proprement (`ETAT_PERIME`,
 *   `MAIN_AILLEURS`), sans 5xx ;
 * - `JETS` : au plus un jet de dés par équipe et par tour au journal (hors relances) ;
 * - `SESSIONS` : deux sessions acceptées par équipe et par séance, dont une par l'équipe ;
 * - `MAINS` : après la clôture, plus aucune main tenue (aucun état d'attente sans sortie).
 */

const { scenario } = require('./base');
const { checkTenirInvariantsFromDb } = require('../../../lib/glTenirInvariants');

async function assertions(ctx) {
  const { db } = ctx;
  const gameId = ctx.partie.gameId;
  const multi = ctx.cache.multi || {
    paires: 0,
    doublons: 0,
    perimes: 0,
    mainAilleurs: 0,
    reprises: 0,
  };
  const out = [];
  const push = (code, ok, detail) => out.push({ code, ok, detail });

  push('G-5xx', ctx.client.stats.erreurs5xx === 0, `${ctx.client.stats.erreurs5xx} réponse(s) 5xx`);
  push(
    'DOUBLONS',
    multi.paires > 0 ? multi.doublons === 0 : null,
    `${multi.doublons} doublon(s) sur ${multi.paires} geste(s) envoyé(s) par deux tablettes au même instant${multi.exemples?.length ? ` — ${multi.exemples.join(' ; ')}` : ''}`,
  );
  push(
    'PERIMES',
    multi.paires > 0 ? multi.perimes + multi.mainAilleurs > 0 : null,
    `tablette en trop refusée : ${multi.perimes} × ETAT_PERIME, ${multi.mainAilleurs} × MAIN_AILLEURS ; ${multi.reprises} rechargement(s) après un état périmé des deux écrans`,
  );
  const livre = await db.withTransaction((tx) =>
    checkTenirInvariantsFromDb(tx, gameId, ctx.settings),
  );
  push(
    'LIVRE',
    livre.ok,
    livre.ok
      ? `livre équilibré (${ctx.compteurs.invariantsVerifies} contrôles pendant le chapitre)`
      : livre.violations.map((v) => v.code).join(', '),
  );

  // Un jet par équipe et par tour ; une Relance ou une bonne réponse de case en rend un de plus.
  const jets = await db.queryAll(
    `SELECT team_id, JSON_EXTRACT(payload_json, '$.roundNumber') AS tour, COUNT(*) AS n
       FROM gl_game_events WHERE game_id = ? AND event_type = 'dice_roll'
      GROUP BY team_id, tour`,
    [gameId],
  );
  const rendus = await db.queryOne(
    `SELECT COUNT(*) AS n FROM gl_game_events
      WHERE game_id = ?
        AND (event_type = 'relance_bonus'
          OR (event_type = 'spell_cast'
            AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.spellCode')) = 'SL005'))`,
    [gameId],
  );
  const enTrop = jets.reduce((acc, j) => acc + Math.max(0, Number(j.n) - 1), 0);
  push(
    'JETS',
    jets.length ? enTrop <= Number(rendus?.n || 0) : null,
    `${jets.length} couple(s) équipe × tour ; ${enTrop} jet(s) en plus du premier, pour ${Number(rendus?.n || 0)} jet(s) rendu(s) par une bonne réponse de case ou une Relance`,
  );

  const sessions = await db.queryOne(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT team_id) AS equipes,
            SUM(accepted_by = 'mj') AS parLeProf, SUM(accepted_by = 'equipe') AS parLEquipe,
            SUM(accepted_at IS NULL) AS jamais
       FROM gl_guest_tokens WHERE game_id = ? AND kind = 'team_session'`,
    [gameId],
  );
  push(
    'SESSIONS',
    Number(sessions?.equipes) === ctx.partie.equipes.length &&
      Number(sessions?.parLeProf) > 0 &&
      Number(sessions?.parLeProf) === Number(sessions?.parLEquipe) &&
      Number(sessions?.jamais) === 0,
    `${Number(sessions?.n) || 0} session(s) pour ${Number(sessions?.equipes) || 0} équipe(s) : ${Number(sessions?.parLeProf) || 0} acceptée(s) par le prof, ${Number(sessions?.parLEquipe) || 0} par un appareil de l'équipe, ${Number(sessions?.jamais) || 0} restée(s) en attente`,
  );
  const mains = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_team_etat WHERE game_id = ? AND main_holder IS NOT NULL AND main_expire_ms > ?',
    [gameId, require('../../../lib/glClock').nowMs()],
  );
  push(
    'MAINS',
    Number(mains?.n) === 0,
    `${Number(mains?.n) || 0} main(s) encore tenue(s) après le camp`,
  );
  return out;
}

module.exports = Object.freeze({
  ...scenario({
    id: 'multi-appareils',
    description:
      'Deux tablettes par équipe (lien de classe, sessions acceptées) au chapitre 1, équipes en parallèle : chaque geste envoyé par les deux tablettes au même instant — 0 doublon, 0 invariant.',
    surface: 'tablette',
    parallele: true,
    plateaux: [1],
  }),
  sessionsEquipe: true,
  appareilsParEquipe: 2,
  assertions,
});
