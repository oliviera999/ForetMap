import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { UserTrackingPanel } from '../../../src/components/settings/UserTrackingPanel.jsx';

vi.mock('../../../src/services/api', () => ({
  api: vi.fn(),
}));

vi.mock('../../../src/shared/hooks/useLatestRequest.js', () => ({
  useLatestRequest: () => () => () => true,
}));

import { api } from '../../../src/services/api';

describe('UserTrackingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.mockImplementation(async (url) => {
      if (String(url).includes('/presence')) {
        return {
          generatedAt: '2026-09-15T12:00:00.000Z',
          counts: { online: 1, recent: 0, total: 1 },
          users: [
            {
              product: 'foret',
              userId: 'u1',
              userType: 'teacher',
              status: 'online',
              presence_label: 'En ligne',
              lastSeen: '2026-09-15T12:00:00.000Z',
              label: 'Admin Test',
            },
          ],
        };
      }
      return { rows: [], byProduct: [], recent: [], multiProductUsers: 0 };
    });
  });

  it('affiche le snapshot de présence admin', async () => {
    render(<UserTrackingPanel />);
    await waitFor(() => {
      expect(screen.getByText(/En ligne : 1/)).toBeTruthy();
    });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/admin/presence'));
    expect(screen.getAllByText(/foret/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/En ligne/).length).toBeGreaterThan(0);
  });
});
