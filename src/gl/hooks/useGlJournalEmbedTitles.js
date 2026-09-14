import { playerJournalAdapter } from '../services/playerJournalAdapter.js';
import { useJournalEmbedTitles } from '../../shared/journal/useJournalEmbedTitles.js';

/**
 * Hydrate les titres d'encarts `gl-journal-embed` du journal G&L (hook partagé + résolveur
 * du produit, `POST /api/gl/player-journal/embeds/resolve`).
 * @param {string} html HTML déjà sécurisé (renderMarkdownToSafeHtml)
 */
export function useGlJournalEmbedTitles(html) {
  return useJournalEmbedTitles(html, playerJournalAdapter.resolveEmbeds);
}
