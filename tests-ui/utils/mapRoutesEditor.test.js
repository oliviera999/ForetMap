import { describe, test, expect } from 'vitest';

import {
  EMPTY_ROUTE_DRAFT,
  ROUTE_STEPS_MAX,
  addStep,
  moveStep,
  patchStepAt,
  placesByKey,
  removeStepAt,
  routeDraftFrom,
  routePayloadFromDraft,
  routePlaceOptions,
  routeSummaryLine,
  stepDisplayLabel,
  stepKey,
  validateRouteDraft,
} from '../../src/utils/mapRoutesEditor.js';

const CATEGORIES = [
  { id: 'c1', label: 'Bâtiments' },
  { id: 'c2', label: 'Extérieur' },
];

const ZONES = [
  { id: 'z1', map_id: 'lyautey', name: 'Cour d’honneur', category_ids: ['c2'] },
  { id: 'z2', map_id: 'autre', name: 'Zone d’une autre carte' },
];

const MARKERS = [
  { id: 'm1', map_id: 'lyautey', label: 'Accueil', category_ids: ['c1'] },
  { id: 'm2', map_id: 'lyautey', label: 'Bibliothèque' },
];

describe('routePlaceOptions', () => {
  test('unifie zones et repères de la carte demandée, triés par nom', () => {
    const options = routePlaceOptions(
      { zones: ZONES, markers: MARKERS, categories: CATEGORIES },
      'lyautey',
    );
    expect(options.map((o) => o.name)).toEqual(['Accueil', 'Bibliothèque', 'Cour d’honneur']);
    expect(options.map((o) => o.target_type)).toEqual(['marker', 'marker', 'zone']);
  });

  test('sans carte, garde tout', () => {
    const options = routePlaceOptions({ zones: ZONES, markers: MARKERS }, '');
    expect(options).toHaveLength(4);
  });

  test('résout les libellés de catégories pour la recherche', () => {
    const [accueil] = routePlaceOptions(
      { zones: [], markers: MARKERS, categories: CATEGORIES },
      'lyautey',
    );
    expect(accueil.category_labels).toEqual(['Bâtiments']);
  });

  test('la clé et target_id sont posés pour composer une étape', () => {
    const [accueil] = routePlaceOptions({ markers: MARKERS }, 'lyautey');
    expect(accueil.key).toBe('marker:m1');
    expect(accueil.target_id).toBe('m1');
  });
});

describe('brouillon et charge d’API', () => {
  test('un parcours serveur devient un brouillon sans valeur nulle', () => {
    const draft = routeDraftFrom({
      title: 'Portes ouvertes',
      slug: 'portes-ouvertes',
      description: null,
      audience: null,
      surfaces: ['plan', 'visit'],
      is_published: 1,
      sort_order: 20,
      steps: [{ target_type: 'zone', target_id: 'z1', step_title: null, step_text: null }],
    });
    expect(draft.description).toBe('');
    expect(draft.audience).toBe('');
    expect(draft.is_published).toBe(true);
    expect(draft.surfaces).toEqual(['visit', 'plan']);
    expect(draft.steps).toEqual([
      { target_type: 'zone', target_id: 'z1', step_title: '', step_text: '' },
    ]);
  });

  test('la charge d’API n’envoie pas de position : le serveur renumérote', () => {
    const payload = routePayloadFromDraft(
      {
        ...EMPTY_ROUTE_DRAFT,
        title: '  Le tour  ',
        steps: [
          { target_type: 'marker', target_id: 'm1', step_title: ' Départ ', step_text: '' },
          { target_type: 'zone', target_id: 'z1', step_title: '', step_text: '' },
        ],
      },
      { mapId: 'lyautey' },
    );
    expect(payload.title).toBe('Le tour');
    expect(payload.map_id).toBe('lyautey');
    expect(payload.steps[0]).toEqual({
      target_type: 'marker',
      target_id: 'm1',
      step_title: 'Départ',
      step_text: '',
    });
    expect(payload.steps[0].position).toBeUndefined();
  });

  test('sans carte, pas de map_id dans la charge (mise à jour d’un parcours existant)', () => {
    expect(routePayloadFromDraft(EMPTY_ROUTE_DRAFT).map_id).toBeUndefined();
  });
});

describe('validateRouteDraft', () => {
  test('refuse un titre vide', () => {
    expect(validateRouteDraft({ ...EMPTY_ROUTE_DRAFT }, { mapId: 'lyautey' })).toEqual({
      ok: false,
      error: 'Titre requis',
    });
  });

  test('refuse l’absence de carte', () => {
    expect(validateRouteDraft({ ...EMPTY_ROUTE_DRAFT, title: 'X' }, {})).toEqual({
      ok: false,
      error: 'Choisissez une carte',
    });
  });

  test('refuse un parcours au-delà de la borne serveur', () => {
    const steps = Array.from({ length: ROUTE_STEPS_MAX + 1 }, (_, i) => ({
      target_type: 'zone',
      target_id: `z${i}`,
    }));
    const result = validateRouteDraft(
      { ...EMPTY_ROUTE_DRAFT, title: 'X', steps },
      { mapId: 'lyautey' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(ROUTE_STEPS_MAX));
  });

  test('accepte un brouillon complet', () => {
    expect(validateRouteDraft({ ...EMPTY_ROUTE_DRAFT, title: 'X' }, { mapId: 'lyautey' })).toEqual({
      ok: true,
    });
  });
});

describe('manipulation des étapes', () => {
  const base = [
    { target_type: 'marker', target_id: 'm1', step_title: '', step_text: '' },
    { target_type: 'zone', target_id: 'z1', step_title: '', step_text: '' },
    { target_type: 'marker', target_id: 'm2', step_title: '', step_text: '' },
  ];

  test('addStep ajoute en fin de liste', () => {
    const next = addStep([], { target_type: 'zone', target_id: 'z9' });
    expect(next).toEqual([{ target_type: 'zone', target_id: 'z9', step_title: '', step_text: '' }]);
  });

  test('addStep ignore un lieu déjà présent', () => {
    expect(addStep(base, { target_type: 'zone', target_id: 'z1' })).toBe(base);
  });

  test('addStep ignore un lieu incomplet', () => {
    expect(addStep(base, { target_type: 'zone' })).toBe(base);
  });

  test('addStep s’arrête à la borne', () => {
    const full = Array.from({ length: ROUTE_STEPS_MAX }, (_, i) => ({
      target_type: 'zone',
      target_id: `z${i}`,
    }));
    expect(addStep(full, { target_type: 'marker', target_id: 'm9' })).toBe(full);
  });

  test('removeStepAt retire le bon rang et laisse la liste intacte hors bornes', () => {
    expect(removeStepAt(base, 1).map((s) => s.target_id)).toEqual(['m1', 'm2']);
    expect(removeStepAt(base, 9)).toBe(base);
  });

  test('moveStep déplace une étape', () => {
    expect(moveStep(base, 2, 0).map((s) => s.target_id)).toEqual(['m2', 'm1', 'z1']);
    expect(moveStep(base, 0, 1).map((s) => s.target_id)).toEqual(['z1', 'm1', 'm2']);
  });

  test('moveStep sur place, hors bornes ou liste trop courte ne change rien', () => {
    expect(moveStep(base, 1, 1)).toBe(base);
    expect(moveStep([base[0]], 0, 1)).toHaveLength(1);
    expect(moveStep(base, -5, 99).map((s) => s.target_id)).toEqual(['z1', 'm2', 'm1']);
  });

  test('patchStepAt ne touche qu’une étape', () => {
    const next = patchStepAt(base, 1, { step_title: 'La cour' });
    expect(next[1].step_title).toBe('La cour');
    expect(next[0]).toBe(base[0]);
    expect(patchStepAt(base, 42, { step_title: 'X' })).toBe(base);
  });
});

describe('libellés', () => {
  const byKey = placesByKey(
    routePlaceOptions({ zones: ZONES, markers: MARKERS, categories: CATEGORIES }, 'lyautey'),
  );

  test('stepKey compose la clé du lieu', () => {
    expect(stepKey({ target_type: 'zone', target_id: 'z1' })).toBe('zone:z1');
  });

  test('le titre propre prime sur le nom du lieu', () => {
    expect(
      stepDisplayLabel({ target_type: 'zone', target_id: 'z1', step_title: 'Départ' }, 0, byKey),
    ).toBe('Départ');
  });

  test('sans titre propre, le nom du lieu est repris', () => {
    expect(stepDisplayLabel({ target_type: 'zone', target_id: 'z1' }, 0, byKey)).toBe(
      'Cour d’honneur',
    );
  });

  test('un lieu supprimé après coup ne rend jamais une ligne vide', () => {
    expect(stepDisplayLabel({ target_type: 'zone', target_id: 'disparu' }, 3, byKey)).toBe(
      'Étape 4 (lieu introuvable)',
    );
  });

  test('le résumé d’une ligne dit l’état, le nombre d’étapes et les surfaces', () => {
    expect(
      routeSummaryLine({
        is_published: true,
        surfaces: ['plan'],
        steps: [{}, {}],
        audience: 'Nouveaux élèves',
      }),
    ).toBe('Publié · 2 étapes · plan · Nouveaux élèves');
    expect(routeSummaryLine({ is_published: false, surfaces: [], steps: [{}] })).toBe(
      'Brouillon · 1 étape · aucune surface',
    );
  });
});
