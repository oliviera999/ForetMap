import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLLearningLinksPanel } from '../../src/gl/components/admin/GLLearningLinksPanel.jsx';

/**
 * Audit des bugs G&L du 19/11/2026, E3. L'éditeur de politique RÉEL (pas de bouchon) est monté,
 * et la réponse de `GET /learning-links/policy` arrive après la saisie de la référence.
 */

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const SETTINGS = {
  gating: {
    enabled: true,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
    retryCooldownHours: 6,
  },
  resource_types: ['species', 'glossary', 'tutorial'],
  keys: [],
};

const STORED_POLICY = {
  policy: { mode: 'threshold', required_correct: 2 },
  effective: { mode: 'threshold', requiredCorrect: 2 },
  effectiveSources: {},
};

function policyPuts() {
  return apiGlMock.mock.calls.filter(
    ([path, method]) => path === '/api/gl/learning-links/policy' && method === 'PUT',
  );
}

describe('GLLearningLinksPanel — politique par ressource (audit 19/11, E3)', () => {
  let pendingPolicyGets;

  beforeEach(() => {
    apiGlMock.mockReset();
    pendingPolicyGets = [];
    apiGlMock.mockImplementation((path, method) => {
      if (path === '/api/gl/learning-links/settings') return Promise.resolve(SETTINGS);
      if (path === '/api/gl/learning-links/policy' && method === 'PUT') {
        return Promise.resolve({ success: true });
      }
      if (String(path).startsWith('/api/gl/learning-links/policy')) {
        return new Promise((resolve) => {
          pendingPolicyGets.push({ path, resolve });
        });
      }
      if (String(path).startsWith('/api/gl/learning-links')) return Promise.resolve({ links: [] });
      return Promise.reject(new Error(`appel inattendu: ${path}`));
    });
  });

  async function typeReference(text) {
    const input = screen.getByPlaceholderText('code ressource…');
    for (let i = 1; i <= text.length; i += 1) {
      fireEvent.change(input, { target: { value: text.slice(0, i) } });

      await act(async () => {});
    }
  }

  test('tant que la politique n’est pas chargée, rien ne peut être enregistré', async () => {
    render(<GLLearningLinksPanel />);
    await waitFor(() => expect(screen.getByPlaceholderText('code ressource…')).toBeTruthy());
    await typeReference('ESP001');
    // Aucune réponse encore : pas de formulaire « Hériter » prêt à écraser la base.
    expect(screen.queryByRole('button', { name: /Enregistrer la politique/i })).toBeNull();
    expect(policyPuts()).toEqual([]);
  });

  test('la politique en base est affichée, et « Enregistrer » ne la remplace pas par « Hériter »', async () => {
    render(<GLLearningLinksPanel />);
    await waitFor(() => expect(screen.getByPlaceholderText('code ressource…')).toBeTruthy());
    await typeReference('ESP001');
    const last = pendingPolicyGets.find(({ path }) => path.includes('resourceRef=ESP001'));
    expect(last).toBeTruthy();
    await act(async () => {
      last.resolve(STORED_POLICY);
    });
    const save = await screen.findByRole('button', { name: /Enregistrer la politique/i });
    expect(screen.getByLabelText(/^Mode$/i)).toHaveValue('threshold');
    fireEvent.click(save);
    await waitFor(() => expect(policyPuts().length).toBe(1));
    expect(policyPuts()[0][2]).toMatchObject({
      resource_type: 'species',
      resource_ref: 'ESP001',
      mode: 'threshold',
      required_correct: 2,
    });
  });

  test('la réponse tardive d’une référence partielle ne s’affiche pas sous la référence complète', async () => {
    render(<GLLearningLinksPanel />);
    await waitFor(() => expect(screen.getByPlaceholderText('code ressource…')).toBeTruthy());
    await typeReference('ESP001');
    const partial = pendingPolicyGets.find(({ path }) => path.endsWith('resourceRef=ESP00'));
    expect(partial).toBeTruthy();
    // La politique d'« ESP00 » (une autre ressource) arrive après la fin de la saisie.
    await act(async () => {
      partial.resolve({ policy: { mode: 'all', required_correct: 1 }, effective: {} });
    });
    expect(screen.queryByRole('button', { name: /Enregistrer la politique/i })).toBeNull();
  });
});
