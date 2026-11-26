/**
 * Étapes numérotées des tâches d'un projet (« C modifié », novembre 2026).
 *
 * Le prof numérote les tâches d'un projet dans leur TITRE (« 1 Récupérer la terre… »,
 * « 2. Transférer… », « Étape 3 : … »). Ce numéro fixe l'ÉTAPE de la tâche ; deux tâches
 * qui portent le même numéro (« 2 … » et « 2 … », ou « 2a … » et « 2b … ») se réalisent
 * EN PARALLÈLE. Rien n'est écrit en base : l'ordre est recalculé à l'affichage, le titre
 * reste la seule source de vérité. À l'intérieur d'une même étape, et pour les tâches non
 * numérotées (placées après les étapes), l'ordre manuel (`sort_order`, glisser-déposer)
 * s'applique — c'est l'ordre d'arrivée de la liste.
 *
 * Garde-fou contre les faux positifs (« 3 graines à semer ») : la numérotation n'est
 * reconnue dans un projet que si AU MOINS DEUX de ses tâches sont numérotées.
 *
 * Module pur (ni React ni I/O) : testé par `tests-ui/utils/taskProjectSteps.test.js`.
 */

/** Nombre minimal de tâches numérotées pour qu'un projet soit traité « par étapes ». */
export const MIN_NUMBERED_TASKS = 2;

/*
 * Préfixe optionnel (« Étape », « Tâche », « n° », « # »), numéro sur 1 ou 2 chiffres,
 * lettre minuscule optionnelle (2a, 2b), puis un séparateur ou la fin du titre. Pas de
 * drapeau `i` : « 3D » (majuscule) n'est pas une sous-étape « 3d ». Quatre chiffres
 * (« 2026 … ») ne passent pas : le 3e chiffre n'est pas un séparateur.
 */
const STEP_PREFIX_RE =
  /^\s*(?:(?:[ÉéEe]tape|[Tt][âa]che|[Nn]°|[Nn]o\.?|#)\s*)?(\d{1,2})([a-z])?(?=$|[\s.)\-–—:/,])/u;

/**
 * Numéro d'étape lu en tête d'un titre de tâche.
 * @param {string|null|undefined} title
 * @returns {{ step: number, sub: string } | null}
 */
export function parseTaskStepNumber(title) {
  const match = STEP_PREFIX_RE.exec(String(title || ''));
  if (!match) return null;
  const step = Number(match[1]);
  if (!Number.isFinite(step)) return null;
  return { step, sub: match[2] || '' };
}

/**
 * Informations d'étape des tâches d'UN projet (liste complète, non filtrée, pour que la
 * mention « en parallèle » ne dépende pas des filtres). Map vide si le projet n'est pas
 * numéroté (moins de `MIN_NUMBERED_TASKS` tâches numérotées).
 * @param {Array<{ id: unknown, title?: string }>} projectTasks
 * @returns {Map<string, { step: number, sub: string, parallel: boolean }>}
 */
export function computeProjectStepInfo(projectTasks) {
  const parsed = [];
  for (const t of Array.isArray(projectTasks) ? projectTasks : []) {
    const info = parseTaskStepNumber(t?.title);
    if (info) parsed.push({ id: String(t.id), ...info });
  }
  const result = new Map();
  if (parsed.length < MIN_NUMBERED_TASKS) return result;
  const countByStep = new Map();
  for (const p of parsed) countByStep.set(p.step, (countByStep.get(p.step) || 0) + 1);
  for (const p of parsed) {
    result.set(p.id, { step: p.step, sub: p.sub, parallel: countByStep.get(p.step) > 1 });
  }
  return result;
}

/**
 * Infos d'étape de toutes les tâches, tous projets confondus : `taskId → info`.
 * Seules les tâches d'un projet numéroté y figurent.
 * @param {Array<{ id: unknown, title?: string, project_id?: unknown }>} tasks
 * @returns {Map<string, { step: number, sub: string, parallel: boolean }>}
 */
export function computeStepInfoByTaskId(tasks) {
  const byProject = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    const projectId = String(t?.project_id || '').trim();
    if (!projectId) continue;
    const bucket = byProject.get(projectId);
    if (bucket) bucket.push(t);
    else byProject.set(projectId, [t]);
  }
  const all = new Map();
  for (const bucket of byProject.values()) {
    for (const [id, info] of computeProjectStepInfo(bucket)) all.set(id, info);
  }
  return all;
}

/**
 * Trie les tâches d'un projet par étape : étapes croissantes (puis sous-lettre), tâches
 * non numérotées ensuite ; ordre d'arrivée conservé à égalité (tri stable). Liste rendue
 * telle quelle si `stepInfo` est vide (projet non numéroté). Ne mute pas l'entrée.
 * @param {Array<{ id: unknown }>} projectTasks
 * @param {Map<string, { step: number, sub: string }>} stepInfo
 */
export function sortProjectTasksBySteps(projectTasks, stepInfo) {
  const list = Array.isArray(projectTasks) ? projectTasks : [];
  if (!stepInfo || stepInfo.size === 0) return list;
  return list
    .map((t, index) => ({ t, index, info: stepInfo.get(String(t?.id)) || null }))
    .sort((a, b) => {
      if (a.info && !b.info) return -1;
      if (!a.info && b.info) return 1;
      if (a.info && b.info) {
        if (a.info.step !== b.info.step) return a.info.step - b.info.step;
        if (a.info.sub !== b.info.sub) return a.info.sub < b.info.sub ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.t);
}

/**
 * Regroupe les tâches filtrées par `project_id` pour le bloc projets, en conservant
 * l'ordre d'arrivée (typiquement `sort_order` / GET) puis en appliquant les étapes
 * numérotées. **Sans** remonter les tâches « terminées » en tête — l'ordre manuel du
 * glisser-déposer doit survivre au refresh pour les validateurs.
 *
 * @param {Array<{ id?: unknown, project_id?: unknown }>} tasks
 * @param {Map<string, { step: number, sub: string, parallel?: boolean }>} stepInfoByTaskId
 * @returns {Map<string, Array>}
 */
export function groupProjectTasksById(tasks, stepInfoByTaskId) {
  const byProject = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    const projectId = String(t?.project_id || '');
    if (!projectId) continue;
    const bucket = byProject.get(projectId);
    if (bucket) bucket.push(t);
    else byProject.set(projectId, [t]);
  }
  for (const [projectId, bucket] of byProject) {
    byProject.set(projectId, sortProjectTasksBySteps(bucket, stepInfoByTaskId));
  }
  return byProject;
}

/**
 * Deux tâches sont dans le même « compartiment » d'ordre manuel : même numéro (étape et
 * sous-lettre) ou toutes deux non numérotées. Le glisser-déposer et les flèches ↑↓ ne
 * réordonnent qu'à l'intérieur d'un compartiment — changer d'étape, c'est changer le
 * numéro du titre (« 2a » / « 2b » restent dans l'ordre de leurs lettres).
 * @param {Map<string, { step: number, sub: string }>} stepInfo
 */
export function sameStepBucket(stepInfo, taskIdA, taskIdB) {
  const a = stepInfo?.get(String(taskIdA)) || null;
  const b = stepInfo?.get(String(taskIdB)) || null;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.step === b.step && a.sub === b.sub;
}

/**
 * Libellé court d'étape pour une puce : « Étape 2 », « Étape 2 · en parallèle ».
 * @param {{ step: number, parallel?: boolean } | null | undefined} info
 */
export function taskStepLabel(info) {
  if (!info) return '';
  return info.parallel ? `Étape ${info.step} · en parallèle` : `Étape ${info.step}`;
}
