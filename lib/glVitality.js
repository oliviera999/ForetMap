// Plafond **technique** : la colonne est un `UNSIGNED INT`, on borne les écritures pour
// qu'aucun effet ne puisse produire une valeur aberrante. Ce n'est pas un plafond de jeu.
const VITALITY_MAX = 99;

/**
 * Plafond **de jeu**, distinct du plafond technique (`VITALITY_MAX`).
 *
 * Sans plafond de jeu, les cœurs s'accumulent sans jamais redescendre : le capital
 * cesse d'être une ressource sous tension, et les sortilèges de vie (Soins, Transmission,
 * Résurrection) répondent à une pénurie qui n'existe plus. Le plafond rend la thésaurisation
 * impossible et redonne sa valeur au soin.
 *
 * `0` (défaut) = pas de plafond de jeu : le comportement historique est conservé tant que
 * l'équipe pédagogique n'a pas choisi de valeur.
 */
function normalizeVitalityCap(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return VITALITY_MAX;
  return Math.max(1, Math.min(VITALITY_MAX, Math.floor(n)));
}

/** Extrait les plafonds de jeu des réglages gameplay (`0`/absent → plafond technique). */
function resolveVitalityCaps(settings = {}) {
  return {
    maxHealth: normalizeVitalityCap(settings?.maxHealthPoints),
    maxPower: normalizeVitalityCap(settings?.maxPowerPoints),
  };
}

function clampVitality(value, max = VITALITY_MAX) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(normalizeVitalityCap(max), Math.floor(n)));
}

/**
 * Applique un delta en respectant le plafond de jeu **sans jamais confisquer** un solde
 * déjà au-dessus.
 *
 * Un élève qui a 9 cœurs le jour où le prof fixe le plafond à 5 ne doit pas en perdre 4
 * d'un coup : la sanction serait rétroactive et incompréhensible. La règle est donc
 * « le plafond bloque les gains, il ne reprend rien » — on ne peut pas monter au-dessus
 * du plafond, mais un solde déjà supérieur reste acquis et ne redescend que par ses
 * propres dépenses.
 */
function applyDeltaWithCap(current, delta, max) {
  const base = Math.max(0, Math.floor(Number(current) || 0));
  const next = base + delta;
  if (next <= base) return Math.max(0, Math.min(VITALITY_MAX, next));
  const ceiling = Math.max(base, normalizeVitalityCap(max));
  return Math.max(0, Math.min(ceiling, next));
}

function getDefaultVitalityFromSettings(settings = {}) {
  const caps = resolveVitalityCaps(settings);
  return {
    health: clampVitality(settings.defaultHealthPoints ?? 3, caps.maxHealth),
    power: clampVitality(settings.defaultPowerPoints ?? 3, caps.maxPower),
  };
}

function parseVitalityDelta(value) {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.trunc(n);
}

/**
 * Verrouille la ligne d'équipe pour toute la durée de la transaction appelante.
 *
 * Les contrôles « effet déjà appliqué » lisent `gl_game_events`, une table qu'aucun verrou
 * ne protège en lecture : deux requêtes lancées au même instant — double clic, deux onglets,
 * deux membres de la même équipe — concluaient toutes deux « pas encore appliqué », puis
 * créditaient chacune l'équipe. Ce verrou sérialise ces transactions : la seconde attend la
 * fin de la première, puis relit un journal où l'événement figure désormais.
 *
 * C'est la ligne d'ÉQUIPE que l'on verrouille, et non celle du joueur : l'idempotence porte
 * sur le couple (équipe, repère) ou (équipe, zone feuillet).
 */
async function lockGlTeamRow(tx, teamId) {
  await tx.queryOne('SELECT id FROM gl_teams WHERE id = ? LIMIT 1 FOR UPDATE', [teamId]);
}

/**
 * Applique un delta de cœurs / gemmes à un joueur.
 *
 * `FOR UPDATE` : le calcul est un lire-modifier-écrire en valeur **absolue**
 * (`UPDATE … SET health_points = ?`), et non un `SET x = x + ?`. Sans verrou de ligne,
 * deux effets appliqués au même instant — un double-clic, deux onglets, un repère et un
 * sortilège — lisent la même valeur de départ et écrivent chacun la leur : le second
 * écrase le premier, et un des deux deltas disparaît. La ligne est donc verrouillée
 * jusqu'à la fin de la transaction appelante, qui sérialise les applications concurrentes.
 */
async function applyPlayerVitalityDelta(
  tx,
  { playerId, healthDelta = 0, powerDelta = 0, caps = null },
) {
  const row = await tx.queryOne(
    'SELECT id, health_points, power_points FROM gl_players WHERE id = ? LIMIT 1 FOR UPDATE',
    [playerId],
  );
  if (!row) {
    const err = new Error('PLAYER_NOT_FOUND');
    err.status = 404;
    throw err;
  }
  const maxHealth = normalizeVitalityCap(caps?.maxHealth);
  const maxPower = normalizeVitalityCap(caps?.maxPower);
  const beforeHealth = Math.max(0, Number(row.health_points) || 0);
  const beforePower = Math.max(0, Number(row.power_points) || 0);
  const wantedHealthDelta = parseVitalityDelta(healthDelta);
  const wantedPowerDelta = parseVitalityDelta(powerDelta);
  const health = applyDeltaWithCap(beforeHealth, wantedHealthDelta, maxHealth);
  const power = applyDeltaWithCap(beforePower, wantedPowerDelta, maxPower);
  await tx.execute(
    'UPDATE gl_players SET health_points = ?, power_points = ?, updated_at = NOW() WHERE id = ?',
    [health, power, playerId],
  );
  return {
    playerId: Number(playerId),
    health,
    power,
    // Gain rogné par le plafond de jeu : l'interface peut dire « tu es au maximum »
    // plutôt que de laisser croire à un bug quand le compteur ne bouge pas.
    healthCapped: health - beforeHealth !== wantedHealthDelta,
    powerCapped: power - beforePower !== wantedPowerDelta,
  };
}

async function applyTeamVitalityDelta(
  tx,
  { gameId, teamId, healthDelta = 0, powerDelta = 0, caps = null },
) {
  const members = await tx.queryAll(
    `SELECT tm.player_id
       FROM gl_team_members tm
      WHERE tm.game_id = ? AND tm.team_id = ?
      ORDER BY tm.player_id ASC`,
    [gameId, teamId],
  );
  if (!members.length) {
    const err = new Error('TEAM_EMPTY');
    err.status = 400;
    throw err;
  }
  const results = [];
  for (const member of members) {
    const updated = await applyPlayerVitalityDelta(tx, {
      playerId: member.player_id,
      healthDelta,
      powerDelta,
      caps,
    });
    results.push(updated);
  }
  return results;
}

async function loadVitalityForGame(queryAllFn, queryOneFn, gameId, vitalityEnabled) {
  if (!vitalityEnabled) return null;
  const game = await queryOneFn('SELECT class_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!game?.class_id) return { enabled: true, byPlayerId: {} };
  const rows = await queryAllFn(
    `SELECT id, health_points, power_points
       FROM gl_players
      WHERE class_id = ?`,
    [game.class_id],
  );
  const byPlayerId = {};
  for (const row of rows) {
    byPlayerId[Number(row.id)] = {
      health: clampVitality(row.health_points),
      power: clampVitality(row.power_points),
    };
  }
  return { enabled: true, byPlayerId };
}

function resolveVitalityError(err) {
  if (err?.status === 404 && err?.message === 'PLAYER_NOT_FOUND') {
    return { status: 404, error: 'Joueur introuvable' };
  }
  if (err?.status === 400 && err?.message === 'TEAM_EMPTY') {
    return { status: 400, error: 'Aucun joueur dans cette équipe pour cette partie' };
  }
  if (err?.status === 400 && err?.message === 'PLAYER_NOT_ON_TEAM') {
    return {
      status: 400,
      error: 'Un ou plusieurs joueurs ciblés n’appartiennent pas à cette équipe',
    };
  }
  if (err?.message === 'PLAYER_CLASS_MISMATCH') {
    return { status: 409, error: 'Le joueur n’appartient pas à la classe de cette partie' };
  }
  return null;
}

module.exports = {
  VITALITY_MAX,
  clampVitality,
  normalizeVitalityCap,
  resolveVitalityCaps,
  applyDeltaWithCap,
  getDefaultVitalityFromSettings,
  parseVitalityDelta,
  lockGlTeamRow,
  applyPlayerVitalityDelta,
  applyTeamVitalityDelta,
  loadVitalityForGame,
  resolveVitalityError,
};
