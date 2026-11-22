/**
 * Chantier collège, flux C2 — barrière de vocabulaire **douce** côté interface.
 *
 * Le contexte pédagogique est simulé (fiche de coordination, § 2) : la règle
 * `glossary_depth_max` vaut `base` en 6e (cycle 3), `approfondissement` en 3e (cycle 4) et
 * `null` au lycée. La table de visibilité elle-même (C1) n'est pas touchée.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, waitFor, fireEvent, within } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { BiodivPedagoContext } from '../../../src/contexts/BiodivPedagoContext.jsx';
import {
  useGlossaryLinkIndex,
  resetGlossaryLinkIndexCache,
} from '../../../src/hooks/useGlossaryLinkIndex.js';
import { GlossaryView } from '../../../src/components/pedago/GlossaryView.jsx';
import {
  GlossaryPopover,
  clearGlossaryDetailCache,
} from '../../../src/components/pedago/GlossaryPopover.jsx';

const SIXIEME = 'base';
const TROISIEME = 'approfondissement';
const LYCEE = null;

const TERMS = [
  {
    glossary_code: 'FM_POL',
    terme: 'Pollinisateur',
    variantes: 'pollinisateurs',
    niveau: 'base',
    definition_courte: 'Animal qui transporte le pollen.',
  },
  {
    glossary_code: 'FM_VER',
    terme: 'Verger',
    variantes: '',
    niveau: 'base',
    definition_courte: 'Terrain planté d’arbres fruitiers.',
  },
  {
    glossary_code: 'FM_HUM',
    terme: 'Humus',
    variantes: '',
    niveau: 'approfondissement',
    definition_courte: 'Couche sombre du sol.',
  },
  {
    glossary_code: 'FM_BIO',
    terme: 'Biocénose',
    variantes: '',
    niveau: 'avance',
    definition_courte: 'Ensemble des êtres vivants d’un milieu.',
  },
];

const DETAILS = {
  FM_POL: {
    glossary_code: 'FM_POL',
    terme: 'Pollinisateur',
    niveau: 'base',
    definition_courte: 'Animal qui transporte le pollen.',
    definition_complete: 'Le pollinisateur vit près de l’humus et de la biocénose du verger.',
  },
  FM_BIO: {
    glossary_code: 'FM_BIO',
    terme: 'Biocénose',
    niveau: 'avance',
    definition_courte: 'Ensemble des êtres vivants d’un milieu.',
    definition_complete: 'La biocénose et son biotope forment un écosystème.',
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
  if (path.startsWith('/api/curriculum')) return Promise.resolve({ items: [] });
  return Promise.resolve({});
}

function contextFor(depthMax) {
  return {
    level: 'college',
    learner: null,
    teacherPreview: null,
    setTeacherPreview: () => {},
    canTeacherPreview: false,
    fullViewByDefault: false,
    canShow: () => true,
    visibility: () => 'show',
    palierRule: (rule) => (rule === 'glossary_depth_max' ? depthMax : null),
    foodWebTypes: (all) => all,
    curriculumNiveaux: null,
  };
}

function wrapperFor(depthMax) {
  const value = contextFor(depthMax);
  return function Wrapper({ children }) {
    return <BiodivPedagoContext.Provider value={value}>{children}</BiodivPedagoContext.Provider>;
  };
}

function renderWith(depthMax, ui) {
  return render(ui, { wrapper: wrapperFor(depthMax) });
}

beforeEach(() => {
  resetGlossaryLinkIndexCache();
  clearGlossaryDetailCache();
  apiMock.mockReset();
  apiMock.mockImplementation(defaultApi);
});

afterEach(() => {
  resetGlossaryLinkIndexCache();
  clearGlossaryDetailCache();
});

describe('useGlossaryLinkIndex — index filtré par palier', () => {
  test.each([
    ['6e (cycle 3)', SIXIEME, ['FM_POL', 'FM_VER']],
    ['3e (cycle 4)', TROISIEME, ['FM_POL', 'FM_VER', 'FM_HUM']],
    ['lycée', LYCEE, ['FM_POL', 'FM_VER', 'FM_HUM', 'FM_BIO']],
  ])('%s', async (_label, depthMax, expected) => {
    const { result } = renderHook(() => useGlossaryLinkIndex(), {
      wrapper: wrapperFor(depthMax),
    });
    await waitFor(() => expect(result.current.length).toBe(expected.length));
    expect(result.current.map((t) => t.glossary_code)).toEqual(expected);
  });

  test('le cache reste complet : un seul appel quel que soit le palier', async () => {
    const first = renderHook(() => useGlossaryLinkIndex(), { wrapper: wrapperFor(SIXIEME) });
    await waitFor(() => expect(first.result.current).toHaveLength(2));
    const second = renderHook(() => useGlossaryLinkIndex(), { wrapper: wrapperFor(LYCEE) });
    expect(second.result.current).toHaveLength(4);
    expect(apiMock.mock.calls.filter(([p]) => p === '/api/glossary/terms')).toHaveLength(1);
  });

  // Depuis le profil collège de la table (C1), le contexte par défaut (aucun fournisseur)
  // est celui d'un visiteur : collège, cycle 3 — seuls les termes `base` sont liés.
  test('sans fournisseur : profil par défaut (collège, cycle 3), termes de base seulement', async () => {
    const { result } = renderHook(() => useGlossaryLinkIndex());
    await waitFor(() =>
      expect(result.current.map((t) => t.glossary_code)).toEqual(['FM_POL', 'FM_VER']),
    );
  });
});

describe('Auto-liens d’une fiche selon le palier', () => {
  /** Codes auto-liés dans la fiche de « Pollinisateur », une fois liste et index chargés. */
  async function linkedCodesIn(depthMax, expectedCount) {
    const { container, unmount } = renderWith(depthMax, <GlossaryView selectedCode="FM_POL" />);
    const read = () =>
      [...container.querySelectorAll('.pedago-glossary__detail a[data-glossary-code]')]
        .map((a) => a.getAttribute('data-glossary-code'))
        .sort();
    await waitFor(() => {
      expect(container.querySelector('.pedago-term-list')).not.toBeNull();
      expect(read()).toHaveLength(expectedCount);
    });
    const codes = read();
    unmount();
    return codes;
  }

  test('terme « avancé » non lié au collège, lié au lycée', async () => {
    expect(await linkedCodesIn(SIXIEME, 1)).toEqual(['FM_VER']);
    expect(await linkedCodesIn(TROISIEME, 2)).toEqual(['FM_HUM', 'FM_VER']);
    expect(await linkedCodesIn(LYCEE, 3)).toEqual(['FM_BIO', 'FM_HUM', 'FM_VER']);
  });

  test('terme « approfondissement » lié en 3e, pas en 6e', async () => {
    expect(await linkedCodesIn(TROISIEME, 2)).toContain('FM_HUM');
    expect(await linkedCodesIn(SIXIEME, 1)).not.toContain('FM_HUM');
  });
});

describe('GlossaryView — liste par défaut et « Pour aller plus loin »', () => {
  function termButtons(container) {
    return [...container.querySelectorAll('.pedago-term-list .pedago-term-btn strong')].map(
      (n) => n.textContent,
    );
  }

  test('en 6e, la liste ne montre que les termes de base ; le bouton retire le filtre', async () => {
    const { container } = renderWith(SIXIEME, <GlossaryView />);
    await waitFor(() => expect(termButtons(container)).toEqual(['Pollinisateur', 'Verger']));
    expect(screen.getByText('2 termes plus avancés sont rangés à part.')).toBeTruthy();

    const toggle = screen.getByRole('button', { name: 'Pour aller plus loin' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(termButtons(container)).toEqual(['Pollinisateur', 'Verger', 'Humus', 'Biocénose']);

    const back = screen.getByRole('button', { name: 'Revenir aux termes essentiels' });
    expect(back.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(back);
    expect(termButtons(container)).toEqual(['Pollinisateur', 'Verger']);
  });

  test('en 3e, seul le terme avancé est rangé à part', async () => {
    const { container } = renderWith(TROISIEME, <GlossaryView />);
    await waitFor(() =>
      expect(termButtons(container)).toEqual(['Pollinisateur', 'Verger', 'Humus']),
    );
    expect(screen.getByText('1 terme plus avancé est rangé à part.')).toBeTruthy();
  });

  test('au lycée, aucune barrière ni bouton', async () => {
    const { container } = renderWith(LYCEE, <GlossaryView />);
    await waitFor(() => expect(termButtons(container)).toHaveLength(4));
    expect(screen.queryByRole('button', { name: 'Pour aller plus loin' })).toBeNull();
  });

  test('choisir explicitement la profondeur « Avancé » montre ces termes', async () => {
    const { container } = renderWith(SIXIEME, <GlossaryView />);
    await waitFor(() => expect(termButtons(container)).toEqual(['Pollinisateur', 'Verger']));
    fireEvent.change(screen.getByLabelText('Niveau'), { target: { value: 'avance' } });
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/glossary/terms?niveau=avance'));
    await waitFor(() => expect(termButtons(container)).toHaveLength(4));
  });

  test('rien n’est caché définitivement : la fiche d’un terme avancé s’ouvre en 6e', async () => {
    const { container } = renderWith(SIXIEME, <GlossaryView selectedCode="FM_BIO" />);
    await waitFor(() =>
      expect(
        container.querySelector('.pedago-glossary__detail .pedago-panel-title')?.textContent,
      ).toBe('Biocénose'),
    );
    const detail = container.querySelector('.pedago-glossary__detail');
    expect(within(detail).getByText('Pour aller plus loin')).toBeTruthy();
    expect(within(detail).getByText('Avancé')).toBeTruthy();
  });
});

describe('GlossaryPopover — définition courte d’abord au collège', () => {
  function renderPopover(depthMax) {
    return renderWith(depthMax, <GlossaryPopover open glossaryCode="FM_POL" onClose={() => {}} />);
  }

  test('au collège, la définition complète est repliée sous la courte', async () => {
    renderPopover(SIXIEME);
    await screen.findByText('Animal qui transporte le pollen.');
    const summary = screen.getByText('Lire la définition complète');
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('Le pollinisateur vit près');
    fireEvent.click(summary);
    expect(details.open).toBe(true);
  });

  test('au lycée, la définition complète est affichée d’emblée', async () => {
    renderPopover(LYCEE);
    await screen.findByText('Animal qui transporte le pollen.');
    expect(screen.queryByText('Lire la définition complète')).toBeNull();
    expect(document.querySelector('.fm-glossary-popover details')).toBeNull();
  });
});
