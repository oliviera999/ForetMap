// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { tasksItemsFromResponse, fetchAllTaskPages } from '../../src/utils/tasksListResponse.js';

describe('tasksListResponse', () => {
  it('normalise tableau et enveloppe', () => {
    expect(tasksItemsFromResponse([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(tasksItemsFromResponse({ items: [{ id: 2 }] })).toEqual([{ id: 2 }]);
    expect(tasksItemsFromResponse(null)).toBeNull();
  });

  it('fetchAllTaskPages enchaîne les pages jusqu’à hasMore false', async () => {
    const calls = [];
    const apiFn = async (path) => {
      calls.push(path);
      if (path.includes('offset=0')) {
        return { items: [{ id: 1 }, { id: 2 }], hasMore: true, limit: 2, offset: 0, total: 3 };
      }
      return { items: [{ id: 3 }], hasMore: false, limit: 2, offset: 2, total: 3 };
    };
    const all = await fetchAllTaskPages(apiFn, 'map_id=m1', { pageLimit: 2 });
    expect(all.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(calls.length).toBe(2);
  });
});
