import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  GLVitalityCounts,
  GLVitalityBadge,
  GLVitalityAdjustButtons,
} from '../../src/gl/components/GLVitalityDisplay.jsx';
import { GLGameBoardRoster } from '../../src/gl/components/GLGameBoardRoster.jsx';
import { GLMarketComptoirPanel } from '../../src/gl/components/GLMarketPlacePanels.jsx';
import { GLSeuilGardeRobe } from '../../src/gl/components/GLSeuilGardeRobe.jsx';
import { GLButDeLAnnee } from '../../src/gl/components/tenir/GLButDeLAnnee.jsx';
import { GLTenirEcranEquipe } from '../../src/gl/components/tenir/GLTenirEcranEquipe.jsx';
import { gemmesSeules, gemmesTexte } from '../../src/gl/utils/glMonnaie.js';
import { computePlayerVitality } from '../../src/gl/utils/glGameplayRules.js';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn().mockResolvedValue({ round: null, lignes: [], moments: [], chimeres: [] }),
  getGlToken: () => 'tok',
}));

/**
 * Ensemble unifié, PR 4 — une seule monnaie, les gemmes (M1, M19). Dès qu'une partie joue
 * « Tenir à deux », aucun écran ne montre ni ne nomme de cœurs : bourse, plateau, écran
 * d'équipe, comptoir, garde-robe, but de l'année.
 */
const sansCoeur = (texte) => expect(texte).not.toMatch(/❤|c[œo]eurs?\b|points de vie/i);

describe('une seule monnaie — le drapeau', () => {
  test('`gemmesSeules` : partie « Tenir », ou drapeau du serveur ; faux pour le jeu classique', () => {
    expect(gemmesSeules({ gameState: { tenir: { enabled: true } } })).toBe(true);
    expect(gemmesSeules({ gameplaySettings: { monnaieUnique: true } })).toBe(true);
    expect(gemmesSeules({ gameplaySettings: { monnaieUnique: false }, gameState: {} })).toBe(false);
    expect(gemmesSeules()).toBe(false);
    expect(gemmesTexte(1)).toBe('1 gemme');
    expect(gemmesTexte(3)).toBe('3 gemmes');
    expect(gemmesTexte(0)).toBe('0 gemme');
  });

  test('bourse du joueur : une partie « Tenir » ne sert que des gemmes (`health` nul)', () => {
    const base = { showsPlayerChrome: true, vitalityEnabled: true, auth: { userId: 4 } };
    expect(
      computePlayerVitality({
        ...base,
        gameState: { vitality: { byPlayerId: { 4: { power: 5 } } } },
      }),
    ).toEqual({ health: null, power: 5 });
    expect(computePlayerVitality({ ...base, profile: { power_points: 2 } })).toEqual({
      health: null,
      power: 2,
    });
    // Jeu classique : les deux jauges, comme avant.
    expect(
      computePlayerVitality({
        ...base,
        gameState: { vitality: { byPlayerId: { 4: { health: 3, power: 5 } } } },
      }),
    ).toEqual({ health: 3, power: 5 });
  });
});

describe('une seule monnaie — la bourse à l’écran', () => {
  test('GLVitalityCounts et GLVitalityBadge : gemmes seules, aucun cœur ; la plume parle d’une gemme', () => {
    const { container, rerender } = render(
      <GLVitalityCounts health={7} power={4} gemmesSeules showHint />,
    );
    expect(container.querySelector('.gl-vitality-count--health')).toBeNull();
    expect(screen.getByLabelText('Gemmes : ta bourse')).toHaveTextContent('4');
    sansCoeur(container.textContent);
    expect(container.textContent).toMatch(/gardée toute l’année/);

    rerender(<GLVitalityBadge health={7} power={4} gemmesSeules plume />);
    expect(screen.getByLabelText('4 gemmes')).toBeInTheDocument();
    expect(screen.getByLabelText('Plume : une gemme au nid')).toBeInTheDocument();
    sansCoeur(container.innerHTML);

    rerender(<GLVitalityBadge power={1} gemmesSeules onClick={() => {}} />);
    expect(screen.getByLabelText('1 gemme — voir mes statistiques')).toBeInTheDocument();
  });

  test('geste du prof (roster) : une seule ligne, en gemmes', () => {
    const onAdjust = vi.fn();
    const { container } = render(
      <GLVitalityAdjustButtons power={3} gemmesSeules onAdjust={onAdjust} />,
    );
    fireEvent.click(screen.getByLabelText('Ajouter une gemme'));
    fireEvent.click(screen.getByLabelText('Retirer une gemme'));
    expect(onAdjust.mock.calls).toEqual([
      [{ healthDelta: 0, powerDelta: 1 }],
      [{ healthDelta: 0, powerDelta: -1 }],
    ]);
    expect(container.querySelectorAll('.gl-vitality-adjust-row')).toHaveLength(1);
    sansCoeur(container.innerHTML);
  });

  test('plateau : un roster servi sans `healthPoints` s’affiche en gemmes seulement', () => {
    const { container } = render(
      <GLGameBoardRoster
        teams={[{ id: 2, name: 'Licornes A', type: 'unicorn' }]}
        roster={[{ playerId: 10, teamId: 2, pseudo: 'joueur-a', powerPoints: 4 }]}
        vitalityEnabled
      />,
    );
    expect(container.querySelector('.gl-vitality-count--power')).not.toBeNull();
    expect(container.querySelector('.gl-vitality-count--health')).toBeNull();
    sansCoeur(container.textContent);
  });

  test('écran d’équipe : bourses des coéquipiers et réserve de la caravane en gemmes', async () => {
    const gameState = {
      game: { id: 7, status: 'live' },
      teams: [{ id: 2, name: 'Licornes A', type: 'unicorn' }],
      roster: [{ playerId: 10, teamId: 2, pseudo: 'joueur-a', powerPoints: 4 }],
      events: [],
    };
    const tenir = {
      enabled: true,
      surface: 'tablette',
      settings: { voile: true },
      state: { voilePosition: -1 },
      round: { number: 1, phase: 'jeu', ordre: [2] },
      permissions: {},
      retraits: [],
      reserves: [{ teamId: 2, power: 3 }],
    };
    const { container } = render(
      <GLTenirEcranEquipe gameState={gameState} tenir={tenir} teamId={2} onReloadGame={vi.fn()} />,
    );
    // Les bourses dans le bandeau ; la réserve de la caravane dans le tiroir « L'équipe ».
    await waitFor(() => expect(screen.getByTestId('gl-tenir-bourses').textContent).toMatch(/💎 4/));
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-bouton'));
    expect(screen.getByTestId('gl-tenir-reserve').textContent).toMatch(
      /Réserve de la caravane : 💎 3/,
    );
    sansCoeur(container.textContent);
  });
});

describe('parures gardées toute l’année (M19)', () => {
  const place = (extra = {}) => ({
    busy: false,
    acheterParure: vi.fn(),
    parures: {
      portees: [{ nom: 'Couronne de lianes' }],
      catalogue: [
        {
          code: 'couronne_lianes',
          nom: 'Couronne de lianes',
          description: 'Trois lianes tressées.',
          prix: 2,
          disponible: true,
          acquise: true,
        },
        {
          code: 'plume_calao',
          nom: 'Plume de calao',
          description: 'Une grande plume.',
          prix: 2,
          disponible: true,
          acquise: false,
        },
        {
          code: 'pelage_neon',
          nom: 'Pelage néon',
          description: 'Un pelage qui brille.',
          prix: 8,
          rare: true,
          disponible: false,
          acquise: false,
        },
      ],
    },
    ...extra,
  });

  test('comptoir : un seul bouton, en gemmes ; une parure acquise ne se rachète pas ; « rare » se dit', () => {
    const p = place();
    const { container } = render(<GLMarketComptoirPanel place={p} />);
    expect(container.textContent).toMatch(/à toi toute l’année/);
    expect(screen.getByTestId('gl-parure-acquise-couronne_lianes')).toHaveTextContent(
      'dans ta garde-robe',
    );
    const boutons = screen.getAllByRole('button');
    expect(boutons).toHaveLength(1);
    expect(boutons[0]).toHaveTextContent('💎 2');
    fireEvent.click(boutons[0]);
    expect(p.acheterParure).toHaveBeenCalledWith('plume_calao');
    expect(container.textContent).toMatch(/8 gemmes · rare/);
    expect(container.textContent).toMatch(/bientôt au comptoir/);
    sansCoeur(container.textContent);
    expect(findForbiddenString(container.textContent)).toBeNull();
  });

  test('garde-robe du Seuil : rien si elle est vide ; poser, ranger ; un refus se dit sans gronder', async () => {
    const vide = render(<GLSeuilGardeRobe gardeRobe={null} onGeste={() => {}} />);
    expect(vide.container.innerHTML).toBe('');
    vide.unmount();

    const onGeste = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Aucune partie en cours pour votre classe'));
    const gardeRobe = {
      peutPoser: true,
      parures: [
        { code: 'couronne_lianes', nom: 'Couronne de lianes', posee: false },
        { code: 'pelage_neon', nom: 'Pelage néon', rare: true, posee: true },
      ],
    };
    const { container } = render(<GLSeuilGardeRobe gardeRobe={gardeRobe} onGeste={onGeste} />);
    expect(screen.getByRole('heading', { name: 'Ma garde-robe' })).toBeInTheDocument();
    expect(container.textContent).toMatch(/Pelage néon · rare · sur la mascotte/);
    fireEvent.click(screen.getByRole('button', { name: 'Poser sur la mascotte' }));
    await waitFor(() => expect(onGeste).toHaveBeenCalledWith('couronne_lianes', 'poser'));
    fireEvent.click(screen.getByRole('button', { name: 'Ranger' }));
    await waitFor(() => expect(onGeste).toHaveBeenCalledWith('pelage_neon', 'ranger'));
    expect(await screen.findByRole('status')).toHaveTextContent('Aucune partie en cours');
    for (const bouton of screen.getAllByRole('button')) {
      expect(bouton.className).toMatch(/gl-btn/);
    }
    expect(findForbiddenString(container.textContent)).toBeNull();
  });

  test('garde-robe sans équipe en route : on regarde, on ne pose pas', () => {
    render(
      <GLSeuilGardeRobe
        gardeRobe={{ peutPoser: false, parures: [{ code: 'a', nom: 'Foulard des dunes' }] }}
        onGeste={() => {}}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/dès que ton équipe sera en route/)).toBeInTheDocument();
  });
});

describe('but de l’année : la Consécration, grisée, jamais un bouton (M19)', () => {
  test('la carte dit le nom et le prix, ne porte aucun bouton ni aucun solde', () => {
    const but = { code: 'SL018', nom: 'Consécration', emoji: null, cout: 8, ouverte: false };
    const { container, rerender } = render(<GLButDeLAnnee but={but} />);
    const carte = screen.getByTestId('gl-but-annee');
    expect(carte).toHaveAttribute('aria-label', 'But de l’année : Consécration, 8 gemmes');
    expect(carte.textContent).toMatch(/Consécration · 8 💎/);
    expect(carte.textContent).toMatch(/s’ouvre au troisième trimestre/);
    expect(container.querySelector('button')).toBeNull();
    expect(findForbiddenString(container.textContent)).toBeNull();

    rerender(<GLButDeLAnnee but={{ ...but, ouverte: true }} />);
    expect(screen.getByTestId('gl-but-annee').textContent).toMatch(/nous y sommes/);

    rerender(<GLButDeLAnnee but={null} />);
    expect(container.innerHTML).toBe('');
  });
});
