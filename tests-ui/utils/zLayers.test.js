import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { describe, test, expect } from 'vitest';

/**
 * Garde-fou de style : l'échelle d'empilement reste **commune et ordonnée**.
 *
 * Les deux produits avaient dérivé sur deux échelles sans rapport (ForetMap de 80 à
 * 99 999, G&L de 55 à 12 050), et les surfaces *partagées* portaient une valeur en dur
 * calibrée pour un seul des deux. Résultat : des fiches qui s'ouvraient derrière ce qui
 * venait de les appeler. Ces tests verrouillent les trois invariants de
 * `src/shared/styles/z-layers.css`.
 */
const STYLE_DIRS = ['src/shared/styles', 'src/gl/styles'];
/**
 * Feuilles hors de ces dossiers, contrôlées au même titre : la feuille d'entrée ForetMap
 * porte encore la majorité des surfaces du produit (et n'est pas formatée par Prettier).
 */
const ROOT_STYLESHEETS = ['src/index.css'];
const Z_LAYERS_PATH = 'src/shared/styles/z-layers.css';

const normalizeRelPath = (relPath) => String(relPath).replace(/\\/g, '/');

const readCss = (relPath) => readFileSync(resolve(process.cwd(), relPath), 'utf8');

/** Retire les commentaires CSS pour ne pas confondre documentation et règles actives. */
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Paliers déclarés dans l'échelle commune, dans leur ordre de lecture. */
function readScale() {
  const css = readCss(Z_LAYERS_PATH);
  const scale = new Map();
  for (const [, name, value] of css.matchAll(/--fm-z-([a-z0-9-]+):\s*(\d+);/g)) {
    scale.set(`--fm-z-${name}`, Number(value));
  }
  return scale;
}

/** Toutes les feuilles de style du dépôt, `z-layers.css` exclue. */
function listStylesheets() {
  const files = [];
  for (const dir of STYLE_DIRS) {
    for (const name of readdirSync(resolve(process.cwd(), dir))) {
      if (name.endsWith('.css')) files.push(join(dir, name));
    }
  }
  files.push(...ROOT_STYLESHEETS);
  return files.map((f) => normalizeRelPath(f)).filter((f) => f !== Z_LAYERS_PATH);
}

describe('z-layers.css — échelle d’empilement commune', () => {
  test('les paliers sont strictement croissants dans l’ordre déclaré', () => {
    const values = [...readScale().values()];
    expect(values.length).toBeGreaterThan(10);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  test('chaque surface passe au-dessus de celle qui peut l’ouvrir', () => {
    const scale = readScale();
    // Invariant 3, dans l'ordre où les surfaces s'appellent : un contenu ouvre une
    // fiche de glossaire, et depuis cette fiche on peut demander à valider le terme
    // (« j'ai appris ce terme »). C'est la validation qui est terminale, pas la fiche.
    expect(scale.get('--fm-z-quiz-popover')).toBeGreaterThan(scale.get('--fm-z-modal'));
    expect(scale.get('--fm-z-glossary')).toBeGreaterThan(scale.get('--fm-z-popover'));
    expect(scale.get('--fm-z-glossary')).toBeGreaterThan(scale.get('--fm-z-quiz-popover'));
    expect(scale.get('--fm-z-learning-ack')).toBeGreaterThan(scale.get('--fm-z-glossary'));
  });

  test('tout accusé de lecture porte le palier qui le place au-dessus des fiches', () => {
    // Le contrôle déclenché depuis une fiche partage la classe `.fm-quiz-popover`
    // avec la *surface* du quiz, qui elle doit rester sous les fiches qu'elle ouvre.
    // Seul le modificateur les distingue : un accusé qui l'oublierait se rouvrirait
    // derrière la fiche d'où on l'a demandé.
    const ackSites = [
      'src/components/pedago/GlossaryTermLearnedAcknowledge.jsx',
      'src/components/TutorialReadAcknowledge.jsx',
      'src/components/PlantSpeciesDiscoveryAcknowledge.jsx',
      'src/gl/components/GLLearningAcknowledgeButton.jsx',
    ];
    for (const site of ackSites) {
      const source = readCss(site);
      const overlay = source.match(/overlayClassName="([^"]*fm-quiz-popover[^"]*)"/);
      expect(`${site} → ${overlay?.[1]}`).toContain('fm-quiz-popover--ack');
    }
  });

  test('le plein écran reste sous les dialogues, sinon il faut le patcher', () => {
    const scale = readScale();
    // Les deux produits portaient le même patch `body.*-map-fullscreen-active
    // .fm-modal-overlay { z-index: … }` faute de cet ordre. Il n'existe plus.
    expect(scale.get('--fm-z-fullscreen')).toBeLessThan(scale.get('--fm-z-modal'));
    expect(scale.get('--fm-z-fullscreen')).toBeGreaterThan(scale.get('--fm-z-nav'));

    for (const file of listStylesheets()) {
      expect(stripCssComments(readCss(file))).not.toMatch(
        /map-fullscreen-active\s+\.(fm-)?modal-overlay/,
      );
    }
  });

  test('aucune feuille ne redéclare un palier de l’échelle', () => {
    const names = [...readScale().keys()];
    for (const file of listStylesheets()) {
      const css = readCss(file);
      for (const name of names) {
        // Une redéclaration par produit est exactement ce qui avait fait diverger les
        // deux échelles : un palier ne se définit qu'à un seul endroit.
        expect(`${file} → ${name}: ${css.includes(`${name}:`)}`).toBe(`${file} → ${name}: false`);
      }
    }
  });

  test('aucune surface globale ne rechoisit un z-index en dur', () => {
    // Les petits entiers restent permis : ils ordonnent des éléments à l'intérieur d'un
    // composant, dans leur propre contexte d'empilement, et n'arbitrent rien.
    const LOCAL_MAX = 30;
    const offenders = [];
    for (const file of listStylesheets()) {
      for (const [, value] of readCss(file).matchAll(/z-index:\s*(\d+)\s*;/g)) {
        if (Number(value) > LOCAL_MAX) offenders.push(`${file}: z-index ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
