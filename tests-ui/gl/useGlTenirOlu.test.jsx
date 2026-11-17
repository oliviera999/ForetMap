import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));
vi.mock('../../src/gl/hooks/useGlNarrator.js', () => ({
  useGlNarrator: () => ({ speakerName: 'OLU', frozen: false }),
}));

import {
  useGlTenirOlu,
  resetGlTenirOluCache,
  OLU_PREMIERE_FOIS_MS,
} from '../../src/gl/hooks/useGlTenirOlu.js';
import { GLOluBulle } from '../../src/gl/components/tenir/GLOluBulle.jsx';

// Olu « première fois » (ensemble unifié, M8) : la ligne désignée par le serveur sur
// l'évènement passe avant toute autre, se dit une fois, et tient la bulle le temps d'être lue.
const LIGNES = [
  { id: 'olu-01', moment: 'fouille', expression: 'curieux', texte: 'On fouille.' },
  {
    id: 'olu-pf-chercher',
    moment: 'premiere_fois',
    expression: 'curieux',
    texte: 'Deux fouilles par tour.',
  },
  {
    id: 'olu-pf-role',
    moment: 'premiere_fois',
    expression: 'neutre',
    texte: 'L’écran appelle un rôle.',
  },
  {
    id: 'olu-pf-sous_le_voile',
    moment: 'premiere_fois',
    expression: 'pensif',
    texte: '{equipe} est sous le voile.',
  },
];
const TEAMS = [{ id: 2, name: 'Licornes A' }];

function Bulle({ events }) {
  const olu = useGlTenirOlu({ gameId: 7, events, teams: TEAMS });
  return <GLOluBulle line={olu.line} speakerName={olu.speakerName} frozen={olu.frozen} />;
}
const bulle = () => screen.queryByTestId('gl-olu-bulle');
const evt = (id, eventType, payload = {}, teamId = null) => ({ id, eventType, payload, teamId });

describe('useGlTenirOlu — première fois', () => {
  beforeEach(() => {
    resetGlTenirOluCache();
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({ lignes: LIGNES, moments: { fouille: 'fouille' } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('les lignes désignées se disent une à une, avant la ligne ordinaire, et tiennent la bulle', async () => {
    const depart = [evt(1, 'tour_ouvert')];
    const { rerender } = render(<Bulle events={depart} />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());
    await act(async () => {});
    expect(bulle()).toBeNull();
    vi.useFakeTimers();
    // Un lot de deux évènements : le premier porte deux lignes « première fois ».
    const lot = [
      ...depart,
      evt(2, 'tour_phase', {
        phase: 'jeu',
        olu: [{ id: 'olu-pf-chercher' }, { id: 'olu-pf-role' }, { id: 'olu-inconnue' }],
      }),
      evt(3, 'fouille', { verdict: 'froid' }, 2),
    ];
    rerender(<Bulle events={lot} />);
    expect(bulle().textContent).toContain('Deux fouilles par tour.');
    expect(bulle().getAttribute('data-moment')).toBe('premiere_fois');
    // Un évènement ordinaire arrive pendant ce temps : la première fois garde la bulle.
    rerender(<Bulle events={[...lot, evt(4, 'fouille', { verdict: 'chaud' }, 2)]} />);
    expect(bulle().textContent).toContain('Deux fouilles par tour.');
    // Puis la seconde ligne, le temps de la première écoulé.
    act(() => {
      vi.advanceTimersByTime(OLU_PREMIERE_FOIS_MS);
    });
    expect(bulle().textContent).toContain('L’écran appelle un rôle.');
    // Une fois lue, la bulle revient aux lignes ordinaires.
    act(() => {
      vi.advanceTimersByTime(OLU_PREMIERE_FOIS_MS + 10);
    });
    rerender(
      <Bulle
        events={[
          ...lot,
          evt(4, 'fouille', { verdict: 'chaud' }, 2),
          evt(5, 'fouille', { verdict: 'tiede' }, 2),
        ]}
      />,
    );
    expect(bulle().textContent).toContain('On fouille.');
    expect(bulle().getAttribute('data-moment')).toBe('fouille');
  });

  test('une ligne par équipe porte le nom de l’équipe désignée ; sans nom connu, elle ne se dit pas', async () => {
    const depart = [evt(1, 'tour_ouvert')];
    const { rerender } = render(<Bulle events={depart} />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());
    await act(async () => {});
    rerender(
      <Bulle
        events={[
          ...depart,
          evt(2, 'voile_avance', { olu: [{ id: 'olu-pf-sous_le_voile', teamId: 99 }] }),
        ]}
      />,
    );
    expect(bulle()).toBeNull();
    rerender(
      <Bulle
        events={[
          ...depart,
          evt(2, 'voile_avance', { olu: [{ id: 'olu-pf-sous_le_voile', teamId: 99 }] }),
          evt(3, 'voile_avance', { olu: [{ id: 'olu-pf-sous_le_voile', teamId: 2 }] }),
        ]}
      />,
    );
    expect(bulle().textContent).toContain('Licornes A est sous le voile.');
    expect(bulle().textContent).not.toContain('{equipe}');
  });
});
