import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../src/services/api', () => ({
  api: vi.fn(),
  getAuthToken: () => 'jeton-de-test',
  getAuthClaims: () => ({ userId: 'eleve-1' }),
  isLikelyNetworkTransportFailure: () => false,
  AccountDeletedError: class AccountDeletedError extends Error {},
}));
vi.mock('../../../src/services/observationsApi', () => ({
  createSpeciesObservation: vi.fn(),
  uploadSpeciesObservationPhoto: vi.fn(),
}));

const { SpeciesObservationForm } =
  await import('../../../src/components/observations/SpeciesObservationForm.jsx');

/**
 * Une ressource (litière, compost…) n'est pas un être vivant : elle n'est pas proposée dans
 * la liste « Espèce observée », sauf quand le formulaire s'ouvre depuis sa propre fiche.
 */
const PLANTS = [
  { id: 1, name: 'Cloporte', emoji: '🐛', entity_kind: 'taxon' },
  { id: 2, name: 'Litière de feuilles', emoji: '🍂', entity_kind: 'ressource' },
  { id: 3, name: 'Phytoplancton', emoji: '🦠', entity_kind: 'groupe_fonctionnel' },
];

function speciesOptions(props = {}) {
  render(
    <SpeciesObservationForm
      mapId="foret"
      plants={PLANTS}
      onDone={() => {}}
      onCancel={() => {}}
      {...props}
    />,
  );
  const select = screen.getByLabelText('Espèce observée');
  return [...select.querySelectorAll('option')].map((o) => o.textContent);
}

describe('SpeciesObservationForm — fiches « ressource »', () => {
  it('la liste des espèces ne propose pas les ressources', () => {
    const labels = speciesOptions().join(' | ');
    expect(labels).toContain('Cloporte');
    expect(labels).toContain('Phytoplancton');
    expect(labels).not.toContain('Litière de feuilles');
  });

  it('ouvert depuis la fiche d’une ressource, il garde cette fiche présélectionnée', () => {
    const labels = speciesOptions({ initialPlantId: 2 }).join(' | ');
    expect(labels).toContain('Litière de feuilles');
    expect(screen.getByLabelText('Espèce observée').value).toBe('2');
  });
});
