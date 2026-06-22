import { describe, test, expect } from 'vitest';
import {
  EVENT_TYPE_OPTIONS,
  DEFAULT_NIVEAUX,
  TIER_LORE_OPTIONS,
  emptyQuestionForm,
  formFromMarker,
  buildEventConfigFromForm,
  emptyPoolForSet,
  patchPoolForSet,
  effectiveBiomeSlugs,
  chapterBiomeSlugsFrom,
  buildAdditionalBiomeOptions,
  buildCategoryOptions,
  buildLoreScopeOptions,
  buildNiveauOptions,
  toggleSelectedCode,
  normalizeFixedCode,
} from '../../src/gl/utils/glMarkerEventEditorForm.js';

describe('glMarkerEventEditorForm — constantes', () => {
  test('EVENT_TYPE_OPTIONS contient question et behavior, tous activés', () => {
    const values = EVENT_TYPE_OPTIONS.map((o) => o.value);
    expect(values).toContain('question');
    expect(values).toContain('behavior');
    expect(EVENT_TYPE_OPTIONS.every((o) => o.enabled)).toBe(true);
  });

  test('DEFAULT_NIVEAUX et TIER_LORE_OPTIONS', () => {
    expect(DEFAULT_NIVEAUX).toEqual(['base', 'approfondissement', 'avance']);
    expect(TIER_LORE_OPTIONS.map((o) => o.value)).toEqual(['cle', 'recit']);
  });
});

describe('emptyQuestionForm / formFromMarker', () => {
  test('emptyQuestionForm est une question biome', () => {
    const form = emptyQuestionForm();
    expect(form.eventType).toBe('question');
    expect(form.questionSet).toBe('biome');
    expect(form.fixedQuestionCode).toBe('');
    expect(form.pool).toBeTypeOf('object');
  });

  test('formFromMarker sans repère = formulaire vierge', () => {
    expect(formFromMarker(null)).toEqual(emptyQuestionForm());
  });

  test('formFromMarker mappe "quiz" → "question"', () => {
    const form = formFromMarker({ event_type: 'QUIZ', event_config: null });
    expect(form.eventType).toBe('question');
  });

  test('formFromMarker conserve un type non-question', () => {
    const form = formFromMarker({ event_type: 'Souffle', event_config: null });
    expect(form.eventType).toBe('souffle');
  });

  test('formFromMarker lit la config question existante', () => {
    const form = formFromMarker({
      event_type: 'question',
      event_config: {
        version: 2,
        question: { set: 'lore', mode: 'fixed', fixedQuestionCode: 'AB12', pool: {} },
      },
    });
    expect(form.questionSet).toBe('lore');
    expect(form.questionMode).toBe('fixed');
    expect(form.fixedQuestionCode).toBe('AB12');
  });
});

describe('buildEventConfigFromForm', () => {
  test('question biome produit une config avec bloc question', () => {
    const cfg = buildEventConfigFromForm(emptyQuestionForm(), null);
    expect(cfg.question).toBeTruthy();
    expect(cfg.question.set).toBe('biome');
  });

  test('type non-question sans effets renvoie null', () => {
    const cfg = buildEventConfigFromForm(
      { eventType: 'souffle', questionSet: 'biome', pool: {} },
      null,
    );
    expect(cfg).toBeNull();
  });

  test("type non-question avec effets renvoie une config d'effets", () => {
    const cfg = buildEventConfigFromForm(
      { eventType: 'souffle', questionSet: 'biome', pool: {} },
      { effects: { neutral: { deltaPv: 1 } } },
    );
    expect(cfg).toBeTruthy();
    expect(cfg.effects).toBeTruthy();
  });

  test('question + effets combine question et effets', () => {
    const cfg = buildEventConfigFromForm(emptyQuestionForm(), {
      effects: { neutral: { deltaPv: 2 } },
    });
    expect(cfg.question).toBeTruthy();
    expect(cfg.effects).toBeTruthy();
  });
});

describe('pools', () => {
  test('emptyPoolForSet biome vs lore', () => {
    expect(emptyPoolForSet('biome')).toHaveProperty('biomeMode', 'chapter');
    expect(emptyPoolForSet('lore')).toHaveProperty('chapitreMode', 'chapter');
  });

  test('patchPoolForSet applique et renormalise (biome)', () => {
    const next = patchPoolForSet({ biomeMode: 'chapter' }, 'biome', { searchQuery: 'eau' });
    expect(next.searchQuery).toBe('eau');
    expect(next.biomeMode).toBe('chapter');
  });

  test('patchPoolForSet applique et renormalise (lore)', () => {
    const next = patchPoolForSet({ chapitreMode: 'chapter' }, 'lore', { chapitreMode: 'custom' });
    expect(next.chapitreMode).toBe('custom');
  });
});

describe('effectiveBiomeSlugs', () => {
  test('mode chapter renvoie les biomes du chapitre', () => {
    expect(effectiveBiomeSlugs({ biomeMode: 'chapter' }, ['a', 'b'])).toEqual(['a', 'b']);
  });

  test('mode custom fusionne sans doublon', () => {
    const result = effectiveBiomeSlugs({ biomeMode: 'custom', biomeSlugs: ['b', 'c'] }, ['a', 'b']);
    expect(result).toEqual(['a', 'b', 'c']);
  });
});

describe('chapterBiomeSlugsFrom', () => {
  test('extrait les slugs non vides', () => {
    expect(chapterBiomeSlugsFrom([{ slug: 'a' }, { slug: '' }, { slug: 'b' }])).toEqual(['a', 'b']);
  });

  test('renvoie [] si non tableau', () => {
    expect(chapterBiomeSlugsFrom(null)).toEqual([]);
  });
});

describe("builders d'options", () => {
  test('buildAdditionalBiomeOptions exclut les biomes du chapitre', () => {
    const opts = buildAdditionalBiomeOptions(
      [
        { slug: 'a', nom: 'A' },
        { slug: 'b', nom: 'B' },
      ],
      ['a'],
    );
    expect(opts).toEqual([{ value: 'b', label: 'B' }]);
  });

  test("buildCategoryOptions préfixe l'emoji", () => {
    expect(buildCategoryOptions([{ slug: 'x', nom: 'X', emoji: '🌿' }])).toEqual([
      { value: 'x', label: '🌿 X' },
    ]);
    expect(buildCategoryOptions([{ slug: 'y', nom: 'Y' }])).toEqual([{ value: 'y', label: 'Y' }]);
  });

  test('buildLoreScopeOptions', () => {
    expect(buildLoreScopeOptions([{ slug: 's', nom: 'S' }])).toEqual([{ value: 's', label: 'S' }]);
  });

  test('buildNiveauOptions fusionne défauts et niveaux du pool, triés', () => {
    const opts = buildNiveauOptions([{ niveau: 'expert' }, { niveau: 'base' }]);
    const values = opts.map((o) => o.value);
    expect(values).toContain('expert');
    expect(values).toContain('base');
    expect([...values]).toEqual([...values].sort());
  });
});

describe('sélection de codes', () => {
  test('toggleSelectedCode ajoute en majuscule', () => {
    expect(toggleSelectedCode(['AB2'], 'ab1')).toEqual(['AB2', 'AB1']);
  });

  test('toggleSelectedCode retire si présent', () => {
    expect(toggleSelectedCode(['AB1'], 'ab1')).toEqual([]);
  });

  test('toggleSelectedCode exclut depuis le pool implicite (tout sélectionné)', () => {
    expect(toggleSelectedCode([], 'AB2', ['AB1', 'AB2', 'AB3'])).toEqual(['AB1', 'AB3']);
  });

  test('toggleSelectedCode ignore un code vide', () => {
    expect(toggleSelectedCode(['AB1'], '  ')).toEqual(['AB1']);
  });

  test('normalizeFixedCode trim + majuscule', () => {
    expect(normalizeFixedCode('  zz9 ')).toBe('ZZ9');
  });
});
