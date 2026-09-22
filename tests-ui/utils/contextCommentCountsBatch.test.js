import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const getContextCommentCounts = vi.fn();

vi.mock('../../src/services/api.js', () => ({
  getContextCommentCounts: (...args) => getContextCommentCounts(...args),
}));

describe('contextCommentCountsBatch', () => {
  beforeEach(() => {
    getContextCommentCounts.mockReset();
    vi.resetModules();
  });

  afterEach(async () => {
    const { resetContextCommentCountsBatch } =
      await import('../../src/utils/contextCommentCountsBatch.js');
    resetContextCommentCountsBatch();
  });

  test('fusionne plusieurs ids du même type en un seul appel', async () => {
    getContextCommentCounts.mockResolvedValue({
      counts: {
        a: { total: 2, newestId: 20 },
        b: { total: 0, newestId: 0 },
      },
    });

    const { fetchContextCommentSummary } =
      await import('../../src/utils/contextCommentCountsBatch.js');

    const [sa, sb] = await Promise.all([
      fetchContextCommentSummary('task', 'a'),
      fetchContextCommentSummary('task', 'b'),
    ]);

    expect(getContextCommentCounts).toHaveBeenCalledTimes(1);
    expect(getContextCommentCounts.mock.calls[0][0]).toEqual({
      contextType: 'task',
      contextIds: expect.arrayContaining(['a', 'b']),
    });
    expect(sa).toEqual({ total: 2, newestId: 20 });
    expect(sb).toEqual({ total: 0, newestId: 0 });
  });
});
