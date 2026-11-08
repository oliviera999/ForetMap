'use strict';

/**
 * Outils de domaine du connecteur (lot D). Chargés **seulement** par `buildServerTools`
 * (serveur `/mcp`), jamais par le script stdio Cursor : ils tirent la base, le pont API et les
 * services de l'application.
 *
 * Chaque module exporte une fonction `build…Tool()` ; l'ordre de la liste fixe l'ordre de
 * `tools/list`.
 */

const MODULES = Object.freeze([
  // Tâches (besoin immédiat).
  ['./tasks', 'buildTasksTool'],
  ['./taskProjects', 'buildTaskProjectsTool'],
  // Personnes et pédagogie.
  ['./students', 'buildStudentsTool'],
  ['./groups', 'buildGroupsTool'],
  ['./tutorials', 'buildTutorialsTool'],
  ['./learning', 'buildLearningTool'],
  ['./quiz', 'buildQuizTool'],
  ['./glossary', 'buildGlossaryTool'],
  ['./curriculum', 'buildCurriculumTool'],
  ['./pedagoSessions', 'buildPedagoSessionsTool'],
  // Vivant et lieux.
  ['./species', 'buildSpeciesTool'],
  ['./foodWeb', 'buildFoodWebTool'],
  ['./observations', 'buildObservationsTool'],
  ['./idKeys', 'buildIdKeysTool'],
  ['./maps', 'buildMapsTool'],
  ['./visit', 'buildVisitTool'],
  ['./plans', 'buildPlansTool'],
  // Vie collective, réglages, exploitation.
  ['./social', 'buildSocialTool'],
  ['./settings', 'buildSettingsTool'],
  ['./rbac', 'buildRbacTool'],
  ['./auditLog', 'buildAuditLogTool'],
  ['./calendar', 'buildCalendarTool'],
  ['./moodle', 'buildMoodleTool'],
  ['./stats', 'buildStatsTool'],
  ['./ops', 'buildOpsTool'],
  // Gnomes & Licornes (domaine `gl`, pont G&L `lib/mcp/glBridge.js`).
  ['./glGames', 'buildGlGamesTool'],
  ['./glGameState', 'buildGlGameStateTool'],
  ['./glGameJournal', 'buildGlGameJournalTool'],
  ['./glGameDiagnostic', 'buildGlGameDiagnosticTool'],
  ['./glSettings', 'buildGlSettingsTool'],
  ['./glTenirCatalogues', 'buildGlTenirCataloguesTool'],
  ['./glContentSnapshot', 'buildGlContentSnapshotTool'],
  ['./glTour', 'buildGlTourTool'],
  ['./glSimReports', 'buildGlSimReportsTool'],
  ['./glRewards', 'buildGlRewardsTool'],
]);

function isMissingModule(err, path) {
  return (
    err &&
    err.code === 'MODULE_NOT_FOUND' &&
    String(err.message || '').includes(path.replace('./', '/'))
  );
}

function buildDomainTools() {
  const out = [];
  for (const [path, fn] of MODULES) {
    let mod;
    try {
      mod = require(path);
    } catch (err) {
      // Module de domaine pas encore livré : ignoré (toute autre erreur remonte).
      if (isMissingModule(err, path)) continue;
      throw err;
    }
    const built = mod[fn]();
    out.push(...(Array.isArray(built) ? built : [built]));
  }
  return out;
}

module.exports = { buildDomainTools, MODULES };
