import { apiGL } from './apiGL.js';
import { createJournalAdapter } from '../../shared/journal/journalAdapter.js';

/** Carnet G&L (« Mon journal ») : client `apiGL`, routes `/api/gl/player-journal/me/*`. */
export const playerJournalAdapter = createJournalAdapter({
  request: apiGL,
  basePath: '/api/gl/player-journal/me',
});
