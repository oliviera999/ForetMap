import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Fil des groupes au collège (chantier collège, flux C4) : fil réduit (`?profile=college`)
 * quand `nested_groups_full_tree` est masquée, « Pour aller plus loin » vers le fil complet.
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  getAuthToken: () => 'jeton-test',
  withAppBase: (path) => path,
  api: (...args) => apiMock(...args),
}));

import { PlantCladeBreadcrumb } from '../../../src/components/biodiv/PlantCladeBreadcrumb.jsx';
import {
  BiodivPedagoContext,
  useBiodivPedago,
} from '../../../src/contexts/BiodivPedagoContext.jsx';

function withProfile(canShowFullTree, ui) {
  function Wrapper({ children }) {
    const base = useBiodivPedago();
    const value = {
      ...base,
      canShow: (feature) => (feature === 'nested_groups_full_tree' ? canShowFullTree : true),
    };
    return <BiodivPedagoContext.Provider value={value}>{children}</BiodivPedagoContext.Provider>;
  }
  return render(<Wrapper>{ui}</Wrapper>);
}

const plant = { id: 7, name: 'Machaon', clade_id: 'lepidopteres' };

describe('PlantCladeBreadcrumb — fil réduit au collège', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (url) => {
      if (url.endsWith('?profile=college')) {
        return {
          collapsed: true,
          path: [
            { id: 'vivant', name: 'Êtres vivants' },
            { id: 'metazoaires', name: 'Animaux' },
            { id: 'insectes', name: 'Insectes' },
          ],
        };
      }
      return {
        path: [
          { id: 'vivant', name: 'Êtres vivants' },
          { id: 'eucaryotes', name: 'Eucaryotes' },
          { id: 'hexapodes', name: 'Hexapodes' },
          { id: 'lepidopteres', name: 'Lépidoptères' },
        ],
      };
    });
  });

  test('collège : fil réduit puis fil complet par « Pour aller plus loin »', async () => {
    withProfile(false, <PlantCladeBreadcrumb plant={plant} />);
    await screen.findByText('Animaux');
    expect(apiMock).toHaveBeenCalledWith('/api/clades/lepidopteres/path?profile=college');
    expect(screen.queryByText('Eucaryotes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pour aller plus loin' }));
    await screen.findByText('Lépidoptères');
    expect(apiMock).toHaveBeenLastCalledWith('/api/clades/lepidopteres/path');
    fireEvent.click(screen.getByRole('button', { name: 'Revenir aux grands groupes' }));
    await screen.findByText('Animaux');
  });

  test('collège sans marque (repli serveur) : fil complet, pas de bouton', async () => {
    apiMock.mockImplementation(async () => ({
      path: [{ id: 'vivant', name: 'Êtres vivants' }],
    }));
    withProfile(false, <PlantCladeBreadcrumb plant={plant} />);
    await screen.findByText('Êtres vivants');
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Pour aller plus loin' })).toBeNull();
  });

  test('lycée : fil complet sans paramètre ni bouton', async () => {
    withProfile(true, <PlantCladeBreadcrumb plant={plant} />);
    await screen.findByText('Lépidoptères');
    expect(apiMock).toHaveBeenCalledWith('/api/clades/lepidopteres/path');
    expect(screen.queryByRole('button', { name: 'Pour aller plus loin' })).toBeNull();
  });
});
