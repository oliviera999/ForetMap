import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Le composant appelle l'API au montage (jeton) et au clic (challenge) : on la remplace.
const apiMock = vi.fn();
vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => 'jeton-de-test',
  getAuthClaims: () => ({ userId: 'eleve-1' }),
  isLikelyNetworkTransportFailure: (err) => err?.code === 'NETWORK_UNREACHABLE',
  createContextComment: vi.fn(),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { PlantSpeciesDiscoveryAcknowledgeButton } =
  await import('../../src/components/PlantSpeciesDiscoveryAcknowledge.jsx');
const { loadPlantObservationQueue, PLANT_OBSERVATION_QUEUE_STORAGE_KEY } =
  await import('../../src/utils/plantObservationQueue.js');

function networkError() {
  const err = new Error('Pas de réseau');
  err.code = 'NETWORK_UNREACHABLE';
  return err;
}

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
  localStorage.removeItem(PLANT_OBSERVATION_QUEUE_STORAGE_KEY);
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

// Piste D (audit du 25/09/2026) : sur le terrain, une observation confirmée sans réseau était
// perdue. Elle est désormais gardée sur l'appareil quand le serveur ne posera pas de question
// à son arrivée, et rejouée avec sa clé d'idempotence.
describe('« Espèce observée » sans réseau', () => {
  it('une ré-observation est mise en file, comptée tout de suite et annoncée', async () => {
    apiMock.mockImplementation(async () => {
      throw networkError();
    });
    const onAcknowledged = vi.fn();
    render(
      <PlantSpeciesDiscoveryAcknowledgeButton
        plantId={42}
        speciesName="Menthe"
        myObservationCount={3}
        siteObservationCount={7}
        onAcknowledged={onAcknowledged}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Espèce observée/ }));
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(onAcknowledged).toHaveBeenCalled());
    expect(onAcknowledged).toHaveBeenCalledWith(42, {
      my_observation_count: 4,
      site_observation_count: 8,
    });
    const queue = loadPlantObservationQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ user_id: 'eleve-1', plant_id: 42 });
    // La clé envoyée est celle gardée en file : le rejeu ne comptera pas deux fois.
    const sent = apiMock.mock.calls.find(([path]) => String(path).includes('acknowledge'));
    expect(sent[2].client_uuid).toBe(queue[0].client_uuid);
    expect(screen.getByRole('status').textContent).toMatch(/Pas de réseau/);
  });

  it('une première observation d’une fiche au conditionnement inconnu n’est pas mise en file', async () => {
    apiMock.mockImplementation(async () => {
      throw networkError();
    });
    render(
      <PlantSpeciesDiscoveryAcknowledgeButton
        plantId={42}
        speciesName="Menthe"
        myObservationCount={0}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Espèce découverte/ }));
    await screen.findByText(/Pas de réseau/);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(loadPlantObservationQueue()).toHaveLength(0);
  });

  it('au retour du réseau, la file est rejouée avec la même clé', async () => {
    localStorage.setItem(
      PLANT_OBSERVATION_QUEUE_STORAGE_KEY,
      JSON.stringify([
        { user_id: 'eleve-1', plant_id: 42, client_uuid: 'cle-idem-0001', queued_at: 1 },
        { user_id: 'autre-eleve', plant_id: 42, client_uuid: 'cle-idem-0002', queued_at: 2 },
      ]),
    );
    apiMock.mockImplementation(async () => ({ success: true }));
    render(<PlantSpeciesDiscoveryAcknowledgeButton plantId={42} speciesName="Menthe" />);
    await waitFor(() => expect(loadPlantObservationQueue()).toHaveLength(1));
    const replay = apiMock.mock.calls.filter(([path]) => String(path).includes('acknowledge'));
    expect(replay).toHaveLength(1);
    expect(replay[0][2]).toEqual({ confirm: true, client_uuid: 'cle-idem-0001' });
    // L'observation d'un autre compte attend que son auteur se reconnecte.
    expect(loadPlantObservationQueue()[0].user_id).toBe('autre-eleve');
  });
});
