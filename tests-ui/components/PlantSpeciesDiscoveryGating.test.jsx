import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Le composant appelle l'API au montage (jeton) et au clic (challenge) : on la remplace.
const apiMock = vi.fn();
vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => 'jeton-de-test',
  createContextComment: vi.fn(),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { PlantSpeciesDiscoveryAcknowledgeButton } =
  await import('../../src/components/PlantSpeciesDiscoveryAcknowledge.jsx');

const CHALLENGE = {
  gating_enabled: true,
  required: true,
  mode: 'any',
  questions: [{ question_code: 'Q1', already_correct: false }],
  pending_count: 1,
  ask_count: 1,
  satisfied: false,
  cooldown: { locked: false, retry_days: 3 },
};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async (path) => {
    if (String(path).includes('/gating/challenge')) return CHALLENGE;
    return {};
  });
});

describe('« Espèce observée » — la ré-observation est conditionnée comme la première', () => {
  it('demande le contrôle même quand l’espèce a déjà été observée', async () => {
    // Avant ce lot, la ré-observation empruntait une branche séparée, sans
    // conditionnement : une fois l'espèce observée, plus aucune question n'était
    // jamais posée sur cette fiche.
    render(
      <PlantSpeciesDiscoveryAcknowledgeButton
        plantId={42}
        speciesName="Menthe"
        myObservationCount={3}
        siteObservationCount={7}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Espèce observée/ }));

    await waitFor(() => {
      expect(apiMock.mock.calls.some(([path]) => String(path).includes('/gating/challenge'))).toBe(
        true,
      );
    });
    expect(await screen.findByText(/Contrôle de compréhension/)).toBeInTheDocument();
  });

  it('ouvre la question dans le popover, pas dans la modale pleine largeur', async () => {
    render(
      <PlantSpeciesDiscoveryAcknowledgeButton
        plantId={42}
        speciesName="Menthe"
        myObservationCount={0}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Espèce découverte/ }));
    await screen.findByText(/Contrôle de compréhension/);
    // Même coque que le tutoriel : la question surgit par-dessus la fiche.
    expect(document.querySelector('.fm-quiz-popover')).not.toBeNull();
  });

  it('annonce le contrôle sur le bouton avant même le clic', async () => {
    render(
      <PlantSpeciesDiscoveryAcknowledgeButton
        plantId={42}
        speciesName="Menthe"
        myObservationCount={0}
        gatingSummary={{ required: true, ask_count: 2, pending_count: 2 }}
      />,
    );
    expect(screen.getByText('2 questions')).toBeInTheDocument();
  });
});
