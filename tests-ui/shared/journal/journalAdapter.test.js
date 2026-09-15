import { describe, expect, test, vi } from 'vitest';
import { createJournalAdapter } from '../../../src/shared/journal/journalAdapter.js';

describe('createJournalAdapter — un seul contrat de routes pour ForetMap et G&L', () => {
  test('routes « me », imports, encarts et lecture staff (ForetMap : users)', async () => {
    const request = vi.fn().mockResolvedValue({});
    const a = createJournalAdapter({ request, basePath: '/api/user-journal/me' });
    await a.fetchJournal();
    await a.importResource({ resourceType: 'plant', resourceRef: '12' });
    await a.resolveEmbeds([{ type: 'plant', ref: '12' }]);
    await a.searchEmbeds('plant', 'nois');
    await a.fetchSubjectJournal(7);
    await a.pinImport('a b', true);
    expect(request.mock.calls).toEqual([
      ['/api/user-journal/me'],
      ['/api/user-journal/me/imports', 'POST', { resourceType: 'plant', resourceRef: '12' }],
      ['/api/user-journal/embeds/resolve', 'POST', { embeds: [{ type: 'plant', ref: '12' }] }],
      ['/api/user-journal/embeds/search?type=plant&q=nois'],
      ['/api/user-journal/users/7'],
      ['/api/user-journal/me/imports/a%20b/pin', 'PUT', { pinned: true }],
    ]);
  });

  test('G&L : même contrat, segment « players »', async () => {
    const request = vi.fn().mockResolvedValue({});
    const a = createJournalAdapter({
      request,
      basePath: '/api/gl/player-journal/me/',
      subjectsSegment: 'players',
    });
    await a.fetchSubjectJournal(3);
    await a.resolveEmbeds([]);
    expect(request.mock.calls).toEqual([
      ['/api/gl/player-journal/players/3'],
      ['/api/gl/player-journal/embeds/resolve', 'POST', { embeds: [] }],
    ]);
  });
});
