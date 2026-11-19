import { Profiler, useState } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

/**
 * Audit des bugs G&L du 19/11/2026, E2 — studio de carte de chapitre.
 *
 * `GLChapterMapStudio.test.jsx` remplace l'éditeur d'évènement par un bouchon : la boucle de
 * rendu et les pertes de données passaient au travers. Ici le studio est monté avec ses VRAIS
 * éditeurs (formulaire du repère, évènement, effets, apparence) ; seuls le canevas de carte et
 * ses gestes — sans mise en page sous jsdom — sont remplacés.
 */

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

vi.mock('../../src/gl/hooks/useGLZoneMusic.js', () => ({
  useGLZoneMusic: () => ({ previewUrl: vi.fn(), stopAll: vi.fn() }),
}));

vi.mock('../../src/gl/hooks/useGlPctMapGestures.js', () => ({
  useGlPctMapGestures: () => ({
    containerRef: { current: null },
    imageRef: { current: null },
    toImagePct: (clientX, clientY) => ({ x: clientX, y: clientY }),
  }),
}));

vi.mock('../../src/gl/components/GLPctMapCanvas.jsx', () => ({
  GLPctMapCanvas: ({ children }) => <div data-testid="map-canvas">{children}</div>,
}));

vi.mock('../../src/gl/components/GLBoardMarkers.jsx', () => ({
  GLBoardMarkers: () => <div data-testid="board-markers" />,
}));

import { GLChapterMapStudio } from '../../src/gl/components/GLChapterMapStudio.jsx';
import {
  effectsDraftFromMarker,
  eventDraftFromMarker,
  toMarkerPayload,
} from '../../src/gl/utils/glChapterMapStudioForm.js';
import {
  buildEventConfigFromForm,
  formFromMarker,
} from '../../src/gl/utils/glMarkerEventEditorForm.js';
import {
  buildEffectsFromForm,
  formFromEventConfig,
} from '../../src/gl/components/GLMarkerEffectsEditor.jsx';
import { normalizeEventConfig } from '../../src/gl/utils/glMarkerEventConfig.js';

const POOL = {
  biomeMode: 'sous_biome',
  biomeSlugs: [],
  categorieSlugs: ['faune'],
  niveaux: ['base'],
  difficulteMin: null,
  difficulteMax: 3,
  searchQuery: '',
  selectedQuestionCodes: ['QF001', 'QF002'],
};

const BRANCH = {
  label: null,
  deltaPv: 0,
  deltaGems: 0,
  deltaMove: 0,
  passTurn: false,
  unDeAuProchainTour: false,
};

/** Repères tels que l'API les rend (`event_config` déjà normalisé par le serveur). */
const MARKERS = [
  {
    id: 1,
    chapter_id: 42,
    label: 'Case question',
    x_pct: 10,
    y_pct: 10,
    order_index: 1,
    event_type: 'question',
    sous_biome_slug: 'savane',
    // Emoji choisi, mode d'affichage jamais enregistré (base ancienne).
    display_mode: null,
    emoji: '🦊',
    event_config: {
      version: 2,
      question: { set: 'biome', mode: 'random', fixedQuestionCode: null, pool: POOL },
    },
  },
  {
    id: 2,
    chapter_id: 42,
    label: 'Défi d’équipe',
    x_pct: 20,
    y_pct: 20,
    order_index: 2,
    event_type: 'challenge',
    event_config: { version: 2, tenir: { defi: true } },
  },
  {
    id: 3,
    chapter_id: 42,
    label: 'Case Souffle',
    x_pct: 30,
    y_pct: 30,
    order_index: 3,
    event_type: 'souffle',
    event_config: {
      version: 2,
      effects: {
        neutral: { ...BRANCH, label: 'Le vent tourne.', passTurn: true },
        gnome: { ...BRANCH, label: 'Un seul dé au prochain tour.', unDeAuProchainTour: true },
        unicorn: { ...BRANCH, label: 'Une gemme.', deltaGems: 1, unDeAuProchainTour: true },
      },
      eventMeta: { tonalite: 'negatif', rarete: null },
    },
  },
  {
    id: 4,
    chapter_id: 42,
    label: 'Départ',
    x_pct: 40,
    y_pct: 40,
    order_index: 4,
    event_type: 'start',
    event_config: null,
  },
  {
    id: 5,
    chapter_id: 42,
    label: 'Évènement à question',
    x_pct: 50,
    y_pct: 50,
    order_index: 5,
    event_type: 'event',
    event_config: {
      version: 2,
      question: {
        set: 'biome',
        mode: 'fixed',
        fixedQuestionCode: 'QF010',
        pool: { ...POOL, biomeMode: 'chapter', selectedQuestionCodes: [] },
      },
      effects: { neutral: { ...BRANCH, deltaMove: 2 } },
    },
  },
];

let commits = 0;
/** Ce que les PUT ont écrit, par identifiant de repère (rejoué au rechargement). */
const stored = new Map();
/** Si défini, les PUT de repère attendent cette promesse avant de répondre. */
let holdPut = null;

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Harness({ markers: initialMarkers = MARKERS }) {
  const [markers, setMarkers] = useState(initialMarkers);
  return (
    <Profiler
      id="studio"
      onRender={() => {
        commits += 1;
      }}
    >
      <GLChapterMapStudio
        chapterId={42}
        chapterSlug="chap"
        chapterTitle="Chapitre"
        chapterBiomes={[{ slug: 'savane', nom: 'Savane' }]}
        mapImageUrl="/maps/map-foret.svg"
        markers={markers}
        // Le rechargement rend de NOUVEAUX objets, comme une vraie relecture de l'API, avec
        // ce que les écritures ont posé « en base ».
        onReload={async () =>
          setMarkers((prev) =>
            prev.map((marker) => ({ ...marker, ...(stored.get(marker.id) || {}) })),
          )
        }
        onError={vi.fn()}
        onInfo={vi.fn()}
      />
    </Profiler>
  );
}

function writes() {
  return apiGlMock.mock.calls.filter(([, method]) => method === 'PUT' || method === 'POST');
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function mountStudio(props) {
  render(<Harness {...props} />);
  await advance(100);
}

async function selectMarker(label) {
  const list = screen.getByRole('button', { name: new RegExp(label) });
  fireEvent.click(list);
  await advance(100);
}

function labelInput() {
  return screen.getByLabelText('Label');
}

let consoleError;

beforeEach(() => {
  commits = 0;
  apiGlMock.mockReset();
  stored.clear();
  holdPut = null;
  apiGlMock.mockImplementation(async (url, method, body) => {
    if (String(url).includes('/api/gl/kingdom-map/zones')) return { zones: [] };
    const match = String(url).match(/\/api\/gl\/chapters\/admin\/markers\/(\d+)$/);
    if (match && method === 'PUT') {
      const gate = holdPut;
      holdPut = null;
      if (gate) await gate.promise;
      stored.set(Number(match[1]), {
        label: body.label,
        event_type: body.eventType,
        event_config: body.eventConfig,
      });
      return { ok: true };
    }
    return { items: [] };
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Une boucle de rendu ne doit pas bloquer la suite : React la signale, on la transforme en
  // échec net.
  consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (String(args[0]).includes('Maximum update depth')) {
      throw new Error('Boucle de rendu détectée (Maximum update depth exceeded)');
    }
  });
});

afterEach(() => {
  consoleError.mockRestore();
  vi.useRealTimers();
});

describe('GLChapterMapStudio — boucle de rendu (E2)', () => {
  test('au repos, le studio ne se rend pas en continu', async () => {
    await mountStudio();
    const afterMount = commits;
    await advance(3000);
    expect(commits - afterMount).toBeLessThanOrEqual(2);
  });

  test('un label modifié est enregistré après le délai', async () => {
    await mountStudio();
    await selectMarker('Départ');
    fireEvent.change(labelInput(), { target: { value: 'Départ du voyage' } });
    await advance(1000);
    expect(writes().length).toBe(1);
    expect(writes()[0][0]).toBe('/api/gl/chapters/admin/markers/4');
    expect(writes()[0][2].label).toBe('Départ du voyage');
  });
});

describe('GLChapterMapStudio — sélectionner un repère ne retire rien (E2)', () => {
  test.each(MARKERS.map((marker) => [marker.label, marker]))(
    'sélectionner « %s » sans le modifier n’écrit rien',
    async (label) => {
      await mountStudio();
      await selectMarker(label);
      await advance(3000);
      expect(writes()).toEqual([]);
    },
  );

  test('passer d’un repère à l’autre sans rien modifier n’écrit rien', async () => {
    await mountStudio();
    for (const marker of MARKERS) {
      await selectMarker(marker.label);
      await advance(1200);
    }
    await selectMarker(MARKERS[0].label);
    await advance(3000);
    expect(writes()).toEqual([]);
  });

  test.each(MARKERS.map((marker) => [marker.label, marker]))(
    'repère → formulaire → charge utile : « %s » garde toute sa configuration',
    async (label, marker) => {
      await mountStudio();
      await selectMarker(label);
      fireEvent.change(labelInput(), { target: { value: `${label} (relu)` } });
      await advance(1000);
      expect(writes().length).toBe(1);
      const [path, method, payload] = writes()[0];
      expect(path).toBe(`/api/gl/chapters/admin/markers/${marker.id}`);
      expect(method).toBe('PUT');
      expect(payload.label).toBe(`${label} (relu)`);
      expect(payload.eventType).toBe(marker.event_type);
      // La configuration envoyée est exactement celle que le serveur avait rendue.
      expect(payload.eventConfig).toEqual(marker.event_config);
      expect(payload.xPct).toBe(marker.x_pct);
      expect(payload.yPct).toBe(marker.y_pct);
      expect(payload.orderIndex).toBe(marker.order_index);
    },
  );

  test('une case « Défi d’équipe » garde tenir.defi', async () => {
    await mountStudio();
    await selectMarker('Défi d’équipe');
    fireEvent.change(labelInput(), { target: { value: 'Défi' } });
    await advance(1000);
    expect(writes()[0][2].eventConfig).toEqual({ version: 2, tenir: { defi: true } });
  });

  test('une case Souffle garde « un seul dé », après un changement d’effet aussi', async () => {
    await mountStudio();
    await selectMarker('Case Souffle');
    const gnome = screen.getByRole('group', { name: 'Effet Gnome' });
    fireEvent.change(within(gnome).getByLabelText('Δ gemmes'), { target: { value: '2' } });
    await advance(1000);
    const effects = writes()[0][2].eventConfig.effects;
    expect(effects.gnome).toMatchObject({ deltaGems: 2, unDeAuProchainTour: true });
    expect(effects.unicorn).toMatchObject({ deltaGems: 1, unDeAuProchainTour: true });
    expect(effects.neutral).toMatchObject({ label: 'Le vent tourne.', passTurn: true });
  });

  test('un repère sans configuration ne devient pas une case question', async () => {
    await mountStudio();
    await selectMarker('Départ');
    fireEvent.change(labelInput(), { target: { value: 'Départ !' } });
    await advance(1000);
    expect(writes()[0][2].eventType).toBe('start');
    expect(writes()[0][2].eventConfig).toBeNull();
  });

  test('l’emoji choisi d’un repère sans mode d’affichage enregistré est gardé', async () => {
    await mountStudio();
    await selectMarker('Case question');
    fireEvent.change(labelInput(), { target: { value: 'Case question 1' } });
    await advance(1000);
    expect(writes()[0][2]).toMatchObject({ displayMode: 'emoji', emoji: '🦊' });
  });

  test('après un enregistrement et le rechargement, rien d’autre ne repart', async () => {
    await mountStudio();
    await selectMarker('Case Souffle');
    fireEvent.change(labelInput(), { target: { value: 'Souffle' } });
    await advance(1000);
    expect(writes().length).toBe(1);
    await advance(4000);
    expect(writes().length).toBe(1);
  });
});

describe('GLChapterMapStudio — saisie pendant l’enregistrement (E2 + E5)', () => {
  test('un texte d’effet tapé pendant le PUT n’est pas écrasé par le rechargement', async () => {
    await mountStudio();
    await selectMarker('Case Souffle');
    const text = () =>
      within(screen.getByRole('group', { name: 'Effet Gnome' })).getByLabelText(/Texte d.effet/);
    fireEvent.change(text(), { target: { value: 'Le vent' } });
    holdPut = deferred();
    const gate = holdPut;
    await advance(900);
    expect(writes().length).toBe(1);
    fireEvent.change(text(), { target: { value: 'Le vent tourne' } });
    await act(async () => {
      gate.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(text()).toHaveValue('Le vent tourne');
    await advance(2500);
    expect(writes().map(([, , body]) => body.eventConfig.effects.gnome.label)).toEqual([
      'Le vent',
      'Le vent tourne',
    ]);
    expect(writes()[1][2].eventConfig.effects.gnome.unDeAuProchainTour).toBe(true);
  });

  test('un réglage de question changé pendant le PUT n’est pas écrasé par le rechargement', async () => {
    await mountStudio();
    await selectMarker('Case question');
    fireEvent.click(screen.getByLabelText(/Question fixe/));
    holdPut = deferred();
    const gate = holdPut;
    await advance(900);
    expect(writes().length).toBe(1);
    expect(writes()[0][2].eventConfig.question.mode).toBe('fixed');
    fireEvent.click(screen.getByLabelText('Lore (histoire)'));
    await act(async () => {
      gate.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByLabelText('Lore (histoire)')).toBeChecked();
    await advance(2500);
    expect(writes().at(-1)[2].eventConfig.question.set).toBe('lore');
  });

  test('changer le type d’un repère applique l’apparence par défaut du nouveau type', async () => {
    await mountStudio();
    await selectMarker('Départ');
    fireEvent.change(screen.getByLabelText(/Type d.événement/), { target: { value: 'question' } });
    await advance(1000);
    expect(writes()[0][2]).toMatchObject({ eventType: 'question', displayMode: 'emoji' });
    expect(writes()[0][2].eventConfig.question).toBeTruthy();
  });
});

describe('GLChapterMapStudio — nouveau repère (E2, resetForm)', () => {
  test('un nouveau repère n’hérite pas des effets du repère sélectionné juste avant', async () => {
    await mountStudio();
    await selectMarker('Case Souffle');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un repère' }));
    await advance(100);
    fireEvent.change(labelInput(), { target: { value: 'Nouvelle case' } });
    await advance(1000);
    expect(writes().length).toBe(1);
    const [path, method, payload] = writes()[0];
    expect(path).toBe('/api/gl/chapters/admin/42/markers');
    expect(method).toBe('POST');
    expect(payload.eventType).toBe('question');
    expect(payload.eventConfig.effects).toBeUndefined();
    expect(payload.eventConfig.eventMeta).toBeUndefined();
    expect(payload.eventConfig.question).toBeTruthy();
  });
});

describe('aller-retour pur repère → formulaire → configuration (E2)', () => {
  test.each(MARKERS.map((marker) => [marker.label, marker]))(
    '« %s » : la configuration reconstruite vaut celle du repère',
    (_label, marker) => {
      const rebuilt = buildEventConfigFromForm(
        formFromMarker(marker),
        effectsDraftFromMarker(marker),
      );
      expect(rebuilt).toEqual(normalizeEventConfig(marker.event_config));
      expect(eventDraftFromMarker(marker).eventConfig).toEqual(marker.event_config);
    },
  );

  test('l’éditeur d’effets relit et réécrit tous les champs d’une branche', () => {
    const effects = MARKERS[2].event_config.effects;
    expect(buildEffectsFromForm(formFromEventConfig(MARKERS[2].event_config))).toEqual(effects);
  });

  test('toMarkerPayload : pas de configuration de question par défaut hors case question', () => {
    const form = { label: 'x', xPct: 1, yPct: 2 };
    expect(
      toMarkerPayload(form, { eventType: 'start', eventConfig: null }, {}).eventConfig,
    ).toBeNull();
    expect(
      toMarkerPayload(form, { eventType: 'question', eventConfig: null }, {}).eventConfig.question,
    ).toBeTruthy();
  });

  test('changer le type d’une case à question vers un autre type retire la question', () => {
    const form = { ...formFromMarker(MARKERS[0]), eventType: 'story' };
    expect(buildEventConfigFromForm(form, { effects: null, eventMeta: null })).toBeNull();
  });
});
