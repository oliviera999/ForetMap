import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { GLTenirMoment } from '../../src/gl/components/tenir/GLTenirMoment.jsx';
import { bandeauxDuMoment, momentDeLEquipe } from '../../src/gl/utils/glTenirMoment.js';
import { maintenantVousPouvez } from '../../src/shared/glSortMomentsCore.js';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const TOUT_OUVERT = {
  jeter: true,
  lancer: true,
  repondre: true,
  fouiller: true,
  lire: true,
  tenir: true,
};
const membres = [
  { playerId: 10, teamId: 2, pseudo: 'joueur-a', powerPoints: 4 },
  { playerId: 11, teamId: 2, pseudo: 'joueur-b', powerPoints: 1 },
];
const olu = {
  line: { texte: 'La caravane repart. On avance ensemble.', expression: 'neutre' },
  speakerName: 'OLU',
};

function gestes(extra = {}) {
  return maintenantVousPouvez({
    perms: TOUT_OUVERT,
    phase: 'jeu',
    fouillesRestantes: 2,
    pagesATenir: 1,
    ...extra,
  });
}

/** Les blocs qui ne peuvent s'afficher qu'un à la fois : la carte du moment n'en montre qu'un. */
const BLOCS = [
  'gl-tenir-maintenant',
  'gl-tenir-main',
  'gl-tenir-appareils',
  'gl-tenir-question',
  'gl-tenir-jet-suspens',
  'gl-tour-des',
  'gl-tenir-retour',
  'gl-peripetie-overlay',
];
function blocsVisibles() {
  return BLOCS.filter((id) => screen.queryByTestId(id));
}

describe('GLTenirMoment', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({ defis: [], moments: [], chimeres: [], ceQuiChange: null });
  });

  test('état « geste » : le rôle, un gros bouton, les autres gestes en puces — rien de grisé', () => {
    const onGeste = vi.fn();
    const moment = momentDeLEquipe({ maintenant: gestes(), fouillesRestantes: 2, phase: 'jeu' });
    render(<GLTenirMoment moment={moment} gameId={7} olu={olu} onGeste={onGeste} />);

    const carte = screen.getByTestId('gl-tenir-maintenant');
    expect(carte).toHaveTextContent('Gestionnaire');
    const gros = carte.querySelector('.gl-tenir-moment__gros');
    expect(gros).toHaveAttribute('data-geste', 'lancer');
    expect(gros).toHaveTextContent('Lancer les dés');
    const puces = within(screen.getByTestId('gl-tenir-puces')).getAllByRole('button');
    expect(puces.map((b) => b.getAttribute('data-geste'))).toEqual(['fouiller', 'lire', 'jeter']);
    expect(puces[0]).toHaveTextContent('Fouiller · 2 fouilles');
    // Aucun bouton éteint : un geste fermé n'est pas là du tout.
    expect(carte.querySelectorAll('button:disabled')).toHaveLength(0);
    expect(carte.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);

    fireEvent.click(gros);
    fireEvent.click(puces[0]);
    expect(onGeste.mock.calls.map((c) => c[0])).toEqual(['lancer', 'fouiller']);
    expect(blocsVisibles()).toEqual(['gl-tenir-maintenant']);
    // Olu parle sous la carte, toujours.
    expect(screen.getByTestId('gl-olu-bulle')).toHaveTextContent('La caravane repart.');
  });

  test('un geste fermé par le serveur est absent, pas grisé', () => {
    const moment = momentDeLEquipe({
      maintenant: maintenantVousPouvez({ perms: { lancer: true }, phase: 'jeu' }),
      phase: 'jeu',
    });
    render(<GLTenirMoment moment={moment} gameId={7} />);
    expect(document.querySelectorAll('[data-geste]')).toHaveLength(1);
    expect(document.querySelector('[data-geste="fouiller"]')).toBeNull();
    expect(document.querySelector('[data-geste="jeter"]')).toBeNull();
    expect(screen.queryByTestId('gl-tenir-puces')).toBeNull();
  });

  test('en fouille : « Touchez la carte · n fouilles », et « Arrêter de fouiller »', () => {
    const onArreterFouille = vi.fn();
    const moment = momentDeLEquipe({
      maintenant: gestes(),
      fouilleMode: true,
      fouillesRestantes: 2,
      phase: 'jeu',
    });
    render(<GLTenirMoment moment={moment} gameId={7} onArreterFouille={onArreterFouille} />);
    // `is-fouille` : le repère que le conteneur lira pour donner son bord doré au plateau.
    expect(screen.getByTestId('gl-tenir-moment')).toHaveClass('is-fouille');
    expect(screen.getByTestId('gl-tenir-fouilles')).toHaveTextContent(
      'Touchez la carte · 2 fouilles',
    );
    expect(screen.getByTestId('gl-tenir-maintenant')).toHaveTextContent('Opératrice ou Opérateur');
    expect(screen.queryByTestId('gl-tenir-puces')).toBeNull();
    const arreter = screen.getByRole('button', { name: 'Arrêter de fouiller' });
    expect(arreter).toHaveAttribute('data-geste', 'fouiller');
    fireEvent.click(arreter);
    expect(onArreterFouille).toHaveBeenCalledTimes(1);
  });

  test('main ailleurs : qui joue, et rien d’autre', () => {
    const moment = momentDeLEquipe({
      mainAilleurs: { texte: 'joueur-a prépare un sort…' },
      maintenant: gestes(),
      phase: 'jeu',
    });
    render(<GLTenirMoment moment={moment} gameId={7} />);
    expect(screen.getByTestId('gl-tenir-main')).toHaveTextContent('joueur-a prépare un sort…');
    expect(document.querySelectorAll('[data-geste]')).toHaveLength(0);
    expect(blocsVisibles()).toEqual(['gl-tenir-main']);
  });

  test('demande d’appareil : le bloc d’acceptation', async () => {
    const onRecharger = vi.fn();
    const moment = momentDeLEquipe({
      appareils: [{ id: 4, resteSecondes: 90 }],
      maintenant: gestes(),
      phase: 'jeu',
    });
    render(
      <GLTenirMoment
        moment={moment}
        gameId={7}
        equipe={{
          version: 3,
          main: { moi: false, texte: 'joueur-a répond…' },
          appareils: [{ id: 4, resteSecondes: 90 }],
        }}
        onRecharger={onRecharger}
      />,
    );
    expect(blocsVisibles()).toEqual(['gl-tenir-appareils']);
    fireEvent.click(screen.getByTestId('gl-tenir-appareil-accepter-4'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/games/7/tenir/sessions/4/accepter',
        'POST',
        {},
      ),
    );
    await waitFor(() => expect(onRecharger).toHaveBeenCalled());
  });

  test('question de case : la carte de question en pleine colonne, avec le délai de débat', () => {
    const repondre = vi.fn();
    const fermer = vi.fn();
    const moment = momentDeLEquipe({ questionCase: true, maintenant: gestes(), phase: 'jeu' });
    render(
      <GLTenirMoment
        moment={moment}
        gameId={7}
        settings={{ delai_debat_secondes: 0 }}
        caseQuestion={{
          question: {
            questionCode: 'q-1',
            presentationToken: 'jeton',
            question: 'Que mange le fennec ?',
            choices: [
              { id: 'a', text: 'Des insectes' },
              { id: 'b', text: 'Des algues' },
            ],
          },
          busy: false,
          repondre,
          fermer,
        }}
      />,
    );
    expect(blocsVisibles()).toEqual(['gl-tenir-question']);
    expect(screen.getByRole('heading', { name: 'La question de la case' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Des insectes'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(repondre).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(fermer).toHaveBeenCalled();
  });

  test('question de page (fouille) : « Une page dort ici »', () => {
    const repondre = vi.fn();
    const moment = momentDeLEquipe({ questionChasse: true, phase: 'jeu' });
    render(
      <GLTenirMoment
        moment={moment}
        gameId={7}
        chasse={{
          question: {
            zoneKey: 'z1',
            question: {
              questionCode: 'q-2',
              question: 'Quel arbre garde l’eau ?',
              choices: [{ id: 'a', text: 'Le baobab' }],
            },
          },
          busy: false,
          repondre,
          clearQuestion: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Une page dort ici' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Le baobab'));
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));
    expect(repondre).toHaveBeenCalledWith('a');
  });

  test('jet en suspens : « Garder ce jet » et « Relance… »', () => {
    const onGarderJet = vi.fn();
    const onRelance = vi.fn();
    const jetEnSuspens = {
      total: 7,
      faces: [3, 4],
      index: 11,
      label: 'Le gué',
      relanceSpellCode: 'RELANCE',
    };
    const moment = momentDeLEquipe({ jetEnSuspens, maintenant: gestes(), phase: 'jeu' });
    render(
      <GLTenirMoment
        moment={moment}
        gameId={7}
        jetEnSuspens={jetEnSuspens}
        onGarderJet={onGarderJet}
        onRelance={onRelance}
      />,
    );
    expect(blocsVisibles()).toEqual(['gl-tenir-jet-suspens']);
    expect(screen.getByTestId('gl-tenir-jet-suspens')).toHaveTextContent(
      'Jet de l’équipe : 7 (3 + 4) → case 12 « Le gué »',
    );
    fireEvent.click(screen.getByTestId('gl-tenir-garder-jet'));
    fireEvent.click(screen.getByTestId('gl-tenir-relance'));
    expect(onGarderJet).toHaveBeenCalledTimes(1);
    expect(onRelance).toHaveBeenCalledWith('RELANCE');
  });

  test('jet en suspens, sorts fermés : pas de « Relance… »', () => {
    const jetEnSuspens = { total: 4, faces: [4], index: 2 };
    render(
      <GLTenirMoment
        moment={momentDeLEquipe({ jetEnSuspens, phase: 'jeu' })}
        gameId={7}
        jetEnSuspens={jetEnSuspens}
      />,
    );
    expect(screen.getByTestId('gl-tenir-garder-jet')).toBeInTheDocument();
    expect(screen.queryByTestId('gl-tenir-relance')).toBeNull();
  });

  test('saisie des dés : le lancer, et une sortie', () => {
    const onLancer = vi.fn();
    const onQuitterSaisie = vi.fn();
    const moment = momentDeLEquipe({ saisieDes: true, maintenant: gestes(), phase: 'jeu' });
    render(
      <GLTenirMoment
        moment={moment}
        gameId={7}
        settings={{ des_mode_effectif: 'serveur' }}
        des={2}
        onLancer={onLancer}
        onQuitterSaisie={onQuitterSaisie}
      />,
    );
    expect(blocsVisibles()).toEqual(['gl-tour-des']);
    expect(screen.getByText('C’est le moment de la ou du Gestionnaire.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lancer 2 dés' }));
    expect(onLancer).toHaveBeenCalledWith({ mode: 'serveur' });
    fireEvent.click(screen.getByTestId('gl-tenir-quitter-saisie'));
    expect(onQuitterSaisie).toHaveBeenCalledTimes(1);
  });

  test('jet saisi : « Jet saisi : le prof valide. »', () => {
    render(
      <GLTenirMoment moment={momentDeLEquipe({ jetEnAttente: true, phase: 'jeu' })} gameId={7} />,
    );
    expect(screen.getByTestId('gl-tenir-moment-jet_attente')).toHaveTextContent(
      'Jet saisi : le prof valide.',
    );
    expect(document.querySelectorAll('[data-geste]')).toHaveLength(0);
  });

  test('retour d’une fouille : le verdict, la piste, « Continuer »', () => {
    const onContinuer = vi.fn();
    const onOuvrirPiste = vi.fn();
    const piste = {
      texte: 'La réponse se lit sur la fiche du fennec.',
      type: 'fiche',
      code: 'fennec',
    };
    const retour = {
      cle: 'chasse:9',
      origine: 'chasse',
      verdict: 'pas_encore',
      texte: 'Pas encore… Regardez ses oreilles.',
      piste,
    };
    const moment = momentDeLEquipe({ retour, maintenant: gestes(), phase: 'jeu' });
    render(
      <GLTenirMoment
        moment={moment}
        gameId={7}
        retour={retour}
        onContinuer={onContinuer}
        onOuvrirPiste={onOuvrirPiste}
      />,
    );
    expect(blocsVisibles()).toEqual(['gl-tenir-retour']);
    const verdict = screen.getByText('Pas encore… Regardez ses oreilles.');
    expect(verdict).toHaveAttribute('data-verdict', 'pas_encore');
    expect(screen.getByTestId('gl-tenir-piste-reponse')).toHaveTextContent(
      'La réponse se lit sur la fiche du fennec.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la fiche' }));
    expect(onOuvrirPiste).toHaveBeenCalledWith(piste);
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(onContinuer).toHaveBeenCalledTimes(1);
    // Le geste suivant n'est pas encore là : un seul état à la fois.
    expect(document.querySelectorAll('[data-geste]')).toHaveLength(0);
  });

  test('retour d’une question de case ; sur la tablette, la piste se lit sans bouton', () => {
    const retour = {
      cle: 'case:5',
      origine: 'case',
      verdict: null,
      texte: 'Bien vu.',
      piste: null,
    };
    const { rerender } = render(
      <GLTenirMoment
        moment={momentDeLEquipe({ retour, phase: 'jeu' })}
        gameId={7}
        retour={retour}
      />,
    );
    expect(screen.getByTestId('gl-tenir-case-retour')).toHaveTextContent('Bien vu.');
    const avecPiste = {
      ...retour,
      origine: 'chasse',
      verdict: 'pas_encore',
      piste: { texte: 'Cherchez le mot « racine ».', type: 'glossaire' },
    };
    rerender(
      <GLTenirMoment
        moment={momentDeLEquipe({ retour: avecPiste, phase: 'jeu' })}
        gameId={7}
        retour={avecPiste}
      />,
    );
    expect(screen.getByTestId('gl-tenir-piste-reponse')).toHaveTextContent(
      'Cherchez le mot « racine ».',
    );
    expect(screen.queryByRole('button', { name: /Ouvrir/ })).toBeNull();
  });

  test('tour joué, voile qui avance, tour pas encore ouvert : un mot, rien à toucher', () => {
    const { rerender } = render(
      <GLTenirMoment moment={momentDeLEquipe({ phase: 'jeu', tourJoue: true })} gameId={7} />,
    );
    expect(screen.getByTestId('gl-tenir-moment-joue')).toHaveTextContent(
      'Votre tour est joué. Regardez les autres équipes.',
    );
    rerender(<GLTenirMoment moment={momentDeLEquipe({ phase: 'jeu' })} gameId={7} />);
    expect(screen.getByTestId('gl-tenir-moment-joue')).toHaveTextContent(
      'Pour l’instant, regardez le plateau.',
    );
    rerender(
      <GLTenirMoment moment={momentDeLEquipe({ phase: 'jeu', surface: 'tableau' })} gameId={7} />,
    );
    expect(screen.getByTestId('gl-tenir-moment-joue')).toHaveTextContent(
      'Le tour se joue au tableau.',
    );
    rerender(<GLTenirMoment moment={momentDeLEquipe({ phase: 'souffle' })} gameId={7} />);
    expect(screen.getByTestId('gl-tenir-moment-souffle')).toHaveTextContent('Le voile avance.');
    rerender(<GLTenirMoment moment={momentDeLEquipe({})} gameId={7} />);
    expect(screen.getByTestId('gl-tenir-moment-attente')).toHaveTextContent(
      'Le prof ouvre bientôt le tour.',
    );
    expect(screen.getByTestId('gl-tenir-moment')).toHaveAttribute('data-etat', 'attente');
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });

  test('l’élève qui regarde ce tour lit son message', () => {
    render(
      <GLTenirMoment moment={momentDeLEquipe({ phase: 'jeu', spectateur: true })} gameId={7} />,
    );
    expect(screen.getByTestId('gl-tenir-spectateur')).toHaveTextContent(/Tu regardes ce tour/);
    expect(screen.queryByText(/Votre tour est joué/)).toBeNull();
  });

  test('tour terminé : le défi à préparer et l’entrée des défis de la Trame', async () => {
    apiGlMock.mockImplementation(async (url) =>
      String(url).endsWith('/defis-case')
        ? {
            defis: [
              {
                id: 1,
                code: 'd-1',
                statut: 'a_preparer',
                titre: 'Le nid',
                consigne: 'Dessinez un nid.',
              },
            ],
          }
        : {},
    );
    const moment = momentDeLEquipe({
      maintenant: maintenantVousPouvez({ perms: {}, phase: 'clos' }),
      phase: 'clos',
    });
    render(<GLTenirMoment moment={moment} gameId={7} cleDeRelecture="12" />);
    expect(screen.getByTestId('gl-tenir-moment-clos')).toHaveTextContent('Le tour est terminé.');
    await waitFor(() => expect(screen.getByTestId('gl-defis-case')).toHaveTextContent('Le nid'));
    const trame = screen.getByRole('button', { name: 'Défis de la Trame' });
    expect(trame).toHaveAttribute('data-geste', 'trame');
  });

  test('au camp : « Ce qui change au prochain chapitre »', async () => {
    apiGlMock.mockImplementation(async (url) =>
      String(url).endsWith('/ce-qui-change')
        ? {
            ceQuiChange: {
              lignes: [{ cle: 'plateau', titre: 'Le plateau', texte: 'Dix pages à trouver.' }],
            },
          }
        : {},
    );
    render(
      <GLTenirMoment moment={momentDeLEquipe({ phase: 'clos', partieFinie: true })} gameId={7} />,
    );
    expect(screen.getByTestId('gl-tenir-moment-camp')).toHaveTextContent('Vous êtes au camp');
    await waitFor(() =>
      expect(screen.getByTestId('gl-ce-qui-change')).toHaveTextContent('Dix pages à trouver.'),
    );
  });

  test('péripétie : l’écran plein, et rien derrière', () => {
    const onPasserPeripetie = vi.fn();
    const peripetie = { id: 'per-1', texte: 'Un pont de lianes. On passe.' };
    const moment = momentDeLEquipe({ peripetie, maintenant: gestes(), phase: 'jeu' });
    render(
      <GLTenirMoment
        moment={moment}
        gameId={7}
        teamName="Licornes A"
        peripetie={peripetie}
        onPasserPeripetie={onPasserPeripetie}
      />,
    );
    expect(blocsVisibles()).toEqual(['gl-peripetie-overlay']);
    expect(screen.queryByTestId('gl-tenir-moment-carte')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'On passe' }));
    expect(onPasserPeripetie).toHaveBeenCalledWith(peripetie);
  });

  test('bandeaux d’une ligne au-dessus de la carte, seulement s’ils sont vrais', () => {
    const lignes = bandeauxDuMoment({
      encordeePar: { name: 'Gnomes A' },
      unDe: true,
      desProchainJet: 1,
      sousVoile: true,
    });
    const moment = momentDeLEquipe({ maintenant: gestes(), phase: 'jeu' });
    const { rerender } = render(<GLTenirMoment moment={moment} lignes={lignes} gameId={7} />);
    expect(screen.getByTestId('gl-tenir-encorde')).toHaveTextContent(
      'L’équipe Gnomes A vous encorde. Le meilleur de vos deux jets vaut pour les deux.',
    );
    expect(screen.getByTestId('gl-tenir-un-de')).toHaveTextContent('Ce tour-ci : un seul dé.');
    expect(screen.getByTestId('gl-tenir-sous-voile')).toHaveTextContent(
      'Votre mascotte est sous le voile.',
    );
    expect(screen.queryByTestId('gl-tenir-en-retrait')).toBeNull();
    rerender(<GLTenirMoment moment={moment} lignes={[]} gameId={7} />);
    expect(screen.queryByTestId('gl-tenir-lignes')).toBeNull();
  });

  test('sorts dépliés : la liste par moment sous les boutons, le sort choisi remonte', async () => {
    apiGlMock.mockImplementation(async (url) =>
      String(url).includes('/tenir/sorts')
        ? {
            moments: [
              {
                key: 'pendant',
                label: 'Pendant le tour',
                sorts: [{ code: 'SENTIER', nom: 'Sentier', cout: 2, lancable: true }],
              },
            ],
          }
        : {},
    );
    const onJeterSort = vi.fn();
    const onGeste = vi.fn();
    const maintenant = maintenantVousPouvez({ perms: { jeter: true }, phase: 'jeu', aLance: true });
    const moment = momentDeLEquipe({ maintenant, sortsOuverts: true, phase: 'jeu' });
    render(
      <GLTenirMoment moment={moment} gameId={7} onGeste={onGeste} onJeterSort={onJeterSort} />,
    );
    const fermer = screen.getByRole('button', { name: 'Fermer les sorts' });
    expect(fermer).toHaveAttribute('data-geste', 'jeter');
    await waitFor(() => expect(screen.getByText('Pendant le tour')).toBeInTheDocument());
    fireEvent.click(fermer);
    expect(onGeste).toHaveBeenCalledWith('jeter');
  });

  test('« Il manque quelqu’un ? » tant que l’équipe n’a rien joué', () => {
    const onPresences = vi.fn();
    const moment = momentDeLEquipe({
      maintenant: gestes(),
      phase: 'jeu',
      presenceOuverte: true,
      aucunGeste: true,
    });
    render(
      <GLTenirMoment
        moment={moment}
        gameId={7}
        presence={{ confirmee: false, absents: [] }}
        membres={membres}
        onPresences={onPresences}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Il manque quelqu’un ?' }));
    fireEvent.click(screen.getByRole('button', { name: /joueur-b/ }));
    fireEvent.click(screen.getByTestId('gl-presence-ok'));
    expect(onPresences).toHaveBeenCalledWith([11]);
  });

  test('une erreur de geste se lit sous la carte', () => {
    const moment = momentDeLEquipe({ maintenant: gestes(), phase: 'jeu' });
    render(<GLTenirMoment moment={moment} gameId={7} erreurs={['Action impossible', '', null]} />);
    expect(screen.getByText('Action impossible')).toHaveClass('gl-error-banner');
    expect(document.querySelectorAll('.gl-error-banner')).toHaveLength(1);
  });

  test('pendant qu’un geste part, les boutons attendent', () => {
    const moment = momentDeLEquipe({ maintenant: gestes(), phase: 'jeu' });
    render(<GLTenirMoment moment={moment} gameId={7} occupe />);
    for (const bouton of document.querySelectorAll('[data-geste]')) expect(bouton).toBeDisabled();
  });

  test('aucun mot interdit dans ce que la carte montre, état par état', () => {
    const etats = [
      momentDeLEquipe({
        maintenant: gestes({ questionDue: true }),
        fouillesRestantes: 2,
        phase: 'jeu',
      }),
      momentDeLEquipe({
        maintenant: gestes(),
        fouilleMode: true,
        fouillesRestantes: 1,
        phase: 'jeu',
      }),
      momentDeLEquipe({ saisieDes: true, maintenant: gestes(), phase: 'jeu' }),
      momentDeLEquipe({ jetEnAttente: true, phase: 'jeu' }),
      momentDeLEquipe({ phase: 'jeu' }),
      momentDeLEquipe({ phase: 'souffle' }),
      momentDeLEquipe({ phase: 'clos' }),
      momentDeLEquipe({ phase: 'clos', partieFinie: true }),
      momentDeLEquipe({ phase: 'ouverture' }),
      momentDeLEquipe({}),
    ];
    for (const moment of etats) {
      const { container, unmount } = render(
        <GLTenirMoment
          moment={moment}
          lignes={bandeauxDuMoment({ enRetrait: true, sousVoile: true, unDe: true })}
          gameId={7}
          settings={{ des_mode_effectif: 'physique' }}
          onQuitterSaisie={() => {}}
        />,
      );
      expect(findForbiddenString(container.textContent), moment.etat).toBeNull();
      unmount();
    }
  });

  test('sans moment : rien', () => {
    const { container } = render(<GLTenirMoment moment={null} gameId={7} />);
    expect(container).toBeEmptyDOMElement();
  });
});
