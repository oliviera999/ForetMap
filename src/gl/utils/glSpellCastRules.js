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
  // Miroir de `isDraftReady` (`lib/glSpellCast.js`) : un axe non demandé reste à zéro.
  if (req.gems === 0 && t.gems > 0) return false;
  if (req.hearts === 0 && t.hearts > 0) return false;
  if (req.gems === 0 && req.hearts === 0) return false;
  return true;
}

/**
 * Le peuple `teamType` ('gnome' | 'unicorn') peut-il lancer un sort restreint à
 * `casterKind` ? Miroir front de `isCasterKindAllowed` (`lib/glSpellOptions.js`) :
 * l'UI évite de proposer un choix que le serveur refusera, elle ne décide de rien.
 */
export function isCasterKindAllowed(casterKind, teamType) {
  const kind = String(casterKind || 'any').toLowerCase();
  if (kind !== 'gnome' && kind !== 'unicorn') return true;
  return String(teamType || '').toLowerCase() === kind;
}

export function canEditContributionRow({
  contributionMode,
  actorPlayerId,
  targetPlayerId,
  isStaff = false,
  casterKind = 'any',
  teamType = null,
}) {
  // La restriction de peuple prime sur le mode de contribution — MJ compris : le
  // serveur refuse de débiter un contributeur du mauvais peuple, quel que soit l'acteur.
  if (!isCasterKindAllowed(casterKind, teamType)) return false;
  if (isStaff) return true;
  const actor = Number(actorPlayerId);
  const target = Number(targetPlayerId);
  if (contributionMode === 'coordinator') return true;
  if (contributionMode === 'self_only') return actor === target;
  if (contributionMode === 'both') return true;
  return false;
}

export function needsOtherPlayerConfirm({ contributionMode, actorPlayerId, targetPlayerId }) {
  if (contributionMode !== 'both') return false;
  return Number(actorPlayerId) !== Number(targetPlayerId);
}

/**
 * Équipes qu'un acteur peut viser pour un sortilège.
 *
 * G13-a — le filtre « seule l'équipe active » a été retiré : il appliquait la rotation
 * séquentielle d'avant le mode classique (migration 139), alors que ce mode fait jouer
 * toutes les équipes dans un même tour et ne borne pas les sortilèges — c'est l'approbation
 * du MJ qui les régule. L'écran promettait donc une règle que le serveur n'a jamais eue.
 */
export function filterSelectableTeams({
  teams,
  teamScope,
  playerTeamId,
  isStaff,
  casterKind = 'any',
}) {
  const list = Array.isArray(teams) ? teams : [];
  let filtered = list;
  if (!isStaff && (teamScope === 'own_team' || teamScope === 'mj_any')) {
    if (playerTeamId == null) return [];
    filtered = filtered.filter((t) => Number(t.id) === Number(playerTeamId));
  }
  // Sort réservé à un peuple : les équipes de l'autre peuple ne sont pas proposées,
  // y compris au MJ — c'est le peuple de l'équipe qui lance qui est contraint.
  return filtered.filter((t) => isCasterKindAllowed(casterKind, t.type));
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

/**
 * Roster carte : une entrée par équipe de la partie (même vide), joueurs triés.
 */
export function buildMapRosterGroups(teams = [], roster = []) {
  const grouped = groupRosterByTeam(roster);
  const byTeamId = new Map(grouped.map((group) => [Number(group.teamId), group]));
  return (Array.isArray(teams) ? teams : []).map((team) => {
    const teamId = Number(team.id);
    const existing = byTeamId.get(teamId);
    return {
      teamId,
      teamName: team.name || existing?.teamName || `Équipe ${teamId}`,
      teamColor: team.color || null,
      players: existing?.players || [],
    };
  });
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

function formatCasterContribution(caster) {
  const parts = [];
  const gems = Number(caster?.gems) || 0;
  const hearts = Number(caster?.hearts) || 0;
  if (gems > 0) parts.push(`${gems} 💎`);
  if (hearts > 0) parts.push(`${hearts} ❤️`);
  return parts.join(' · ');
}

function resolveCastersFromPayload(payload = {}, roster = []) {
  if (Array.isArray(payload.casters) && payload.casters.length > 0) {
    return payload.casters
      .filter((c) => (Number(c?.gems) || 0) > 0 || (Number(c?.hearts) || 0) > 0)
      .map((c) => ({
        playerId: Number(c.playerId),
        displayName: String(c.displayName || `Joueur #${c.playerId}`),
        gems: Number(c.gems) || 0,
        hearts: Number(c.hearts) || 0,
        contributionLabel: formatCasterContribution(c),
      }));
  }

  const rosterById = new Map((roster || []).map((p) => [Number(p.playerId), p]));
  const contribs = Array.isArray(payload.contributions) ? payload.contributions : [];
  return contribs
    .filter((c) => (Number(c?.gems) || 0) > 0 || (Number(c?.hearts) || 0) > 0)
    .map((c) => {
      const row = rosterById.get(Number(c.playerId));
      return {
        playerId: Number(c.playerId),
        displayName: row ? formatPlayerLabel(row) : `Joueur #${c.playerId}`,
        gems: Number(c.gems) || 0,
        hearts: Number(c.hearts) || 0,
        contributionLabel: formatCasterContribution(c),
      };
    });
}

/**
 * View-model pour le popup de résultat après lancement.
 * @param {{ event?: object, draft?: object }} source
 */
export function buildSpellCastResultViewModel({ event, draft } = {}) {
  const evt = event || {};
  const payload = evt.payload || {};
  const eventId = evt.id != null ? Number(evt.id) : null;
  const spellCode =
    String(payload.spellCode || draft?.spellCode || '')
      .trim()
      .toUpperCase() || null;
  const spellName = String(payload.spellName || draft?.spell?.nom || spellCode || 'Sortilège');
  const spellEmoji =
    payload.spellEmoji != null
      ? String(payload.spellEmoji)
      : draft?.spell?.emoji != null
        ? String(draft.spell.emoji)
        : '✨';
  const costLabel = formatSpellCost(payload.cost || draft?.required);
  const casters = resolveCastersFromPayload(payload, draft?.roster);

  return {
    eventId,
    spellCode,
    spellName,
    spellEmoji,
    costLabel,
    casters,
  };
}
