import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLGatingSettings } from '../../src/gl/components/settings/GLGatingSettings.jsx';

/** Audit des bugs G&L du 19/11/2026, E12 : champ « valeur libre » du délai, non contrôlé. */

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const GATING = {
  enabled: true,
  granularity: 'player',
  defaultMode: 'any',
  defaultRequiredCorrect: 1,
  retryCooldownHours: 6,
  allowedWrongAttempts: 1,
};

describe('GLGatingSettings — délai libre (audit 19/11, E12)', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    let gating = { ...GATING };
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (path === '/api/gl/learning-links/settings' && method === 'PUT') {
        const map = {
          'gating.retry_cooldown_hours': 'retryCooldownHours',
          'gating.allowed_wrong_attempts': 'allowedWrongAttempts',
        };
        gating = { ...gating, [map[body.key] || body.key]: body.value };
        return { success: true, gating };
      }
      if (path === '/api/gl/learning-links/settings') return { gating };
      return { policy: null, effective: {} };
    });
  });

  function puts() {
    return apiGlMock.mock.calls.filter(([, method]) => method === 'PUT').map(([, , body]) => body);
  }

  test('le champ libre suit la valeur choisie dans la liste', async () => {
    render(<GLGatingSettings />);
    const free = await screen.findByLabelText('Délai en heures (valeur libre)');
    expect(free).toHaveValue(6);
    fireEvent.change(
      screen.getAllByLabelText(/Délai avant nouvelle tentative après une erreur/)[0],
      {
        target: { value: '24' },
      },
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Délai en heures (valeur libre)')).toHaveValue(24),
    );
    // Passage dans le champ sans rien taper : l'ancienne valeur affichée (6) ne doit pas
    // revenir écraser le choix de la liste (24).
    const after = screen.getByLabelText('Délai en heures (valeur libre)');
    fireEvent.focus(after);
    fireEvent.blur(after);
    expect(puts()).toEqual([{ key: 'gating.retry_cooldown_hours', value: 24 }]);
  });

  test('un champ libre vidé puis quitté n’enregistre pas 0 heure', async () => {
    render(<GLGatingSettings />);
    const free = await screen.findByLabelText('Délai en heures (valeur libre)');
    fireEvent.change(free, { target: { value: '' } });
    fireEvent.blur(free);
    expect(puts()).toEqual([]);
    const wrong = screen.getAllByLabelText('Erreurs tolérées avant blocage')[0];
    fireEvent.change(wrong, { target: { value: '' } });
    fireEvent.blur(wrong);
    expect(puts()).toEqual([]);
  });

  test('une valeur libre saisie part bien', async () => {
    render(<GLGatingSettings />);
    const free = await screen.findByLabelText('Délai en heures (valeur libre)');
    fireEvent.change(free, { target: { value: '30' } });
    fireEvent.blur(free);
    await waitFor(() =>
      expect(puts()).toEqual([{ key: 'gating.retry_cooldown_hours', value: 30 }]),
    );
  });
});
