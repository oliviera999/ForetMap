/**
 * Progression visite côté client : normalisation API, file d’attente hors-ligne pour POST /api/visit/seen.
 */

import {
  safeLocalStorageReadJson,
  safeLocalStorageWriteJson,
} from './browserStorage.js';

export const VISIT_SEEN_QUEUE_STORAGE_KEY = 'foretmap_visit_seen_queue';

/**
 * @typedef {{ target_type: string, target_id: string, seen: boolean, updated_at: number }} VisitSeenQueueItem
 */

/**
 * @param {unknown} body — corps JSON de la progression, ou null / absent en cas d’échec d’appel
 * @returns {{ seen: Array<{ target_type: string, target_id: string }> }}
 */
export function safeVisitProgressPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { seen: [] };
  }
  const raw = body.seen;
  if (!Array.isArray(raw)) return { seen: [] };
  const seen = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const target_type = String(r.target_type || '').trim();
    const target_id = String(r.target_id ?? '').trim();
    if (!target_type || !target_id) continue;
    seen.push({ target_type, target_id });
  }
  return { seen };
}

/** @param {string} target_type @param {string} target_id */
export function visitSeenQueueItemKey(target_type, target_id) {
  return `${String(target_type || '').trim()}:${String(target_id ?? '').trim()}`;
}

/**
 * Dernier état par cible (ordre chronologique conservé pour le flush).
 * @param {VisitSeenQueueItem[]} queue
 * @returns {VisitSeenQueueItem[]}
 */
export function compactVisitSeenQueue(queue) {
  if (!Array.isArray(queue) || queue.length === 0) return [];
  const byKey = new Map();
  for (const raw of queue) {
    if (!raw || typeof raw !== 'object') continue;
    const target_type = String(raw.target_type || '').trim();
    const target_id = String(raw.target_id ?? '').trim();
    if (!target_type || !target_id) continue;
    const key = visitSeenQueueItemKey(target_type, target_id);
    const seen = raw.seen !== false;
    const updated_at = Number.isFinite(Number(raw.updated_at))
      ? Number(raw.updated_at)
      : Date.now();
    byKey.set(key, { target_type, target_id, seen, updated_at });
  }
  return [...byKey.values()].sort((a, b) => a.updated_at - b.updated_at);
}

/**
 * @returns {VisitSeenQueueItem[]}
 */
export function loadVisitSeenQueue() {
  const raw = safeLocalStorageReadJson(VISIT_SEEN_QUEUE_STORAGE_KEY, []);
  return compactVisitSeenQueue(Array.isArray(raw) ? raw : []);
}

/**
 * @param {VisitSeenQueueItem[]} queue
 */
export function saveVisitSeenQueue(queue) {
  const compact = compactVisitSeenQueue(queue);
  safeLocalStorageWriteJson(VISIT_SEEN_QUEUE_STORAGE_KEY, compact);
  return compact;
}

/**
 * @param {{ target_type: string, target_id: string, seen: boolean }} action
 * @returns {VisitSeenQueueItem[]}
 */
export function enqueueVisitSeenAction(action) {
  const target_type = String(action?.target_type || '').trim();
  const target_id = String(action?.target_id ?? '').trim();
  if (!target_type || !target_id) return loadVisitSeenQueue();
  const next = compactVisitSeenQueue([
    ...loadVisitSeenQueue(),
    {
      target_type,
      target_id,
      seen: action.seen !== false,
      updated_at: Date.now(),
    },
  ]);
  return saveVisitSeenQueue(next);
}

export function replaceQueuedVisitSeenAction(action) {
  const target_type = String(action?.target_type || '').trim();
  const target_id = String(action?.target_id ?? '').trim();
  if (!target_type || !target_id) return loadVisitSeenQueue();
  const key = visitSeenQueueItemKey(target_type, target_id);
  const queue = loadVisitSeenQueue();
  let found = false;
  const next = queue.map((item) => {
    if (visitSeenQueueItemKey(item.target_type, item.target_id) !== key) return item;
    found = true;
    return {
      target_type,
      target_id,
      seen: action.seen !== false,
      updated_at: Date.now(),
    };
  });
  return found ? saveVisitSeenQueue(next) : queue;
}

/**
 * Applique la file locale sur un Set de clés `type:id` (état optimiste).
 * @param {Set<string>} seenSet
 * @param {VisitSeenQueueItem[]} [queue]
 */
export function applyVisitSeenQueueToSet(seenSet, queue = loadVisitSeenQueue()) {
  if (!seenSet || typeof seenSet.add !== 'function') return seenSet;
  for (const item of compactVisitSeenQueue(queue)) {
    const key = visitSeenQueueItemKey(item.target_type, item.target_id);
    if (item.seen) seenSet.add(key);
    else seenSet.delete(key);
  }
  return seenSet;
}

/**
 * @param {(action: { target_type: string, target_id: string, seen: boolean }) => Promise<void>} postSeen
 * @returns {Promise<{ synced: number, failed: number, remaining: number }>}
 */
export async function flushVisitSeenQueue(postSeen) {
  let queue = loadVisitSeenQueue();
  if (queue.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }
  let synced = 0;
  let failed = 0;
  const remaining = [];
  const flushedByKey = new Map(queue.map((item) => [visitSeenQueueItemKey(item.target_type, item.target_id), item]));
  for (const item of queue) {
    try {
      await postSeen({
        target_type: item.target_type,
        target_id: item.target_id,
        seen: item.seen,
      });
      synced += 1;
    } catch (_) {
      failed += 1;
      remaining.push(item);
    }
  }
  const failedKeys = new Set(remaining.map((item) => visitSeenQueueItemKey(item.target_type, item.target_id)));
  const nextQueue = [];
  for (const item of loadVisitSeenQueue()) {
    const key = visitSeenQueueItemKey(item.target_type, item.target_id);
    const flushed = flushedByKey.get(key);
    if (!flushed) {
      nextQueue.push(item);
      continue;
    }
    if (failedKeys.has(key)) {
      nextQueue.push(item);
      continue;
    }
    const unchangedSinceFlushStarted =
      item.seen === flushed.seen && Number(item.updated_at) === Number(flushed.updated_at);
    if (!unchangedSinceFlushStarted) nextQueue.push(item);
  }
  const saved = saveVisitSeenQueue(nextQueue);
  return { synced, failed, remaining: saved.length };
}

export function isBrowserOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}
