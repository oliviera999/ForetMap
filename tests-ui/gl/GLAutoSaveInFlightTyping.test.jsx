import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

/**
 * Audit des bugs G&L du 19/11/2026, E5 (signalé → confirmé ici).
 * Scénario commun : l'enregistrement automatique part, la réponse du serveur est RETENUE,
 * l'auteur continue de taper, puis la réponse arrive. La saisie ne doit pas revenir en
 * arrière, et la suite de la frappe doit finir par partir.
 */

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  clearGlSession: vi.fn(),
}));

// Enfants lourds de l'écran des chapitres, sans rapport avec le formulaire testé.
vi.mock('../../src/gl/components/GLChapterMapStudio.jsx', () => ({
  GLChapterMapStudio: () => <div data-testid="stub-map-studio" />,
}));
vi.mock('../../src/gl/components/GLFeuilletZonePlateauPanel.jsx', () => ({
  GLFeuilletZonePlateauPanel: () => <div data-testid="stub-feuillet-zone" />,
}));
vi.mock('../../src/gl/components/admin/GLChapterScenesAdminPanel.jsx', () => ({
  GLChapterScenesAdminPanel: () => <div data-testid="stub-scenes" />,
}));
vi.mock('../../src/gl/components/admin/GLChaptersImportExportPanel.jsx', () => ({
  GLChaptersImportExportPanel: () => <div data-testid="stub-import-export" />,
}));
vi.mock('../../src/components/MediaLibraryMenu.jsx', () => ({
  MediaLibraryMenu: () => <div data-testid="stub-media-library" />,
}));
vi.mock('../../src/gl/components/admin/chapters/GLChapterMapPreview.jsx', () => ({
  GLChapterMapPreview: () => <div data-testid="stub-map-preview" />,
}));

import { GLChaptersAdminView } from '../../src/gl/components/GLChaptersAdminView.jsx';
import { GLContentPage } from '../../src/gl/components/GLContentPage.jsx';
import { GLGlossaryEditorPanel } from '../../src/gl/components/admin/GLGlossaryEditorPanel.jsx';
import { GLSpeciesEditorPanel } from '../../src/gl/components/admin/GLSpeciesEditorPanel.jsx';
import { GLSpellsEditorPanel } from '../../src/gl/components/admin/GLSpellsEditorPanel.jsx';

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function writes() {
  return apiGlMock.mock.calls.filter(([, method]) => method === 'PUT' || method === 'POST');
}

beforeEach(() => {
  apiGlMock.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('E5 — chapitres', () => {
  const chapter = (title) => ({
    chapter: { id: 1, slug: 'chap-un', title, plateau_number: 1, biomes: [], spells: [] },
    markers: [],
  });

  test('une frappe pendant le PUT du chapitre n’est pas écrasée par la réponse', async () => {
    const put = deferred();
    apiGlMock.mockImplementation((path, method, body) => {
      if (path === '/api/gl/chapters') {
        return Promise.resolve([{ id: 1, slug: 'chap-un', title: 'Chapitre Un', biomes: [] }]);
      }
      if (path === '/api/gl/biomes') return Promise.resolve([]);
      if (path === '/api/gl/admin/spells/all') return Promise.resolve({ items: [] });
      if (path === '/api/gl/auth/config') return Promise.resolve({ brand: {}, modules: {} });
      if (path === '/api/gl/chapters/chap-un') return Promise.resolve(chapter('Chapitre Un'));
      if (path === '/api/gl/chapters/admin/1' && method === 'PUT') {
        if (writes().length === 1) return put.promise.then(() => chapter(body.title));
        return Promise.resolve(chapter(body.title));
      }
      return Promise.resolve(null);
    });
    render(<GLChaptersAdminView />);
    await advance(100);
    fireEvent.click(screen.getByRole('button', { name: /Chapitre Un/ }));
    await advance(100);
    const title = screen.getByLabelText('Titre');
    expect(title).toHaveValue('Chapitre Un');

    fireEvent.change(title, { target: { value: 'Chapitre Un b' } });
    // Rien ne part avant la fin du délai : `enabled` valait la CHAÎNE du titre, si bien que
    // chaque frappe relançait l'effet de démontage du hook et envoyait un PUT immédiat.
    await advance(300);
    expect(writes().length).toBe(0);
    await advance(600);
    expect(writes().length).toBe(1);
    expect(writes()[0][2].title).toBe('Chapitre Un b');

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Chapitre Un bis' } });
    await act(async () => {
      put.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByLabelText('Titre')).toHaveValue('Chapitre Un bis');

    await advance(2500);
    expect(
      writes()
        .filter(([path]) => path === '/api/gl/chapters/admin/1')
        .map(([, , body]) => body.title),
    ).toEqual(['Chapitre Un b', 'Chapitre Un bis']);
  });
});

describe('E5 — page de contenu', () => {
  test('une frappe pendant le PUT de la page n’est pas écrasée par la réponse', async () => {
    const put = deferred();
    apiGlMock.mockImplementation((path, method, body) => {
      if (path === '/api/gl/content/world' && method === 'PUT') {
        const answer = { slug: 'world', title: body.title, bodyMarkdown: body.bodyMarkdown };
        if (writes().length === 1) return put.promise.then(() => answer);
        return Promise.resolve(answer);
      }
      if (path === '/api/gl/content/world') {
        return Promise.resolve({ slug: 'world', title: 'Le monde', bodyMarkdown: 'Texte.' });
      }
      return Promise.resolve(null);
    });
    render(
      <GLContentPage
        slug="world"
        fallbackTitle="Le monde"
        auth={{ permissions: ['gl.read', 'gl.content.manage'] }}
        brandSlots={{}}
      />,
    );
    await advance(100);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le contenu' }));
    const title = screen.getByLabelText('Titre');
    fireEvent.change(title, { target: { value: 'Le monde des' } });
    await advance(900);
    expect(writes().length).toBe(1);

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Le monde des gnomes' } });
    await act(async () => {
      put.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByLabelText('Titre')).toHaveValue('Le monde des gnomes');

    await advance(2500);
    expect(writes().map(([, , body]) => body.title)).toEqual([
      'Le monde des',
      'Le monde des gnomes',
    ]);
  });
});

describe('E5 — fiches (glossaire, espèces, sorts)', () => {
  /**
   * @param {object} cfg panneau, bouton « nouveau », champ saisi, routes et forme de l'entité.
   */
  async function scenario({ Panel, newButton, field, base, codeField, entityKey, code, setup }) {
    const post = deferred();
    const nameKey = field.key;
    const entityOf = (body) => ({
      ok: true,
      [entityKey]: { ...body, [codeField]: code, statut: body.statut || 'actif' },
    });
    apiGlMock.mockImplementation((path, method, body) => {
      const preset = setup(path, method);
      if (preset !== undefined) return Promise.resolve(preset);
      if (path === `${base}/next-code`) return Promise.resolve({ [codeField]: code });
      if (path === base && method === 'POST') return post.promise.then(() => entityOf(body));
      if (path === `${base}/${code}` && method === 'PUT') return Promise.resolve(entityOf(body));
      return Promise.resolve({ items: [], total: 0 });
    });
    render(<Panel />);
    // Horloge simulée : on fait avancer le temps à la main plutôt que d'attendre (`waitFor`
    // sonde sur une horloge réelle, instable quand la suite tourne en parallèle).
    await advance(100);
    fireEvent.click(screen.getByRole('button', { name: newButton }));
    await advance(100);
    expect(screen.getByDisplayValue(code)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(field.label), { target: { value: 'Fennec' } });
    await advance(900);
    expect(writes().length).toBe(1);
    expect(writes()[0][2][nameKey]).toBe('Fennec');

    fireEvent.change(screen.getByLabelText(field.label), {
      target: { value: 'Fennec des sables' },
    });
    await act(async () => {
      post.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByLabelText(field.label)).toHaveValue('Fennec des sables');

    await advance(2500);
    expect(writes().map(([path, method, body]) => [path, method, body[nameKey]])).toEqual([
      [base, 'POST', 'Fennec'],
      [`${base}/${code}`, 'PUT', 'Fennec des sables'],
    ]);
  }

  test('glossaire', async () => {
    await scenario({
      Panel: GLGlossaryEditorPanel,
      newButton: '+ Nouveau terme',
      field: { label: 'Terme *', key: 'terme' },
      base: '/api/gl/admin/glossary/terms',
      codeField: 'glossary_code',
      entityKey: 'term',
      code: 'GL9999',
      setup: (path) => {
        if (path === '/api/gl/admin/glossary/meta') {
          return {
            categories: [{ id: 'ecologie', label: 'Écologie' }],
            niveaux: [{ id: 'base', label: 'Base' }],
            biomes: [{ slug: 'sahara', nom: 'Sahara' }],
          };
        }
        return undefined;
      },
    });
  });

  test('espèces', async () => {
    await scenario({
      Panel: GLSpeciesEditorPanel,
      newButton: '+ Nouvelle espèce',
      field: { label: /Nom commun/i, key: 'nom_commun' },
      base: '/api/gl/admin/species',
      codeField: 'species_code',
      entityKey: 'species',
      code: 'SP9999',
      setup: (path) => {
        if (path === '/api/gl/biomes') return [{ slug: 'sahara', nom: 'Sahara' }];
        if (String(path).startsWith('/api/gl/admin/species?')) {
          return { biome: { slug: 'sahara', nom: 'Sahara' }, items: [], total: 0 };
        }
        return undefined;
      },
    });
  });

  test('sorts', async () => {
    await scenario({
      Panel: GLSpellsEditorPanel,
      newButton: '+ Nouveau sort',
      field: { label: 'Nom', key: 'nom' },
      base: '/api/gl/admin/spells',
      codeField: 'spell_code',
      entityKey: 'spell',
      code: 'SL999',
      setup: (path) => {
        if (path === '/api/gl/spell-categories') return [{ slug: 'vie', nom: 'Vie' }];
        if (String(path).includes('/api/gl/admin/spells?')) {
          return { category: { slug: 'vie', nom: 'Vie' }, items: [] };
        }
        return undefined;
      },
    });
  });
});
