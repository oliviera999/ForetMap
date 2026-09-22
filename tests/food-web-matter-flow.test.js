'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const {
  INTERACTION_TYPES,
  INTERACTION_TYPES_CORE,
  INTERACTION_TYPE_META,
  INTERACTION_TYPE_LABELS,
  EVIDENCE_LEVELS,
  EVIDENCE_LEVEL_LABELS,
  POLLINATION_EFFICACIES,
  POLLINATION_EFFICACY_LABELS,
  interactionMatterFlow,
  interactionTypeMeta,
  orientInteraction,
} = require('../lib/shared/foodWebCore');
const { GRAPH_PRESET_TYPES } = require('../lib/pedagoContentAudit');

/**
 * Sens du flux de matière, et parité entre les deux copies de la table des types.
 *
 * Pourquoi ce test plutôt qu'une colonne SQL `matter_flow` : l'orientation des liens est
 * déjà déclarée à deux endroits — `lib/shared/foodWebCore.js` et son miroir ESM
 * `src/shared/foodWebTypes.js`, que le front ne peut pas importer depuis `lib/`. Une
 * troisième copie en base, à resynchroniser à chaque ajout de type, coûterait plus qu'elle
 * ne rapporterait. Le test tient l'invariant à sa place.
 */

/** Miroir ESM, chargé dynamiquement : `src/` est en modules ES, les tests en CommonJS. */
let front;
before(async () => {
  front = await import('../src/shared/foodWebTypes.js');
});

const MATTER_FLOWS = new Set(['to_from', 'from_to', 'none']);

describe('matterFlow', () => {
  test('chaque type déclare un sens de flux connu', () => {
    for (const type of INTERACTION_TYPES) {
      const flow = interactionMatterFlow(type);
      assert.ok(MATTER_FLOWS.has(flow), `${type} : sens de flux inattendu (${flow})`);
    }
  });

  test('l’orientation d’affichage découle du sens du flux', () => {
    for (const type of INTERACTION_TYPES) {
      const { orientation } = interactionTypeMeta(type);
      const flow = interactionMatterFlow(type);
      if (flow === 'to_from') {
        assert.strictEqual(
          orientation,
          'consumed',
          `${type} : la matière remonte de la cible vers l’acteur, la flèche doit être inversée`,
        );
      } else if (flow === 'from_to') {
        assert.strictEqual(
          orientation,
          'directed',
          `${type} : la matière descend de l’acteur vers la cible, la flèche doit suivre le lien`,
        );
      } else {
        assert.ok(
          ['directed', 'mutual'].includes(orientation),
          `${type} : sans flux de matière, l’orientation ne peut pas être « consumed »`,
        );
      }
    }
  });

  test('la mycophagie est un flux trophique, les quatre autres ajouts n’en sont pas', () => {
    // Migration 272. Brouter un mycélium vivant transporte de la matière vers le
    // consommateur ; le mutualisme, le commensalisme, l'allélopathie et la facilitation sont
    // des rapports entre espèces, pas des transferts.
    assert.strictEqual(interactionMatterFlow('mycophagie'), 'to_from');
    assert.strictEqual(interactionTypeMeta('mycophagie').orientation, 'consumed');
    for (const type of ['mutualisme', 'commensalisme', 'allelopathie', 'facilitation']) {
      assert.strictEqual(interactionMatterFlow(type), 'none', type);
    }
    assert.strictEqual(interactionTypeMeta('mutualisme').orientation, 'mutual');
  });

  test('les flux trophiques et les apports minéraux vont en sens contraires', () => {
    // C'est l'inversion qui rendait `nitrification` illisible tant qu'il mélangeait
    // l'excrétion des poissons et l'oxydation bactérienne.
    assert.strictEqual(interactionMatterFlow('herbivorie'), 'to_from');
    assert.strictEqual(interactionMatterFlow('detritivorie'), 'to_from');
    assert.strictEqual(interactionMatterFlow('excretion'), 'from_to');
    assert.strictEqual(interactionMatterFlow('assimilation'), 'from_to');
  });

  test('un type inconnu retombe sur « aucun flux » sans lever', () => {
    assert.strictEqual(interactionMatterFlow('parthénogénèse'), 'none');
    assert.strictEqual(interactionMatterFlow(null), 'none');
  });
});

describe('orientInteraction suit matterFlow', () => {
  test('un flux trophique inverse la flèche (la matière remonte vers le consommateur)', () => {
    const { tailId, headId } = orientInteraction(1, 2, 'detritivorie');
    assert.strictEqual(tailId, 2, 'la litière est l’origine');
    assert.strictEqual(headId, 1, 'le cloporte est la pointe');
  });

  test('une excrétion garde le sens du lien (l’acteur alimente la cible)', () => {
    const { tailId, headId } = orientInteraction(1, 2, 'excretion');
    assert.strictEqual(tailId, 1, 'le poisson est l’origine');
    assert.strictEqual(headId, 2, 'la bactérie est la pointe');
  });

  test('une relation symétrique ne désigne pas de mangeur', () => {
    assert.strictEqual(orientInteraction(1, 2, 'symbiose').symmetric, true);
  });
});

describe('parité backend / miroir ESM', () => {
  test('les deux copies listent exactement les mêmes types', () => {
    assert.deepStrictEqual([...front.INTERACTION_TYPES].sort(), [...INTERACTION_TYPES].sort());
  });

  test('la liste bornée GL est identique des deux côtés, et incluse dans celle de ForetMap', () => {
    assert.deepStrictEqual(
      [...front.INTERACTION_TYPES_CORE].sort(),
      [...INTERACTION_TYPES_CORE].sort(),
    );
    for (const type of INTERACTION_TYPES_CORE) {
      assert.ok(INTERACTION_TYPES.includes(type), `${type} absent de la liste ForetMap`);
    }
  });

  test('niveaux de preuve et efficacités de pollinisation sont identiques des deux côtés', () => {
    assert.deepStrictEqual([...front.EVIDENCE_LEVELS], [...EVIDENCE_LEVELS]);
    assert.deepStrictEqual({ ...front.EVIDENCE_LEVEL_LABELS }, { ...EVIDENCE_LEVEL_LABELS });
    assert.deepStrictEqual([...front.POLLINATION_EFFICACIES], [...POLLINATION_EFFICACIES]);
    assert.deepStrictEqual(
      { ...front.POLLINATION_EFFICACY_LABELS },
      { ...POLLINATION_EFFICACY_LABELS },
    );
    assert.strictEqual(front.POLLINATION_TYPE, 'pollinisation');
  });

  test('les libellés sont identiques des deux côtés', () => {
    assert.deepStrictEqual({ ...front.INTERACTION_TYPE_LABELS }, { ...INTERACTION_TYPE_LABELS });
  });

  test('orientation, relation et sens du flux sont identiques des deux côtés', () => {
    for (const type of INTERACTION_TYPES) {
      assert.deepStrictEqual(
        { ...front.INTERACTION_TYPE_META[type] },
        { ...INTERACTION_TYPE_META[type] },
        `divergence sur ${type} entre foodWebCore.js et foodWebTypes.js`,
      );
    }
  });

  test('chaque type a un libellé non vide', () => {
    for (const type of INTERACTION_TYPES) {
      assert.ok(INTERACTION_TYPE_LABELS[type], `libellé manquant : ${type}`);
    }
  });
});

describe('presets de graphe', () => {
  test('tout type est rangé dans exactement un preset', () => {
    const alimentaire = new Set(GRAPH_PRESET_TYPES.alimentaire);
    const relations = new Set(GRAPH_PRESET_TYPES.relations);
    for (const type of INTERACTION_TYPES) {
      const inAlim = alimentaire.has(type);
      const inRel = relations.has(type);
      assert.ok(inAlim || inRel, `${type} n’apparaît dans aucun preset`);
      assert.ok(!(inAlim && inRel), `${type} apparaît dans les deux presets`);
    }
  });

  test('le réseau alimentaire ne contient que des flux trophiques', () => {
    for (const type of GRAPH_PRESET_TYPES.alimentaire) {
      assert.strictEqual(
        interactionMatterFlow(type),
        'to_from',
        `${type} n’est pas un flux trophique : sa place est dans « autres relations »`,
      );
    }
  });

  test('les apports minéraux détachés de la nitrification sont dans « autres relations »', () => {
    for (const type of ['excretion', 'assimilation', 'nitrification']) {
      assert.ok(GRAPH_PRESET_TYPES.relations.includes(type), `${type} mal rangé`);
    }
  });
});
