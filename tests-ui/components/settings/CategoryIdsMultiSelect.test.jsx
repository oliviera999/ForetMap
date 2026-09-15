import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryIdsMultiSelect } from '../../../src/components/settings/CategoryIdsMultiSelect.jsx';

vi.mock('../../../src/services/api', () => ({
  api: vi.fn(async (url) => {
    if (String(url).includes('/api/map-categories/manage')) {
      return [
        { id: 'arbres', label: 'Arbres', emoji: '🌳' },
        { id: 'oiseaux', label: 'Oiseaux', emoji: '🐦' },
        { id: 'insectes', label: 'Insectes', emoji: '🐛' },
      ];
    }
    return {};
  }),
}));

describe('CategoryIdsMultiSelect — anti-course', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('deux clics rapides envoient la sélection complète, pas seulement la dernière case', async () => {
    const writes = [];
    const releases = [];
    const onSave = vi.fn((next) => {
      writes.push(next);
      return new Promise((resolve) => {
        releases.push(resolve);
      });
    });

    render(<CategoryIdsMultiSelect label="Catégories" value="" onSave={onSave} testId="cats" />);

    fireEvent.click(await screen.findByRole('checkbox', { name: /Arbres/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Oiseaux/i }));

    await waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(1));
    expect(writes[0]).toBe('arbres');

    releases[0]();
    await waitFor(() => expect(writes).toContain('arbres;oiseaux'));
    expect(writes.at(-1)).toBe('arbres;oiseaux');
    expect(writes).not.toContain('oiseaux');

    expect(screen.getByRole('checkbox', { name: /Arbres/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Oiseaux/i })).toBeChecked();
    releases[releases.length - 1]();
  });
});
