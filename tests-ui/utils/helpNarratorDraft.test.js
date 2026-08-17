import { describe, expect, it } from 'vitest';

import {
  clearNarratorExpression,
  clearNarratorPortrait,
  countIllustratedExpressions,
  describeNarratorPreviewOrigin,
  normalizeNarratorDraft,
  normalizeNarratorUrl,
  resolveNarratorPreview,
  setNarratorPortrait,
} from '../../src/utils/helpNarratorDraft.js';

const BASE = { enabled: true, speakerName: 'OLU', fallbackSilhouette: 'olu', portraits: {} };

describe('normalizeNarratorUrl — même règle que le serveur', () => {
  it('retient un chemin absolu du site et une URL http(s)', () => {
    expect(normalizeNarratorUrl('/uploads/olu.webp')).toBe('/uploads/olu.webp');
    expect(normalizeNarratorUrl('  https://cdn.example/olu.webp ')).toBe(
      'https://cdn.example/olu.webp',
    );
  });

  it('écarte data:, javascript:, protocole-relatif et chemin relatif', () => {
    expect(normalizeNarratorUrl('data:image/png;base64,AAAA')).toBe('');
    expect(normalizeNarratorUrl('javascript:alert(1)')).toBe('');
    expect(normalizeNarratorUrl('//cdn.example/olu.webp')).toBe('');
    expect(normalizeNarratorUrl('uploads/olu.webp')).toBe('');
  });

  it('écarte une URL plus longue que la limite du schéma', () => {
    expect(normalizeNarratorUrl(`/${'a'.repeat(600)}`)).toBe('');
  });
});

describe('normalizeNarratorDraft', () => {
  it('ne garde que les expressions et cadrages connus', () => {
    const draft = normalizeNarratorDraft({
      speakerName: '  OLU  ',
      portraits: {
        neutre: { bust: '/uploads/n.webp', torse: '/uploads/x.webp' },
        hilare: { bust: '/uploads/nope.webp' },
      },
    });
    expect(draft.speakerName).toBe('OLU');
    expect(draft.portraits).toEqual({ neutre: { bust: '/uploads/n.webp' } });
  });

  it('omet une expression dont aucune URL n’est retenue', () => {
    const draft = normalizeNarratorDraft({ portraits: { parle: { bust: 'javascript:alert(1)' } } });
    expect(draft.portraits).toEqual({});
  });

  it('applique les défauts sur une entrée vide et n’éteint que sur un false explicite', () => {
    expect(normalizeNarratorDraft(null)).toEqual(BASE);
    expect(normalizeNarratorDraft({ enabled: false }).enabled).toBe(false);
    expect(normalizeNarratorDraft({ enabled: undefined }).enabled).toBe(true);
  });
});

describe('affectation d’un portrait', () => {
  it('pose une URL sans muter le brouillon d’entrée', () => {
    const next = setNarratorPortrait(BASE, 'parle', 'bust', '/uploads/parle.webp');
    expect(next.portraits.parle).toEqual({ bust: '/uploads/parle.webp' });
    expect(BASE.portraits).toEqual({});
  });

  it('efface l’entrée quand l’URL serait refusée par le serveur', () => {
    const filled = setNarratorPortrait(BASE, 'parle', 'bust', '/uploads/parle.webp');
    const next = setNarratorPortrait(filled, 'parle', 'bust', 'data:image/png;base64,AA');
    expect(next.portraits.parle).toBeUndefined();
  });

  it('retire un cadrage sans emporter les autres', () => {
    let draft = setNarratorPortrait(BASE, 'parle', 'bust', '/uploads/b.webp');
    draft = setNarratorPortrait(draft, 'parle', 'face', '/uploads/f.webp');
    const next = clearNarratorPortrait(draft, 'parle', 'face');
    expect(next.portraits.parle).toEqual({ bust: '/uploads/b.webp' });
  });

  it('vide une expression entière', () => {
    const draft = setNarratorPortrait(BASE, 'grave', 'bust', '/uploads/g.webp');
    expect(clearNarratorExpression(draft, 'grave').portraits).toEqual({});
  });

  it('compte les expressions illustrées', () => {
    let draft = setNarratorPortrait(BASE, 'neutre', 'bust', '/uploads/n.webp');
    draft = setNarratorPortrait(draft, 'parle', 'face', '/uploads/p.webp');
    expect(countIllustratedExpressions(draft)).toBe(2);
  });
});

describe('resolveNarratorPreview — miroir de la cascade de MascotSpeaker', () => {
  const draft = {
    ...BASE,
    portraits: {
      neutre: { bust: '/uploads/neutre.webp' },
      parle: { bust: '/uploads/parle.webp', face: '/uploads/parle-face.webp' },
      montre: { bust: '/uploads/montre.webp' },
    },
  };

  it('préfère l’image propre au cadrage demandé', () => {
    expect(resolveNarratorPreview(draft, 'parle', 'face')).toMatchObject({
      src: '/uploads/parle-face.webp',
      origin: 'own',
    });
  });

  it('recadre depuis le buste quand le visage manque', () => {
    expect(resolveNarratorPreview(draft, 'montre', 'face')).toMatchObject({
      src: '/uploads/montre.webp',
      origin: 'derived',
    });
  });

  it('retombe sur « neutre » quand l’expression n’a aucune image', () => {
    expect(resolveNarratorPreview(draft, 'grave', 'bust')).toMatchObject({
      src: '/uploads/neutre.webp',
      origin: 'inherited',
      expression: 'neutre',
    });
  });

  it('retombe sur la silhouette quand rien n’est fourni', () => {
    const preview = resolveNarratorPreview(
      { ...BASE, fallbackSilhouette: 'backpackFox' },
      'grave',
      'bust',
    );
    expect(preview).toMatchObject({ src: '', origin: 'svg', silhouette: 'backpackFox' });
  });

  it('décrit la provenance en clair', () => {
    expect(describeNarratorPreviewOrigin('own')).toBe('');
    expect(describeNarratorPreviewOrigin('inherited')).toContain('Neutre');
    expect(describeNarratorPreviewOrigin('svg')).toContain('repli');
  });
});
