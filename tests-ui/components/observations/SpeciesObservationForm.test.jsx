import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createMock = vi.fn();
const uploadMock = vi.fn();

vi.mock('../../../src/services/api', () => ({
  api: vi.fn(),
  getAuthToken: () => 'jeton-de-test',
  getAuthClaims: () => ({ userId: 'eleve-1' }),
  isLikelyNetworkTransportFailure: (err) => err?.code === 'NETWORK_UNREACHABLE',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));
vi.mock('../../../src/services/observationsApi', () => ({
  createSpeciesObservation: (...args) => createMock(...args),
  uploadSpeciesObservationPhoto: (...args) => uploadMock(...args),
}));

const { SpeciesObservationForm, todayLocalDate } =
  await import('../../../src/components/observations/SpeciesObservationForm.jsx');
const { listQueuedSpeciesObservations, SPECIES_OBSERVATION_QUEUE_STORAGE_KEY } =
  await import('../../../src/utils/speciesObservationQueue.js');

const PLANTS = [
  { id: 2, name: 'Rouge-gorge', emoji: '🐦' },
  { id: 1, name: 'Coccinelle', emoji: '🐞' },
];
const ZONES = [
  { id: 'mare', name: 'Mare', map_id: 'foret' },
  { id: 'ailleurs', name: 'Autre carte', map_id: 'n3' },
];
const MARKERS = [{ id: 'm1', label: 'Nichoir', map_id: 'foret' }];

function renderForm(props = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(
    <SpeciesObservationForm
      mapId="foret"
      plants={PLANTS}
      zones={ZONES}
      markers={MARKERS}
      onDone={onDone}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onDone, onCancel };
}

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(() => {
  localStorage.removeItem(SPECIES_OBSERVATION_QUEUE_STORAGE_KEY);
  createMock.mockReset();
  uploadMock.mockReset();
  setOnline(true);
});

afterEach(() => {
  setOnline(true);
});

describe('SpeciesObservationForm', () => {
  it('rappelle d’observer sans toucher, trie les espèces, ne propose que les lieux de la carte', () => {
    renderForm();
    expect(screen.getByText(/sans toucher ni prélever/)).toBeTruthy();
    const species = screen.getByLabelText('Espèce observée');
    const labels = [...species.querySelectorAll('option')].map((o) => o.textContent);
    expect(labels.slice(1)).toEqual(['🐞 Coccinelle', '🐦 Rouge-gorge']);
    const place = screen.getByLabelText('Lieu (facultatif)');
    const places = [...place.querySelectorAll('option')].map((o) => o.textContent);
    expect(places).toContain('Mare');
    expect(places).toContain('Nichoir');
    expect(places).not.toContain('Autre carte');
    expect(screen.getByLabelText('Date').value).toBe(todayLocalDate());
  });

  it('exige l’espèce ou un texte', async () => {
    const user = userEvent.setup();
    const { onDone } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(screen.getByRole('alert').textContent).toMatch(/espèce ou décris/);
    expect(createMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('en ligne : envoie l’observation avec sa clé, espèce et lieu présélectionnés', async () => {
    createMock.mockResolvedValue({ observation: { id: 9, status: 'soumise' }, replayed: false });
    const user = userEvent.setup();
    const { onDone } = renderForm({
      initialPlantId: 1,
      initialPlace: { kind: 'marker', id: 'm1' },
    });
    await user.selectOptions(screen.getByLabelText('Comment l’as-tu repérée ?'), 'chant');
    await user.type(screen.getByLabelText('Ce que tu as vu'), 'Chant dans la haie');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const body = createMock.mock.calls[0][0];
    expect(body).toMatchObject({
      map_id: 'foret',
      plant_id: 1,
      marker_id: 'm1',
      detection_mode: 'chant',
      text: 'Chant dans la haie',
      observed_at: todayLocalDate(),
    });
    expect(body.client_uuid).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(body.zone_id).toBeUndefined();
    expect(onDone.mock.calls[0][0].observation.id).toBe(9);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('sans réseau : l’observation est gardée sur l’appareil, pour ce compte', async () => {
    setOnline(false);
    const user = userEvent.setup();
    const { onDone } = renderForm({ initialPlantId: 2 });
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0]).toMatchObject({ queued: true });
    expect(createMock).not.toHaveBeenCalled();
    const queued = listQueuedSpeciesObservations('eleve-1');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ plant_id: 2, plant_label: '🐦 Rouge-gorge' });
  });

  it('réseau perdu pendant l’envoi : même clé mise en file (le rejeu ne fera pas de doublon)', async () => {
    const err = new Error('Pas de réseau');
    err.code = 'NETWORK_UNREACHABLE';
    createMock.mockRejectedValue(err);
    const user = userEvent.setup();
    const { onDone } = renderForm();
    await user.type(screen.getByLabelText('Ce que tu as vu'), 'Un oiseau noir');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const queued = listQueuedSpeciesObservations('eleve-1');
    expect(queued).toHaveLength(1);
    expect(queued[0].client_uuid).toBe(createMock.mock.calls[0][0].client_uuid);
  });

  it('refus du serveur : message affiché, rien en file', async () => {
    const err = new Error('Zone introuvable sur cette carte');
    err.status = 400;
    createMock.mockRejectedValue(err);
    const user = userEvent.setup();
    const { onDone } = renderForm({ initialPlantId: 1 });
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Zone introuvable/));
    expect(onDone).not.toHaveBeenCalled();
    expect(listQueuedSpeciesObservations('eleve-1')).toHaveLength(0);
  });
});
