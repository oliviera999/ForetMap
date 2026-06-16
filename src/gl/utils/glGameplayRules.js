/**
 * Règles gameplay pures du shell AppGL (O6), extraites de `src/gl/AppGL.jsx` :
 * réglages gameplay par défaut, droits d'action joueur, droit de lancer un
 * sortilège, vitalité et mascotte du joueur. Aucun état React ici.
 */
import { isModuleEnabled } from '../constants/modules.js';

export const GL_DEFAULT_GAMEPLAY = {
  turnsEnabled: false,
  narrationEnabled: false,
  playerActionsEnabled: false,
  scoringEnabled: false,
  vitalityEnabled: false,
  defaultHealthPoints: 3,
  defaultPowerPoints: 3,
  spellCastEnabled: false,
  spellCastContributionMode: 'both',
  spellCastTeamScope: 'any_team',
  spellCastMjOnly: false,
  qcmMjOnly: false,
};

/**
 * Vrai si le joueur peut demander une action : module actif, équipe affectée,
 * et — si le jeu en tours est actif — c'est le tour de son équipe.
 * Toujours faux pour l'UI staff (le MJ agit directement).
 */
export function computeCanRequestAction({
  showStaffAdminUi,
  gameplaySettings,
  auth,
  currentTeamId,
}) {
  if (showStaffAdminUi || !gameplaySettings.playerActionsEnabled) return false;
  const myTeamId = auth?.teamId != null ? Number(auth.teamId) : null;
  if (myTeamId == null) return false;
  if (gameplaySettings.turnsEnabled && currentTeamId != null && currentTeamId !== myTeamId)
    return false;
  return true;
}

/**
 * Vrai si le lancer de sort est permis : module ou réglage actif, vitalité
 * activée, partie en cours, restriction MJ respectée, et tour de l'équipe du
 * joueur si le jeu en tours est actif.
 */
export function computeCanSpellCast({
  modules,
  gameplaySettings,
  gameState,
  auth,
  currentTeamId,
  showsPlayerChrome,
  showStaffAdminUi,
}) {
  const moduleOn =
    isModuleEnabled(modules, 'spellCastEnabled') || gameplaySettings.spellCastEnabled === true;
  if (!moduleOn || !gameplaySettings.vitalityEnabled) return false;
  if (!gameState?.game?.id || gameState?.game?.status !== 'live') return false;
  if (gameplaySettings.spellCastMjOnly && !showStaffAdminUi) return false;
  if (gameplaySettings.turnsEnabled && currentTeamId != null) {
    const myTeamId = auth?.teamId != null ? Number(auth.teamId) : null;
    if (showsPlayerChrome && myTeamId != null && currentTeamId !== myTeamId) return false;
  }
  return true;
}

/**
 * Vitalité affichée pour le joueur : points temps réel de la partie si
 * présents, sinon repli sur le profil GL, sinon `null`.
 */
export function computePlayerVitality({
  showsPlayerChrome,
  vitalityEnabled,
  auth,
  gameState,
  profile,
}) {
  if (!showsPlayerChrome || !vitalityEnabled) return null;
  const playerId = auth?.userId != null ? Number(auth.userId) : null;
  if (playerId == null) return null;
  const fromGame = gameState?.vitality?.byPlayerId?.[playerId];
  if (fromGame) {
    return { health: fromGame.health, power: fromGame.power };
  }
  const source = profile || {};
  if (source.health_points != null || source.power_points != null) {
    return {
      health: Number(source.health_points) || 0,
      power: Number(source.power_points) || 0,
    };
  }
  return null;
}

/** Mascotte de l'équipe du joueur (chrome joueur uniquement), `null` sinon. */
export function findPlayerMascotId({ showsPlayerChrome, auth, teams }) {
  if (!showsPlayerChrome) return null;
  const myTeamId = auth?.teamId != null ? Number(auth.teamId) : null;
  if (myTeamId == null || !Array.isArray(teams)) return null;
  const team = teams.find((t) => Number(t.id) === myTeamId);
  return team?.mascot_id || null;
}
