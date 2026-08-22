import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../src/services/api', () => ({
  api: (...args) => apiMock(...args),
}));

import {
  useGlossaryLinkIndex,
  resetGlossaryLinkIndexCache,
} from '../src/hooks/useGlossaryLinkIndex.js';
import { GlossaryView } from '../src/components/pedago/GlossaryView.jsx';

const TERMS = [
  { glossary_code: 'FM_ECO', terme: 'Écosystème', variantes: 'écosystèmes' },
  { glossary_code: 'FM_BIO', terme: 'Biocénose', variantes: '' },
];

const DETAILS = {
  FM_ECO: {
    glossary_code: 'FM_ECO',
    terme: 'Écosystème',
    definition_courte: 'Ensemble vivant + milieu.',
    definition_complete: 'Un écosystème réunit un biotope et une biocénose.',
  },
  FM_BIO: {
    glossary_code: 'FM_BIO',
    terme: 'Biocénose',
    definition_complete: 'Ensemble des êtres vivants d’un milieu.',
  },
};

function defaultApi(path) {
  if (path.startsWith('/api/glossary/categories')) return Promise.resolve({ categories: [] });
  if (path.startsWith('/api/glossary/terms/')) {
    const code = decodeURIComponent(path.split('/').pop());
    return DETAILS[code]
      ? Promise.resolve(DETAILS[code])
      : Promise.reject(new Error('Terme introuvable'));
  }
  if (path.startsWith('/api/glossary/terms')) return Promise.resolve({ items: TERMS });
  return Promise.reject(new Error(`Route non mockée : ${path}`));
}

beforeEach(() => {
  resetGlossaryLinkIndexCache();
  apiMock.mockReset();
  apiMock.mockImplementation(defaultApi);
});

afterEach(() => {
  resetGlossaryLinkIndexCache();
});

describe('useGlossaryLinkIndex', () => {
  test('charge l’index une seule fois et le partage entre écrans', async () => {
    const first = renderHook(() => useGlossaryLinkIndex());
    const second = renderHook(() => useGlossaryLinkIndex());
    await waitFor(() => expect(first.result.current).toHaveLength(2));
    await waitFor(() => expect(second.result.current).toHaveLength(2));
    const indexCalls = apiMock.mock.calls.filter(([path]) => path === '/api/glossary/terms');
    expect(indexCalls).toHaveLength(1);

    // Un troisième écran monté plus tard réutilise le cache mémoire.
    const third = renderHook(() => useGlossaryLinkIndex());
    expect(third.result.current).toHaveLength(2);
    expect(apiMock.mock.calls.filter(([path]) => path === '/api/glossary/terms')).toHaveLength(1);
  });

  test('échec silencieux : index vide, aucune exception', async () => {
    apiMock.mockImplementation(() => Promise.reject(new Error('réseau')));
    const { result } = renderHook(() => useGlossaryLinkIndex());
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  test('`enabled: false` n’appelle pas l’API', () => {
    renderHook(() => useGlossaryLinkIndex({ enabled: false }));
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe('GlossaryView — auto-liens dans la fiche', () => {
  test('auto-lie les termes voisins, jamais le terme affiché, et navigue dans la vue', async () => {
    const { container } = render(<GlossaryView selectedCode="FM_ECO" />);

    await waitFor(() =>
      expect(container.querySelector('a[data-glossary-code="FM_BIO"]')).not.toBeNull(),
    );
    // Le terme couramment affiché n'est pas auto-lié vers lui-même.
    expect(container.querySelector('a[data-glossary-code="FM_ECO"]')).toBeNull();

    /*
     * Le clic est rejoué jusqu'à ce qu'il porte. `GlossaryMarkdown` capte les auto-liens
     * par **délégation attachée dans un `useEffect`** : la présence du lien dans le DOM
     * ne garantit pas que l'écouteur le soit déjà. Attendre le nœud puis cliquer une
     * seule fois laisse donc une fenêtre où le clic tombe dans le vide — invisible en
     * local, mais reproduite en CI sous charge (2887 tests en parallèle).
     *
     * Sélectionner le nœud à chaque tentative importe autant : un re-rendu consécutif au
     * chargement de la liste remplace le lien, et un nœud capturé plus tôt serait détaché.
     */
    await waitFor(() => {
      fireEvent.click(container.querySelector('a[data-glossary-code="FM_BIO"]'));
      expect(apiMock).toHaveBeenCalledWith('/api/glossary/terms/FM_BIO');
    });
    await waitFor(() =>
      expect(
        container.querySelector('.pedago-glossary__detail .pedago-panel-title').textContent,
      ).toBe('Biocénose'),
    );
  });
});
