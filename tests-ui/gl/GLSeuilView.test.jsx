import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiGL = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: (...args) => apiGL(...args) }));

import { GLSeuilView, buildSeuilSuggestions } from '../../src/gl/components/GLSeuilView.jsx';
import { GL_MODULE_DEFAULTS } from '../../src/gl/constants/modules.js';

const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((k) => [k, true]));

function makeView(overrides = {}) {
  return {
    points: 7,
    level: 2,
    stage: { name: 'Pousse', emoji: '🌱' },
    affinity: { key: 'proche', label: 'Regard du proche', emoji: '🍄' },
    levelStart: 5,
    nextLevelAt: 15,
    pointsToNextLevel: 8,
    regards: {
      proche: { points: 6, sources: [{ key: 'species', label: 'Espèces étudiées', count: 6 }] },
      loin: {
        points: 1,
        sources: [{ key: 'feuillets_found', label: 'Feuillets trouvés', count: 1 }],
      },
    },
    grimoire: [
      {
        code: 'seconde_chance',
        name: 'Seconde chance',
        emoji: '🔁',
        regard: 'proche',
        levelRequired: 2,
        description: 'Lève le délai.',
        unlocked: true,
        charged: true,
        usesCount: 0,
        pointsToRecharge: 0,
      },
      {
        code: 'memoire',
        name: 'Mémoire',
        emoji: '🪶',
        regard: 'loin',
        levelRequired: 3,
        description: 'Rend lisible un feuillet.',
        unlocked: false,
        charged: false,
        usesCount: 0,
        pointsToRecharge: 0,
      },
    ],
    expedition: {
      gameId: 1,
      gameStatus: 'paused',
      chapterTitle: 'Tropiques',
      teamId: 3,
      teamName: 'Les Ronces',
      teamType: 'unicorn',
      mascotId: null,
      teammates: ['Lina', 'Sam'],
    },
    traversees: [
      {
        gameId: 9,
        gameName: 'Partie passée',
        chapterTitle: 'Déserts chauds',
        endedAt: '2026-09-20T10:00:00Z',
        teamName: 'Les Anciens',
        teamType: 'gnome',
        mascotId: null,
        teammates: ['Noé'],
      },
    ],
    gestures: [
      {
        code: 'salut',
        name: 'Saluer',
        emoji: '👋',
        levelRequired: 2,
        unlocked: true,
        bubble: { gnome: 'Bonjour, voyageur !', unicorn: 'Salut à toi, voyageur !' },
      },
      { code: 'danse', name: 'Danser', emoji: '🎶', levelRequired: 6, unlocked: false, bubble: {} },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  apiGL.mockReset();
  localStorage.clear();
});

describe('GLSeuilView', () => {
  test('affiche les deux faces : niveau à deux regards et expédition', async () => {
    apiGL.mockResolvedValueOnce(makeView());
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Moi, voyageur' })).toBeInTheDocument();
    expect(screen.getByText('Pousse')).toBeInTheDocument();
    expect(document.querySelector('.gl-seuil-face__affinity')).toHaveTextContent(
      'Regard du proche',
    );
    expect(screen.getByRole('progressbar', { name: /Regard du proche : 6 points/ })).toBeTruthy();
    expect(screen.getByText('Les Ronces')).toBeInTheDocument();
    expect(screen.getByText(/campe entre deux séances/)).toBeInTheDocument();
    expect(screen.getByText('Avec : Lina, Sam')).toBeInTheDocument();
    expect(screen.getByText(/Au niveau 3 : le sortilège/)).toBeInTheDocument();
    expect(screen.getByText('S’ouvre au niveau 3')).toBeInTheDocument();
  });

  test('sans équipe : la face expédition le dit franchement', async () => {
    apiGL.mockResolvedValueOnce(makeView({ expedition: null }));
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    expect(await screen.findByText(/Ton compagnon t’attend/)).toBeInTheDocument();
  });

  test('séance en cours : bouton vers le plateau', async () => {
    const user = userEvent.setup();
    const onNavigateTab = vi.fn();
    apiGL.mockResolvedValueOnce(
      makeView({ expedition: { ...makeView().expedition, gameStatus: 'live' } }),
    );
    render(<GLSeuilView modules={allModules} onNavigateTab={onNavigateTab} />);
    await user.click(await screen.findByRole('button', { name: 'Rejoindre le plateau' }));
    expect(onNavigateTab).toHaveBeenCalledWith('maps');
  });

  test('lancer Seconde chance : choisir la cible puis recharger la vue', async () => {
    const user = userEvent.setup();
    apiGL
      .mockResolvedValueOnce(makeView())
      .mockResolvedValueOnce({
        spell: 'seconde_chance',
        items: [{ target: 'species:fennec', label: 'Fennec' }],
        emptyMessage: '',
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(makeView());
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Lancer' }));
    await user.click(await screen.findByRole('button', { name: 'Fennec' }));
    expect(apiGL).toHaveBeenCalledWith('/api/gl/voyageur/spells/seconde_chance/cast', 'POST', {
      target: 'species:fennec',
    });
    expect(await screen.findByText(/Seconde chance lancé sur « Fennec »/)).toBeInTheDocument();
  });

  test('niveau monté depuis la dernière visite : célébration', async () => {
    localStorage.setItem('gl_voyageur_seen_level', '1');
    apiGL.mockResolvedValueOnce(makeView());
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    expect(await screen.findByText('Niveau 2 atteint !')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('gl_voyageur_seen_level')).toBe('2'));
  });

  test('compte staff (403) : message d’explication, pas d’erreur brute', async () => {
    const err = new Error('Réservé aux joueurs');
    err.status = 403;
    apiGL.mockRejectedValueOnce(err);
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    expect(await screen.findByText(/Le Seuil est l’accueil des joueurs/)).toBeInTheDocument();
  });
});

describe('buildSeuilSuggestions', () => {
  test('pousse d’abord vers le regard le moins exercé, puis le sortilège prêt', () => {
    const out = buildSeuilSuggestions(makeView(), allModules);
    expect(out.map((s) => s.id)).toEqual(['carnet', 'species', 'spell']);
  });

  test('ne propose jamais un onglet dont le module est éteint', () => {
    const modules = { ...allModules, loreCarnetEnabled: false, playerJournalEnabled: false };
    const out = buildSeuilSuggestions(makeView(), modules);
    expect(out.map((s) => s.id)).toEqual(['lore', 'species', 'spell']);
  });
});

describe('GLSeuilView — suite S2/S3/S6', () => {
  test('Mes traversées : les expéditions passées avec leurs compagnons', async () => {
    apiGL.mockResolvedValueOnce(makeView());
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Mes traversées' })).toBeInTheDocument();
    expect(screen.getByText('Les Anciens')).toBeInTheDocument();
    expect(screen.getByText('Avec : Noé')).toBeInTheDocument();
  });

  test('Mes traversées vides : message d’attente', async () => {
    apiGL.mockResolvedValueOnce(makeView({ traversees: [] }));
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    expect(await screen.findByText(/Tes expéditions terminées viendront/)).toBeInTheDocument();
  });

  test('geste débloqué : la mascotte de l’équipe parle ; geste verrouillé : niveau requis', async () => {
    const user = userEvent.setup();
    apiGL.mockResolvedValueOnce(makeView());
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Saluer/ }));
    // Équipe licorne (expédition de makeView) : la bulle du peuple licorne.
    expect(screen.getByText('Salut à toi, voyageur !')).toBeInTheDocument();
    expect(screen.getByText(/Danser · niveau 6/)).toBeInTheDocument();
  });

  test('Loupe dans le grimoire : pas de bouton Lancer, elle se lance pendant une question', async () => {
    const view = makeView();
    view.grimoire.push({
      code: 'loupe',
      name: 'Loupe',
      emoji: '🔍',
      regard: 'proche',
      levelRequired: 2,
      targetKind: 'qcm',
      description: 'Écarte une mauvaise réponse.',
      unlocked: true,
      charged: true,
      usesCount: 0,
      pointsToRecharge: 0,
    });
    apiGL.mockResolvedValueOnce(view);
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    expect(await screen.findByText('Prêt — se lance pendant une question')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Lancer' })).toHaveLength(1);
  });
});

describe('GLSeuilView — sons du voyageur', () => {
  test('bouton Sons : coupe puis réactive, mémorisé pour l’élève', async () => {
    const user = userEvent.setup();
    apiGL.mockResolvedValueOnce(makeView());
    render(<GLSeuilView modules={allModules} onNavigateTab={() => {}} />);
    const btn = await screen.findByRole('button', { name: /Sons activés/ });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await user.click(btn);
    expect(screen.getByRole('button', { name: /Sons coupés/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(localStorage.getItem('gl_voyageur_sfx_muted')).toBe('1');
  });

  test('module des sons éteint par l’admin : pas de bouton', async () => {
    apiGL.mockResolvedValueOnce(makeView());
    render(
      <GLSeuilView
        modules={{ ...allModules, voyageurSoundsEnabled: false }}
        onNavigateTab={() => {}}
      />,
    );
    await screen.findByRole('heading', { name: 'Moi, voyageur' });
    expect(screen.queryByRole('button', { name: /Sons/ })).toBeNull();
  });
});
