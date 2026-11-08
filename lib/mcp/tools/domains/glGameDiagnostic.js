'use strict';

/**
 * `gl_game_diagnostic` — diagnostic d'une partie « Tenir à deux » (domaine `gl`, lecture seule).
 *
 * - invariants du moteur (`checkTenirInvariantsFromDb`, `lib/glTenirInvariants.js`) : bornes des
 *   bourses, cohérence du grand livre, pions, voile, états de pages, relances, fouilles, réserve ;
 * - grand livre par cause (`sumLedgerByCause`) et réserve de la caravane par équipe
 *   (`listReserves`, E4, migration 341) ;
 * - durées : ouverture → clos par tour, moyenne, séances jusqu'au Seuil ;
 * - compteurs : fouilles (dont réparations), pages trouvées / tenues / pâlies, sorts lancés,
 *   dons, retraits ouverts, évènements par type.
 *
 * Aucun nom d'élève ; l'instantané des invariants (bourses par joueur) **n'est pas renvoyé**,
 * seules les violations le sont. Lecture SQL READ ONLY sous vérification du staff G&L.
 */

const { defineDomainTool, req } = require('./factory');
const { gameIdParam, gameplaySettings, loadGameOrThrow, readGl } = require('./glCommon');
const {
  formatGame,
  loadCounters,
  loadRounds,
  loadSeuilRound,
  summarizeRounds,
} = require('../../../glDiagnostic');

const TOOL = 'gl_game_diagnostic';

/** Verdict compact : vert sans violation, rouge sinon (orange si seulement des écarts de quota). */
const WARN_CODES = new Set(['RELANCES_MAX', 'FOUILLES_QUOTA']);

function verdictOf(violations) {
  if (!violations.length) return 'vert';
  return violations.every((v) => WARN_CODES.has(v.code)) ? 'orange' : 'rouge';
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : diagnostic d’une partie (invariants, économie, durées)',
  intro:
    'Diagnostic d’une partie Gnomes & Licornes « Tenir à deux » : violations d’invariants du moteur (bourses, grand livre, pions, voile, pages, quotas), grand livre des ressources par cause, réserve de la caravane par équipe, durées des tours et séances jusqu’au Seuil, compteurs (fouilles, pages trouvées / tenues / pâlies, sorts lancés, dons). Lecture seule, aucun nom d’élève. Réservé au staff G&L.',
  actions: {
    get: {
      summary: 'invariants (violations), grand livre par cause, réserves, durées, compteurs',
      params: { game_id: req(gameIdParam) },
      run: async (args, ctx) => {
        const settings = await gameplaySettings();
        return readGl(
          ctx,
          async (db) => {
            const game = await loadGameOrThrow(db, args.game_id);
            const { checkTenirInvariantsFromDb } = require('../../../glTenirInvariants');
            const { sumLedgerByCause, listReserves } = require('../../../glBourses');
            const invariants = await checkTenirInvariantsFromDb(db, args.game_id, settings);
            const violations = invariants.violations || [];
            const rounds = await loadRounds(db, args.game_id);
            const seuilRound = await loadSeuilRound(db, args.game_id);
            let ledger = [];
            try {
              ledger = await sumLedgerByCause(db, args.game_id);
            } catch (_) {
              ledger = [];
            }
            let reserves = [];
            try {
              reserves = await listReserves(db, args.game_id);
            } catch (_) {
              reserves = [];
            }
            return {
              game: formatGame(game),
              verdict: verdictOf(violations),
              invariants: { ok: invariants.ok, count: violations.length, violations },
              ledger: {
                parCause: ledger,
                totalCoeurs: ledger.reduce((a, r) => a + r.deltaHealth, 0),
                totalGemmes: ledger.reduce((a, r) => a + r.deltaPower, 0),
                mouvements: ledger.reduce((a, r) => a + r.count, 0),
              },
              reserves,
              durees: summarizeRounds(rounds, { seuilRound }),
              compteurs: await loadCounters(db, args.game_id),
            };
          },
          { timeoutMs: 20000 },
        );
      },
    },
  },
});

module.exports = { buildGlGameDiagnosticTool: () => tool, verdictOf };
