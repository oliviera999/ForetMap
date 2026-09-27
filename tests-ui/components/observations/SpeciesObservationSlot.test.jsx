import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let token = 'jeton-de-test';
const listMineMock = vi.fn();
const deleteMock = vi.fn();
const createMock = vi.fn();

vi.mock('../../../src/services/api', () => ({
  api: vi.fn(),
  getAuthToken: () => token,
  getAuthClaims: () => ({ userId: 'eleve-1' }),
  isLikelyNetworkTransportFailure: (err) => err?.code === 'NETWORK_UNREACHABLE',
  withAppBase: (p) => p,
  AccountDeletedError: class AccountDeletedError extends Error {},
}));
vi.mock('../../../src/services/observationsApi', () => ({
  createSpeciesObservation: (...args) => createMock(...args),
  uploadSpeciesObservationPhoto: vi.fn(),
  listMySpeciesObservations: (...args) => listMineMock(...args),
  deleteSpeciesObservation: (...args) => deleteMock(...args),
}));

const { DataProvider } = await import('../../../src/contexts/DataContext.jsx');
const { SessionProvider } = await import('../../../src/contexts/SessionContext.jsx');
const { PublicSettingsProvider } = await import('../../../src/contexts/PublicSettingsContext.jsx');
const { SpeciesObservationSlot, isConfirmedOnSite } =
  await import('../../../src/components/observations/SpeciesObservationSlot.jsx');
const { LocationObservationSlot } =
  await import('../../../src/components/observations/LocationObservationSlot.jsx');
const { SPECIES_OBSERVATION_QUEUE_STORAGE_KEY, enqueueSpeciesObservation } =
  await import('../../../src/utils/speciesObservationQueue.js');

const DATA = {
  activeMapId: 'foret',
  plants: [{ id: 5, name: 'Mésange charbonnière', emoji: '🐦' }],
  zones: [{ id: 'mare', name: 'Mare', map_id: 'foret' }],
  markers: [{ id: 'm1', label: 'Nichoir', map_id: 'foret' }],
};

function renderWith(
  ui,
  { session = { canParticipateContextComments: true }, publicSettings = null } = {},
) {
  return render(
    <PublicSettingsProvider value={publicSettings}>
      <DataProvider value={DATA}>
        <SessionProvider value={session}>{ui}</SessionProvider>
      </DataProvider>
    </PublicSettingsProvider>,
  );
}

const MODULE_OFF = { modules: { species_observations_enabled: false } };

beforeEach(() => {
  token = 'jeton-de-test';
  localStorage.removeItem(SPECIES_OBSERVATION_QUEUE_STORAGE_KEY);
  listMineMock.mockReset();
  deleteMock.mockReset();
  createMock.mockReset();
  listMineMock.mockResolvedValue({ items: [] });
});

describe('SpeciesObservationSlot (fiche espèce)', () => {
  it('affiche « Confirmée sur le site » quand le registre dit confirme_site', () => {
    expect(isConfirmedOnSite({ validation_status: 'confirme_site' })).toBe(true);
    expect(isConfirmedOnSite({ validation_status: 'attendu' })).toBe(false);
    renderWith(
      <SpeciesObservationSlot
        plant={{ id: 5, name: 'Mésange charbonnière' }}
        presenceEntry={{ plant_id: 5, sources: ['registre'], validation_status: 'confirme_site' }}
      />,
    );
    expect(screen.getByText('Confirmée sur le site')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Signaler une observation/ })).toBeTruthy();
  });

  it('sans session : ni signalement ni liste (visite publique), la confirmation reste visible', () => {
    token = '';
    renderWith(
      <SpeciesObservationSlot
        plant={{ id: 5, name: 'Mésange' }}
        presenceEntry={{ validation_status: 'confirme_site' }}
      />,
    );
    expect(screen.getByText('Confirmée sur le site')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Signaler/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mes observations/ })).toBeNull();
  });

  it('profil sans participation : pas de bouton de signalement, la liste reste', () => {
    renderWith(<SpeciesObservationSlot plant={{ id: 5, name: 'Mésange' }} />, {
      session: { canParticipateContextComments: false },
    });
    expect(screen.queryByRole('button', { name: /Signaler/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Mes observations/ })).toBeTruthy();
    expect(screen.queryByText('Confirmée sur le site')).toBeNull();
  });

  it('ouvre le formulaire avec l’espèce présélectionnée', async () => {
    const user = userEvent.setup();
    renderWith(<SpeciesObservationSlot plant={{ id: 5, name: 'Mésange charbonnière' }} />);
    await user.click(screen.getByRole('button', { name: /Signaler une observation/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Signaler une observation — Mésange charbonnière/),
    ).toBeTruthy();
    expect(within(dialog).getByLabelText('Espèce observée').value).toBe('5');
  });

  it('« Mes observations » : statut, note de l’enseignant, file hors ligne de l’espèce', async () => {
    listMineMock.mockResolvedValue({
      items: [
        {
          id: 1,
          plant_id: 5,
          plant_name: 'Mésange charbonnière',
          plant_emoji: '🐦',
          status: 'validee',
          observed_at: '2026-09-20',
          map_label: 'Forêt',
          text: 'Au nichoir',
          decision_note: 'Bravo',
          photos: [],
        },
        { id: 2, plant_id: 9, plant_name: 'Autre', status: 'soumise', observed_at: '2026-09-21' },
      ],
    });
    // Le rejeu échoue (réseau absent) : l'entrée reste affichée « En attente de réseau ».
    const err = new Error('Pas de réseau');
    err.code = 'NETWORK_UNREACHABLE';
    createMock.mockRejectedValue(err);
    enqueueSpeciesObservation({
      user_id: 'eleve-1',
      client_uuid: 'sobs-test-0001',
      map_id: 'foret',
      plant_id: 5,
      observed_at: '2026-09-22',
      text: 'Gardée sans réseau',
      plant_label: '🐦 Mésange charbonnière',
    });
    const user = userEvent.setup();
    renderWith(<SpeciesObservationSlot plant={{ id: 5, name: 'Mésange charbonnière' }} />);
    await user.click(screen.getByRole('button', { name: /Mes observations/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getAllByTestId('species-obs-item')).toHaveLength(1));
    expect(within(dialog).getByText('Validée')).toBeTruthy();
    expect(within(dialog).getByText(/Bravo/)).toBeTruthy();
    expect(within(dialog).getByText('En attente de réseau')).toBeTruthy();
    // Validée = preuve : pas de suppression proposée.
    const item = within(dialog).getByTestId('species-obs-item');
    expect(within(item).queryByRole('button', { name: 'Supprimer' })).toBeNull();
  });
});

describe('interrupteur ui.modules.species_observations_enabled', () => {
  it('éteint : ni signalement ni liste pour un élève', () => {
    renderWith(<SpeciesObservationSlot plant={{ id: 5, name: 'Mésange' }} mapId="foret" />, {
      publicSettings: MODULE_OFF,
    });
    expect(screen.queryByTestId('species-obs-actions')).toBeNull();
  });

  it('éteint : le validateur garde les boutons', () => {
    renderWith(<SpeciesObservationSlot plant={{ id: 5, name: 'Mésange' }} mapId="foret" />, {
      publicSettings: MODULE_OFF,
      session: {
        canParticipateContextComments: true,
        hasPermission: (key) => key === 'observations.validate',
      },
    });
    expect(screen.getByRole('button', { name: /Signaler une observation/ })).toBeTruthy();
  });
});

describe('LocationObservationSlot (zone ou repère de la carte)', () => {
  it('présélectionne le lieu dans le formulaire', async () => {
    const user = userEvent.setup();
    renderWith(
      <LocationObservationSlot
        kind="zone"
        location={{ id: 'mare', map_id: 'foret', name: 'Mare' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Signaler une observation ici/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Lieu (facultatif)').value).toBe('zone:mare');
  });

  it('rien pour un lieu non enregistré', () => {
    const { container } = renderWith(
      <LocationObservationSlot kind="marker" location={{ map_id: 'foret' }} />,
    );
    expect(container.querySelector('[data-testid="species-obs-actions"]')).toBeNull();
  });
});
