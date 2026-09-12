import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { UserJournalView } from '../../src/components/journal/UserJournalView.jsx';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { api } from '../../src/services/api';

describe('UserJournalView', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockResolvedValue({
      limits: { maxChars: 0, maxAssets: 0 },
      articles: [],
      imports: [],
    });
  });

  it('affiche le carnet vide et le bouton nouvel article', async () => {
    render(<UserJournalView zones={[]} />);
    await waitFor(() => {
      expect(screen.getByTestId('user-journal')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Nouvel article/i })).toBeInTheDocument();
    expect(screen.getByText(/encore vide/i)).toBeInTheDocument();
  });
});
