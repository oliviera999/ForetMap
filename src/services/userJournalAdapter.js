import { api } from './api';
import { createJournalAdapter } from '../shared/journal/journalAdapter.js';

/** Carnet ForetMap (« Mon carnet ») : client `api`, routes `/api/user-journal/me/*`. */
export const userJournalAdapter = createJournalAdapter({
  request: api,
  basePath: '/api/user-journal/me',
});
