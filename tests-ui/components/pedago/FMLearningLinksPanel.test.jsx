import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.fn();

vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
}));

import { FMLearningLinksPanel } from '../../../src/components/pedago/admin/FMLearningLinksPanel.jsx';

const RESOURCES = {
  resource_type: 'tutorial',
  resources: [
    {
      ref: '1',
      label: 'Le compostage',
      is_active: true,
      links_count: 1,
      gating_count: 1,
      suggested_count: 0,
    },
    {
      ref: '2',
      label: 'Arroser au jardin',
      is_active: true,
      links_count: 0,
      gating_count: 0,
      suggested_count: 0,
    },
  ],
};

const LINKS = {
  links: [
    {
      id: 10,
      resource_type: 'tutorial',
      resource_ref: '1',
      question_code: 'QF0001',
      is_gating: 1,
      status: 'approved',
      origin: 'manual',
      confidence: null,
      note: null,
    },
  ],
};

const QUESTIONS = {
  items: [
    { question_code: 'QF0001', question: 'Que met-on dans le compost ?' },
    { question_code: 'QF0002', question: 'Quand faut-il arroser ?' },
  ],
};

/** Route le mock api selon le chemin ; `overrides` remplace une réponse ponctuelle. */
function installApi(overrides = {}) {
  apiMock.mockImplementation((path, method = 'GET', body) => {
    if (overrides.handler) {
      const custom = overrides.handler(path, method, body);
      if (custom !== undefined) return Promise.resolve(custom);
    }
    if (path.startsWith('/api/learning-links/config')) {
      return Promise.resolve({ gating: overrides.gating ?? { enabled: true, defaultMode: 'any' } });
    }
    if (path.startsWith('/api/learning-links/resources')) return Promise.resolve(RESOURCES);
    if (path.startsWith('/api/learning-links/policy')) {
      return Promise.resolve({ policy: null, effective: { mode: 'any', requiredCorrect: 1 } });
    }
    if (path.startsWith('/api/learning-links/suggest')) {
      return Promise.resolve(overrides.suggest ?? { candidates: [], stats: {}, inserted: 0 });
    }
    if (path.startsWith('/api/learning-links')) return Promise.resolve(LINKS);
    if (path.startsWith('/api/quiz/admin/questions')) return Promise.resolve(QUESTIONS);
    return Promise.resolve({});
  });
}

describe('FMLearningLinksPanel', () => {
  beforeEach(() => {
    apiMock.mockReset();
    installApi();
  });

  test('liste les tutoriels et sélectionne le premier', async () => {
    render(<FMLearningLinksPanel />);
    expect(await screen.findByRole('button', { name: /Le compostage/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arroser au jardin/ })).toBeInTheDocument();
    // Le premier tutoriel est ouvert d'emblée : sa question rattachée s'affiche.
    expect(await screen.findByText('QF0001')).toBeInTheDocument();
  });

  test('affiche le texte de la question rattachée, pas seulement son code', async () => {
    render(<FMLearningLinksPanel />);
    expect(await screen.findByText('Que met-on dans le compost ?')).toBeInTheDocument();
  });

  test('avertit quand le contrôle de compréhension est éteint sur le site', async () => {
    installApi({ gating: { enabled: false, defaultMode: 'any' } });
    render(<FMLearningLinksPanel />);
    expect(await screen.findByText(/désactivé sur le site/i)).toBeInTheDocument();
  });

  test('aucun avertissement quand le contrôle est actif', async () => {
    render(<FMLearningLinksPanel />);
    await screen.findByRole('button', { name: /Le compostage/ });
    expect(screen.queryByText(/désactivé sur le site/i)).not.toBeInTheDocument();
  });

  test('ne propose pas au rattachement une question déjà liée', async () => {
    render(<FMLearningLinksPanel />);
    const picker = await screen.findByLabelText('Question à rattacher');
    // Le `<select>` existe dès que le tutoriel est sélectionné, mais le filtrage dépend d'un
    // **second** appel (`/api/learning-links`) : entre les deux, aucune question n'est encore
    // connue comme liée et QF0001 figure toujours dans la liste. Lire les options tout de suite
    // observait donc un état transitoire — vert sur une machine rapide, rouge sur un runner
    // chargé. On attend l'état que le test décrit.
    await waitFor(() => {
      const values = [...picker.querySelectorAll('option')].map((o) => o.value);
      // Les deux assertions dans la même attente : sans la première, un `<select>` vide
      // satisferait la seconde et le test passerait pour la mauvaise raison.
      expect(values).toContain('QF0002');
      expect(values).not.toContain('QF0001');
    });
  });

  test('rattache une question via POST puis recharge la liste', async () => {
    render(<FMLearningLinksPanel />);
    const picker = await screen.findByLabelText('Question à rattacher');
    fireEvent.change(picker, { target: { value: 'QF0002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher' }));
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        '/api/learning-links',
        'POST',
        expect.objectContaining({
          resource_type: 'tutorial',
          resource_ref: '1',
          question_code: 'QF0002',
          is_gating: true,
        }),
      );
    });
  });

  test('l’appariement automatique simule d’abord, sans rien écrire', async () => {
    installApi({
      suggest: {
        candidates: [
          {
            resource_ref: '1',
            resource_label: 'Le compostage',
            question_code: 'QF0002',
            confidence: 0.82,
            reason: 'contenu: compost, azot',
          },
        ],
        stats: { editorial_candidates: 0, textual_candidates: 1 },
        inserted: 0,
      },
    });
    render(<FMLearningLinksPanel />);
    await screen.findByRole('button', { name: /Le compostage/ });
    fireEvent.click(screen.getByRole('button', { name: /Proposer des rattachements/i }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        '/api/learning-links/suggest',
        'POST',
        expect.objectContaining({ apply: false }),
      );
    });
    expect(await screen.findByText(/82 %/)).toBeInTheDocument();
    // Le message est fragmenté par les interpolations JSX : matcher sur le
    // contenu du paragraphe, pas sur un nœud texte isolé.
    expect(
      screen.getByText(
        (_content, el) =>
          el?.tagName === 'P' && /Rien n.est encore enregistr/i.test(el.textContent || ''),
      ),
    ).toBeInTheDocument();
  });

  test('les propositions ne sont écrites qu’après confirmation explicite', async () => {
    installApi({
      suggest: {
        candidates: [
          {
            resource_ref: '1',
            resource_label: 'Le compostage',
            question_code: 'QF0002',
            confidence: 0.82,
            reason: 'contenu: compost',
          },
        ],
        stats: { editorial_candidates: 0, textual_candidates: 1 },
        inserted: 1,
      },
    });
    render(<FMLearningLinksPanel />);
    await screen.findByRole('button', { name: /Le compostage/ });
    fireEvent.click(screen.getByRole('button', { name: /Proposer des rattachements/i }));
    const confirm = await screen.findByRole('button', { name: /Enregistrer ces propositions/i });

    const applyCallsBefore = apiMock.mock.calls.filter(
      (c) => c[0] === '/api/learning-links/suggest' && c[2]?.apply === true,
    );
    expect(applyCallsBefore).toHaveLength(0);

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        '/api/learning-links/suggest',
        'POST',
        expect.objectContaining({ apply: true }),
      );
    });
  });

  test('bascule le caractère bloquant d’un rattachement', async () => {
    render(<FMLearningLinksPanel />);
    const toggle = await screen.findByLabelText('Bloquante pour QF0001');
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith('/api/learning-links/10', 'PATCH', {
        is_gating: false,
      });
    });
  });

  test('retire un rattachement', async () => {
    render(<FMLearningLinksPanel />);
    await screen.findByText('QF0001');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith('/api/learning-links/10', 'DELETE');
    });
  });

  test('une erreur de chargement est affichée, pas avalée', async () => {
    apiMock.mockImplementation((path) => {
      if (path.startsWith('/api/learning-links/resources')) {
        return Promise.reject(new Error('Permission insuffisante'));
      }
      return Promise.resolve({});
    });
    render(<FMLearningLinksPanel />);
    expect(await screen.findByText('Permission insuffisante')).toBeInTheDocument();
  });
});
