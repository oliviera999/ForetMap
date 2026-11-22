import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';

const apiGlMock = vi.fn();
const boardMock = vi.fn();
const journalMock = vi.fn();
// Faux socket : garde les écouteurs posés par la vue pour rejouer un évènement temps réel.
const socketEcouteurs = new Map();
const fauxSocket = {
  on: (nom, fn) => socketEcouteurs.set(nom, fn),
  off: (nom, fn) => {
    if (socketEcouteurs.get(nom) === fn) socketEcouteurs.delete(nom);
  },
};
const abonnements = [];

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));
vi.mock('../../src/gl/realtime/glSocketClient.js', () => ({
  acquireGlSocket: (token) => ({ socket: token ? fauxSocket : null, release() {} }),
  subscribeGlGame: (token, gameId) => {
    abonnements.push(Number(gameId));
    return () => {};
  },
}));
vi.mock('../../src/gl/components/GLGameBoard.jsx', () => ({
  GLGameBoard: (props) => {
    boardMock(props);
    return <div data-testid="stub-board" />;
  },
}));
vi.mock('../../src/gl/components/mj/GLTourJournal.jsx', () => ({
  GLTourJournal: (props) => {
    journalMock(props);
    return <div data-testid="stub-journal" />;
  },
}));

import {
  GLProjectionView,
  PROJECTION_FERMEE,
  mentionsDEquipe,
  pageEtatLabel,
  pageEtatLigne,
} from '../../src/gl/components/tenir/GLProjectionView.jsx';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

/**
 * Projection « Tenir à deux » : le plateau (composant de l'onglet Cartes) en lecture seule avec
 * les calques chasse + voile ; aucun état brut (« endormie » → « dort encore », « palie » →
 * « pâlie »…) ; numéro de case humain (rang + 1) identique au journal.
 */
describe('GLProjectionView', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    boardMock.mockReset();
    journalMock.mockReset();
    socketEcouteurs.clear();
    abonnements.length = 0;
    apiGlMock.mockImplementation((path) => {
      if (path === '/api/gl/games/9') {
        return Promise.resolve({
          game: { id: 9, name: 'Classe 6e — plateau 1', plateau_number: 1 },
          markers: [
            { id: 1, x_pct: 5, y_pct: 20, order_index: 0 },
            { id: 2, x_pct: 15, y_pct: 20, order_index: 1 },
          ],
          teams: [{ id: 7, name: 'Les Racines', type: 'gnome', position_marker_id: 2 }],
          tenir: { state: { voilePosition: 8 } },
        });
      }
      if (path === '/api/gl/games/9/tenir/tour') {
        return Promise.resolve({
          round: { number: 2, phase: 'jeu', equipeActiveId: null },
          teams: [{ id: 7, name: 'Les Racines', type: 'gnome', pathIndex: 1, auCamp: false }],
        });
      }
      if (path === '/api/gl/games/9/chasse') {
        return Promise.resolve({
          tenues: 1,
          total: 3,
          pages: [
            { zoneKey: 'cz-p1-01', indice: 'Là où…', etat: 'endormie' },
            { zoneKey: 'cz-p1-02', indice: 'Là où…', etat: 'palie' },
            {
              zoneKey: 'cz-p1-03',
              indice: 'Là où…',
              etat: 'tenue',
              tenuePar: { name: 'Les Lucioles' },
            },
          ],
          empreintes: [],
          kraa: null,
        });
      }
      return Promise.resolve(null);
    });
  });

  test('affiche le plateau en lecture seule avec les calques tenir, et les libellés d’état', async () => {
    render(<GLProjectionView gameId={9} token="t" />);
    await waitFor(() => expect(screen.getByTestId('stub-board')).toBeTruthy());
    const props = boardMock.mock.calls.at(-1)[0];
    expect(props.canMoveMascot).toBe(false);
    expect(props.canRequestAction).toBe(false);
    expect(props.canSpellCast).toBe(false);
    // Le plateau du tableau : la scène épurée, sans aucun bouton (étape 2 du chantier).
    expect(props.presentation).toBe('projection');
    expect(props.tenirLayers.voilePosition).toBe(8);
    expect(props.tenirLayers.carnet.total).toBe(3);
    expect(props.markers).toHaveLength(2);
    expect(screen.getByText(/le voile est à la case 9/)).toBeTruthy();
    expect(screen.getByText(/case 2/)).toBeTruthy();
    expect(screen.getByText('dort encore')).toBeTruthy();
    expect(screen.getByText('pâlie')).toBeTruthy();
    expect(screen.getByText(/^tenue/).textContent).toBe('tenue par Les Lucioles');
    expect(document.body.textContent).not.toMatch(/endormie|palie\b|revelee|trouvee|reparee/);
  });

  /**
   * Audit du 19/11/2026, J1 — une projection est une session invitée : le runtime de l'app ne
   * recharge rien pour elle. La vue s'abonne elle-même aux évènements de la partie.
   */
  test('J1 : se recharge sur un évènement temps réel de la partie, sans F5', async () => {
    const tourDe = { round: null, teams: [] };
    apiGlMock.mockImplementation((path) => {
      if (path === '/api/gl/games/9') {
        return Promise.resolve({ game: { id: 9, name: 'Classe' }, markers: [], teams: [] });
      }
      if (path === '/api/gl/games/9/tenir/tour') return Promise.resolve({ ...tourDe });
      return Promise.resolve(null);
    });
    render(<GLProjectionView gameId={9} token="jeton-projection" refreshKey={0} />);
    await waitFor(() => expect(screen.getByText('Classe')).toBeTruthy());
    // Aucun tour ouvert : les mêmes mots que l'écran d'équipe, jamais « en attente ».
    expect(screen.getByTestId('gl-projection-tour').textContent).toBe(
      'Le prof ouvre bientôt le tour.',
    );
    expect(abonnements).toEqual([9]);
    expect(typeof socketEcouteurs.get('gl:game:event')).toBe('function');
    expect(typeof socketEcouteurs.get('gl:game:equipe')).toBe('function');

    // Le prof ouvre le tour et passe en jeu, une équipe lance : trois évènements coup sur coup.
    tourDe.round = { number: 1, phase: 'jeu', equipeActiveId: null };
    const lectures = apiGlMock.mock.calls.filter(([p]) => p.endsWith('/tenir/tour')).length;
    act(() => {
      socketEcouteurs.get('gl:game:event')({ gameId: 9, eventType: 'tour_ouvert' });
      socketEcouteurs.get('gl:game:event')({ gameId: 9, eventType: 'tour_phase' });
      socketEcouteurs.get('gl:game:equipe')({ gameId: 9 });
      // Un évènement d'une autre partie ne recharge rien.
      socketEcouteurs.get('gl:game:event')({ gameId: 12, eventType: 'tour_phase' });
    });
    await waitFor(() => expect(screen.getByText(/Tour 1 — À vous de jouer/)).toBeTruthy(), {
      timeout: 3000,
    });
    // La rafale est regroupée : une seule relecture.
    expect(apiGlMock.mock.calls.filter(([p]) => p.endsWith('/tenir/tour')).length).toBe(
      lectures + 1,
    );
  });

  test('J1 : un évènement d’une autre partie seule ne recharge pas', async () => {
    render(<GLProjectionView gameId={9} token="jeton-projection" />);
    await waitFor(() => expect(screen.getByTestId('stub-board')).toBeTruthy());
    const lectures = apiGlMock.mock.calls.length;
    act(() => socketEcouteurs.get('gl:game:event')({ gameId: 12, eventType: 'tour_phase' }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(apiGlMock.mock.calls.length).toBe(lectures);
  });

  /**
   * Chantier « écrans de séance », étape 3 — le mode tableau : une grille (bandeau, plateau,
   * colonne de droite, faits marquants), lue du fond de la salle.
   */
  describe('mode tableau', () => {
    const partie = ({ phase = 'jeu', status = 'live', passeur = null, lumiere = null } = {}) =>
      apiGlMock.mockImplementation((path) => {
        if (path === '/api/gl/games/9') {
          return Promise.resolve({
            game: { id: 9, name: 'Classe 6e', plateau_number: 1, status },
            markers: [
              { id: 1, x_pct: 5, y_pct: 20, order_index: 0 },
              { id: 2, x_pct: 15, y_pct: 20, order_index: 1 },
            ],
            teams: [
              {
                id: 7,
                name: 'Les Racines',
                type: 'gnome',
                mascot_id: 'gl-gnome',
                color: '#65a30d',
              },
              { id: 8, name: 'Les Crinières', type: 'unicorn', mascot_id: null, color: null },
            ],
            tenir: { state: { voilePosition: 1 } },
          });
        }
        if (path === '/api/gl/games/9/tenir/tour') {
          return Promise.resolve({
            round: { number: 3, phase, equipeActiveId: 8, passeur },
            teams: [
              {
                id: 7,
                name: 'Les Racines',
                type: 'gnome',
                pathIndex: 1,
                auCamp: false,
                unDe: true,
                desProchainJet: 1,
              },
              { id: 8, name: 'Les Crinières', type: 'unicorn', pathIndex: 6, auCamp: true },
            ],
            lumiere,
            sablier: { phase: { secondes: 300, restantSecondes: 120, enPause: true } },
          });
        }
        if (path === '/api/gl/games/9/chasse') {
          return Promise.resolve({
            tenues: 1,
            total: 3,
            pages: [
              { zoneKey: 'z1', indice: 'Là où le vent se pose', etat: 'endormie' },
              {
                zoneKey: 'z2',
                titre: 'Un oiseau bleu',
                indice: 'Là où…',
                etat: 'trouvee',
                trouveePar: { name: 'Les Racines' },
              },
              {
                zoneKey: 'z3',
                titre: 'La colonne',
                indice: 'Là où…',
                etat: 'tenue',
                trouveePar: { name: 'Les Racines' },
                tenuePar: { name: 'Les Crinières' },
              },
            ],
          });
        }
        if (path === '/api/gl/games/9/defis-case') return Promise.resolve({ defis: [] });
        return Promise.resolve(null);
      });
    const PAGE = { titre: 'Premier pays. Un oiseau bleu.', texte: 'Le chemin continue.' };
    const texteVisible = () => screen.getByTestId('gl-projection').textContent;

    test('pendant le jeu : bandeau, plateau, équipes en pastilles, carnet en pages, trois faits', async () => {
      partie({ lumiere: { active: true, total: 12, palier: 100 } });
      render(<GLProjectionView gameId={9} token="t" />);
      await waitFor(() => expect(screen.getByTestId('stub-board')).toBeTruthy());
      const racine = screen.getByTestId('gl-projection');
      expect(racine.dataset.vue).toBe('plateau');
      expect(racine.classList.contains('gl-projection--carte')).toBe(false);

      // Bandeau : la partie, le tour et sa phase en mots d'élève, le sablier.
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Classe 6e');
      expect(screen.getByTestId('gl-projection-tour').textContent).toBe(
        'Tour 3 — À vous de jouer · le voile est à la case 2',
      );
      expect(screen.getByTestId('gl-sablier-phase')).toBeTruthy();

      // À droite : une pastille par équipe (mascotte, nom, case, ce qui la concerne).
      const pastilles = [...racine.querySelectorAll('.gl-projection__team')];
      expect(pastilles).toHaveLength(2);
      expect(pastilles[0].querySelector('.gl-mascot-avatar')).not.toBeNull();
      expect(pastilles[0].style.getPropertyValue('--gl-team-color')).toBe('#65a30d');
      expect(pastilles[0].textContent).toBe(
        'Les Racinescase 2sous le voilece tour-ci : un seul dé',
      );
      expect(pastilles[1].textContent).toBe('Les Crinièrescase 7au camp');
      // Au tableau, l'équipe dont c'est le tour se repère.
      expect(pastilles[1].classList.contains('is-active')).toBe(true);
      expect(pastilles[0].classList.contains('is-active')).toBe(false);

      // La Lumière en jauge.
      const lumiere = screen.getByTestId('gl-projection-lumiere');
      expect(lumiere.textContent).toContain('12 / 100');
      const jauge = lumiere.querySelector('progress');
      expect(jauge.getAttribute('max')).toBe('100');
      expect(jauge.getAttribute('value')).toBe('12');

      // Le carnet en pages : le titre une fois trouvée, jamais l'indice ; l'état en mots.
      const pages = [...racine.querySelectorAll('.gl-projection__page')];
      expect(pages.map((p) => p.textContent)).toEqual([
        'Page 1dort encore',
        'Un oiseau bleutrouvée par Les Racines',
        'La colonnetenue par Les Crinières',
      ]);
      expect(texteVisible()).not.toContain('Là où');

      // En bas : les trois derniers faits marquants, pas le journal entier.
      expect(
        within(screen.getByTestId('gl-projection-faits')).getByTestId('stub-journal'),
      ).toBeTruthy();
      const journal = journalMock.mock.calls.at(-1)[0];
      expect(journal.marquants).toBe(true);
      expect(journal.limit).toBe(3);

      // Rien à toucher pendant le jeu, et aucun mot interdit.
      expect(racine.querySelectorAll('button')).toHaveLength(0);
      expect(findForbiddenString(texteVisible())).toBeNull();
    });

    test('sans Lumière ouverte : pas de jauge', async () => {
      partie({ lumiere: { active: false, total: 99, palier: 100 } });
      render(<GLProjectionView gameId={9} token="t" />);
      await waitFor(() => expect(screen.getByTestId('stub-board')).toBeTruthy());
      expect(screen.queryByTestId('gl-projection-lumiere')).toBeNull();
    });

    test('à la clôture : la carte « À la prochaine séance » remplace l’écran ; « Voir le plateau » y ramène', async () => {
      partie({ phase: 'clos', passeur: PAGE });
      render(<GLProjectionView gameId={9} token="t" />);
      const carte = await screen.findByTestId('gl-projection-accroche');
      const racine = screen.getByTestId('gl-projection');
      expect(racine.dataset.vue).toBe('carte');
      expect(racine.classList.contains('gl-projection--carte')).toBe(true);
      expect(within(carte).getByRole('heading', { level: 2 }).textContent).toBe(
        'À la prochaine séance',
      );
      expect(carte.textContent).toContain('Premier pays. Un oiseau bleu.');
      expect(carte.textContent).toContain('Le chemin continue.');
      expect(screen.getByTestId('gl-projection-accroche-indice').textContent).toBe(
        'Une page dort encore : « Là où le vent se pose »',
      );
      // Plein écran : ni plateau, ni colonne, ni faits marquants derrière la carte.
      expect(screen.queryByTestId('gl-projection-board')).toBeNull();
      expect(screen.queryByTestId('gl-projection-cote')).toBeNull();
      expect(screen.queryByTestId('gl-projection-faits')).toBeNull();
      // Le bandeau reste : la classe lit « Tour terminé ».
      expect(screen.getByTestId('gl-projection-tour').textContent).toContain(
        'Tour 3 — Tour terminé',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Voir le plateau' }));
      expect(screen.queryByTestId('gl-projection-accroche')).toBeNull();
      expect(screen.getByTestId('stub-board')).toBeTruthy();
      expect(screen.getByTestId('gl-projection').dataset.vue).toBe('plateau');
      // Une sortie dans chaque sens : le bandeau rouvre la carte.
      fireEvent.click(screen.getByRole('button', { name: 'À la prochaine séance' }));
      expect(screen.getByTestId('gl-projection-accroche')).toBeTruthy();
      expect(screen.queryByTestId('stub-board')).toBeNull();
    });

    test('le choix « Voir le plateau » ne vaut que pour ce moment : au tour clos suivant, la carte revient', async () => {
      const tourDe = { number: 3 };
      partie({ phase: 'clos', passeur: PAGE });
      const base = apiGlMock.getMockImplementation();
      apiGlMock.mockImplementation(async (path) => {
        const data = await base(path);
        if (path === '/api/gl/games/9/tenir/tour') data.round.number = tourDe.number;
        return data;
      });
      render(<GLProjectionView gameId={9} token="t" />);
      await screen.findByTestId('gl-projection-accroche');
      fireEvent.click(screen.getByRole('button', { name: 'Voir le plateau' }));
      expect(screen.queryByTestId('gl-projection-accroche')).toBeNull();
      tourDe.number = 4;
      act(() => socketEcouteurs.get('gl:game:event')({ gameId: 9, eventType: 'tour_clos' }));
      await waitFor(() => expect(screen.getByTestId('gl-projection-accroche')).toBeTruthy(), {
        timeout: 3000,
      });
    });

    test('pendant le souffle : le plateau reste à l’écran, la page du jour s’ouvre à la demande', async () => {
      partie({ phase: 'souffle', passeur: PAGE });
      render(<GLProjectionView gameId={9} token="t" />);
      await waitFor(() => expect(screen.getByTestId('stub-board')).toBeTruthy());
      expect(screen.getByTestId('gl-projection-tour').textContent).toContain('Le voile avance');
      expect(screen.queryByTestId('gl-projection-page')).toBeNull();
      expect(document.querySelector('.gl-tour-passeur')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'La page du jour' }));
      const carte = screen.getByTestId('gl-projection-page');
      // Le titre de la page sert de titre à la carte : il n'est pas redit dans le texte.
      expect(within(carte).getByRole('heading', { level: 2 }).textContent).toBe(
        'Premier pays. Un oiseau bleu.',
      );
      expect(carte.querySelector('.gl-tour-passeur strong')).toBeNull();
      expect(carte.textContent).toContain('Le chemin continue.');
      // Ce n'est pas la fin de séance : ni « À la prochaine séance », ni indice.
      expect(screen.queryByTestId('gl-projection-accroche')).toBeNull();
      expect(screen.queryByTestId('gl-projection-accroche-indice')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Voir le plateau' }));
      expect(screen.getByTestId('stub-board')).toBeTruthy();
    });

    test('pendant le jeu, sans page du jour : aucune carte, aucun bouton', async () => {
      partie();
      render(<GLProjectionView gameId={9} token="t" />);
      await waitFor(() => expect(screen.getByTestId('stub-board')).toBeTruthy());
      expect(screen.queryByTestId('gl-projection-ouvrir-carte')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    });

    test('au camp : pas de carte d’office ; « Ce qui change » prend la place des faits marquants', async () => {
      partie({ phase: 'clos', status: 'ended', passeur: PAGE });
      render(<GLProjectionView gameId={9} token="t" />);
      await waitFor(() => expect(screen.getByTestId('stub-board')).toBeTruthy());
      expect(screen.queryByTestId('gl-projection-accroche')).toBeNull();
      expect(screen.queryByTestId('stub-journal')).toBeNull();
      // L'appel peut partir après l'affichage du plateau (CI chargée) : on l'attend.
      await waitFor(() =>
        expect(
          apiGlMock.mock.calls.some(([p]) => p === '/api/gl/games/9/tenir/ce-qui-change'),
        ).toBe(true),
      );
      // La page du jour reste à portée d'un clic.
      fireEvent.click(screen.getByRole('button', { name: 'La page du jour' }));
      expect(screen.getByTestId('gl-projection-page').textContent).toContain('Le chemin continue.');
    });
  });

  // Relecture garde-fous (lot 6) : à la clôture du chapitre le lien est révoqué, et la classe
  // lisait le refus brut du serveur, sans savoir quoi faire (garde-fou 11).
  test('lien révoqué ou échu (403) : une phrase qui dit qui a la main, pas le refus du serveur', async () => {
    apiGlMock.mockImplementation((path) => {
      if (path === '/api/gl/games/9/chasse') return Promise.resolve(null);
      return Promise.reject(
        Object.assign(new Error('Accès refusé à cette partie'), { status: 403 }),
      );
    });
    render(<GLProjectionView gameId={9} token="t" />);
    await waitFor(() => expect(screen.getByText(PROJECTION_FERMEE)).toBeTruthy());
    expect(screen.queryByText(/Accès refusé/)).toBeNull();
  });

  test('une autre erreur garde son message', async () => {
    apiGlMock.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('Erreur serveur'), { status: 500 })),
    );
    render(<GLProjectionView gameId={9} token="t" />);
    await waitFor(() => expect(screen.getByText('Erreur serveur')).toBeTruthy());
  });

  test('pageEtatLigne : l’état, et l’équipe qui a révélé, trouvé ou tenu la page', () => {
    const A = { name: 'Les Racines' };
    const B = { name: 'Les Lucioles' };
    expect(pageEtatLigne({ etat: 'endormie' })).toBe('dort encore');
    expect(pageEtatLigne({ etat: 'revelee', reveleePar: A })).toBe('révélée par Les Racines');
    expect(pageEtatLigne({ etat: 'trouvee', trouveePar: A })).toBe('trouvée par Les Racines');
    // Une page tenue se dit par l'équipe qui la tient, pas par celle qui l'a trouvée.
    expect(pageEtatLigne({ etat: 'tenue', trouveePar: A, tenuePar: B })).toBe(
      'tenue par Les Lucioles',
    );
    expect(pageEtatLigne({ etat: 'palie', trouveePar: A })).toBe('pâlie');
    expect(pageEtatLigne({ etat: 'reparee', trouveePar: A })).toBe('réparée');
    expect(pageEtatLigne({ etat: 'trouvee' })).toBe('trouvée');
  });

  test('mentionsDEquipe : au camp, sous le voile, un seul dé (ce tour-ci ou au prochain)', () => {
    expect(mentionsDEquipe({ pathIndex: 4 }, 2)).toEqual([]);
    expect(mentionsDEquipe({ pathIndex: 2 }, 2)).toEqual(['sous le voile']);
    // Tant que le voile n'est pas sur le plateau, personne n'est dessous.
    expect(mentionsDEquipe({ pathIndex: 0 }, -1)).toEqual([]);
    expect(
      mentionsDEquipe({ pathIndex: 9, auCamp: true, unDe: true, desProchainJet: 2 }, 2),
    ).toEqual(['au camp', 'au prochain tour : un seul dé']);
    expect(mentionsDEquipe({ pathIndex: 9, unDe: true, desProchainJet: 1 }, 2)).toEqual([
      'ce tour-ci : un seul dé',
    ]);
  });

  test('pageEtatLabel : tous les états ont un libellé', () => {
    for (const [etat, libelle] of [
      ['endormie', 'dort encore'],
      ['revelee', 'révélée'],
      ['palie', 'pâlie'],
      ['trouvee', 'trouvée'],
      ['tenue', 'tenue'],
      ['reparee', 'réparée'],
    ]) {
      expect(pageEtatLabel(etat)).toBe(libelle);
    }
  });
});
