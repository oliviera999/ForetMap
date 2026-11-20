import { describe, test, expect } from 'vitest';
import {
  ETATS_DU_MOMENT,
  ORDRE_DES_GESTES,
  PUCES_MAX,
  PSEUDO_MAX,
  LIBELLE_DE_CASE_MAX,
  TEXTES_DU_MOMENT,
  aucunGesteDuTour,
  bandeauxDuMoment,
  boursesDeLEquipe,
  casesEnPastilles,
  empreinteDuTiroir,
  estSousVoile,
  momentDeLEquipe,
  retourDuMoment,
} from '../../src/gl/utils/glTenirMoment.js';
import { maintenantVousPouvez } from '../../src/shared/glSortMomentsCore.js';
import { PHASE_AUCUN_TOUR } from '../../src/gl/constants/tenirPhases.js';
import { MESSAGE_SPECTATEUR } from '../../src/shared/glMainCore.js';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

const TOUT_OUVERT = {
  jeter: true,
  lancer: true,
  repondre: true,
  fouiller: true,
  lire: true,
  tenir: true,
};

/** Les gestes ouverts d'une équipe en phase de jeu, comme l'écran les calcule. */
function gestesOuverts(extra = {}) {
  return maintenantVousPouvez({
    perms: TOUT_OUVERT,
    phase: 'jeu',
    questionDue: true,
    fouillesRestantes: 2,
    pagesATenir: 1,
    ...extra,
  });
}

/** Une entrée où **tous** les états sont vrais en même temps : on en retire un à un. */
function toutVrai() {
  return {
    peripetie: { id: 'per-1', texte: 'Un pont de lianes.' },
    mainAilleurs: { texte: 'Lina prépare un sort…' },
    appareils: [{ id: 4, resteSecondes: 90 }],
    questionCase: true,
    questionChasse: true,
    jetEnSuspens: { total: 7, index: 11 },
    saisieDes: true,
    jetEnAttente: true,
    retour: { cle: 'chasse:1', origine: 'chasse', verdict: 'froid', texte: 'Froid.' },
    maintenant: gestesOuverts(),
    phase: 'jeu',
    partieFinie: true,
  };
}

describe('momentDeLEquipe — un seul état, le premier vrai', () => {
  test('chaque état cède la place au suivant, dans l’ordre du tableau', () => {
    const entree = toutVrai();
    const vus = [];
    const retirer = [
      ['peripetie', (e) => ({ ...e, peripetie: null })],
      ['main_ailleurs', (e) => ({ ...e, mainAilleurs: null })],
      ['appareil', (e) => ({ ...e, appareils: [] })],
      ['question', (e) => ({ ...e, questionCase: false, questionChasse: false })],
      ['jet_suspens', (e) => ({ ...e, jetEnSuspens: null })],
      ['saisie_des', (e) => ({ ...e, saisieDes: false })],
      ['jet_attente', (e) => ({ ...e, jetEnAttente: false })],
      ['retour', (e) => ({ ...e, retour: null })],
      ['geste', (e) => ({ ...e, maintenant: [] })],
      ['joue', (e) => ({ ...e, phase: 'souffle' })],
      ['souffle', (e) => ({ ...e, phase: 'clos' })],
      ['camp', (e) => ({ ...e, partieFinie: false })],
      ['clos', (e) => ({ ...e, phase: null })],
      ['attente', (e) => e],
    ];
    let courant = entree;
    for (const [attendu, suite] of retirer) {
      const moment = momentDeLEquipe(courant);
      expect(moment.etat).toBe(attendu);
      vus.push(moment.etat);
      courant = suite(courant);
    }
    expect(vus).toEqual([...ETATS_DU_MOMENT]);
  });

  test('sans rien : « Le prof ouvre bientôt le tour. », et rien à toucher', () => {
    const moment = momentDeLEquipe();
    expect(moment).toMatchObject({ etat: 'attente', texte: PHASE_AUCUN_TOUR, geste: null });
    expect(moment.puces).toEqual([]);
  });

  test('phase d’ouverture : l’équipe sait que son tour vient', () => {
    expect(momentDeLEquipe({ phase: 'ouverture' })).toMatchObject({
      etat: 'attente',
      texte: TEXTES_DU_MOMENT.ouverture,
    });
  });

  test('main ailleurs : le texte du serveur, et aucun geste', () => {
    const moment = momentDeLEquipe({
      mainAilleurs: { texte: 'Lina prépare un sort…', geste: 'sort' },
      questionCase: true,
      maintenant: gestesOuverts(),
      phase: 'jeu',
    });
    expect(moment).toMatchObject({ etat: 'main_ailleurs', texte: 'Lina prépare un sort…' });
    expect(moment.geste).toBeNull();
    expect(moment.puces).toEqual([]);
  });

  test('question de case avant question de page', () => {
    expect(momentDeLEquipe({ questionCase: true, questionChasse: true }).origine).toBe('case');
    expect(momentDeLEquipe({ questionChasse: true }).origine).toBe('chasse');
  });

  test('une demande d’appareil compte, une liste vide non', () => {
    expect(momentDeLEquipe({ appareils: 2 }).etat).toBe('appareil');
    expect(momentDeLEquipe({ appareils: [{ id: 1 }] }).etat).toBe('appareil');
    expect(momentDeLEquipe({ appareils: [] }).etat).toBe('attente');
  });
});

describe('momentDeLEquipe — état « geste »', () => {
  test('le gros bouton suit l’ordre répondre, lancer, fouiller, lire, sorts', () => {
    expect(ORDRE_DES_GESTES).toEqual(['repondre', 'lancer', 'fouiller', 'lire', 'jeter']);
    const moment = momentDeLEquipe({
      maintenant: gestesOuverts(),
      phase: 'jeu',
      fouillesRestantes: 2,
    });
    expect(moment).toMatchObject({
      etat: 'geste',
      geste: 'repondre',
      role: 'Éclaireuse ou Éclaireur',
      libelle: 'Répondre à la question',
    });
    // Trois puces au plus : lancer, fouiller, lire — « jeter » ne tient plus.
    expect(PUCES_MAX).toBe(3);
    expect(moment.puces.map((p) => p.geste)).toEqual(['lancer', 'fouiller', 'lire']);
    expect(moment.puces[1].court).toBe('Fouiller · 2 fouilles');
  });

  test('question et fouille ouvertes ensemble : répondre d’abord, fouiller en puce', () => {
    const moment = momentDeLEquipe({
      maintenant: maintenantVousPouvez({
        perms: { repondre: true, fouiller: true },
        phase: 'jeu',
        aLance: true,
        questionDue: true,
        fouillesRestantes: 3,
      }),
      fouillesRestantes: 3,
      phase: 'jeu',
    });
    expect(moment.geste).toBe('repondre');
    expect(moment.puces.map((p) => p.geste)).toEqual(['fouiller']);
  });

  test('sans question due : lancer devient le gros bouton', () => {
    const moment = momentDeLEquipe({
      maintenant: gestesOuverts({ questionDue: false }),
      fouillesRestantes: 2,
      phase: 'jeu',
    });
    expect(moment).toMatchObject({
      geste: 'lancer',
      role: 'Gestionnaire',
      libelle: 'Lancer les dés',
    });
    expect(moment.detail).toBeNull();
    expect(moment.puces.map((p) => p.geste)).toEqual(['fouiller', 'lire', 'jeter']);
  });

  test('un seul dé dû : le bouton le dit', () => {
    const moment = momentDeLEquipe({
      maintenant: gestesOuverts({ questionDue: false, des: 1 }),
      des: 1,
      phase: 'jeu',
    });
    expect(moment).toMatchObject({ libelle: 'Lancer le dé', detail: 'Un seul dé ce tour-ci.' });
  });

  test('équipe de quatre : l’Assistante ou l’Assistant répond à la question', () => {
    const moment = momentDeLEquipe({
      maintenant: gestesOuverts({ effectif: 4 }),
      phase: 'jeu',
    });
    expect(moment.geste).toBe('repondre');
    expect(moment.role).toBe('Assistante ou Assistant');
  });

  test('en fouille : « Touchez la carte », plus aucune puce', () => {
    const moment = momentDeLEquipe({
      maintenant: gestesOuverts(),
      fouilleMode: true,
      fouillesRestantes: 2,
      phase: 'jeu',
    });
    expect(moment).toMatchObject({
      etat: 'geste',
      geste: 'fouiller',
      fouille: true,
      role: 'Opératrice ou Opérateur',
      detail: '2 fouilles',
    });
    expect(moment.puces).toEqual([]);
  });

  test('le mode fouille ne rouvre pas un geste fermé', () => {
    const moment = momentDeLEquipe({
      maintenant: maintenantVousPouvez({ perms: { lancer: true }, phase: 'jeu' }),
      fouilleMode: true,
      phase: 'jeu',
    });
    expect(moment).toMatchObject({ geste: 'lancer', fouille: false });
  });

  test('un geste fermé par le serveur n’apparaît nulle part', () => {
    const moment = momentDeLEquipe({
      maintenant: maintenantVousPouvez({
        perms: { lancer: true, fouiller: false, jeter: false },
        phase: 'jeu',
        fouillesRestantes: 2,
      }),
      phase: 'jeu',
    });
    expect(moment.geste).toBe('lancer');
    expect(moment.puces).toEqual([]);
  });

  test('retour puis geste suivant : le retour passe devant, sauf si une fouille est en cours', () => {
    const retour = { cle: 'chasse:9', origine: 'chasse', verdict: 'tiede', texte: 'Tiède.' };
    const base = { maintenant: gestesOuverts(), fouillesRestantes: 2, phase: 'jeu' };
    expect(momentDeLEquipe({ ...base, retour }).etat).toBe('retour');
    // « Continuer » acquitte : le geste suivant revient.
    expect(momentDeLEquipe({ ...base, retour: null }).etat).toBe('geste');
    // Le geste suivant acquitte aussi.
    expect(momentDeLEquipe({ ...base, retour, fouilleMode: true })).toMatchObject({
      etat: 'geste',
      fouille: true,
    });
  });

  test('saisie des dés : seulement tant que le jet est permis', () => {
    const ouvert = gestesOuverts({ questionDue: false });
    expect(momentDeLEquipe({ saisieDes: true, maintenant: ouvert, phase: 'jeu' })).toMatchObject({
      etat: 'saisie_des',
      role: 'Gestionnaire',
    });
    // Un autre appareil de l'équipe a lancé : la saisie se referme d'elle-même.
    const apres = gestesOuverts({ questionDue: false, aLance: true });
    expect(momentDeLEquipe({ saisieDes: true, maintenant: apres, phase: 'jeu' }).etat).toBe(
      'geste',
    );
  });

  test('sorts dépliés : le bouton change de nom, la liste est demandée', () => {
    const maintenant = maintenantVousPouvez({ perms: { jeter: true }, phase: 'jeu', aLance: true });
    const moment = momentDeLEquipe({ maintenant, sortsOuverts: true, phase: 'jeu' });
    expect(moment).toMatchObject({ geste: 'jeter', libelle: 'Fermer les sorts', sorts: true });
    expect(momentDeLEquipe({ maintenant, phase: 'jeu' })).toMatchObject({
      libelle: 'Jeter un sort',
      sorts: false,
    });
  });

  test('« Il manque quelqu’un ? » tant qu’aucun geste n’est joué ce tour', () => {
    const base = { maintenant: gestesOuverts(), phase: 'jeu', presenceOuverte: true };
    expect(momentDeLEquipe({ ...base, aucunGeste: true }).presence).toBe(true);
    expect(momentDeLEquipe({ ...base, aucunGeste: false }).presence).toBe(false);
    expect(momentDeLEquipe({ ...base, aucunGeste: true, presenceOuverte: false }).presence).toBe(
      false,
    );
  });
});

describe('momentDeLEquipe — quand il n’y a rien à toucher', () => {
  test('tour joué, voile qui avance', () => {
    expect(momentDeLEquipe({ phase: 'jeu' })).toMatchObject({
      etat: 'joue',
      texte: TEXTES_DU_MOMENT.joue,
    });
    expect(momentDeLEquipe({ phase: 'souffle' })).toMatchObject({
      etat: 'souffle',
      texte: 'Le voile avance.',
    });
  });

  test('l’élève qui regarde ce tour lit son message, pas « Votre tour est joué »', () => {
    expect(momentDeLEquipe({ phase: 'jeu', spectateur: true })).toMatchObject({
      etat: 'joue',
      spectateur: true,
      texte: MESSAGE_SPECTATEUR,
    });
  });

  test('tour terminé : les défis de la Trame restent en puce', () => {
    const maintenant = maintenantVousPouvez({ perms: {}, phase: 'clos' });
    const moment = momentDeLEquipe({ maintenant, phase: 'clos' });
    expect(moment.etat).toBe('clos');
    expect(moment.puces.map((p) => p.geste)).toEqual(['trame']);
    expect(moment.puces[0].libelle).toBe('Défis de la Trame');
  });

  test('défis éteints : aucune puce', () => {
    const maintenant = maintenantVousPouvez({ perms: {}, phase: 'clos', defis: false });
    expect(momentDeLEquipe({ maintenant, phase: 'clos' }).puces).toEqual([]);
  });

  test('au camp : « Ce qui change » passe devant le tour terminé', () => {
    expect(momentDeLEquipe({ phase: 'clos', partieFinie: true }).etat).toBe('camp');
    expect(momentDeLEquipe({ phase: null, partieFinie: true }).etat).toBe('camp');
  });

  test('une page à faire tenir hors du tour reste le gros bouton, la Trame en puce', () => {
    const maintenant = maintenantVousPouvez({
      perms: { tenir: true },
      phase: 'clos',
      pagesATenir: 2,
    });
    const moment = momentDeLEquipe({ maintenant, phase: 'clos' });
    expect(moment).toMatchObject({ etat: 'geste', geste: 'lire', role: 'Secrétaire' });
    expect(moment.detail).toBe('2 pages à lire et à faire tenir');
    expect(moment.puces.map((p) => p.geste)).toEqual(['trame']);
  });
});

describe('aucunGesteDuTour', () => {
  test('ni jet ni fouille', () => {
    expect(aucunGesteDuTour()).toBe(true);
    expect(aucunGesteDuTour({ aLance: true })).toBe(false);
    expect(aucunGesteDuTour({ fouilles: { restantes: 3, quota: 3 } })).toBe(true);
    expect(aucunGesteDuTour({ fouilles: { restantes: 2, quota: 3 } })).toBe(false);
  });
});

describe('retourDuMoment', () => {
  test('rien à dire sans verdict ni retour de case', () => {
    expect(retourDuMoment()).toBeNull();
    expect(retourDuMoment({ verdict: { verdict: 'inconnu', at: 1 } })).toBeNull();
  });

  test('fouille : le texte du verdict', () => {
    expect(retourDuMoment({ verdict: { verdict: 'chaud', at: 42 } })).toEqual({
      cle: 'chasse:42',
      origine: 'chasse',
      verdict: 'chaud',
      texte: 'Chaud : la page est tout près.',
      piste: null,
    });
  });

  test('une fouille qui ouvre une question n’est pas un retour', () => {
    expect(retourDuMoment({ verdict: { verdict: 'zone', at: 42 } })).toBeNull();
  });

  test('réponse à une question de page : le retour du serveur et sa piste', () => {
    const piste = {
      texte: 'La réponse se lit sur la fiche du fennec.',
      type: 'fiche',
      code: 'fennec',
    };
    const retour = retourDuMoment({
      verdict: {
        verdict: 'pas_encore',
        feedback: 'Pas encore… Regardez ses oreilles.',
        piste,
        at: 7,
      },
    });
    expect(retour).toMatchObject({
      verdict: 'pas_encore',
      texte: 'Pas encore… Regardez ses oreilles.',
      piste,
    });
  });

  test('question de case : son retour, daté', () => {
    expect(retourDuMoment({ caseRetour: { texte: 'Bien vu.', at: 5 } })).toEqual({
      cle: 'case:5',
      origine: 'case',
      verdict: null,
      texte: 'Bien vu.',
      piste: null,
    });
  });

  test('deux retours de case au même instant gardent chacun leur clé', () => {
    const un = retourDuMoment({ caseRetour: { texte: 'Bien vu.', at: 5, id: 1 } });
    const deux = retourDuMoment({ caseRetour: { texte: 'Bien vu.', at: 5, id: 2 } });
    expect(un.cle).toBe('case:1');
    expect(deux.cle).not.toBe(un.cle);
  });

  test('le plus récent des deux', () => {
    const verdict = { verdict: 'froid', at: 10 };
    expect(retourDuMoment({ verdict, caseRetour: { texte: 'Bien vu.', at: 20 } }).origine).toBe(
      'case',
    );
    expect(retourDuMoment({ verdict, caseRetour: { texte: 'Bien vu.', at: 5 } }).origine).toBe(
      'chasse',
    );
  });
});

describe('bandeauxDuMoment', () => {
  test('aucun bandeau quand rien n’est vrai', () => {
    expect(bandeauxDuMoment()).toEqual([]);
  });

  test('seulement ceux qui sont vrais, avec leurs repères de test', () => {
    const lignes = bandeauxDuMoment({
      etatPerime: 'L’équipe a déjà joué ce geste. Voici où vous en êtes.',
      encordeePar: { name: 'Gnomes A' },
      unDe: true,
      desProchainJet: 1,
      enRetrait: true,
      sousVoile: true,
    });
    expect(lignes.map((l) => l.testId)).toEqual([
      'gl-tenir-etat-perime',
      'gl-tenir-encorde',
      'gl-tenir-un-de',
      'gl-tenir-en-retrait',
      'gl-tenir-sous-voile',
    ]);
    expect(lignes[1].fort).toBe('L’équipe Gnomes A vous encorde.');
    expect(lignes[2].texte).toBe('Ce tour-ci : un seul dé.');
  });

  test('le seul dé se dit au futur tant qu’il n’est pas dû', () => {
    expect(bandeauxDuMoment({ unDe: true, desProchainJet: 2 })[0].texte).toBe(
      'Au prochain tour : un seul dé.',
    );
  });
});

describe('estSousVoile', () => {
  test('la chasse fait foi ; sinon, les rangs', () => {
    expect(estSousVoile({ fouilles: { sousVoile: true } })).toBe(true);
    expect(estSousVoile({ fouilles: { sousVoile: false }, pathIndex: 1, voilePosition: 5 })).toBe(
      false,
    );
    expect(estSousVoile({ pathIndex: 3, voilePosition: 3 })).toBe(true);
    expect(estSousVoile({ pathIndex: 4, voilePosition: 3 })).toBe(false);
    // Voile pas encore sur le plateau (-1), ou rang inconnu.
    expect(estSousVoile({ pathIndex: 0, voilePosition: -1 })).toBe(false);
    expect(estSousVoile({ voilePosition: 3 })).toBe(false);
  });
});

describe('casesEnPastilles', () => {
  test('numéro humain, pictogramme et libellé court', () => {
    const pastilles = casesEnPastilles([
      { index: 4, label: 'Le gué', eventType: 'question', tonalite: null },
      { index: 5, label: null, eventType: 'event', tonalite: 'trame' },
      {
        index: 6,
        label: 'La très longue clairière des fougères arborescentes',
        eventType: 'story',
      },
      { index: 7, eventType: 'inconnu' },
    ]);
    expect(pastilles[0]).toMatchObject({ numero: 5, icone: '❓', libelle: 'Le gué' });
    // La tonalité prime sur le type ; sans libellé, le mot du type.
    expect(pastilles[1]).toMatchObject({ numero: 6, icone: '🧵', libelle: 'Trame' });
    expect(pastilles[2].libelle.length).toBeLessThanOrEqual(LIBELLE_DE_CASE_MAX);
    expect(pastilles[2].libelle.endsWith('…')).toBe(true);
    expect(pastilles[2].complet).toBe('La très longue clairière des fougères arborescentes');
    expect(pastilles[3]).toMatchObject({ numero: 8, libelle: 'Étape' });
  });

  test('rien à venir', () => {
    expect(casesEnPastilles()).toEqual([]);
    expect(casesEnPastilles(null)).toEqual([]);
  });
});

describe('boursesDeLEquipe', () => {
  test('pseudo coupé à douze caractères, gemmes servies', () => {
    const bourses = boursesDeLEquipe([
      { playerId: 10, pseudo: 'joueur-a', powerPoints: 4 },
      { playerId: 11, pseudo: 'joueur-au-nom-long', powerPoints: 0 },
      { playerId: 12, firstName: 'Élève', lastName: 'Test' },
    ]);
    expect(bourses[0]).toEqual({ id: 10, nom: 'joueur-a', complet: 'joueur-a', gemmes: 4 });
    expect(bourses[1].nom.length).toBeLessThanOrEqual(PSEUDO_MAX);
    expect(bourses[1].gemmes).toBe(0);
    // Solde tu par le serveur : la pastille ne porte que le nom.
    expect(bourses[2]).toMatchObject({ nom: 'Élève Test', gemmes: null });
  });
});

describe('empreinteDuTiroir', () => {
  const carnet = {
    pages: [
      { zoneKey: 'z1', etat: 'endormie' },
      { zoneKey: 'z2', etat: 'trouvee' },
    ],
  };
  test('stable tant que rien ne change', () => {
    expect(empreinteDuTiroir({ carnet, reserve: { power: 2 }, absents: [12, 11] })).toBe(
      empreinteDuTiroir({ carnet: { ...carnet }, reserve: { power: 2 }, absents: [11, 12] }),
    );
  });
  test('change avec une page, la réserve, un absent ou un défi', () => {
    const base = empreinteDuTiroir({ carnet, reserve: { power: 2 } });
    const tenue = { pages: [carnet.pages[0], { zoneKey: 'z2', etat: 'tenue' }] };
    expect(empreinteDuTiroir({ carnet: tenue, reserve: { power: 2 } })).not.toBe(base);
    expect(empreinteDuTiroir({ carnet, reserve: { power: 3 } })).not.toBe(base);
    expect(empreinteDuTiroir({ carnet, reserve: { power: 2 }, absents: [11] })).not.toBe(base);
    expect(empreinteDuTiroir({ carnet, reserve: { power: 2 }, defis: 1 })).not.toBe(base);
  });
});

describe('textes de la carte du moment : garde-fous', () => {
  test('aucun mot interdit dans ce que la carte dit à l’équipe', () => {
    const textes = [
      ...Object.values(TEXTES_DU_MOMENT),
      ...bandeauxDuMoment({
        encordeePar: { name: 'Gnomes A' },
        unDe: true,
        desProchainJet: 1,
        enRetrait: true,
        sousVoile: true,
      }).flatMap((l) => [l.fort, l.texte]),
      ...bandeauxDuMoment({ unDe: true }).map((l) => l.texte),
      ...['froid', 'tiede', 'chaud', 'deja_trouvee', 'palie', 'page_trouvee', 'pas_encore'].map(
        (verdict) => retourDuMoment({ verdict: { verdict, at: 1 } }).texte,
      ),
      ...[
        momentDeLEquipe({ maintenant: gestesOuverts(), phase: 'jeu', fouillesRestantes: 1 }),
        momentDeLEquipe({
          maintenant: gestesOuverts({ questionDue: false, des: 1 }),
          des: 1,
          phase: 'jeu',
        }),
        momentDeLEquipe({
          maintenant: maintenantVousPouvez({ perms: {}, phase: 'clos' }),
          phase: 'clos',
        }),
      ].flatMap((m) => [
        m.libelle,
        m.detail,
        ...m.puces.flatMap((p) => [p.libelle, p.court, p.detail]),
      ]),
      ...casesEnPastilles(
        [
          'start',
          'question',
          'event',
          'souffle',
          'trame',
          'challenge',
          'shortcut',
          'frontier',
          'finish',
          'story',
          'narration',
          'point',
        ].map((eventType, index) => ({ index, eventType })),
      ).map((c) => c.libelle),
    ].filter(Boolean);
    expect(textes.length).toBeGreaterThan(30);
    for (const texte of textes) expect(findForbiddenString(texte), texte).toBeNull();
  });
});
