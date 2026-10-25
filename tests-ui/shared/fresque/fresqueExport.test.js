import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  EXPORT_CREDIT_H,
  EXPORT_W,
  buildExportScene,
  exportFilename,
} from '../../../src/shared/fresque/fresqueExport.js';
import {
  addLink,
  addNote,
  buildDeckModel,
  createInitialState,
  evaluateBoard,
  placeCard,
  setCreative,
} from '../../../src/shared/fresque/fresqueCore.js';

const DIR = path.join(process.cwd(), 'public', 'fresques', 'climat-junior-fr-v7-5');
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
const model = buildDeckModel(read('deck.json'), read('correction.json'), read('hints.json'));

describe('buildExportScene', () => {
  test('la scène porte toujours la bande de crédit, les cartes, les flèches et les post-it', () => {
    let s = createInitialState(model, { level: 'eclaireur' });
    s = placeCard(model, s, 'c04', { x: 10, y: 10, flipped: true });
    s = placeCard(model, s, 'c07', { x: 40, y: 10 });
    s = addLink(model, s, 'c04', 'c07').state;
    s = addNote(model, s, { text: 'Marcher plus', color: 'green', x: 50, y: 60 }).state;
    s = setCreative(model, s, { title: 'Ma fresque à moi', arrowColor: 'plum' });
    const scene = buildExportScene(model, s, {
      publicBase: '/fresques/x/',
      evaluation: evaluateBoard(model, s),
    });
    expect(scene.width).toBe(EXPORT_W);
    expect(scene.creditBandHeight).toBe(EXPORT_CREDIT_H);
    expect(scene.height).toBe(scene.creditBandY + EXPORT_CREDIT_H);
    expect(scene.creditLine).toMatch(/Fresque du Climat/);
    expect(scene.creditLine).toMatch(/CC BY-NC-ND/);
    expect(scene.licenceUrl).toMatch(/fresqueduclimat\.org\/licence/);
    expect(scene.title).toBe('Ma fresque à moi');
    expect(scene.cards).toHaveLength(2);
    const c04 = scene.cards.find((c) => c.id === 'c04');
    expect(c04.src).toBe('/fresques/x/cards/c04-verso.sm.webp');
    expect(c04.w / c04.h).toBeCloseTo(1719 / 1168, 1);
    expect(scene.arrows).toHaveLength(1);
    // Correction ouverte : la flèche trouvée prend la couleur « trouvée », pas celle de la palette.
    expect(scene.arrows[0].category).toBe('trouvee');
    expect(scene.arrows[0].color).toBe('#15803d');
    expect(scene.notes).toHaveLength(1);
    expect(scene.notes[0].text).toBe('Marcher plus');
    expect(scene.showBands).toBe(true);
    expect(scene.bands).toHaveLength(5);
  });

  test('sans correction, la couleur choisie s’applique ; sans titre, celui du jeu', () => {
    let s = createInitialState(model);
    s = placeCard(model, s, 'c04', { x: 10, y: 10 });
    s = placeCard(model, s, 'c13', { x: 60, y: 10 });
    s = addLink(model, s, 'c04', 'c13').state;
    s = setCreative(model, s, { arrowColor: 'rose' });
    const scene = buildExportScene(model, s, {});
    expect(scene.arrows[0].color).toBe('#be123c');
    expect(scene.arrows[0].category).toBeNull();
    expect(scene.title).toBe(model.deck.title);
    expect(scene.showBands).toBe(false);
    expect(exportFilename(model, s)).toBe('fresque-du-climat-junior.png');
    expect(exportFilename(model, setCreative(model, s, { title: 'Été chaud !' }))).toBe(
      'ete-chaud.png',
    );
  });
});
