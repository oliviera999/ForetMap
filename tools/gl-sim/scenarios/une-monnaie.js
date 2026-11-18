'use strict';

/**
 * Scénario `une-monnaie` (ensemble unifié, PR 4, § 9.6 du prompt
 * `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md`) : une année — plateaux 1 à 4 enchaînés, mêmes élèves,
 * bourses gardées d'un chapitre à l'autre — pour une classe moyenne et une classe en
 * difficulté, graine fixée. Les mesures `uneMonnaie` de chaque chapitre
 * (`tools/gl-sim/mesures.js`) disent la bourse moyenne, la part d'élèves au plafond et à zéro,
 * et ce que les équipes avaient en poche à l'ouverture de chaque séance.
 *
 * Assertions (lues après le dernier chapitre, sur toute l'année de la classe) :
 * - `G-5xx` : aucune réponse 5xx ;
 * - `COEURS` : aucun mouvement de cœurs au grand livre — une seule monnaie ;
 * - `PARURES` : chaque parure payée est dans la garde-robe de son acheteur, et aucune n'a été
 *   rendue au comptoir à la fin d'un chapitre ;
 * - `PLAFOND` et `BOURSES-FIN` : des **signaux**, jamais des échecs (`ok` nul) — part d'élèves
 *   au plafond en fin d'année (repère : 25 % au plus) ; bourse moyenne et pot des équipes au
 *   dernier chapitre (le pot du chapitre 1 se lit dans `uneMonnaie.potPremiereSeance`). Le
 *   banc mesure, il ne règle rien : le levier (le prix des sorts) est une donnée, à ne pas
 *   toucher sans décision.
 */

const { scenario } = require('./base');

async function assertions(ctx, mesures) {
  const { db } = ctx;
  const gameId = ctx.partie.gameId;
  const out = [];
  const push = (code, ok, detail) => out.push({ code, ok, detail });

  push('G-5xx', ctx.client.stats.erreurs5xx === 0, `${ctx.client.stats.erreurs5xx} réponse(s) 5xx`);

  const coeurs = await db.queryOne(
    `SELECT COUNT(*) AS n FROM gl_resource_ledger l
      WHERE l.delta_health <> 0
        AND l.game_id IN (SELECT id FROM gl_games WHERE class_id = (SELECT class_id FROM gl_games WHERE id = ?))`,
    [gameId],
  );
  push(
    'COEURS',
    Number(coeurs?.n) === 0,
    `${Number(coeurs?.n) || 0} mouvement(s) de cœurs au grand livre sur l'année`,
  );

  const joueurs = [...ctx.joueurs.values()].map((j) => j.id);
  const marks = joueurs.map(() => '?').join(', ');
  const payees = await db.queryOne(
    `SELECT COUNT(*) AS n FROM gl_resource_ledger WHERE cause = 'parure' AND delta_power < 0 AND player_id IN (${marks})`,
    joueurs,
  );
  const gardees = await db.queryOne(
    `SELECT COUNT(*) AS n FROM gl_player_parures WHERE player_id IN (${marks})`,
    joueurs,
  );
  const rendues = await db.queryOne(
    `SELECT COUNT(*) AS n FROM gl_game_parures WHERE achetee_par IN (${marks}) AND rendue_at IS NOT NULL`,
    joueurs,
  );
  push(
    'PARURES',
    Number(payees?.n) === Number(gardees?.n) && Number(rendues?.n) === 0,
    `${Number(payees?.n) || 0} parure(s) payée(s), ${Number(gardees?.n) || 0} en garde-robe, ${Number(rendues?.n) || 0} rendue(s) au comptoir`,
  );

  // Signaux (jamais des échecs).
  const plafond = Number(ctx.resolved?.max_power_points) || 8;
  const soldes = await db.queryAll(
    `SELECT power_points FROM gl_players WHERE id IN (${marks})`,
    joueurs,
  );
  const auPlafond = soldes.filter((r) => Number(r.power_points) >= plafond).length;
  const pct = soldes.length ? Math.round((1000 * auPlafond) / soldes.length) / 10 : 0;
  push(
    'PLAFOND',
    null,
    `${pct} % des élèves au plafond de ${plafond} gemmes en fin d'année (repère : 25 % au plus)${pct > 25 ? ' — à regarder' : ''}`,
  );
  const m = mesures?.uneMonnaie || null;
  push(
    'BOURSES-FIN',
    null,
    m
      ? `dernier chapitre : bourse moyenne ${m.gemmesMoyenne} gemme(s), ${m.aZeroPct} % à zéro, pot moyen d'équipe ${m.potMoyenParEquipe}`
      : 'mesures indisponibles',
  );
  return out;
}

module.exports = Object.freeze({
  ...scenario({
    id: 'une-monnaie',
    description:
      'Une seule monnaie (PR 4) : une année, classe moyenne / en difficulté × plateaux 1-4, bourses de gemmes, plafond, parures gardées.',
  }),
  compose: true,
  sousScenarios: [
    { id: 'moyenne', classe: 'moyenne', effectif: 20, surface: 'hybride' },
    { id: 'difficulte', classe: 'difficulte', effectif: 20, surface: 'hybride' },
  ],
  plateaux: [1, 2, 3, 4],
  assertions,
});
