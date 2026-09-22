import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryIdsMultiSelect } from '../../../src/components/settings/CategoryIdsMultiSelect.jsx';

vi.mock('../../../src/services/api', () => ({
  api: vi.fn(async (url) => {
    if (String(url).includes('/api/map-categories/manage')) {
      return [
        {
          id: 'arbres',
          label: 'Arbres',
          emoji: '🌳',
          is_active: true,
          surfaces: ['map', 'visit', 'plan', 'staff'],
        },
        {
          id: 'oiseaux',
          label: 'Oiseaux',
          emoji: '🐦',
          is_active: true,
          surfaces: ['map', 'visit', 'plan', 'staff'],
        },
        {
          id: 'insectes',
          label: 'Insectes',
          emoji: '🐛',
          is_active: true,
          surfaces: ['map', 'visit', 'plan', 'staff'],
        },
        {
          id: 'technique',
          label: 'Technique',
          emoji: '🔧',
          is_active: true,
          surfaces: ['map', 'staff'],
        },
        {
          id: 'inactive',
          label: 'Inactive',
          emoji: '💤',
          is_active: false,
          surfaces: ['map', 'visit', 'plan', 'staff'],
        },
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

  test('requireSurface et excludeIds filtrent la liste', async () => {
    render(
      <CategoryIdsMultiSelect
        label="Catégories"
        value=""
        onSave={vi.fn()}
        testId="cats"
        requireSurface="plan"
        excludeIds={['oiseaux']}
      />,
    );
    expect(await screen.findByRole('checkbox', { name: /Arbres/i })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Insectes/i })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Oiseaux/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Technique/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Inactive/i })).toBeNull();
  });
});
