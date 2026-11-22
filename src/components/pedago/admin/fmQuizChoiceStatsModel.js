/**
 * Lecture des statistiques d'items d'une question du quiz ForetMap (réponse `GET
 * /api/quiz/admin/questions/stats`, migration `quiz_attempt_choice`) pour l'écran du
 * professeur : fonctions pures, sans JSX, testées à part.
 */

/** Ligne de statistiques d'une question, ou `null`. */
export function findQuestionStat(stats, questionCode) {
  if (!questionCode || !Array.isArray(stats)) return null;
  return stats.find((s) => s?.question_code === questionCode) || null;
}

/** Répartition d'une lettre d'origine dans la version courante, ou `null`. */
export function choiceShare(stat, letter) {
  if (!stat || !Array.isArray(stat.repartition)) return null;
  return stat.repartition.find((r) => r.lettre === letter) || null;
}

/** `12345` ms → « 12 s » ; ≥ 1 min → « 1 min 05 s ». */
export function formatDurationMs(ms) {
  const value = Number(ms);
  if (ms == null || !Number.isFinite(value)) return null;
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
}

/** Pourcentage français (« 48 % », « 12,5 % »). */
export function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/** Indice de discrimination en notation française (« 0,45 », « −0,2 »). */
export function formatIndex(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const text = Math.abs(Number(value)).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return Number(value) < 0 ? `−${text}` : text;
}

/** Nombre de signaux de relecture d'une ligne (attracteur, discrimination négative, réussite faible). */
export function signalCount(stat) {
  const s = stat?.signaux || {};
  return [s.attracteur, s.discrimination_negative, s.reussite_faible].filter(Boolean).length;
}

/**
 * Tri « suspectes d'abord » de la liste des questions : signalées en tête (le plus de signaux
 * d'abord, puis la réussite la plus basse), puis les autres dans l'ordre de `fallbackSort`.
 *
 * @param {Array<object>} items questions de la liste
 * @param {Array<object>} stats lignes de `…/admin/questions/stats`
 * @param {(items: Array<object>) => Array<object>} fallbackSort
 */
export function sortSuspectFirst(items, stats, fallbackSort) {
  const byCode = new Map((Array.isArray(stats) ? stats : []).map((s) => [s.question_code, s]));
  const ordered = fallbackSort([...(Array.isArray(items) ? items : [])]);
  const rank = new Map(ordered.map((item, i) => [item.question_code, i]));
  return ordered.sort((a, b) => {
    const sa = byCode.get(a.question_code);
    const sb = byCode.get(b.question_code);
    const fa = sa?.suspect === true ? 1 : 0;
    const fb = sb?.suspect === true ? 1 : 0;
    if (fa !== fb) return fb - fa;
    if (fa === 1) {
      const diff = signalCount(sb) - signalCount(sa);
      if (diff !== 0) return diff;
      const ra = sa.success_rate == null ? 2 : Number(sa.success_rate);
      const rb = sb.success_rate == null ? 2 : Number(sb.success_rate);
      if (ra !== rb) return ra - rb;
    }
    return rank.get(a.question_code) - rank.get(b.question_code);
  });
}
