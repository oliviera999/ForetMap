/**
 * Articles du carnet écrits sans réseau (piste D, audit du 25/09/2026, § 1.4.6 et § 2.4).
 *
 * En ligne, « + Nouvel article » crée l'article sur le serveur puis l'enregistre au fil de la
 * frappe. Sans réseau, l'article devient un **brouillon gardé sur l'appareil** : l'élève écrit
 * normalement, et le brouillon part au retour du réseau en un seul envoi (titre, texte, zone)
 * portant sa clé `client_uuid` (migration 299) — renvoyé, il n'est créé qu'une fois.
 *
 * Un refus définitif du serveur (texte trop long, zone supprimée…) ne jette jamais le texte :
 * le brouillon reste, marqué en échec avec le message du serveur, jusqu'à ce que l'élève le
 * corrige ou le supprime (`onRefusal: 'keep'`).
 *
 * Ce qui attend le réseau : les **images** (envoyées une à une au serveur, trop lourdes pour le
 * stockage local) et l'épinglage.
 */

import { createOfflineQueue, newClientUuid } from './offlineActionQueue.js';

export const JOURNAL_DRAFT_QUEUE_STORAGE_KEY = 'foretmap_journal_draft_queue';
/** Borne de sécurité : une file qui grossit sans fin signale un autre problème. */
export const JOURNAL_DRAFT_QUEUE_MAX = 30;
/** Plafond local d'un brouillon (le stockage de l'appareil est limité et partagé). */
export const JOURNAL_DRAFT_BODY_MAX = 20000;
/** Préfixe des identifiants d'article locaux (jamais un entier, comme ceux du serveur). */
export const LOCAL_ARTICLE_ID_PREFIX = 'local-';

/**
 * @typedef {{ user_id: string, client_uuid: string, title: string, bodyMarkdown: string,
 *   zoneId: string|null, created_at: string, updated_at: string, refused: boolean,
 *   error: string, queued_at: number }} JournalDraft
 */

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bodyMarkdown = typeof raw.bodyMarkdown === 'string' ? raw.bodyMarkdown : '';
  if (bodyMarkdown.length > JOURNAL_DRAFT_BODY_MAX) return null;
  const zone = raw.zoneId == null ? '' : String(raw.zoneId).trim();
  const createdAt = String(raw.created_at || '') || new Date().toISOString();
  return {
    user_id: raw.user_id,
    client_uuid: raw.client_uuid,
    title: String(raw.title || '').slice(0, 255),
    bodyMarkdown,
    zoneId: zone || null,
    created_at: createdAt,
    updated_at: String(raw.updated_at || '') || createdAt,
    refused: !!raw.refused,
    error: raw.error ? String(raw.error).slice(0, 500) : '',
    queued_at: Number.isFinite(Number(raw.queued_at)) ? Number(raw.queued_at) : 0,
  };
}

const queue = createOfflineQueue({
  storageKey: JOURNAL_DRAFT_QUEUE_STORAGE_KEY,
  max: JOURNAL_DRAFT_QUEUE_MAX,
  normalize,
});

export const isLocalArticleId = (id) => String(id ?? '').startsWith(LOCAL_ARTICLE_ID_PREFIX);
export const localArticleId = (clientUuid) => `${LOCAL_ARTICLE_ID_PREFIX}${clientUuid}`;
export const clientUuidOfLocalArticle = (id) =>
  isLocalArticleId(id) ? String(id).slice(LOCAL_ARTICLE_ID_PREFIX.length) : '';

/** Brouillon → article au format du fil (`JournalArticleReadCard`, éditeur). */
export function draftToArticle(draft) {
  return {
    id: localArticleId(draft.client_uuid),
    title: draft.title,
    bodyMarkdown: draft.bodyMarkdown,
    zoneId: draft.zoneId,
    zoneName: null,
    pinned: false,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
    usage: { charCount: [...draft.bodyMarkdown].length, assetCount: 0 },
    assets: [],
    local: true,
    offlineError: draft.refused ? draft.error || 'Refusé par le serveur' : '',
  };
}

/** Brouillons d'un compte, les plus récents d'abord. */
export function listJournalDrafts(userId) {
  return queue.listFor(userId).slice().reverse();
}

/**
 * Nouveau brouillon vide pour un compte.
 * @returns {JournalDraft|null} `null` si l'appareil ne peut pas le garder
 */
export function createJournalDraft(userId) {
  const now = new Date().toISOString();
  const draft = {
    user_id: userId,
    client_uuid: newClientUuid('draft'),
    title: '',
    bodyMarkdown: '',
    zoneId: null,
    created_at: now,
    updated_at: now,
  };
  if (!queue.enqueue(draft)) return null;
  return queue.listFor(userId).find((d) => d.client_uuid === draft.client_uuid) || null;
}

/**
 * Enregistre la saisie d'un brouillon ; une modification lève un refus précédent (l'élève a
 * corrigé : on retente au prochain rejeu).
 * @returns {JournalDraft|null}
 */
export function updateJournalDraft(clientUuid, { title, bodyMarkdown, zoneId }) {
  return queue.update(clientUuid, {
    title,
    bodyMarkdown,
    zoneId: zoneId ?? null,
    updated_at: new Date().toISOString(),
    refused: false,
    error: '',
  });
}

export const removeJournalDraft = (clientUuid) => queue.remove(clientUuid);

/** Un brouillon sans titre ni texte n'a rien à envoyer. */
export const isEmptyJournalDraft = (draft) =>
  !String(draft.title || '').trim() && !String(draft.bodyMarkdown || '').trim();

/** Corps de `POST /api/user-journal/me/articles` pour un brouillon. */
export function journalDraftRequestBody(draft) {
  return {
    client_uuid: draft.client_uuid,
    title: draft.title,
    bodyMarkdown: draft.bodyMarkdown,
    zoneId: draft.zoneId,
  };
}

/**
 * Envoie les brouillons du compte (sauf ceux de `skip`, en cours d'édition). Les brouillons
 * vides sont retirés sans envoi.
 * @param {(draft: JournalDraft) => Promise<{ article?: { id: number } }>} send
 * @param {string} userId
 * @param {{ skip?: Set<string> }} [options] clés à ne pas envoyer maintenant
 */
export function flushJournalDrafts(send, userId, { skip = new Set() } = {}) {
  for (const draft of queue.listFor(userId)) {
    if (!skip.has(draft.client_uuid) && isEmptyJournalDraft(draft)) {
      queue.remove(draft.client_uuid);
    }
  }
  return queue.flush(send, userId, {
    onRefusal: 'keep',
    eligible: (draft) => !skip.has(draft.client_uuid),
  });
}
