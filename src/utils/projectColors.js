/**
 * Une couleur par projet de tâches (novembre 2026) : les cartes des tâches d'un projet et la
 * case du projet portent la même teinte, pour distinguer les projets d'un coup d'œil.
 *
 * Aucune donnée en base : la couleur est DÉRIVÉE de l'identifiant du projet.
 * - Chaque projet a une couleur préférée, `hash(id) % PROJECT_COLOR_COUNT` : elle ne dépend
 *   que de lui, donc ne change pas quand on filtre, ni d'une session à l'autre.
 * - Deux projets de la liste ne partagent pas une couleur tant qu'il y en a au plus
 *   `PROJECT_COLOR_COUNT` : en cas de collision, le projet le plus RÉCENT prend la couleur
 *   libre suivante (les anciens gardent la leur). Au-delà, les couleurs se répètent.
 *
 * Les teintes elles-mêmes sont des classes `.project-color-N` dans `src/index.css`, qui
 * redéfinissent les jetons `--project-accent / --project-tint / --project-chip / --project-ink`.
 *
 * Module pur : testé par `tests-ui/utils/projectColors.test.js`.
 */

/** Nombre de teintes de la palette (classes `.project-color-0` … `-9`). */
export const PROJECT_COLOR_COUNT = 10;

/** Hachage djb2 d'une chaîne, entier positif. */
function hashString(value) {
  let h = 5381;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Couleur préférée d'un projet (indépendante des autres projets). */
export function preferredProjectColor(projectId) {
  return hashString(projectId) % PROJECT_COLOR_COUNT;
}

/**
 * Attribue une couleur à chaque projet : `projectId → index` (0 … PROJECT_COLOR_COUNT − 1).
 * Ordre de priorité : date de création croissante, puis id.
 * @param {Array<{ id: unknown, created_at?: string|null }>} projects
 * @returns {Map<string, number>}
 */
export function assignProjectColors(projects) {
  const list = (Array.isArray(projects) ? projects : [])
    .filter((p) => p && String(p.id || '').trim())
    .map((p) => ({ id: String(p.id), created: String(p.created_at || '') }))
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
  const result = new Map();
  const used = new Set();
  for (const p of list) {
    if (result.has(p.id)) continue;
    const preferred = preferredProjectColor(p.id);
    let chosen = preferred;
    if (used.size < PROJECT_COLOR_COUNT) {
      for (let step = 0; step < PROJECT_COLOR_COUNT; step += 1) {
        const candidate = (preferred + step) % PROJECT_COLOR_COUNT;
        if (!used.has(candidate)) {
          chosen = candidate;
          break;
        }
      }
    }
    used.add(chosen);
    result.set(p.id, chosen);
  }
  return result;
}

/**
 * Classe CSS de la couleur d'un projet. Un projet absent de la table (projet archivé vu
 * depuis une tâche, par exemple) retombe sur sa couleur préférée.
 * @param {Map<string, number> | null | undefined} colorById
 * @param {unknown} projectId
 */
export function projectColorClass(colorById, projectId) {
  const id = String(projectId || '').trim();
  if (!id) return '';
  const index = colorById?.has(id) ? colorById.get(id) : preferredProjectColor(id);
  return `project-color-${index}`;
}
