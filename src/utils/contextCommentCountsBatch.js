/**
 * Regroupe les demandes de résumé (total + marqueur du dernier commentaire) émises par plusieurs
 * `ContextComments` montés en même temps (liste de tâches) en un seul
 * `GET /api/context-comments/counts`, sur le modèle des lots de
 * `useLearningGatingSummary` (max 100 ids / requête).
 */

import { getContextCommentCounts } from '../services/api.js';
import { normalizeContextCommentMarker } from './contextCommentsHelpers.js';

const MAX_IDS_PER_REQUEST = 100;
const FLUSH_DELAY_MS = 40;

/** @type {Map<string, { waiters: Map<string, Array<{ resolve: Function, reject: Function }>>, timer: ReturnType<typeof setTimeout> | null }>} */
const queuesByType = new Map();

function emptySummary() {
  return { total: 0, newestId: '' };
}

function normalizeSummary(row) {
  return {
    total: Math.max(0, Number(row?.total) || 0),
    // Marqueur opaque : les identifiants de commentaire sont des UUID. Les convertir en
    // nombre donnait `NaN`, replié en `0`, et le badge « non lus » restait muet.
    newestId: normalizeContextCommentMarker(row?.newestId ?? row?.newest_id),
  };
}

function getQueue(contextType) {
  let q = queuesByType.get(contextType);
  if (!q) {
    q = { waiters: new Map(), timer: null };
    queuesByType.set(contextType, q);
  }
  return q;
}

async function flushType(contextType) {
  const q = queuesByType.get(contextType);
  if (!q) return;
  q.timer = null;
  const entries = [...q.waiters.entries()];
  q.waiters.clear();
  if (entries.length === 0) return;

  const idChunks = [];
  for (let i = 0; i < entries.length; i += MAX_IDS_PER_REQUEST) {
    idChunks.push(entries.slice(i, i + MAX_IDS_PER_REQUEST));
  }

  try {
    const merged = new Map();
    for (const chunk of idChunks) {
      const ids = chunk.map(([id]) => id);
      const data = await getContextCommentCounts({ contextType, contextIds: ids });
      const counts = data?.counts && typeof data.counts === 'object' ? data.counts : {};
      for (const id of ids) {
        merged.set(id, normalizeSummary(counts[id]));
      }
    }
    for (const [id, waiters] of entries) {
      const summary = merged.get(id) || emptySummary();
      for (const w of waiters) w.resolve(summary);
    }
  } catch (err) {
    for (const [, waiters] of entries) {
      for (const w of waiters) w.reject(err);
    }
  }
}

/**
 * @param {string} contextType
 * @param {string|number} contextId
 * @returns {Promise<{ total: number, newestId: string }>}
 */
export function fetchContextCommentSummary(contextType, contextId) {
  const type = String(contextType || '').trim();
  const id = String(contextId ?? '').trim();
  if (!type || !id) return Promise.resolve(emptySummary());

  return new Promise((resolve, reject) => {
    const q = getQueue(type);
    if (!q.waiters.has(id)) q.waiters.set(id, []);
    q.waiters.get(id).push({ resolve, reject });
    if (!q.timer) {
      q.timer = setTimeout(() => {
        void flushType(type);
      }, FLUSH_DELAY_MS);
    }
  });
}

/** Vide les files en attente (tests). */
export function resetContextCommentCountsBatch() {
  for (const q of queuesByType.values()) {
    if (q.timer) clearTimeout(q.timer);
  }
  queuesByType.clear();
}
