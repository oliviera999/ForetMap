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
    expect(screen.getByLabelText('Mode par défaut')).toHaveValue('any');
    // Libellé « (site) » depuis la cascade de politiques (type / chapitre / scope).
    expect(screen.getByLabelText('Granularité du suivi (site)')).toHaveValue('player');
    // « Marquer automatiquement » a été retiré : le réglage est déprécié et ignoré par le
    // runtime, l'afficher revenait à promettre un effet inexistant (audit F1, 2026-08).
    expect(screen.queryByRole('checkbox', { name: /Marquer automatiquement/ })).toBeNull();
  });

  test('la granularité « par ressource » d’une base ancienne reste affichée', async () => {
    apiGlMock.mockResolvedValue({ gating: { ...GATING, granularity: 'per_resource' } });
    render(<GLGatingSettings />);
    await waitFor(() => {
      expect(screen.getByLabelText('Granularité du suivi (site)')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Granularité du suivi (site)')).toHaveValue('per_resource');
    expect(screen.getByRole('option', { name: /ancien réglage/ })).toBeInTheDocument();
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

// D2 (docs/AUDIT_VALIDATION_QUIZ_2026-09.md) : la politique par type chargée APRÈS le montage
// s'affiche dans l'éditeur (remonté par clé), et « Enregistrer » envoie ce qu'on voit.
describe('GLGatingSettings — préréglage par type chargé après montage', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('la politique chargée s’affiche et « Enregistrer » l’envoie', async () => {
    const puts = [];
    apiGlMock.mockImplementation(async (path, method = 'GET', body) => {
      if (method === 'PUT' && path === '/api/gl/learning-links/type-policy') {
        puts.push(body);
        return { success: true };
      }
      if (path.startsWith('/api/gl/learning-links/type-policy?resourceType=feuillet')) {
        // Réponse volontairement retardée : le composant est déjà monté quand elle arrive.
        await new Promise((r) => setTimeout(r, 30));
        return {
          policy: { mode: 'all', allowed_wrong_attempts: 2, lock_mode: 'strict' },
          effective: { mode: 'all', lockMode: 'strict' },
          site: GATING,
        };
      }
      if (path.startsWith('/api/gl/learning-links/type-policy')) {
        return { policy: null, effective: { mode: 'any' }, site: GATING };
      }
      return { gating: GATING };
    });
    render(<GLGatingSettings />);
    await waitFor(() => {
      expect(screen.getAllByLabelText('Mode').some((el) => el.value === 'all')).toBe(true);
    });
    const feuilletMode = screen.getAllByLabelText('Mode').find((el) => el.value === 'all');
    const editor = feuilletMode.closest('.gating-policy-editor');
    expect(editor.querySelector('select[value], select')).toBeTruthy();
    const severity = Array.from(editor.querySelectorAll('select')).find(
      (sel) => sel.value === 'strict',
    );
    expect(severity, 'la sévérité chargée est affichée').toBeTruthy();

    fireEvent.click(
      Array.from(editor.querySelectorAll('button')).find((b) =>
        /Enregistrer la politique/.test(b.textContent),
      ),
    );
    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0]).toMatchObject({ resource_type: 'feuillet', mode: 'all', lock_mode: 'strict' });
  });
});
