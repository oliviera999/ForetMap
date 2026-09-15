import { userJournalAdapter } from '../services/userJournalAdapter.js';
import { useJournalEmbedTitles } from '../shared/journal/useJournalEmbedTitles.js';

/** Hydrate les titres d'encarts du carnet ForetMap (hook partagé + résolveur du produit). */
export function useFmJournalEmbedTitles(html) {
  return useJournalEmbedTitles(html, userJournalAdapter.resolveEmbeds);
}
