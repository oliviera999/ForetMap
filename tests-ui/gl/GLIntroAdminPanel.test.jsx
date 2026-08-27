import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLIntroAdminPanel } from '../../src/gl/components/admin/GLIntroAdminPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  clearGlSession: vi.fn(),
}));

const INTRO = {
  enabled: true,
  opening: {
    kicker: 'Avant la traversée',
    titleHtml: '<em>La boîte</em>',
    credit: 'Lycée Lyautey',
    button: 'Ouvrir',
    foot: 'Appuyez sur une touche',
  },
  finale: { button: 'Entrer dans le royaume' },
  audio: { loopKey: 'GL_intro_loop', finalKey: 'GL_intro_final' },
  scenes: [{ id: 's1', voice: 'copiste', text: 'Le copiste referme le registre.' }],
};

beforeEach(() => {
  apiGlMock.mockReset();
});

describe('GLIntroAdminPanel — anti-wipe après un chargement raté', () => {
  test('un GET en échec n’expose aucun formulaire et n’écrit rien', async () => {
    apiGlMock.mockImplementation((url, method) => {
      if (url === '/api/gl/admin/content/intro' && !method) {
        return Promise.reject(new Error('Chargement de l’intro impossible'));
      }
      return Promise.reject(new Error(`Appel inattendu: ${method || 'GET'} ${url}`));
    });

    render(<GLIntroAdminPanel />);

    expect(await screen.findByText(/Chargement de l’intro impossible/)).toBeTruthy();
    // Sans fiche chargée, l'enregistrement automatique écrirait un brouillon vide
    // (scenes: [], textes vides) par-dessus l'intro en base.
    expect(screen.queryByText("Écran d'ouverture")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aperçu' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(apiGlMock.mock.calls.some(([, method]) => method === 'PUT')).toBe(false);
  });

  test('« Réessayer » recharge et rouvre le formulaire', async () => {
    let attempt = 0;
    apiGlMock.mockImplementation((url, method) => {
      if (url === '/api/gl/admin/content/intro' && !method) {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error('Réseau indisponible'))
          : Promise.resolve(INTRO);
      }
      return Promise.reject(new Error(`Appel inattendu: ${method || 'GET'} ${url}`));
    });

    render(<GLIntroAdminPanel />);
    expect(await screen.findByText(/Réseau indisponible/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Avant la traversée')).toBeTruthy();
    });
    expect(apiGlMock.mock.calls.some(([, method]) => method === 'PUT')).toBe(false);
  });

  test('après un chargement réussi, le formulaire porte bien les valeurs chargées', async () => {
    apiGlMock.mockImplementation((url, method) => {
      if (url === '/api/gl/admin/content/intro' && !method) return Promise.resolve(INTRO);
      return Promise.reject(new Error(`Appel inattendu: ${method || 'GET'} ${url}`));
    });

    render(<GLIntroAdminPanel />);

    expect(await screen.findByDisplayValue('Avant la traversée')).toBeTruthy();
    expect(screen.getByDisplayValue('Entrer dans le royaume')).toBeTruthy();
  });
});
