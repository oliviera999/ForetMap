'use strict';

/**
 * Règles serveur du métier, du format et de la phase d'une tâche (migration 329), communes à
 * la création, à la modification, à la duplication, à l'import et à la génération
 * d'occurrences récurrentes. Valeurs et libellés : `lib/shared/taskTaxonomyCore.js`.
 *
 *  - une valeur inconnue est refusée (erreur → 400), jamais remise à NULL en silence ;
 *  - une récurrence non nulle impose `format = 'routine'` ;
 *  - une phase n'est acceptée que si la tâche est rattachée à un projet ; quand la tâche
 *    quitte son projet, la phase est remise à NULL ;
 *  - `category` et `format` restent facultatifs à l'API (import, MCP, anciens clients) :
 *    seul le formulaire les exige à la création.
 *
 * `proposed_by_user_id` n'est jamais lu depuis un corps de requête : seule la route de
 * proposition l'écrit.
 */

const { parseTaxonomyInput, effectiveTaskFormat } = require('../shared/taskTaxonomyCore');

const PHASE_WITHOUT_PROJECT_ERROR = 'Une phase de projet exige que la tâche soit liée à un projet';

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

/**
 * Valeurs effectives de la taxonomie d'une tâche.
 *
 * @param {object} body corps reçu (champs absents = valeurs courantes conservées)
 * @param {{ current?: { category?: string|null, format?: string|null, project_phase?: string|null },
 *           projectId?: string|null, recurrence?: string|null, allowWrite?: boolean }} ctx
 *   `current` : tâche existante (modification) ; `allowWrite` à false ignore les champs du corps
 *   (profil qui ne gère pas les tâches).
 * @returns {{ category: string|null, format: string|null, projectPhase: string|null } | { error: string }}
 */
function resolveTaskTaxonomy(
  body,
  { current = {}, projectId = null, recurrence = null, allowWrite = true } = {},
) {
  const source = allowWrite ? body || {} : {};
  const parsed = {};
  for (const [key, kind] of [
    ['category', 'category'],
    ['format', 'format'],
    ['project_phase', 'project_phase'],
  ]) {
    const result = parseTaxonomyInput(kind, has(source, key) ? source[key] : undefined);
    if (result.error) return { error: result.error };
    parsed[key] = result.value === undefined ? (current[key] ?? null) : result.value;
  }
  const hasProject = projectId != null && String(projectId).trim() !== '';
  let projectPhase = parsed.project_phase;
  if (!hasProject) {
    if (has(source, 'project_phase') && projectPhase) return { error: PHASE_WITHOUT_PROJECT_ERROR };
    projectPhase = null;
  }
  return {
    category: parsed.category,
    format: effectiveTaskFormat(recurrence, parsed.format),
    projectPhase,
  };
}

/** Colonnes filtrables de `GET /api/tasks` (le nom du paramètre est celui de la colonne). */
const LIST_FILTER_COLUMNS = Object.freeze(['category', 'format', 'project_phase']);

/**
 * Filtres `category`, `format`, `project_phase` d'une liste de tâches (`a,b,c`).
 * @param {object} query `req.query`
 * @returns {{ filters: Array<{ column: string, values: string[] }> } | { error: string }}
 */
function parseTaskTaxonomyListFilters(query) {
  const filters = [];
  for (const column of LIST_FILTER_COLUMNS) {
    const raw = query?.[column];
    if (raw == null || raw === '') continue;
    const parts = (Array.isArray(raw) ? raw : [raw])
      .flatMap((v) => String(v).split(','))
      .map((v) => v.trim())
      .filter(Boolean);
    const values = [];
    for (const part of parts) {
      const parsed = parseTaxonomyInput(column, part);
      if (parsed.error) return { error: parsed.error };
      if (parsed.value && !values.includes(parsed.value)) values.push(parsed.value);
    }
    if (values.length) filters.push({ column, values });
  }
  return { filters };
}

module.exports = {
  resolveTaskTaxonomy,
  parseTaskTaxonomyListFilters,
  LIST_FILTER_COLUMNS,
  PHASE_WITHOUT_PROJECT_ERROR,
};
