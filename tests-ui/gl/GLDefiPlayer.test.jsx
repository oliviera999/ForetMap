import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  getGlToken: () => 'jeton',
}));

import { GLDefiPlayer } from '../../src/gl/components/defis/GLDefiPlayer.jsx';
import { GLDefisView } from '../../src/gl/components/defis/GLDefisView.jsx';

const cartes = [
  { code: 'P', nom: 'Herbe', role: 'producteur' },
  { code: 'H', nom: 'Zèbre', role: 'consommateur' },
  { code: 'C', nom: 'Lion', role: 'consommateur' },
];
const retisser = (extra = {}) => ({
  id: 4,
  type: 'retisser',
  libelle: 'Retisser',
  unite: 'savane:5',
  mode: 'individuel',
  statut: 'en_cours',
  revision: 0,
  indices: 0,
  titre: 'Savane',
  niveau: 5,
  cartes,
  fleches: [],
  trouvees: 0,
  positions: {},
  complet: false,
  critere: 'Chaque animal a trouvé quelque chose à manger.',
  ...extra,
});

function erreur(status, body) {
  const err = new Error(body.error || 'erreur');
  err.status = status;
  err.body = body;
  return err;
}

describe('GLDefiPlayer — un défi de la Trame à l’écran', () => {
  beforeEach(() => {
    // Accolades : `mockReset()` renvoie le mock, que vitest prendrait pour un nettoyage.
    apiGlMock.mockReset();
  });

  test('Retisser : le geste s’affiche tout de suite, part avec la révision, et le classement revient du serveur', async () => {
    const posee = { de: 'P', vers: 'H', classement: 'trouvee', message: 'Lien trouvé.' };
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (method === 'POST' && path.endsWith('/defis')) return { defi: retisser() };
      if (method === 'PUT') {
        return {
          defi: retisser({ revision: body.revision + 1, fleches: [posee], trouvees: 1 }),
          reussite: null,
        };
      }
      return {};
    });
    render(<GLDefiPlayer gameId={7} cible={{ type: 'retisser', unite: 'savane:5' }} />);
    await waitFor(() => screen.getByTestId('gl-trame-board'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis', 'POST', {
      type: 'retisser',
      unite: 'savane:5',
    });
    expect(screen.getByText(/Savane · 5 cartes|Retisser — Savane · 5 cartes/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('gl-trame-carte-P'));
    fireEvent.click(screen.getByTestId('gl-trame-carte-H'));
    // Tout de suite : la flèche est là, pas encore classée.
    expect(document.querySelectorAll('line.gl-trame-trait')).toHaveLength(0);
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis/4', 'PUT', {
        revision: 0,
        etat: { fleches: [{ de: 'P', vers: 'H' }], positions: {} },
      }),
    );
    await waitFor(() => expect(screen.getByTestId('gl-trame-trouvees').textContent).toContain('1'));
    expect(document.querySelectorAll('line.is-trouvee')).toHaveLength(1);
  });

  test('révision dépassée : le défi est rechargé et l’élève en est prévenu', async () => {
    apiGlMock.mockImplementation(async (path, method) => {
      if (method === 'POST' && path.endsWith('/defis')) return { defi: retisser() };
      if (method === 'PUT')
        throw erreur(409, { code: 'edit_conflict', error: 'modifié', revision: 3 });
      return {
        defi: retisser({
          revision: 3,
          fleches: [{ de: 'H', vers: 'C', classement: 'trouvee', message: 'Lien trouvé.' }],
        }),
      };
    });
    render(<GLDefiPlayer gameId={7} cible={{ type: 'retisser', unite: 'savane:5' }} />);
    await waitFor(() => screen.getByTestId('gl-trame-board'));
    fireEvent.click(screen.getByTestId('gl-trame-carte-P'));
    fireEvent.click(screen.getByTestId('gl-trame-carte-H'));
    await waitFor(() => screen.getByText(/modifié sur un autre appareil/));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis/4');
    expect(
      screen.getByRole('button', {
        name: 'Retirer la flèche de la carte « Zèbre » vers la carte « Lion »',
      }),
    ).toBeTruthy();
  });

  test('indice gratuit, puis réussite : « Défi réussi », la page de veillée, jamais de ressource annoncée', async () => {
    const onReussi = vi.fn();
    apiGlMock.mockImplementation(async (path, method) => {
      if (method === 'POST' && path.endsWith('/indice')) {
        return {
          indice: {
            rang: 3,
            genre: 'revelation',
            lien: { de: 'H', vers: 'C' },
            message: 'Un lien à tracer.',
          },
          indices: 4,
        };
      }
      if (method === 'POST') return { defi: retisser() };
      return {
        defi: retisser({ statut: 'reussi', complet: true, revision: 1 }),
        reussite: { premiere: true, page: true, pagesEpuisees: false, message: null },
      };
    });
    render(
      <GLDefiPlayer
        gameId={7}
        cible={{ type: 'retisser', unite: 'savane:5' }}
        onReussi={onReussi}
      />,
    );
    await waitFor(() => screen.getByTestId('gl-trame-board'));
    fireEvent.click(screen.getByTestId('gl-defi-indice'));
    await waitFor(() => screen.getByTestId('gl-defi-indice-texte'));
    expect(document.querySelectorAll('line.is-suggestion')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('gl-trame-carte-H'));
    fireEvent.click(screen.getByTestId('gl-trame-carte-C'));
    await waitFor(() => screen.getByTestId('gl-defi-reussi'));
    const texte = screen.getByTestId('gl-defi-reussi').textContent;
    expect(texte).toContain('Une page de veillée rejoint ton carnet.');
    expect(texte).not.toMatch(/gemme|cœur|point/i);
    expect(onReussi).toHaveBeenCalled();
  });

  test('La trame altérée : une prédiction par carte, « Vérifier », « Pas encore » sans la réponse', async () => {
    const alteree = (extra = {}) => ({
      id: 5,
      type: 'alteree',
      libelle: 'La trame altérée',
      unite: 'savane:C',
      mode: 'individuel',
      statut: 'en_cours',
      revision: 0,
      titre: 'Savane',
      cartes,
      liens: [
        { de: 'P', vers: 'H' },
        { de: 'H', vers: 'C' },
      ],
      retiree: 'C',
      predictions: {},
      verification: null,
      complet: false,
      ...extra,
    });
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (method === 'POST') return { defi: alteree() };
      return {
        defi: alteree({
          revision: body.revision + 1,
          predictions: body.etat.predictions,
          verification: body.etat.verifie
            ? [
                { code: 'P', juste: false, message: 'Pas encore.' },
                {
                  code: 'H',
                  juste: true,
                  message: '« Lion » ne mange plus « Zèbre » : il y en a davantage.',
                },
              ]
            : null,
        }),
        reussite: null,
      };
    });
    render(<GLDefiPlayer gameId={7} cible={{ type: 'alteree', unite: 'savane:C' }} />);
    await waitFor(() => screen.getByTestId('gl-trame-board'));
    expect(screen.getByTestId('gl-trame-verifier').disabled).toBe(true);
    // Le sens des quatre boutons est écrit en toutes lettres.
    expect(screen.getByTestId('gl-trame-prediction-legende').textContent).toMatch(
      /il y en a plus.*il y en a moins.*il n’y en a plus.*pas de changement/,
    );
    expect(screen.getByText('carte retirée')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gl-trame-prediction-P-rien'));
    fireEvent.click(screen.getByTestId('gl-trame-prediction-H-augmente'));
    expect(screen.getByTestId('gl-trame-prediction-H-augmente').getAttribute('aria-checked')).toBe(
      'true',
    );
    await waitFor(() => expect(screen.getByTestId('gl-trame-verifier').disabled).toBe(false));
    fireEvent.click(screen.getByTestId('gl-trame-verifier'));
    await waitFor(() => screen.getByTestId('gl-trame-retour-P'));
    expect(screen.getByTestId('gl-trame-retour-P').textContent).toContain('Pas encore.');
    expect(screen.getByTestId('gl-trame-retour-H').textContent).toContain('il y en a davantage');
    const dernier = apiGlMock.mock.calls.filter((c) => c[1] === 'PUT').at(-1);
    expect(dernier[2].etat).toEqual({ predictions: { P: 'rien', H: 'augmente' }, verifie: true });
  });

  test('Réparer : trois colonnes, la leçon après le rangement, les mesures après la leçon', async () => {
    const reparer = (extra = {}) => ({
      id: 6,
      type: 'reparer',
      libelle: 'Réparer la trame',
      unite: 'p1',
      mode: 'individuel',
      statut: 'en_cours',
      revision: 0,
      titre: 'Réparer la trame',
      aClasser: [
        { code: 'G', nom: 'Gorille' },
        { code: 'Z', nom: 'Zèbre' },
      ],
      categories: ['en_danger', 'fragile', 'pas_menace'],
      rangement: {},
      rangementVerifie: null,
      rangementComplet: false,
      lecon: null,
      leconLue: false,
      especes: [],
      mesures: [],
      choix: {},
      mesuresVerifiees: null,
      requises: 2,
      pourquoi: '',
      complet: false,
      ...extra,
    });
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (method === 'POST') return { defi: reparer() };
      const range = Object.keys(body.etat.rangement || {}).length === 2;
      return {
        defi: reparer({
          revision: body.revision + 1,
          rangement: body.etat.rangement,
          leconLue: body.etat.leconLue === true,
          choix: body.etat.mesures || {},
          rangementComplet: range,
          lecon: range ? 'Sous les tropiques, beaucoup d’espèces sont en danger.' : null,
          especes: range
            ? [{ code: 'G', nom: 'Gorille', menace: 'La forêt est coupée.', signalee: true }]
            : [],
          mesures: range ? [{ code: 'M1', texte: 'Créer une aire protégée' }] : [],
        }),
        reussite: null,
      };
    });
    render(<GLDefiPlayer gameId={7} cible={{ type: 'reparer', unite: 'p1' }} />);
    await waitFor(() => screen.getByTestId('gl-trame-ranger-G-en_danger'));
    expect(screen.queryByTestId('gl-trame-lecon')).toBeNull();
    fireEvent.click(screen.getByTestId('gl-trame-ranger-G-en_danger'));
    expect(screen.getByTestId('gl-trame-range-G')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gl-trame-ranger-Z-pas_menace'));
    await waitFor(() => screen.getByTestId('gl-trame-lecon'));
    expect(screen.queryByTestId('gl-trame-mesures')).toBeNull();
    fireEvent.click(screen.getByTestId('gl-trame-lecon-lue'));
    await waitFor(() => screen.getByTestId('gl-trame-mesures'));
    expect(screen.getByText(/signalée par une Licorne/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('gl-trame-mesure-G-M1'));
    await waitFor(() => {
      const dernier = apiGlMock.mock.calls.filter((c) => c[1] === 'PUT').at(-1);
      expect(dernier[2].etat.mesures).toEqual({ G: ['M1'] });
    });
  });
});

describe('GLDefisView — entrée « Défis »', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  const liste = {
    actifs: true,
    mode: 'individuel',
    tourOuvert: false,
    types: [{ type: 'retisser', libelle: 'Retisser' }],
    defis: [
      {
        type: 'retisser',
        unite: 'savane:5',
        biomeNom: 'Savane',
        niveau: 5,
        disponible: true,
        statut: 'reussi',
        defiId: 4,
      },
      {
        type: 'retisser',
        unite: 'savane:7',
        biomeNom: 'Savane',
        niveau: 7,
        disponible: true,
        statut: null,
        defiId: null,
      },
      {
        type: 'retisser',
        unite: 'savane:9',
        biomeNom: 'Savane',
        niveau: 9,
        disponible: false,
        statut: null,
        defiId: null,
      },
    ],
    pages: { utilisees: 1, plafond: 2 },
    aReparer: [{ code: 'SP1', nom: 'Gorille' }],
  };

  test('les défis de son peuple, le niveau suivant fermé, le compteur de pages, sans total ni rang', async () => {
    apiGlMock.mockResolvedValue(liste);
    render(<GLDefisView gameId={7} />);
    await waitFor(() => screen.getByTestId('gl-defis'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis');
    expect(screen.getByTestId('gl-defi-ouvrir-retisser-savane:7').disabled).toBe(false);
    expect(screen.getByTestId('gl-defi-ouvrir-retisser-savane:9').disabled).toBe(true);
    expect(screen.getByTestId('gl-defis-pages').textContent).toMatch(/1 sur\s+2/);
    expect(screen.getByTestId('gl-defis-a-reparer').textContent).toContain('Gorille');
    expect(screen.getByTestId('gl-defis').textContent).not.toMatch(/classement|rang|score/i);
    apiGlMock.mockResolvedValue({ defi: retisser({ unite: 'savane:7', niveau: 7 }) });
    fireEvent.click(screen.getByTestId('gl-defi-ouvrir-retisser-savane:7'));
    await waitFor(() => screen.getByTestId('gl-defi'));
    fireEvent.click(screen.getByRole('button', { name: 'Retour aux défis' }));
    expect(screen.queryByTestId('gl-defi')).toBeNull();
  });

  test('équipe pendant un tour : les défis attendent ; partie hors « Tenir » ou défis fermés : un mot, sans erreur', async () => {
    apiGlMock.mockResolvedValue({
      ...liste,
      mode: 'equipe',
      tourOuvert: true,
      pages: { utilisees: null, plafond: 2 },
    });
    const { unmount } = render(<GLDefisView gameId={7} />);
    await waitFor(() => screen.getByTestId('gl-defis-attendre'));
    expect(screen.getByTestId('gl-defi-ouvrir-retisser-savane:7').disabled).toBe(true);
    expect(screen.queryByTestId('gl-defis-pages')).toBeNull();
    unmount();
    apiGlMock.mockRejectedValue(erreur(409, { code: 'TENIR_DISABLED', error: 'pas tenir' }));
    render(<GLDefisView gameId={7} />);
    await waitFor(() => screen.getByTestId('gl-defis-fermes'));
    expect(document.querySelector('.gl-error-banner')).toBeNull();
  });

  test('le prof lance pour une équipe : la liste et le défi portent son teamId', async () => {
    apiGlMock.mockResolvedValue({ ...liste, mode: 'equipe', tourOuvert: true });
    render(<GLDefisView gameId={7} teamId={12} />);
    await waitFor(() => screen.getByTestId('gl-defis'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis?teamId=12');
    // Le prof n'attend pas la fin du tour.
    expect(screen.queryByTestId('gl-defis-attendre')).toBeNull();
    apiGlMock.mockResolvedValue({ defi: retisser({ mode: 'equipe' }) });
    fireEvent.click(screen.getByTestId('gl-defi-ouvrir-retisser-savane:7'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis', 'POST', {
        type: 'retisser',
        unite: 'savane:7',
        teamId: 12,
      }),
    );
  });
});

// Ensemble unifié (M21) : « Le bon rôle », « Le bon pays », « Les fils de l'adaptation ».
const ranger = (extra = {}) => ({
  id: 9,
  type: 'ranger',
  libelle: 'Le bon rôle',
  consigne: 'Range chaque être vivant selon son rôle dans la Trame.',
  unite: 'role:savane',
  mode: 'individuel',
  statut: 'en_cours',
  revision: 0,
  indices: 0,
  titre: 'Le bon rôle · Savane',
  niveau: null,
  famille: 'role',
  cartes: [
    { code: 'SP1', nom: 'Herbe à éléphant', indice: null, generique: false },
    { code: 'SP2', nom: 'Zèbre des plaines', indice: null, generique: false },
  ],
  categories: [
    { code: 'producteur', nom: 'Producteur', aide: 'fabrique sa matière avec la lumière' },
    { code: 'consommateur', nom: 'Consommateur', aide: null },
  ],
  rangement: {},
  rangementVerifie: [],
  complet: false,
  bilan: null,
  ...extra,
});

describe('GLDefiPlayer — ranger et fils de l’adaptation', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('Le bon rôle : la consigne du catalogue, « Pas encore. » sans la réponse, le pourquoi, puis le bilan', async () => {
    const reponses = [
      ranger({
        revision: 1,
        rangement: { SP1: 'consommateur' },
        rangementVerifie: [{ code: 'SP1', juste: false, message: 'Pas encore.' }],
      }),
      ranger({
        revision: 2,
        statut: 'reussi',
        complet: true,
        rangement: { SP1: 'producteur', SP2: 'consommateur' },
        rangementVerifie: [
          { code: 'SP1', juste: true, message: 'Elle fabrique sa matière avec la lumière.' },
          { code: 'SP2', juste: true, message: 'Il broute l’herbe.' },
        ],
        bilan: 'Sans producteurs, personne ne mange.',
      }),
    ];
    const envois = [];
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (method === 'POST' && path.endsWith('/defis')) return { defi: ranger() };
      if (method === 'PUT') {
        envois.push(body);
        const defi = reponses.shift();
        return { defi, reussite: defi.statut === 'reussi' ? { premiere: true, page: true } : null };
      }
      return {};
    });
    render(<GLDefiPlayer gameId={7} cible={{ type: 'ranger', unite: 'role:savane' }} />);
    await waitFor(() => screen.getByTestId('gl-trame-ranger-SP1-producteur'));
    // Le titre du catalogue seul (il porte déjà le nom du défi), et sa consigne.
    expect(screen.getByRole('heading', { level: 4 }).textContent).toBe('Le bon rôle · Savane');
    expect(screen.getByText('Range chaque être vivant selon son rôle dans la Trame.')).toBeTruthy();
    expect(screen.getByText('fabrique sa matière avec la lumière')).toBeTruthy();
    expect(screen.queryByTestId('gl-trame-bilan')).toBeNull();

    fireEvent.click(screen.getByTestId('gl-trame-ranger-SP1-consommateur'));
    await waitFor(() => screen.getByTestId('gl-trame-retour-SP1'));
    expect(envois[0]).toEqual({ revision: 0, etat: { rangement: { SP1: 'consommateur' } } });
    expect(screen.getByTestId('gl-trame-retour-SP1').textContent).toContain('Pas encore.');
    expect(screen.getByTestId('gl-defi').textContent).not.toMatch(/faux|raté|Non[ ,.]/);

    // Un nouveau geste efface le retour de l'ancienne colonne tant que le serveur n'a pas relu.
    fireEvent.click(screen.getByTestId('gl-trame-ranger-SP1-producteur'));
    expect(screen.queryByTestId('gl-trame-retour-SP1')).toBeNull();
    fireEvent.click(screen.getByTestId('gl-trame-ranger-SP2-consommateur'));
    await waitFor(() => screen.getByTestId('gl-defi-reussi'));
    expect(envois[1].etat).toEqual({ rangement: { SP1: 'producteur', SP2: 'consommateur' } });
    expect(screen.getByTestId('gl-trame-retour-SP1').textContent).toContain(
      'Elle fabrique sa matière avec la lumière.',
    );
    expect(screen.getByTestId('gl-trame-bilan').textContent).toBe(
      'Sans producteurs, personne ne mange.',
    );
    expect(screen.getByTestId('gl-trame-ranger-SP1-producteur').disabled).toBe(true);
    expect(screen.getByTestId('gl-defi-reussi').textContent).not.toMatch(/gemme|cœur/i);
  });

  test('Le bon pays : l’indice de chaque carte est à l’écran', async () => {
    apiGlMock.mockResolvedValue({
      defi: ranger({
        libelle: 'Le bon pays',
        titre: 'Le bon pays',
        unite: 'pays:p1',
        famille: 'pays',
        consigne: 'Lis l’indice de chaque carte, puis range-la dans le pays où elle vit.',
        cartes: [{ code: 'SP1', nom: 'Okapi', indice: 'Vit seul et discret.', generique: false }],
        categories: [
          { code: 'jungle_afc', nom: 'Jungle d’Afrique centrale', aide: null },
          { code: 'savane', nom: 'Savane tropicale', aide: null },
        ],
      }),
    });
    render(<GLDefiPlayer gameId={7} cible={{ type: 'ranger', unite: 'pays:p1' }} />);
    await waitFor(() => screen.getByTestId('gl-trame-indice-SP1'));
    expect(screen.getByTestId('gl-trame-indice-SP1').textContent).toContain('Vit seul et discret.');
    expect(screen.getByTestId('gl-trame-ranger-SP1-savane').textContent).toBe('Savane tropicale');
  });

  test('Les fils de l’adaptation : le plateau de flèches, la consigne et le critère du catalogue', async () => {
    apiGlMock.mockResolvedValue({
      defi: {
        ...retisser(),
        type: 'adaptation',
        libelle: 'Les fils de l’adaptation',
        titre: "Les fils de l'adaptation · Savane",
        unite: 'adaptation:savane',
        niveau: null,
        consigne: 'Relie chaque contrainte du milieu au problème qu’elle pose.',
        critere: 'Chaque contrainte du milieu mène à son problème.',
        cartes: [
          { code: 'A', nom: 'La saison sèche dure', role: 'fil' },
          { code: 'B', nom: 'Il faut trouver de l’eau', role: 'fil' },
        ],
      },
    });
    render(<GLDefiPlayer gameId={7} cible={{ type: 'adaptation', unite: 'adaptation:savane' }} />);
    await waitFor(() => screen.getByTestId('gl-trame-board'));
    expect(screen.getByRole('heading', { level: 4 }).textContent).toBe(
      "Les fils de l'adaptation · Savane",
    );
    expect(
      screen.getByText('Relie chaque contrainte du milieu au problème qu’elle pose.'),
    ).toBeTruthy();
    expect(screen.getByText(/Pour finir : Chaque contrainte du milieu/)).toBeTruthy();
  });

  test('liste : « ranger » se range en deux rubriques, une par famille', async () => {
    apiGlMock.mockResolvedValue({
      actifs: true,
      mode: 'individuel',
      tourOuvert: false,
      pages: { utilisees: 0, plafond: 4 },
      types: [
        { type: 'ranger', famille: 'role', libelle: 'Le bon rôle' },
        { type: 'ranger', famille: 'pays', libelle: 'Le bon pays' },
        { type: 'adaptation', libelle: 'Les fils de l’adaptation' },
      ],
      defis: [
        {
          type: 'ranger',
          famille: 'role',
          unite: 'role:savane',
          titre: 'Le bon rôle · Savane',
          plateau: 1,
          disponible: true,
          statut: null,
        },
        {
          type: 'ranger',
          famille: 'pays',
          unite: 'pays:p1',
          titre: 'Le bon pays',
          plateau: 1,
          disponible: true,
          statut: 'reussi',
        },
        {
          type: 'adaptation',
          unite: 'adaptation:savane',
          titre: "Les fils de l'adaptation · Savane",
          plateau: 1,
          disponible: true,
          statut: null,
        },
      ],
      aReparer: [],
    });
    render(<GLDefisView gameId={7} />);
    await waitFor(() => screen.getByTestId('gl-defis'));
    const role = document.querySelector('[data-type="ranger"][data-famille="role"]');
    const pays = document.querySelector('[data-type="ranger"][data-famille="pays"]');
    expect(role.querySelector('h5').textContent).toBe('Le bon rôle');
    expect(role.querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByTestId('gl-defi-ouvrir-ranger-role:savane').textContent).toBe('Savane');
    expect(pays.querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByTestId('gl-defi-ouvrir-ranger-pays:p1').textContent).toContain('Plateau 1');
    expect(screen.getByTestId('gl-defi-ouvrir-adaptation-adaptation:savane').textContent).toBe(
      'Savane',
    );
  });
});
