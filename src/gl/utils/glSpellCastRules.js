/**
 * Règles pures pour le lancement collaboratif de sortilèges (UI).
 */

export function sumContributionTotals(contributions = []) {
  let gems = 0;
  let hearts = 0;
  for (const row of contributions) {
    gems += Number(row?.gems) || 0;
    hearts += Number(row?.hearts) || 0;
  }
  return { gems, hearts };
}

export function isSpellCastReady(totals, required) {
  const req = required || { gems: 0, hearts: 0 };
  const t = totals || { gems: 0, hearts: 0 };
  if (req.gems > 0 && t.gems !== req.gems) return false;
  if (req.hearts > 0 && t.hearts !== req.hearts) return false;
  if (req.gems === 0 && req.hearts === 0) return false;
  return true;
}

export function canEditContributionRow({
  contributionMode,
  actorPlayerId,
  targetPlayerId,
  isStaff = false,
}) {
  if (isStaff) return true;
  const actor = Number(actorPlayerId);
  const target = Number(targetPlayerId);
  if (contributionMode === 'coordinator') return true;
  if (contributionMode === 'self_only') return actor === target;
  if (contributionMode === 'both') return true;
  return false;
}

export function needsOtherPlayerConfirm({
  contributionMode,
  actorPlayerId,
  targetPlayerId,
}) {
  if (contributionMode !== 'both') return false;
  return Number(actorPlayerId) !== Number(targetPlayerId);
}

export function filterSelectableTeams({
  teams,
  teamScope,
  playerTeamId,
  currentTeamId,
  turnsEnabled,
  isStaff,
}) {
  const list = Array.isArray(teams) ? teams : [];
  let filtered = list;
  if (!isStaff && (teamScope === 'own_team' || teamScope === 'mj_any')) {
    if (playerTeamId == null) return [];
    filtered = filtered.filter((t) => Number(t.id) === Number(playerTeamId));
  }
  if (turnsEnabled && currentTeamId != null) {
    filtered = filtered.filter((t) => Number(t.id) === Number(currentTeamId));
  }
  return filtered;
}

export function formatPlayerLabel(player) {
  if (player?.pseudo) return String(player.pseudo);
  const name = `${player?.firstName || ''} ${player?.lastName || ''}`.trim();
  return name || `Joueur #${player?.playerId}`;
}

/** Payload PUT contributions : une entrée par joueur du roster (y compris zéros). */
export function buildContributionsSavePayload(roster, localContribs = []) {
  const byId = new Map((localContribs || []).map((r) => [Number(r.playerId), r]));
  return (roster || []).map((p) => {
    const row = byId.get(Number(p.playerId));
    return {
      playerId: Number(p.playerId),
      gems: Number(row?.gems) || 0,
      hearts: Number(row?.hearts) || 0,
    };
  });
}

export function buildLocalContributions(roster, existing = []) {
  const byId = new Map((existing || []).map((c) => [Number(c.playerId), c]));
  return (roster || []).map((p) => {
    const prev = byId.get(Number(p.playerId));
    return {
      playerId: Number(p.playerId),
      gems: Number(prev?.gems) || 0,
      hearts: Number(prev?.hearts) || 0,
    };
  });
}

/** Groupe le roster par équipe (ordre stable). */
export function groupRosterByTeam(roster = []) {
  const groups = new Map();
  for (const player of roster) {
    const key = player?.teamId != null ? Number(player.teamId) : 0;
    const label = player?.teamName || (key ? `Équipe ${key}` : 'Sans équipe');
    if (!groups.has(key)) {
      groups.set(key, { teamId: key, teamName: label, players: [] });
    }
    groups.get(key).players.push(player);
  }
  return [...groups.values()];
}

/** Coût affiché à partir des champs catalogue ou du brouillon. */
export function formatSpellCost(spellOrRequired) {
  const req = spellOrRequired?.required || spellOrRequired;
  const gems = Number(req?.gems ?? req?.cout_gemmes) || 0;
  const hearts = Number(req?.hearts ?? req?.cout_coeurs) || 0;
  const parts = [];
  if (gems > 0) parts.push(`${gems} 💎`);
  if (hearts > 0) parts.push(`${hearts} ❤️`);
  return parts.length ? parts.join(' · ') : '';
}

/** Étape initiale du wizard selon rôle et sort présélectionné. */
export function resolveSpellCastInitialStep({ isStaff, activeSpellCode }) {
  if (!activeSpellCode) return 'spell';
  if (isStaff) return 'fund';
  return 'team';
}
