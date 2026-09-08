import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

import { GLTeamComposeDialog } from '../../src/gl/components/mj/GLTeamComposeDialog.jsx';
import {
  listAvailableRecipes,
  listWeightSliders,
} from '../../src/gl/utils/glTeamCompositionRecipes.js';

function buildProposal(overrides = {}) {
  return {
    gameId: 7,
    recipe: 'random',
    requestedRecipe: 'random',
    seed: 'brume-4172',
    teamCount: 2,
    teams: [
      {
        index: 0,
        name: 'Sources',
        type: 'gnome',
        color: '#22c55e',
        mascotId: 'gl-gnome-mousse',
        members: [
          { playerId: 1, pseudo: 'alpha', firstName: 'A', lastName: 'Un', isActive: true },
          { playerId: 2, pseudo: 'beta', firstName: 'B', lastName: 'Deux', isActive: true },
        ],
        newPairs: 1,
        repeatedPairs: 0,
      },
      {
        index: 1,
        name: 'Nord',
        type: 'unicorn',
        color: '#3b82f6',
        mascotId: 'gl-licorne-aube',
        members: [
          { playerId: 3, pseudo: 'gamma', firstName: 'C', lastName: 'Trois', isActive: true },
        ],
        newPairs: 0,
        repeatedPairs: 0,
      },
    ],
    excluded: [],
    stats: { players: 3, newPairs: 1, repeatedPairs: 0, historyGames: 0 },
    warnings: [],
    explain: ['2 équipes pour 3 joueurs (effectifs 1–2).'],
    existingTeams: [],
    ...overrides,
  };
}

describe('GLTeamComposeDialog', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('ouvre avec un aperçu immédiat, affiche les équipes et applique la proposition', async () => {
    apiGlMock.mockImplementation((path, method, body) => {
      if (path.endsWith('/teams/compose/preview')) return Promise.resolve(buildProposal());
      if (path.endsWith('/teams/compose/apply')) {
        return Promise.resolve({ ok: true, teams: body.teams, replaced: false });
      }
      return Promise.reject(new Error(`chemin inattendu ${path}`));
    });
    const onApplied = vi.fn().mockResolvedValue();
    const onClose = vi.fn();
    render(
      <GLTeamComposeDialog
        open
        onClose={onClose}
        gameId={7}
        gameName="Partie test"
        onApplied={onApplied}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('gl-compose-team-0')).toBeTruthy());
    // Premier aperçu : ni recette ni taille — la politique de la classe décide côté serveur.
    const firstCall = apiGlMock.mock.calls[0];
    expect(firstCall[0]).toBe('/api/gl/games/7/teams/compose/preview');
    expect(firstCall[2]).toEqual({ includeInactive: false });
    // La carte sélectionnée suit la recette effective renvoyée.
    expect(screen.getByTestId('gl-compose-recipe-random').getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByText(/alpha — A Un/)).toBeTruthy();
    expect(screen.getByDisplayValue('Sources')).toBeTruthy();
    expect(screen.getByText('2 équipes pour 3 joueurs (effectifs 1–2).')).toBeTruthy();
    // Aucun score n'est rendu.
    expect(screen.queryByText(/composite|score/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    const applyCall = apiGlMock.mock.calls.find((c) => c[0].endsWith('/teams/compose/apply'));
    expect(applyCall[2]).toEqual(
      expect.objectContaining({
        recipe: 'random',
        seed: 'brume-4172',
        replaceExisting: false,
        teams: [
          expect.objectContaining({ name: 'Sources', type: 'gnome', memberIds: [1, 2] }),
          expect.objectContaining({ name: 'Nord', type: 'unicorn', memberIds: [3] }),
        ],
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  test('le sélecteur « déplacer vers… » déplace un joueur et l’application reflète l’ajustement', async () => {
    apiGlMock.mockImplementation((path) => {
      if (path.endsWith('/teams/compose/preview')) return Promise.resolve(buildProposal());
      if (path.endsWith('/teams/compose/apply')) return Promise.resolve({ ok: true });
      return Promise.reject(new Error(path));
    });
    render(<GLTeamComposeDialog open onClose={() => {}} gameId={7} onApplied={async () => {}} />);
    await waitFor(() => expect(screen.getByTestId('gl-compose-team-1')).toBeTruthy());

    const mover = screen.getByLabelText('Déplacer beta vers…');
    fireEvent.change(mover, { target: { value: '1' } });
    await waitFor(() =>
      expect(screen.getByTestId('gl-compose-team-1').textContent).toMatch(/beta — B Deux/),
    );
    fireEvent.change(screen.getByLabelText('Nom de l’équipe 2'), { target: { value: 'Nord Bis' } });

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() =>
      expect(apiGlMock.mock.calls.some((c) => c[0].endsWith('/teams/compose/apply'))).toBe(true),
    );
    const applyCall = apiGlMock.mock.calls.find((c) => c[0].endsWith('/teams/compose/apply'));
    expect(applyCall[2].teams[0].memberIds).toEqual([1]);
    expect(applyCall[2].teams[1]).toEqual(
      expect.objectContaining({ name: 'Nord Bis', memberIds: [3, 2] }),
    );
  });

  test('épingles : un déplacement épingle le joueur, « Régénérer » renvoie les épingles, bascule manuelle', async () => {
    apiGlMock.mockImplementation((path) =>
      path.endsWith('/teams/compose/preview')
        ? Promise.resolve(buildProposal())
        : Promise.resolve({ ok: true }),
    );
    render(<GLTeamComposeDialog open onClose={() => {}} gameId={7} />);
    await waitFor(() => expect(screen.getByTestId('gl-compose-team-1')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Déplacer beta vers…'), { target: { value: '1' } });
    const pinBeta = screen.getByRole('button', { name: 'Désépingler beta' });
    expect(pinBeta.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Épingler alpha' }));
    expect(screen.getByRole('button', { name: 'Désépingler alpha' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
    await waitFor(() => {
      const previews = apiGlMock.mock.calls.filter((c) => c[0].endsWith('/teams/compose/preview'));
      const last = previews[previews.length - 1][2];
      expect(last.pins).toEqual(
        expect.arrayContaining([
          { playerId: 2, slot: 1 },
          { playerId: 1, slot: 0 },
        ]),
      );
      expect(last.seed).toBeUndefined();
    });

    // Désépingler beta : disparaît du corps suivant.
    fireEvent.click(screen.getByRole('button', { name: 'Désépingler beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
    await waitFor(() => {
      const previews = apiGlMock.mock.calls.filter((c) => c[0].endsWith('/teams/compose/preview'));
      expect(previews[previews.length - 1][2].pins).toEqual([{ playerId: 1, slot: 0 }]);
    });
  });

  test('contraintes de la classe : verrous chargés, ajout et retrait relancent l’aperçu ; indice politique', async () => {
    const locks = [
      {
        id: 51,
        kind: 'apart',
        players: [
          { playerId: 1, pseudo: 'alpha' },
          { playerId: 3, pseudo: 'gamma' },
        ],
      },
    ];
    apiGlMock.mockImplementation((path, method, body) => {
      if (path.endsWith('/teams/compose/preview')) {
        return Promise.resolve(
          buildProposal({
            classId: 12,
            recipeSource: 'policy',
            classPolicy: 'carry_over',
            classTeamSizeDefault: 3,
            recipe: 'random_memory',
            warnings: [{ code: 'POLICY_DEFAULT_RECIPE' }, { code: 'PEOPLE_ROTATION' }],
          }),
        );
      }
      if (path === '/api/gl/admin/classes/12/pairing-locks' && method === 'GET') {
        return Promise.resolve({ locks });
      }
      if (path === '/api/gl/admin/classes/12/pairing-locks' && method === 'POST') {
        locks.push({
          id: 52,
          kind: body.kind,
          players: [
            { playerId: body.playerAId, pseudo: 'p' },
            { playerId: body.playerBId, pseudo: 'q' },
          ],
        });
        return Promise.resolve({ ok: true, created: true, lock: locks[1] });
      }
      if (path === '/api/gl/admin/classes/12/pairing-locks/51' && method === 'DELETE') {
        locks.splice(0, 1);
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error(`chemin inattendu ${method} ${path}`));
    });
    render(<GLTeamComposeDialog open onClose={() => {}} gameId={7} />);
    await waitFor(() => expect(screen.getByTestId('gl-compose-constraints')).toBeTruthy());
    expect(screen.getByTestId('gl-compose-policy-hint').textContent).toMatch(/Reconduire/);
    expect(screen.getByText(/politique d’équipes de la classe/)).toBeTruthy();
    expect(screen.getByText(/troisièmes tours/)).toBeTruthy();
    expect(screen.getByLabelText('Taille visée par équipe').getAttribute('placeholder')).toBe(
      'classe : 3',
    );
    // Recette effective sélectionnée.
    expect(screen.getByTestId('gl-compose-recipe-random_memory').getAttribute('aria-checked')).toBe(
      'true',
    );

    await waitFor(() => expect(screen.getByText(/alpha & gamma/)).toBeTruthy());
    expect(screen.getByText('Jamais ensemble')).toBeTruthy();

    const previewsBefore = apiGlMock.mock.calls.filter((c) =>
      c[0].endsWith('/teams/compose/preview'),
    ).length;
    fireEvent.change(screen.getByLabelText('Premier joueur du verrou'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Type de verrou'), { target: { value: 'together' } });
    fireEvent.change(screen.getByLabelText('Second joueur du verrou'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le verrou' }));
    await waitFor(() =>
      expect(
        apiGlMock.mock.calls.some(
          (c) =>
            c[0] === '/api/gl/admin/classes/12/pairing-locks' &&
            c[1] === 'POST' &&
            c[2].playerAId === 1 &&
            c[2].playerBId === 2 &&
            c[2].kind === 'together',
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByText(/p & q/)).toBeTruthy());
    await waitFor(() =>
      expect(
        apiGlMock.mock.calls.filter((c) => c[0].endsWith('/teams/compose/preview')).length,
      ).toBeGreaterThan(previewsBefore),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le verrou alpha et gamma' }));
    await waitFor(() =>
      expect(
        apiGlMock.mock.calls.some(
          (c) => c[0] === '/api/gl/admin/classes/12/pairing-locks/51' && c[1] === 'DELETE',
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText(/alpha & gamma/)).toBeNull());
  });

  test('peuple de la première équipe : le choix explicite part dans `startWith`', async () => {
    apiGlMock.mockImplementation(() => Promise.resolve(buildProposal()));
    render(<GLTeamComposeDialog open onClose={() => {}} gameId={7} />);
    await waitFor(() => expect(screen.getByTestId('gl-compose-team-0')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Peuple de la première équipe'), {
      target: { value: 'unicorn' },
    });
    await waitFor(() =>
      expect(
        apiGlMock.mock.calls.some(
          (c) => c[0].endsWith('/teams/compose/preview') && c[2].startWith === 'unicorn',
        ),
      ).toBe(true),
    );
  });

  test('équipes existantes : « Appliquer » exige la case « remplacer » ; changer de recette relance l’aperçu', async () => {
    apiGlMock.mockImplementation((path, method, body) => {
      if (path.endsWith('/teams/compose/preview')) {
        return Promise.resolve(
          buildProposal({
            recipe: body.recipe === 'carry_over' ? 'random' : body.recipe,
            requestedRecipe: body.recipe,
            warnings: [
              { code: 'TEAMS_NOT_EMPTY', message: 'x', teamCount: 1, memberCount: 2 },
              ...(body.recipe === 'carry_over' ? [{ code: 'NO_PREVIOUS_GAME', message: 'y' }] : []),
            ],
            existingTeams: [{ teamId: 40, name: 'Vieille', memberCount: 2 }],
          }),
        );
      }
      return Promise.resolve({ ok: true });
    });
    render(<GLTeamComposeDialog open onClose={() => {}} gameId={7} />);
    await waitFor(() => expect(screen.getByTestId('gl-compose-team-0')).toBeTruthy());

    const apply = screen.getByRole('button', { name: 'Appliquer' });
    expect(apply.disabled).toBe(true);
    expect(screen.getByText(/déjà des équipes avec des joueurs/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Remplacer les 1 équipe existante/));
    expect(screen.getByRole('button', { name: 'Appliquer' }).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('gl-compose-recipe-carry_over'));
    await waitFor(() =>
      expect(
        apiGlMock.mock.calls.some(
          (c) => c[0].endsWith('/teams/compose/preview') && c[2].recipe === 'carry_over',
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByText(/Aucune partie précédente/)).toBeTruthy());
    // Repli serveur sur `random` : la carte sélectionnée suit la recette effective.
    await waitFor(() =>
      expect(screen.getByTestId('gl-compose-recipe-random').getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
  });

  test('erreur d’aperçu affichée, bouton Appliquer désactivé', async () => {
    apiGlMock.mockRejectedValue(new Error('Au moins deux joueurs actifs sont nécessaires'));
    render(<GLTeamComposeDialog open onClose={() => {}} gameId={7} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/deux joueurs/));
    expect(screen.getByRole('button', { name: 'Appliquer' }).disabled).toBe(true);
  });

  test('recettes v2 masquées par défaut, visibles si activées, homogène bloquée avec score', () => {
    expect(listAvailableRecipes().map((r) => r.id)).toEqual([
      'random',
      'random_memory',
      'carry_over',
    ]);
    const all = listAvailableRecipes({ profileRecipesEnabled: true, scoringEnabled: true });
    expect(all.map((r) => r.id)).toContain('homogeneous');
    expect(all.find((r) => r.id === 'homogeneous').disabled).toBe(true);
    expect(all.find((r) => r.id === 'mixed').disabled).toBe(false);
    // Curseurs : aucun pour la reconduction, presets pré-positionnés sinon.
    expect(listWeightSliders('carry_over')).toEqual([]);
    const mixed = listWeightSliders('mixed');
    expect(mixed.map((s) => s.key)).toEqual(['repeat', 'inter', 'roles']);
    expect(mixed.find((s) => s.key === 'inter').defaultValue).toBe(60);
    expect(listWeightSliders('homogeneous').map((s) => s.key)).toEqual(['repeat', 'intra']);
  });

  test('recettes v2 : cartes affichées, homogène désactivée avec score, poids avancés envoyés', async () => {
    apiGlMock.mockImplementation((path, method, body) =>
      path.endsWith('/teams/compose/preview')
        ? Promise.resolve(
            buildProposal({
              recipe: body.recipe || 'random',
              requestedRecipe: body.recipe || 'random',
              warnings: body.recipe === 'mixed' ? [{ code: 'PROFILE_DATA_SPARSE' }] : [],
              explain: ['Profils variés dans chaque équipe.'],
            }),
          )
        : Promise.resolve({ ok: true }),
    );
    render(
      <GLTeamComposeDialog
        open
        onClose={() => {}}
        gameId={7}
        profileRecipesEnabled
        scoringEnabled
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-compose-team-0')).toBeTruthy());
    // Trois cartes de profil visibles ; « groupes de besoin » grisée tant que le score est actif.
    expect(screen.getByTestId('gl-compose-recipe-mixed')).toBeTruthy();
    expect(screen.getByTestId('gl-compose-recipe-roles')).toBeTruthy();
    const homogeneous = screen.getByTestId('gl-compose-recipe-homogeneous');
    expect(homogeneous.disabled).toBe(true);
    expect(homogeneous.textContent).toMatch(/score est activé/);
    // Aucune section « Poids avancés » pour l'aléatoire pur ? Si : le terme « binômes » y est.
    expect(screen.getByTestId('gl-compose-advanced')).toBeTruthy();

    fireEvent.click(screen.getByTestId('gl-compose-recipe-mixed'));
    await waitFor(() =>
      expect(
        apiGlMock.mock.calls.some(
          (c) => c[0].endsWith('/teams/compose/preview') && c[2].recipe === 'mixed',
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByText(/Peu de données de jeu/)).toBeTruthy());
    // Le premier appel « mixed » ne porte aucune surcharge (presets serveur).
    const firstMixed = apiGlMock.mock.calls.find(
      (c) => c[0].endsWith('/teams/compose/preview') && c[2].recipe === 'mixed',
    );
    expect(firstMixed[2].weightsOverride).toBeUndefined();

    // Un curseur déplacé ⇒ nouvel aperçu avec `weightsOverride` borné côté client au pas.
    const slider = screen.getByLabelText(/Équipes comparables entre elles/);
    expect(Number(slider.value)).toBe(60);
    fireEvent.change(slider, { target: { value: '80' } });
    await waitFor(() =>
      expect(
        apiGlMock.mock.calls.some(
          (c) =>
            c[0].endsWith('/teams/compose/preview') &&
            c[2].recipe === 'mixed' &&
            c[2].weightsOverride?.inter === 80,
        ),
      ).toBe(true),
    );
    // Retour aux presets : la surcharge disparaît du corps.
    fireEvent.click(screen.getByRole('button', { name: 'Revenir aux poids par défaut' }));
    await waitFor(() => {
      const last = apiGlMock.mock.calls.filter((c) => c[0].endsWith('/teams/compose/preview'));
      expect(last[last.length - 1][2].weightsOverride).toBeUndefined();
    });
    // Toujours aucun score à l'écran.
    expect(screen.queryByText(/composite/i)).toBeNull();
  });
});
