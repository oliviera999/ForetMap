import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLGatingSettings } from '../../src/gl/components/settings/GLGatingSettings.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const GATING = {
  enabled: false,
  granularity: 'player',
  autoMarkOnCorrect: true,
  defaultMode: 'any',
  defaultRequiredCorrect: 1,
  retryCooldownDays: 3,
};

describe('GLGatingSettings', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('charge et affiche les réglages gating', async () => {
    apiGlMock.mockResolvedValue({ gating: GATING });
    render(<GLGatingSettings />);
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Activer le conditionnement/ }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('checkbox', { name: /Activer le conditionnement/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Marquer automatiquement/ })).toBeChecked();
  });

  test('active l’interrupteur global via PUT /learning-links/settings', async () => {
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (method === 'PUT') {
        expect(path).toBe('/api/gl/learning-links/settings');
        expect(body).toEqual({ key: 'gating.enabled', value: true });
        return { success: true, gating: { ...GATING, enabled: true } };
      }
      return { gating: GATING };
    });
    render(<GLGatingSettings />);
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Activer le conditionnement/ }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Activer le conditionnement/ }));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Activer le conditionnement/ })).toBeChecked();
    });
  });

  test('change le mode par défaut', async () => {
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (method === 'PUT') {
        expect(body).toEqual({ key: 'gating.default_mode', value: 'all' });
        return { success: true, gating: { ...GATING, defaultMode: 'all' } };
      }
      return { gating: GATING };
    });
    render(<GLGatingSettings />);
    await waitFor(() => {
      expect(screen.getByLabelText('Mode par défaut')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Mode par défaut'), { target: { value: 'all' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Mode par défaut')).toHaveValue('all');
    });
  });

  test('affiche une erreur si le chargement échoue', async () => {
    apiGlMock.mockRejectedValue(new Error('Accès refusé'));
    render(<GLGatingSettings />);
    await waitFor(() => {
      expect(screen.getByText('Accès refusé')).toBeInTheDocument();
    });
  });
});
