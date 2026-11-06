import { describe, test, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GLTenirEquipeView } from '../../src/gl/components/tenir/GLTenirEquipeView.jsx';
import { GLCarnetClasseView } from '../../src/gl/components/tenir/GLCarnetClasseView.jsx';
import { GLPeripetieOverlay } from '../../src/gl/components/tenir/GLPeripetieOverlay.jsx';
import { GLChasseLayer } from '../../src/gl/components/tenir/GLChasseLayer.jsx';
import { GLVoileLayer } from '../../src/gl/components/tenir/GLVoileLayer.jsx';
import { GLTenirQuestionCard } from '../../src/gl/components/tenir/GLTenirQuestionCard.jsx';
import { GLOluBulle } from '../../src/gl/components/tenir/GLOluBulle.jsx';
import { TENIR_OLU_FALLBACK, TENIR_VERDICT_TEXTES } from '../../src/gl/constants/tenirTextes.js';
import {
  FENETRE_LABELS,
  GLSpellCastEffectParams,
} from '../../src/gl/components/spell-cast/GLSpellCastEffectParams.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn().mockResolvedValue({ round: null, lignes: [], moments: {}, chimeres: [] }),
  getGlToken: () => 'tok',
}));

/** Spec § 2 : jamais visible côté élève (identifiant technique `kraa` toléré dans le code). */
const FORBIDDEN =
  /monstre|ennemi|attaque|poursui|corbeau|Krâ|Kraa|Grise|\bfaux\b|raté|perdu|classement/;

const gameState = {
  game: { id: 7, status: 'live' },
  teams: [
    { id: 2, name: 'Licornes A', type: 'unicorn' },
    { id: 3, name: 'Gnomes A', type: 'gnome' },
  ],
  roster: [{ playerId: 10, teamId: 2, pseudo: 'joueur-a', healthPoints: 3, powerPoints: 4 }],
  events: [
    {
      id: 1,
      eventType: 'fouille',
      teamId: 2,
      payload: { verdict: 'chaud' },
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      eventType: 'peripetie',
      teamId: 2,
      payload: { id: 'per-1', texte: 'Une mangouste a volé le dé. On relance.' },
      createdAt: new Date().toISOString(),
    },
  ],
};

const tenir = {
  enabled: true,
  surface: 'tablette',
  settings: { des_count: 2, des_mode_effectif: 'serveur' },
  round: { number: 2, phase: 'jeu' },
  permissions: { jeter: true, lancer: true, repondre: true, fouiller: true, lire: true },
  enRetrait: true,
  plume: true,
};

const chasse = {
  carnet: {
    total: 2,
    tenues: 1,
    trouvees: 2,
    pages: [
      {
        zoneKey: 'z1',
        indice: 'Là où le vent se pose',
        etat: 'palie',
        trouveePar: null,
        tenuePar: null,
        palissementPct: 20,
        contour: { x: 0.2, y: 0.3 },
      },
      {
        zoneKey: 'z2',
        indice: 'Sous la pierre',
        titre: 'La page du ruisseau',
        etat: 'tenue',
        trouveePar: { id: 2, name: 'Licornes A' },
        tenuePar: { id: 3, name: 'Gnomes A' },
        palissementPct: 0,
        contour: { x: 0.5, y: 0.5 },
      },
    ],
    empreintes: [{ id: 1, teamId: 2, x: 0.1, y: 0.2, verdict: 'froid' }],
    kraa: { x: 0.1, y: 0.2, etat: 'deja_trouvee', at: 'x' },
    fouilles: { quota: 0, utilisees: 0, restantes: 0, sousVoile: true },
    voilePosition: 3,
  },
  busy: false,
  error: '',
  page: {
    zoneKey: 'z2',
    etat: 'trouvee',
    peutTenir: true,
    palissementPct: 30,
    feuillet: { titre: 'La page du ruisseau', incipit: 'Le ruisseau compte.', texte: '…' },
    question: {
      questionCode: 'LECT-z2',
      question: 'Que compte le ruisseau ?',
      choices: [
        { id: 0, text: 'Ses pierres' },
        { id: 1, text: 'Ses poissons' },
      ],
    },
    feedback: 'Pas encore. Relis la première ligne.',
  },
  fouilleMode: true,
  setFouilleMode: vi.fn(),
  question: {
    zoneKey: 'z1',
    question: {
      questionCode: 'Q1',
      question: 'Quel animal gratte la terre ?',
      choices: [
        { id: 0, text: 'Le blaireau' },
        { id: 1, text: 'La carpe' },
      ],
    },
  },
  clearQuestion: vi.fn(),
  closePage: vi.fn(),
  dernierVerdict: { verdict: 'pas_encore', feedback: 'Pas encore : la page dort encore ici.' },
  fouiller: vi.fn(),
  repondre: vi.fn(),
  ouvrir: vi.fn(),
  tenir: vi.fn(),
};

describe('chaînes interdites côté élève (spec § 2)', () => {
  test('vue équipe, carnet, question, calques, péripétie, bulle d’Olu, paramètres de sort', () => {
    const { container } = render(
      <>
        <GLTenirEquipeView
          gameState={gameState}
          tenir={tenir}
          teamId={2}
          onReloadGame={vi.fn()}
          chasse={chasse}
        />
        <GLCarnetClasseView chasse={chasse} teamId={2} />
        <GLTenirQuestionCard
          question={chasse.question.question}
          feedback="Pas encore : la page dort encore ici."
        />
        <GLChasseLayer carnet={chasse.carnet} teams={gameState.teams} />
        <GLVoileLayer
          markers={[
            { id: 1, order_index: 0, x_pct: 10, y_pct: 10 },
            { id: 2, order_index: 1, x_pct: 20, y_pct: 10 },
          ]}
          position={1}
        />
        <GLPeripetieOverlay
          peripetie={{ id: 'p', texte: 'Une mangouste a volé le dé.' }}
          teamName="Licornes A"
          onPasser={vi.fn()}
        />
        <GLOluBulle
          line={{ texte: 'On tient.', expression: 'neutre', moment: 'voile' }}
          speakerName="OLU"
        />
        <GLSpellCastEffectParams
          spell={{
            tenir_v2: true,
            spell_code: 'SL045',
            peuple: 'pacte',
            ressource: 'pacte',
            cible: 'deux_equipes',
            fenetre: 'avant_jets_pacte',
            limite: { par: 'tour', n: 1, portee: 'partie' },
          }}
          teams={gameState.teams}
          teamId={3}
          teamType="gnome"
          value={{}}
          onChange={vi.fn()}
        />
      </>,
    );
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(container.querySelector('polygon')).toBeNull();
    // L'oiseau n'a ni nom ni texte ; le motif de retrait n'apparaît jamais.
    expect(container.querySelector('[data-testid="gl-kraa"]').textContent).toBe('');
    expect(container.textContent).not.toMatch(/motif/i);
  });

  test('textes de repli et libellés de fenêtre', () => {
    const all = [
      ...Object.values(TENIR_OLU_FALLBACK)
        .flat()
        .map((l) => l.texte),
      ...Object.values(TENIR_VERDICT_TEXTES),
      ...Object.values(FENETRE_LABELS),
    ].join(' ');
    expect(all).not.toMatch(FORBIDDEN);
  });
});
