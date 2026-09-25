import { api, isLikelyNetworkTransportFailure } from './api';
import { userJournalAdapter } from './userJournalAdapter.js';
import { DEFAULT_JOURNAL_LIMITS } from '../shared/journal/journalFeed.js';
import {
  clientUuidOfLocalArticle,
  createJournalDraft,
  draftToArticle,
  flushJournalDrafts,
  isLocalArticleId,
  journalDraftRequestBody,
  listJournalDrafts,
  localArticleId,
  removeJournalDraft,
  updateJournalDraft,
} from '../utils/journalDraftQueue.js';

/** Messages de ce qui attend le réseau dans un brouillon (piste D). */
export const JOURNAL_OFFLINE_IMAGE_MESSAGE =
  'Pas de réseau : les images s’ajoutent une fois l’article envoyé. Écris ton texte, il est gardé.';
export const JOURNAL_OFFLINE_PIN_MESSAGE =
  'L’article pourra être épinglé une fois envoyé (réseau nécessaire).';
export const JOURNAL_DRAFT_TOO_LONG_MESSAGE =
  'Texte trop long pour être gardé sur l’appareil : raccourcis-le, ou attends le réseau.';

/**
 * Carnet ForetMap tolérant l'absence de réseau (piste D, audit du 25/09/2026). Même interface
 * que `userJournalAdapter` (`shared/journal/journalAdapter.js`) : les hooks partagés
 * (`useJournalFeed`, `useJournalArticleEditor`) l'utilisent sans le savoir, et G&L garde son
 * adaptateur inchangé.
 *
 * - Lecture : les brouillons du compte passent en tête du fil. Sans réseau, le fil ne montre
 *   qu'eux, et `onOfflineChange(true)` prévient la vue (qui l'annonce à l'élève).
 * - « + Nouvel article » sans réseau : un brouillon local (`id` = `local-<clé>`), enregistré
 *   dans l'appareil au fil de la frappe.
 * - Envoi : `flushDrafts()` crée chaque brouillon sur le serveur en un appel, avec sa clé
 *   d'idempotence ; la correspondance brouillon → article reste connue pour qu'un éditeur resté
 *   ouvert continue d'enregistrer au bon endroit.
 *
 * @param {object} options
 * @param {() => string} options.getUserId compte connecté (la file lui est propre)
 * @param {(offline: boolean) => void} [options.onOfflineChange]
 */
export function createOfflineJournalAdapter({ getUserId, onOfflineChange = () => {} }) {
  const base = userJournalAdapter;
  /** Brouillons déjà envoyés : identifiant local → identifiant serveur. */
  const syncedIds = new Map();
  let lastLimits = DEFAULT_JOURNAL_LIMITS;

  const serverIdOf = (articleId) => syncedIds.get(String(articleId)) ?? null;
  const drafts = () => listJournalDrafts(getUserId()).map(draftToArticle);

  return {
    ...base,

    async fetchJournal() {
      try {
        const data = await base.fetchJournal();
        if (data?.limits) lastLimits = data.limits;
        onOfflineChange(false);
        const articles = Array.isArray(data?.articles) ? data.articles : [];
        return { ...data, articles: [...drafts(), ...articles] };
      } catch (err) {
        if (!isLikelyNetworkTransportFailure(err)) throw err;
        onOfflineChange(true);
        return { limits: lastLimits, articles: drafts(), imports: [] };
      }
    },

    async createArticle() {
      try {
        return await base.createArticle();
      } catch (err) {
        const userId = getUserId();
        if (!isLikelyNetworkTransportFailure(err) || !userId) throw err;
        const draft = createJournalDraft(userId);
        if (!draft) throw err; // stockage indisponible : ne rien promettre
        onOfflineChange(true);
        return { article: draftToArticle(draft) };
      }
    },

    async updateArticle(articleId, payload) {
      if (!isLocalArticleId(articleId)) return base.updateArticle(articleId, payload);
      const serverId = serverIdOf(articleId);
      if (serverId != null) return base.updateArticle(serverId, payload);
      const draft = updateJournalDraft(clientUuidOfLocalArticle(articleId), payload || {});
      if (!draft) throw new Error(JOURNAL_DRAFT_TOO_LONG_MESSAGE);
      return { article: draftToArticle(draft) };
    },

    async deleteArticle(articleId) {
      if (!isLocalArticleId(articleId)) return base.deleteArticle(articleId);
      const serverId = serverIdOf(articleId);
      if (serverId != null) return base.deleteArticle(serverId);
      removeJournalDraft(clientUuidOfLocalArticle(articleId));
      return { ok: true };
    },

    async pinArticle(articleId, pinned) {
      if (!isLocalArticleId(articleId)) return base.pinArticle(articleId, pinned);
      const serverId = serverIdOf(articleId);
      if (serverId != null) return base.pinArticle(serverId, pinned);
      throw new Error(JOURNAL_OFFLINE_PIN_MESSAGE);
    },

    async addArticleAsset(articleId, imageData) {
      if (!isLocalArticleId(articleId)) return base.addArticleAsset(articleId, imageData);
      const serverId = serverIdOf(articleId);
      if (serverId != null) return base.addArticleAsset(serverId, imageData);
      throw new Error(JOURNAL_OFFLINE_IMAGE_MESSAGE);
    },

    async removeArticleAsset(articleId, assetId) {
      const serverId = isLocalArticleId(articleId) ? serverIdOf(articleId) : articleId;
      if (serverId == null) throw new Error(JOURNAL_OFFLINE_IMAGE_MESSAGE);
      return base.removeArticleAsset(serverId, assetId);
    },

    /**
     * Envoie les brouillons du compte connecté, sauf ceux en cours d'édition.
     * @param {{ skipArticleIds?: Array<string|number> }} [options]
     * @returns {Promise<{ synced: number, refused: Array<{ item: object, message: string }>, remaining: number, idMap: Map<string, number> }>}
     */
    async flushDrafts({ skipArticleIds = [] } = {}) {
      const userId = getUserId();
      const skip = new Set(
        skipArticleIds.filter(isLocalArticleId).map((id) => clientUuidOfLocalArticle(id)),
      );
      const idMap = new Map();
      const out = await flushJournalDrafts(
        async (draft) => {
          const res = await api(
            '/api/user-journal/me/articles',
            'POST',
            journalDraftRequestBody(draft),
          );
          const serverId = res?.article?.id;
          if (serverId != null) {
            syncedIds.set(localArticleId(draft.client_uuid), serverId);
            idMap.set(localArticleId(draft.client_uuid), serverId);
          }
          return res;
        },
        userId,
        { skip },
      );
      return { ...out, idMap };
    },
  };
}
