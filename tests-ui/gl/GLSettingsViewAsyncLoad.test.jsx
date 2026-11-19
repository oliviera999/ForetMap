import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GLSettingsView } from '../../src/gl/components/GLSettingsView.jsx';

/**
 * Audit des bugs G&L du 19/11/2026, lot 3 (E1, E5, E12).
 * Le composant RÉEL est monté et la réponse du chargement arrive APRÈS le premier rendu :
 * c'est exactement ce que `GLTenirSettings.test.jsx` (réglages déjà chargés) ne voyait pas.
 */

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const SETTINGS = {
  'platform.title': 'Gnomes & Licornes',
  'platform.subtitle': 'Sous-titre en base',
  'platform.brand': {},
  'gameplay.default_health_points': 3,
  'gameplay.default_power_points': 4,
  'gameplay.tenir_des_count': 2,
  'gameplay.tenir_fouilles_par_tour': 3,
  'gameplay.tenir_zones_par_plateau': { 1: 3, 2: 4, 3: 5, 4: 6 },
  'gameplay.tenir_fouille_seuils': '{"chaud":0.15,"tiede":0.35}',
};

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function putCalls() {
  return apiGlMock.mock.calls.filter(([, method]) => method === 'PUT');
}

function mockApi({ settings = SETTINGS, firstLoad = null, onPut = null } = {}) {
  let current = { ...settings };
  let loads = 0;
  apiGlMock.mockImplementation((path, method, body) => {
    if (path === '/api/gl/admin/settings') {
      loads += 1;
      if (loads === 1 && firstLoad) return firstLoad.promise.then(() => ({ settings: current }));
      return Promise.resolve({ settings: { ...current } });
    }
    if (method === 'PUT' && String(path).startsWith('/api/gl/admin/settings/')) {
      const key = String(path).split('/').pop();
      const apply = () => {
        current = { ...current, [key]: body.value };
        return { ok: true };
      };
      if (onPut) return onPut(key, body).then(apply);
      return Promise.resolve(apply());
    }
    return Promise.resolve(null);
  });
}

describe('GLSettingsView — chargement asynchrone (audit 19/11, lot 3)', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('E1 — les nombres « Tenir à deux » affichent la valeur chargée, pas leur minimum', async () => {
    const firstLoad = deferred();
    mockApi({ firstLoad });
    render(<GLSettingsView />);
    // Le bloc est monté avant la réponse : rien n'est encore connu.
    expect(screen.getByTestId('gl-tenir-settings')).toBeInTheDocument();
    await act(async () => {
      firstLoad.resolve();
    });
    await waitFor(() => expect(screen.getByLabelText('Dés du geste Lancer')).toHaveValue(2));
    expect(screen.getByLabelText('Fouilles par équipe et par tour')).toHaveValue(3);
    const zones = screen.getByRole('group', { name: 'Zones de chasse par plateau' });
    expect(within(zones).getByLabelText('Plateau 1')).toHaveValue(3);
    expect(within(zones).getByLabelText('Plateau 4')).toHaveValue(6);
    const seuils = screen.getByRole('group', { name: /Seuils des verdicts/ });
    expect(within(seuils).getByLabelText('Chaud (≤)')).toHaveValue(0.15);
  });

  test('E1 — un clic puis Tab, sans rien taper, n’écrit rien', async () => {
    const firstLoad = deferred();
    mockApi({ firstLoad });
    render(<GLSettingsView />);
    await act(async () => {
      firstLoad.resolve();
    });
    await waitFor(() => expect(screen.getByLabelText('Dés du geste Lancer')).toHaveValue(2));
    const des = screen.getByLabelText('Dés du geste Lancer');
    fireEvent.focus(des);
    fireEvent.blur(des);
    const zones = screen.getByRole('group', { name: 'Zones de chasse par plateau' });
    const plateau1 = within(zones).getByLabelText('Plateau 1');
    fireEvent.focus(plateau1);
    fireEvent.blur(plateau1);
    await act(async () => {});
    expect(putCalls()).toEqual([]);
  });

  test('E1 — un champ par plateau vide n’envoie pas 0 à la place', async () => {
    // Réglage absent de la base : tous les champs du groupe sont vides.
    const settings = { ...SETTINGS };
    delete settings['gameplay.tenir_zones_par_plateau'];
    mockApi({ settings });
    render(<GLSettingsView />);
    await waitFor(() => expect(screen.getByLabelText('Dés du geste Lancer')).toHaveValue(2));
    const zones = screen.getByRole('group', { name: 'Zones de chasse par plateau' });
    const plateau1 = within(zones).getByLabelText('Plateau 1');
    expect(plateau1).toHaveValue(null);
    fireEvent.focus(plateau1);
    fireEvent.blur(plateau1);
    await act(async () => {});
    expect(putCalls()).toEqual([]);
  });

  test('E1 — un nombre vidé puis quitté n’envoie pas 0', async () => {
    mockApi();
    render(<GLSettingsView />);
    await waitFor(() =>
      expect(screen.getByLabelText('Fouilles par équipe et par tour')).toHaveValue(3),
    );
    const fouilles = screen.getByLabelText('Fouilles par équipe et par tour');
    fireEvent.change(fouilles, { target: { value: '' } });
    fireEvent.blur(fouilles);
    await act(async () => {});
    expect(putCalls()).toEqual([]);
  });

  test('E1 — une vraie saisie part toujours, avec la valeur tapée', async () => {
    mockApi();
    render(<GLSettingsView />);
    await waitFor(() => expect(screen.getByLabelText('Dés du geste Lancer')).toHaveValue(2));
    const des = screen.getByLabelText('Dés du geste Lancer');
    fireEvent.change(des, { target: { value: '3' } });
    fireEvent.blur(des);
    await waitFor(() =>
      expect(putCalls()).toEqual([
        ['/api/gl/admin/settings/gameplay.tenir_des_count', 'PUT', { value: 3 }],
      ]),
    );
    await waitFor(() => expect(screen.getByLabelText('Dés du geste Lancer')).toHaveValue(3));
  });

  test('E12 — PV / PP initiaux : un champ vidé n’enregistre pas 0', async () => {
    mockApi();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<GLSettingsView />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByLabelText('PV initiaux (❤️)')).toHaveValue(3);
      fireEvent.change(screen.getByLabelText('PV initiaux (❤️)'), { target: { value: '' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(putCalls()).toEqual([]);
      // La saisie d'une vraie valeur repart normalement.
      fireEvent.change(screen.getByLabelText('PV initiaux (❤️)'), { target: { value: '5' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(putCalls().map(([path, , body]) => [path.split('/').pop(), body.value])).toEqual([
        ['gameplay.default_health_points', 5],
        ['gameplay.default_power_points', 4],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('E5 — une frappe saisie pendant l’enregistrement du titre n’est pas écrasée', async () => {
    const put = deferred();
    mockApi({ onPut: () => put.promise });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<GLSettingsView />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByLabelText('Sous-titre plateforme')).toHaveValue('Sous-titre en base');
      const title = screen.getByLabelText('Titre plateforme');
      fireEvent.change(title, { target: { value: 'Royaume' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });
      expect(putCalls()[0]).toEqual([
        '/api/gl/admin/settings/platform.title',
        'PUT',
        { value: 'Royaume' },
      ]);
      // Requête en vol : l'admin continue de taper.
      fireEvent.change(title, { target: { value: 'Royaume des gnomes' } });
      await act(async () => {
        put.resolve();
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(screen.getByLabelText('Titre plateforme')).toHaveValue('Royaume des gnomes');
      // … et la suite de la saisie finit bien par partir.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      const titles = putCalls()
        .filter(([path]) => path.endsWith('platform.title'))
        .map(([, , body]) => body.value);
      expect(titles).toEqual(['Royaume', 'Royaume des gnomes']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('E5 — un interrupteur basculé pendant une saisie ne remet pas le titre à sa valeur en base', async () => {
    mockApi();
    render(<GLSettingsView />);
    await waitFor(() =>
      expect(screen.getByLabelText('Sous-titre plateforme')).toHaveValue('Sous-titre en base'),
    );
    fireEvent.change(screen.getByLabelText('Titre plateforme'), { target: { value: 'Royaume' } });
    fireEvent.click(screen.getByLabelText('Le voile'));
    await waitFor(() =>
      expect(putCalls().some(([path]) => path.endsWith('gameplay.tenir_voile'))).toBe(true),
    );
    await act(async () => {});
    expect(screen.getByLabelText('Titre plateforme')).toHaveValue('Royaume');
  });
});
