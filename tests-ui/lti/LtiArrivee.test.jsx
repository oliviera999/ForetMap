// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  destinationsFromTicket,
  parseTicketFromHash,
  tabForLanding,
} from '../../src/utils/ltiArrivee.js';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(),
}));

vi.mock('../../src/utils/ltiArrivee.js', async () => {
  const actual = await vi.importActual('../../src/utils/ltiArrivee.js');
  return { ...actual, redirectTo: vi.fn() };
});

const { api } = await import('../../src/services/api');
const { redirectTo } = await import('../../src/utils/ltiArrivee.js');
const { LtiArrivee } = await import('../../src/components/lti/LtiArrivee.jsx');

function ticketFor(destinations) {
  const json = JSON.stringify({ destination: { destinations } });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  const payload = btoa(binary);
  return `${btoa('{"alg":"none"}')}.${payload}.x`;
}

describe('ltiArrivee helpers', () => {
  it('lit le ticket du hash et les destinations du JWT', () => {
    const t = ticketFor([{ id: 'fm_map', label: 'La carte', product: 'fm', landing: 'fm_map' }]);
    expect(parseTicketFromHash(`#ticket=${encodeURIComponent(t)}`)).toBe(t);
    expect(destinationsFromTicket(t)).toHaveLength(1);
    expect(tabForLanding('fm_tasks')).toBe('tasks');
    expect(tabForLanding('gl_game')).toBeNull();
  });
});

describe('LtiArrivee', () => {
  beforeEach(() => {
    api.mockReset();
    redirectTo.mockReset();
    window.history.replaceState({}, '', '/lti/arrivee');
  });

  it('sans ticket : message d’erreur', () => {
    window.location.hash = '';
    render(<LtiArrivee />);
    expect(screen.getByRole('alert').textContent).toMatch(/incomplet|expiré/);
  });

  it('une seule destination : échange automatique puis redirection #oauth=', async () => {
    const t = ticketFor([{ id: 'fm_map', label: 'La carte', product: 'fm', landing: 'fm_map' }]);
    window.location.hash = `#ticket=${encodeURIComponent(t)}`;
    api.mockResolvedValue({
      product: 'fm',
      type: 'student',
      landing: 'fm_map',
      redirectUrl: 'https://foret.test/#oauth=abc',
    });
    render(<LtiArrivee />);
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('/api/lti/session', 'POST', {
      ticket: t,
      destinationId: 'fm_map',
    });
    expect(redirectTo).toHaveBeenCalledWith('https://foret.test/#oauth=abc');
  });

  it('plusieurs destinations : boutons, pas d’échange tant qu’on n’a pas choisi', async () => {
    const t = ticketFor([
      { id: 'fm_map', label: 'ForetMap — la carte', product: 'fm', landing: 'fm_map' },
      { id: 'gl_game', label: 'Gnomes & Licornes', product: 'gl', landing: 'gl_game' },
    ]);
    window.location.hash = `#ticket=${encodeURIComponent(t)}`;
    render(<LtiArrivee />);
    expect(screen.getByRole('button', { name: 'ForetMap — la carte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gnomes & Licornes' })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    api.mockResolvedValue({ redirectUrl: 'https://gl.test/#oauth=z', landing: 'gl_game' });
    fireEvent.click(screen.getByRole('button', { name: 'Gnomes & Licornes' }));
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://gl.test/#oauth=z'));
  });
});
