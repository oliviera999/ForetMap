import { apiGL } from './apiGL.js';
import { createJournalAdapter } from '../../shared/journal/journalAdapter.js';

/** Adaptateur G&L du carnet partagé : `apiGL` + routes `/api/gl/player-journal/*`. */
export const playerJournalAdapter = createJournalAdapter({
  request: apiGL,
  basePath: '/api/gl/player-journal/me',
  subjectsSegment: 'players',
});
