// Visibilité des blocs « Mes statistiques » selon le statut n3beur du compte.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  withAppBase: (url) => String(url || ''),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { api } = await import('../../src/services/api');
const { StudentStats } = await import('../../src/components/stats-views.jsx');

const BASE_STATS = {
  done: 4,
  pending: 1,
  submitted: 2,
  total: 7,
  plant_species_observed: 12,
  plant_observation_events: 30,
  tutorials_read: 5,
};

const PROGRESSION = {
  thresholds: {},
  steps: [
    { roleSlug: 'eleve_novice', min: 0, label: 'Palier 1', emoji: '🪨' },
    { roleSlug: 'eleve_avance', min: 5, label: 'Palier 2', emoji: '🌿' },
  ],
  roleSlug: 'eleve_novice',
  roleDisplayName: 'Palier 1',
  roleEmoji: '🪨',
  autoProgressionEnabled: true,
};

const ASSIGNMENTS = [
  {
    id: 'a1',
    task_id: 't1',
    title: 'Pailler la haie',
    status: 'validated',
    zone_name: 'Potager',
    assigned_at: '2026-05-04T09:00:00.000Z',
  },
];

/** Réponse `/api/stats/me/:id` pour un compte n3beur ou non. */
function mockStats({ isN3beur }) {
  api.mockImplementation(async () => ({
    id: 'U1',
    first_name: 'Camille',
    last_name: 'Test',
    user_type: 'student',
    is_n3beur: isN3beur,
    stats: isN3beur ? BASE_STATS : { ...BASE_STATS, done: 0, pending: 0, submitted: 0, total: 0 },
    progression: isN3beur ? PROGRESSION : null,
    assignments: isN3beur ? ASSIGNMENTS : [],
  }));
}

describe('StudentStats — visibilité selon le statut n3beur', () => {
  it('compte hors groupe n3 : ni progression, ni stats de tâches, ni activité récente', async () => {
    mockStats({ isN3beur: false });
    const { container } = render(<StudentStats student={{ id: 'U1' }} />);

    await screen.findByText('Biodiversité & tutoriels');
    expect(screen.queryByText(/Profil actuel/)).toBeNull();
    expect(container.querySelector('.rank-progress')).toBeNull();
    expect(screen.queryByText('Tâches validées')).toBeNull();
    expect(screen.queryByText('Total prises')).toBeNull();
    expect(screen.queryByText('Activité récente')).toBeNull();
    // Le volet biodiversité & tutoriels reste affiché.
    expect(screen.getByText('Espèces observées (fiches)')).toBeTruthy();
    expect(screen.getByText('Tutoriels lus')).toBeTruthy();
  });

  it('compte n3beur : progression, stats de tâches et activité récente affichées', async () => {
    mockStats({ isN3beur: true });
    const { container } = render(<StudentStats student={{ id: 'U1' }} />);

    await screen.findByText('Biodiversité & tutoriels');
    await waitFor(() => expect(container.querySelector('.rank-progress')).not.toBeNull());
    expect(screen.getByText(/Profil actuel/)).toBeTruthy();
    expect(screen.getByText('Tâches validées')).toBeTruthy();
    expect(screen.getByText('Activité récente')).toBeTruthy();
    expect(screen.getByText('Pailler la haie')).toBeTruthy();
  });

  it('réponse sans `is_n3beur` (serveur antérieur) : tout reste affiché', async () => {
    api.mockImplementation(async () => ({
      id: 'U1',
      first_name: 'Camille',
      user_type: 'student',
      stats: BASE_STATS,
      progression: PROGRESSION,
      assignments: ASSIGNMENTS,
    }));
    const { container } = render(<StudentStats student={{ id: 'U1' }} />);

    await screen.findByText('Biodiversité & tutoriels');
    await waitFor(() => expect(container.querySelector('.rank-progress')).not.toBeNull());
    expect(screen.getByText('Activité récente')).toBeTruthy();
  });
});
