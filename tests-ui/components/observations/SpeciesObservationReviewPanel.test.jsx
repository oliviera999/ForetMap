import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const reviewMock = vi.fn();
const decideMock = vi.fn();
const candidatesMock = vi.fn();
const attachMock = vi.fn();

vi.mock('../../../src/services/api', () => ({
  api: vi.fn(),
  getAuthToken: () => 'jeton-prof',
  withAppBase: (p) => p,
}));
vi.mock('../../../src/services/observationsApi', () => ({
  listSpeciesObservationsForReview: (...args) => reviewMock(...args),
  decideSpeciesObservation: (...args) => decideMock(...args),
  listObservationInteractionCandidates: (...args) => candidatesMock(...args),
  attachObservationEvidence: (...args) => attachMock(...args),
}));

const { DataProvider } = await import('../../../src/contexts/DataContext.jsx');
const { SpeciesObservationReviewPanel } =
  await import('../../../src/components/observations/SpeciesObservationReviewPanel.jsx');

const DATA = {
  activeMapId: 'foret',
  plants: [
    { id: 5, name: 'Mésange', emoji: '🐦' },
    { id: 6, name: 'Chenille', emoji: '🐛' },
  ],
};
const MAPS = [
  { id: 'foret', label: 'Forêt' },
  { id: 'n3', label: 'N3' },
];

const PENDING = {
  id: 11,
  observer_name: 'Élève Test',
  map_id: 'foret',
  map_label: 'Forêt',
  zone_name: 'Mare',
  plant_id: null,
  plant_name: null,
  observed_at: '2026-09-20',
  detection_mode: 'vue',
  text: 'Un oiseau à tête noire',
  status: 'soumise',
  photos: [],
};

function renderPanel(props = {}) {
  const onToast = vi.fn();
  render(
    <DataProvider value={DATA}>
      <SpeciesObservationReviewPanel maps={MAPS} onToast={onToast} {...props} />
    </DataProvider>,
  );
  return { onToast };
}

beforeEach(() => {
  reviewMock.mockReset();
  decideMock.mockReset();
  candidatesMock.mockReset();
  attachMock.mockReset();
});

describe('SpeciesObservationReviewPanel', () => {
  it('sans la permission (403) : le panneau disparaît', async () => {
    const err = new Error('Permission insuffisante');
    err.status = 403;
    reviewMock.mockRejectedValue(err);
    renderPanel();
    await waitFor(() => expect(reviewMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('species-obs-review')).toBeNull());
  });

  it('file d’examen de la carte active : compteur, observation, validation avec espèce choisie', async () => {
    reviewMock.mockResolvedValue({
      items: [PENDING],
      counts: { soumise: 1, validee: 3, refusee: 0 },
    });
    decideMock.mockResolvedValue({
      observation: { ...PENDING, status: 'validee', plant_id: 5, plant_name: 'Mésange' },
      map_species: { status: 'confirme_site' },
    });
    const user = userEvent.setup();
    const { onToast } = renderPanel();
    await waitFor(() => expect(screen.getByText(/Observations à valider \(1\)/)).toBeTruthy());
    expect(reviewMock).toHaveBeenCalledWith({ mapId: 'foret', status: 'soumise' });
    await user.click(screen.getByText(/Observations à valider/));
    const card = screen.getByTestId('species-obs-review-item');
    expect(within(card).getByText(/Un oiseau à tête noire/)).toBeTruthy();
    expect(within(card).getByText(/Élève Test/)).toBeTruthy();

    const validate = within(card).getByRole('button', { name: 'Valider' });
    expect(validate.disabled).toBe(true);
    await user.selectOptions(within(card).getByLabelText('Espèce retenue'), '5');
    await user.type(within(card).getByLabelText('Note pour l’élève'), 'Bien observé');
    await user.click(validate);
    await waitFor(() => expect(decideMock).toHaveBeenCalled());
    expect(decideMock).toHaveBeenCalledWith(11, {
      decision: 'validee',
      plantId: 5,
      note: 'Bien observé',
    });
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/confirmée sur le site/)),
    );
  });

  it('filtres carte et statut rechargent la liste', async () => {
    reviewMock.mockResolvedValue({ items: [], counts: { soumise: 0, validee: 0, refusee: 0 } });
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(reviewMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByText(/Observations à valider/));
    await user.selectOptions(screen.getByLabelText('Statut'), 'all');
    await waitFor(() =>
      expect(reviewMock).toHaveBeenLastCalledWith({ mapId: 'foret', status: 'all' }),
    );
    await user.selectOptions(screen.getByLabelText('Carte'), '');
    await waitFor(() =>
      expect(reviewMock).toHaveBeenLastCalledWith({ mapId: null, status: 'all' }),
    );
    expect(screen.getByText('Aucune observation dans cette liste.')).toBeTruthy();
  });
});
