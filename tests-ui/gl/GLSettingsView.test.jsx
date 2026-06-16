import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GLSettingsView } from '../../src/gl/components/GLSettingsView.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const baseSettings = {
  'platform.title': 'Gnomes & Licornes',
  'platform.subtitle': '',
  'platform.brand': {},
  'gameplay.turns_enabled': false,
  'gameplay.narration_enabled': false,
  'gameplay.player_actions_enabled': false,
  'gameplay.scoring_enabled': false,
  'gameplay.qcm_mj_only': false,
  'gameplay.spell_cast_mj_only': false,
  'gameplay.default_health_points': 3,
  'gameplay.default_power_points': 3,
  'gameplay.marker_question_retrigger': 'every_arrival',
  'gameplay.zone_content_retrigger': 'once_per_game',
};

describe('GLSettingsView', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    apiGlMock.mockImplementation((path) => {
      if (path === '/api/gl/admin/settings') {
        return Promise.resolve({ settings: { ...baseSettings } });
      }
      if (String(path).startsWith('/api/gl/admin/settings/')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve(null);
    });
  });

  test('affiche les profils de séance', async () => {
    render(<GLSettingsView />);
    await waitFor(() => expect(screen.getByText('Profils de séance')).toBeTruthy());
    expect(screen.getByText('MJ + tours')).toBeTruthy();
    expect(screen.getByText('Complet libre')).toBeTruthy();
  });

  test('appliquer le profil MJ + tours envoie les PUT gameplay attendus', async () => {
    render(<GLSettingsView />);
    await waitFor(() => expect(screen.getByText('MJ + tours')).toBeTruthy());

    const applyButtons = screen.getAllByRole('button', { name: 'Appliquer' });
    const mjTurnsButton = applyButtons.find((btn) => {
      const card = btn.closest('.gl-gameplay-preset-card');
      return card?.textContent?.includes('MJ + tours');
    });
    expect(mjTurnsButton).toBeTruthy();
    fireEvent.click(mjTurnsButton);

    await waitFor(() => {
      const puts = apiGlMock.mock.calls.filter(
        ([path, method]) =>
          method === 'PUT' && String(path).includes('/api/gl/admin/settings/gameplay.'),
      );
      const keys = puts.map(([path]) => path.split('/').pop());
      expect(keys).toContain('gameplay.turns_enabled');
      expect(keys).toContain('gameplay.narration_enabled');
      expect(keys).toContain('gameplay.player_actions_enabled');
      expect(keys).toContain('gameplay.qcm_mj_only');
      expect(keys).toContain('gameplay.spell_cast_mj_only');
    });
  });
});
