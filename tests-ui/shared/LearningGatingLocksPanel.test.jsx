import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  LearningGatingLocksPanel,
  formatLearner,
  formatRemaining,
} from '../../src/shared/components/LearningGatingLocksPanel.jsx';

const LOCKS = {
  locks: [
    {
      product: 'fm',
      learner: { user_id: 'u1', user_type: 'student', display_name: 'Camille' },
      resource_type: 'tutorial',
      resource_ref: '12',
      resource_label: 'Le compostage',
      scope: 'resource',
      locked_question_code: null,
      wrong_question_code: 'QF0001',
      wrong_attempts: 2,
      remaining_days: 2,
      expired: false,
    },
    {
      product: 'fm',
      learner: { user_id: 'u2', user_type: 'student', display_name: null },
      resource_type: 'tutorial',
      resource_ref: '13',
      resource_label: null,
      scope: 'question',
      locked_question_code: 'QF0007',
      wrong_question_code: 'QF0007',
      wrong_attempts: 1,
      remaining_days: 0,
      expired: true,
    },
  ],
};

const request = vi.fn();
const buildReleaseBody = (lock) => ({ user_id: lock.learner.user_id });

function renderPanel() {
  return render(
    <LearningGatingLocksPanel
      request={request}
      basePath="/api/learning-links"
      buildReleaseBody={buildReleaseBody}
    />,
  );
}

describe('formatLearner', () => {
  test('privilégie le nom affiché', () => {
    expect(formatLearner({ display_name: 'Camille', user_id: 'u1' })).toBe('Camille');
  });
  test('retombe sur le type et l’identifiant pour un lecteur sans compte (GL)', () => {
    expect(formatLearner({ user_type: 'gl_guest', user_id: '42' })).toBe('gl_guest 42');
    expect(formatLearner({ user_type: 'student', user_id: 'u9' })).toBe('u9');
  });
  test('ne casse pas sur une entrée vide', () => {
    expect(formatLearner(null)).toBe('—');
  });
});

describe('formatRemaining', () => {
  test('singulier et pluriel', () => {
    expect(formatRemaining({ remaining_days: 1 })).toBe('encore 1 jour');
    expect(formatRemaining({ remaining_days: 3 })).toBe('encore 3 jours');
  });
  test('un blocage expiré le dit', () => {
    expect(formatRemaining({ expired: true, remaining_days: 0 })).toBe('Expiré');
  });
  test('jamais « 0 jour » sur un blocage actif', () => {
    expect(formatRemaining({ remaining_days: 0 })).toBe('encore 1 jour');
  });
});

describe('LearningGatingLocksPanel', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(LOCKS);
  });

  test('liste les blocages avec le libellé de la fiche', async () => {
    renderPanel();
    expect(await screen.findByText('Le compostage')).toBeInTheDocument();
    expect(screen.getByText('Camille')).toBeInTheDocument();
  });

  test('compte les blocages réellement en cours, pas les expirés', async () => {
    renderPanel();
    // Deux lignes, dont une expirée : un seul blocage actif.
    expect(await screen.findByText(/1 lecteur bloqué en ce moment/)).toBeInTheDocument();
  });

  test('distingue la portée du verrou', async () => {
    renderPanel();
    expect(await screen.findByText('Toute la fiche')).toBeInTheDocument();
    expect(screen.getByText('Une seule question')).toBeInTheDocument();
  });

  test('n’offre pas de bouton « Débloquer » sur un blocage expiré', async () => {
    renderPanel();
    await screen.findByText('Le compostage');
    expect(screen.getAllByRole('button', { name: 'Débloquer' })).toHaveLength(1);
  });

  test('lever un verrou appelle DELETE puis recharge', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Débloquer' }));
    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('/api/learning-links/locks', 'DELETE', {
        user_id: 'u1',
      });
    });
    expect(await screen.findByText(/Verrou levé/)).toBeInTheDocument();
  });

  test('la case « expirés » recharge avec le bon paramètre', async () => {
    renderPanel();
    await screen.findByText('Le compostage');
    fireEvent.click(screen.getByLabelText(/blocages déjà expirés/i));
    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('/api/learning-links/locks?includeExpired=1');
    });
  });

  test('liste vide : le message dit que personne n’est bloqué', async () => {
    request.mockResolvedValue({ locks: [] });
    renderPanel();
    expect(await screen.findByText(/Personne n’est bloqué/)).toBeInTheDocument();
  });

  test('une erreur de chargement est affichée, pas avalée', async () => {
    request.mockRejectedValue(new Error('Permission insuffisante'));
    renderPanel();
    expect(await screen.findByText('Permission insuffisante')).toBeInTheDocument();
  });
});
