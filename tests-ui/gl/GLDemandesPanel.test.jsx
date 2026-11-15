import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLDemandesPanel } from '../../src/gl/components/mj/GLDemandesPanel.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));
vi.mock('../../src/gl/components/mj/GLTenirHonneursPanel.jsx', () => ({
  GLTenirHonneursPanel: () => <div data-testid="relecture" />,
}));

const demandes = [
  {
    id: 1,
    kind: 'des_a_valider',
    refId: '41',
    teamId: 2,
    teamName: 'Gnomes A',
    titre: 'Dés à valider',
    action: 'Valider le jet',
    detail: '1 + 1 = 2',
    payload: {},
  },
  {
    id: 2,
    kind: 'jet_en_suspens',
    refId: 'suspens-1-3',
    teamId: 3,
    teamName: 'Licornes A',
    titre: 'Jet en suspens',
    action: 'Appliquer la case',
    detail: 'jet de 4',
    payload: {},
  },
  {
    id: 3,
    kind: 'nommer',
    refId: '77',
    teamId: 2,
    teamName: 'Gnomes A',
    titre: 'Nommer : page à réparer',
    action: 'Effet appliqué',
    detail: 'Nommer',
    payload: { zoneKey: 'cz-p1-03' },
  },
  {
    id: 4,
    kind: 'presence_a_confirmer',
    refId: 'presence-1-4',
    teamId: 4,
    teamName: 'Licornes B',
    titre: 'Présences à confirmer',
    action: 'Tout le monde est là',
    detail: '',
    payload: {},
  },
  {
    id: 5,
    kind: 'chimere',
    refId: '9',
    teamId: null,
    teamName: null,
    titre: 'Chimère à relire',
    action: 'Relire',
    detail: '« Lapin-hibou »',
    payload: {},
  },
];

function tourApi() {
  return {
    busy: false,
    validerSaisie: vi.fn().mockResolvedValue({}),
    refuserSaisie: vi.fn().mockResolvedValue({}),
    garderJet: vi.fn().mockResolvedValue({}),
    presences: vi.fn().mockResolvedValue({}),
  };
}

describe('GLDemandesPanel — file unique du prof', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation(async (path) =>
      path.endsWith('/tenir/demandes') ? { demandes, total: demandes.length } : {},
    );
  });

  test('une ligne par demande, la plus ancienne en haut, un bouton principal par ligne', async () => {
    const api = tourApi();
    const onChanged = vi.fn();
    render(<GLDemandesPanel game={{ id: 7 }} tourApi={api} onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByTestId('gl-demandes-total').textContent).toBe('5'));
    const lignes = document.querySelectorAll('.gl-demandes__ligne');
    expect([...lignes].map((l) => l.getAttribute('data-kind'))).toEqual([
      'des_a_valider',
      'jet_en_suspens',
      'nommer',
      'presence_a_confirmer',
      'chimere',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Valider le jet' }));
    await waitFor(() => expect(api.validerSaisie).toHaveBeenCalledWith('41'));
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la case' }));
    await waitFor(() => expect(api.garderJet).toHaveBeenCalledWith(3));
    fireEvent.click(screen.getByRole('button', { name: 'Tout le monde est là' }));
    await waitFor(() => expect(api.presences).toHaveBeenCalledWith([], 4));
    fireEvent.click(screen.getByRole('button', { name: 'Effet appliqué' }));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/games/7/spell-casts/drafts/77/effect-applied',
        'POST',
        { zoneKey: 'cz-p1-03' },
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refuser et rembourser' }));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/games/7/spell-casts/drafts/77/refuser',
        'POST',
        {},
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test('une proposition d’élève se relit avant d’être acceptée', async () => {
    render(<GLDemandesPanel game={{ id: 7 }} tourApi={tourApi()} />);
    await waitFor(() => screen.getByText('« Lapin-hibou »'));
    expect(screen.queryByTestId('relecture')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Relire' }));
    expect(screen.getByTestId('relecture')).toBeTruthy();
  });

  test('file vide : rien n’attend', async () => {
    apiGlMock.mockResolvedValue({ demandes: [], total: 0 });
    render(<GLDemandesPanel game={{ id: 7 }} tourApi={tourApi()} />);
    await waitFor(() => screen.getByText('Rien n’attend votre geste.'));
    expect(screen.getByTestId('gl-demandes-total').textContent).toBe('0');
  });
});
