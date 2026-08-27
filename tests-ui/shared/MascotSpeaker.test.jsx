import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MascotSpeaker } from '../../src/shared/components/MascotSpeaker.jsx';

const SRC_ROOT = path.resolve(__dirname, '..', '..', 'src');
const SPEAKER_PATH = path.join(SRC_ROOT, 'shared', 'components', 'MascotSpeaker.jsx');

function speaker(container) {
  return container.querySelector('[data-mascot-speaker]');
}

function narratorWith(portraits, extra = {}) {
  return {
    enabled: true,
    speakerName: 'OLU',
    fallbackSilhouette: 'olu',
    portraits,
    ...extra,
  };
}

describe('MascotSpeaker', () => {
  test('est décoratif : aria-hidden et alt vide, jamais de texte', () => {
    const { container } = render(
      <MascotSpeaker narrator={narratorWith({ neutre: { bust: '/uploads/n.webp' } })} />,
    );
    expect(speaker(container)).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(container.textContent).toBe('');
  });

  test('sans portrait, retombe sur le SVG et ne laisse jamais de vide', () => {
    const { container } = render(<MascotSpeaker narrator={narratorWith({})} />);
    const node = speaker(container);
    expect(node).toHaveAttribute('data-source', 'svg');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  test('sans configuration du tout, rend quand même le SVG de repli', () => {
    const { container } = render(<MascotSpeaker />);
    expect(speaker(container)).toHaveAttribute('data-source', 'svg');
    expect(speaker(container)).toHaveAttribute('data-mascot-speaker', 'olu');
  });

  test('la silhouette de repli suit la configuration', () => {
    const { container } = render(
      <MascotSpeaker narrator={narratorWith({}, { fallbackSilhouette: 'backpackFox' })} />,
    );
    expect(speaker(container)).toHaveAttribute('data-mascot-speaker', 'backpackFox');
  });

  test('cascade : cadrage demandé → bust de l’expression → neutre → SVG', () => {
    const portraits = {
      neutre: { bust: '/uploads/neutre-bust.webp', face: '/uploads/neutre-face.webp' },
      parle: { bust: '/uploads/parle-bust.webp' },
      montre: { face: '/uploads/montre-face.webp' },
    };

    // 1. cadrage exact
    const exact = render(
      <MascotSpeaker narrator={narratorWith(portraits)} expression="montre" size="face" />,
    );
    expect(exact.container.querySelector('img')).toHaveAttribute(
      'src',
      '/uploads/montre-face.webp',
    );

    // 2. même expression, cadrage `bust` de repli (recadrage CSS)
    const derived = render(
      <MascotSpeaker narrator={narratorWith(portraits)} expression="parle" size="face" />,
    );
    const derivedImg = derived.container.querySelector('img');
    expect(derivedImg).toHaveAttribute('src', '/uploads/parle-bust.webp');
    expect(derivedImg).toHaveAttribute('data-derived', 'bust');

    // 3. expression sans aucun portrait → neutre, cadrage demandé
    const toNeutre = render(
      <MascotSpeaker narrator={narratorWith(portraits)} expression="grave" size="face" />,
    );
    expect(toNeutre.container.querySelector('img')).toHaveAttribute(
      'src',
      '/uploads/neutre-face.webp',
    );

    // 4. plus rien → SVG
    const toSvg = render(<MascotSpeaker narrator={narratorWith({})} expression="grave" />);
    expect(speaker(toSvg.container)).toHaveAttribute('data-source', 'svg');
  });

  test('un cadrage servi tel quel n’est pas marqué comme dérivé', () => {
    const { container } = render(
      <MascotSpeaker
        narrator={narratorWith({ neutre: { bust: '/uploads/n.webp' } })}
        size="bust"
      />,
    );
    expect(container.querySelector('img')).not.toHaveAttribute('data-derived');
  });

  test('une expression inconnue est normalisée en neutre', () => {
    const { container } = render(
      <MascotSpeaker
        narrator={narratorWith({ neutre: { bust: '/uploads/n.webp' } })}
        expression="hilare"
      />,
    );
    expect(speaker(container)).toHaveAttribute('data-expression', 'neutre');
  });

  test('l’interrupteur global éteint complètement le portrait', () => {
    const { container } = render(
      <MascotSpeaker
        narrator={narratorWith({ neutre: { bust: '/uploads/n.webp' } }, { enabled: false })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('dimensions explicites sur l’image : pas de décalage de mise en page', () => {
    const { container } = render(
      <MascotSpeaker
        narrator={narratorWith({ neutre: { bust: '/uploads/n.webp' } })}
        size="face"
      />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('width');
    expect(img).toHaveAttribute('height');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  test('le cadrage est exposé en data-* stable pour les e2e', () => {
    const { container } = render(<MascotSpeaker narrator={narratorWith({})} size="body" />);
    expect(speaker(container)).toHaveAttribute('data-framing', 'body');
  });
});

describe('MascotSpeaker — garde-fou d’architecture (§15.8)', () => {
  // Le renderer animé pèse 100–170 Ko en chunks lazy : le déclencher à l'ouverture
  // d'un panneau d'aide est disqualifiant (§4.1). Cette assertion verrouille la règle
  // mieux qu'un commentaire — elle casse si quelqu'un branche un renderer un jour.
  const FORBIDDEN = [
    'VisitMapMascotRive',
    'VisitMapMascotSpriteCut',
    'VisitMapMascotSpritesheet',
    'VisitMapMascotRenderer',
    'VisitMapMascot.jsx',
    '@rive-app',
  ];

  function localImportsOf(filePath) {
    const source = readFileSync(filePath, 'utf8');
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    return { source, specifiers };
  }

  test('MascotSpeaker n’importe aucun renderer lourd', () => {
    const { source } = localImportsOf(SPEAKER_PATH);
    // On ignore le bloc de commentaire d'en-tête, qui cite ces noms pour expliquer la règle.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const forbidden of FORBIDDEN) {
      expect(code, `import interdit dans MascotSpeaker : ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('aucun import direct de MascotSpeaker n’amène de renderer lourd', () => {
    const { specifiers } = localImportsOf(SPEAKER_PATH);
    const locals = specifiers.filter((s) => s.startsWith('.'));
    expect(locals.length).toBeGreaterThan(0);
    for (const specifier of locals) {
      const resolved = path.resolve(path.dirname(SPEAKER_PATH), specifier);
      const code = readFileSync(resolved, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const forbidden of FORBIDDEN) {
        expect(code, `${specifier} amène ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
