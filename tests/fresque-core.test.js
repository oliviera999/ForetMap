'use strict';

/**
 * Cœur partagé des fresques (`src/shared/fresque/fresqueCore.js`, miroir CJS
 * `lib/shared/fresqueCore.js`) : modèle du jeu, cumul des liens attendus par lot, classement
 * des flèches (dont les six pièges), ouverture des lots, indices déterministes, fin, validation,
 * journal et migration. Sans base : le jeu est lu par le registre.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const core = require('../lib/shared/fresqueCore');
const { loadFresqueDecks, resetFresqueDecksForTests } = require('../lib/fresqueDecks');

resetFresqueDecksForTests();
const entry = loadFresqueDecks({ strict: true, reset: true }).get('climat-junior-fr-v7-5');
const model = core.buildDeckModel(entry.deck, entry.correction, entry.hints);
const NOW = '2026-10-25T10:00:00.000Z';

function placeLots(state, lots) {
  let s = state;
  for (const n of lots) {
    for (const id of core.lotCards(model, n)) {
      s = core.placeCard(model, s, id, { x: 10, y: 10, now: NOW });
    }
    if (core.canOpenNextLot(model, s)) s = core.openNextLot(model, s, { now: NOW });
  }
  return s;
}

function link(state, from, to) {
  const r = core.addLink(model, state, from, to, { now: NOW });
  assert.ok(r.link, `flèche ${from}>${to} refusée (${r.result.category})`);
  return r.state;
}

describe('modèle du jeu', () => {
  test('cartes, lots, liens, degrés, rôles', () => {
    assert.equal(model.cardIds.length, 21);
    assert.deepEqual(
      model.lots.map((l) => l.cards.length),
      [5, 6, 10],
    );
    assert.equal(model.totalExpected, 30);
    assert.equal(model.outDegree.c21, 6);
    assert.equal(model.inDegree.c32, 4);
    assert.equal(model.roles.c39, 'arrivee');
    assert.equal(model.roles.c18, 'sans_consequence');
    assert.equal(model.roles.c21, 'relais');
    assert.deepEqual(model.steps, ['decouvrir', 'lot1', 'lot2', 'lot3', 'comprendre']);
    assert.ok(model.reachableTwoPlus.c04.includes('c21'));
    assert.ok(!model.reachableTwoPlus.c04.includes('c07'), 'c07 est à une flèche de c04');
  });

  test('bandes guidées : colonnes de gauche à droite', () => {
    const first = core.bandRect(model, 'activites');
    const last = core.bandRect(model, 'vivant');
    assert.equal(first.x, 0);
    assert.equal(Math.round(first.w), 20);
    assert.equal(Math.round(last.x), 80);
    assert.deepEqual(core.bandRect(model, 'inconnue'), { x: 0, y: 0, w: 100, h: 100 });
  });

  test('le miroir CJS expose les mêmes fonctions que la source ESM', async () => {
    const esm = await import(
      pathToFileURL(path.join(__dirname, '..', 'src', 'shared', 'fresque', 'fresqueCore.js')).href
    );
    assert.deepEqual(Object.keys(esm).sort(), Object.keys(core).sort());
  });
});

describe('cumul des liens attendus par lot', () => {
  test('4 après le lot 1, 10 après le lot 2, 30 après le lot 3', () => {
    let s = core.createInitialState(model, { now: NOW });
    s = placeLots(s, [1]);
    assert.equal(core.expectedLinks(model, s).length, 4);
    assert.equal(s.lotReached, 2, 'le lot 2 est ouvert dès que le lot 1 est posé');
    s = placeLots(s, [2]);
    assert.equal(core.expectedLinks(model, s).length, 10);
    s = placeLots(s, [3]);
    assert.equal(core.expectedLinks(model, s).length, 30);
    assert.equal(core.nextLotNumber(model, s), null);
    assert.ok(core.canEnterUnderstand(model, s));
  });
});

describe('classifyLink', () => {
  const cases = [
    ['c02', 'c07', 'trouvee'],
    ['c18', 'c22', 'piege'],
    ['c08', 'c07', 'piege'],
    ['c18', 'c25', 'a_discuter'],
    ['c21', 'c22', 'raccourci'],
    ['c13', 'c07', 'inversee'],
    ['c04', 'c13', 'raccourci'],
    ['c22', 'c39', 'raccourci'],
    ['c07', 'c21', 'raccourci'],
    ['c36', 'c02', 'a_discuter'],
  ];
  for (const [from, to, expected] of cases) {
    test(`${from} → ${to} = ${expected}`, () => {
      const r = core.classifyLink(model, from, to);
      assert.equal(r.category, expected);
      assert.ok(r.text.length > 0, 'un texte accompagne chaque catégorie');
      assert.equal(r.refused, false);
      assert.ok(r.mark, 'repère visuel (icône + ton)');
    });
  }

  test('les pièges portent leur texte propre et le drapeau trap', () => {
    const r = core.classifyLink(model, 'c18', 'c22');
    assert.equal(r.trap, true);
    assert.match(r.text, /banquise/i);
    const r2 = core.classifyLink(model, 'c21', 'c22');
    assert.equal(r2.trap, true);
    assert.match(r2.text, /Presque/);
  });

  test('boucle et doublon sont refusés', () => {
    assert.equal(core.classifyLink(model, 'c04', 'c04').refused, true);
    assert.equal(core.classifyLink(model, 'c04', 'c04').category, 'boucle');
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    s = link(s, 'c04', 'c07');
    const dup = core.classifyLink(model, 'c04', 'c07', s);
    assert.equal(dup.category, 'doublon');
    assert.equal(dup.refused, true);
    const r = core.addLink(model, s, 'c04', 'c07', { now: NOW });
    assert.equal(r.link, null);
    assert.equal(r.state, s, 'état inchangé');
  });

  test('aucun texte de catégorie ne contient « faux » ni « erreur »', () => {
    for (const [from, to] of cases) {
      const r = core.classifyLink(model, from, to);
      assert.doesNotMatch(r.text, /\b(faux|fausse|erreur)\b/i);
    }
    for (const mark of Object.values(core.LINK_CATEGORY_MARKS)) {
      assert.doesNotMatch(mark.label, /\b(faux|fausse|erreur)\b/i);
    }
  });

  test('A → B et B → A peuvent coexister (la seconde est signalée inversée)', () => {
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    s = link(s, 'c07', 'c13');
    const r = core.addLink(model, s, 'c13', 'c07', { now: NOW });
    assert.ok(r.link);
    assert.equal(r.result.category, 'inversee');
    assert.equal(r.state.links.length, 2);
  });
});

describe('cartes, lots et étapes', () => {
  test('la main contient les cartes du lot ouvert, « Tout poser » les place sans chevauchement', () => {
    let s = core.createInitialState(model, { level: 'eclaireur', now: NOW });
    assert.deepEqual(core.cardsInHand(model, s), ['c04', 'c07', 'c13', 'c18', 'c21']);
    assert.equal(core.canOpenNextLot(model, s), false);
    s = core.placeAllHand(model, s, { now: NOW });
    assert.equal(core.cardsInHand(model, s).length, 0);
    assert.equal(core.cardsOnTable(s).length, 5);
    const rects = Object.values(s.cards).map(core.cardRect);
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        assert.equal(overlap, false, 'deux cartes se recouvrent');
      }
    }
    // Éclaireur : chaque carte est dans sa bande.
    for (const [id, pos] of Object.entries(s.cards)) {
      const band = core.bandRect(model, model.cardsById[id].guideBand);
      assert.ok(pos.x >= band.x && pos.x < band.x + band.w, `${id} hors de sa bande`);
    }
    assert.ok(core.canOpenNextLot(model, s));
  });

  test('une carte d’un lot non ouvert ne peut pas être posée ; retourner ; déplacer', () => {
    let s = core.createInitialState(model, { now: NOW });
    assert.equal(core.placeCard(model, s, 'c03', { x: 5, y: 5, now: NOW }), s);
    s = core.placeCard(model, s, 'c04', { x: 150, y: -3, now: NOW });
    assert.deepEqual(s.cards.c04, { x: 100, y: 0, flipped: false, placedAt: NOW });
    s = core.flipCard(model, s, 'c04', { now: NOW });
    assert.equal(s.cards.c04.flipped, true);
    s = core.moveCard(model, s, 'c04', 20.123, 30.456, { now: NOW });
    assert.equal(s.cards.c04.x, 20.12);
    assert.equal(s.cards.c04.y, 30.46);
    assert.equal(s.cards.c04.placedAt, NOW, 'placedAt conservé');
  });

  test('étapes : on revient sur une étape passée, pas sur une étape future', () => {
    let s = core.createInitialState(model, { now: NOW });
    assert.equal(core.canGoToStep(model, s, 'lot1'), true);
    assert.equal(core.canGoToStep(model, s, 'lot2'), false);
    assert.equal(core.canGoToStep(model, s, 'comprendre'), false);
    s = placeLots(s, [1, 2, 3]);
    assert.equal(core.canGoToStep(model, s, 'comprendre'), true);
    s = core.setStep(model, s, 'comprendre', { now: NOW });
    assert.equal(s.step, 'comprendre');
    s = core.setStep(model, s, 'lot1', { now: NOW });
    assert.equal(s.step, 'lot1');
    assert.equal(core.setStep(model, s, 'inconnue', { now: NOW }), s);
  });
});

describe('évaluation et puces Éclaireur', () => {
  test('evaluateBoard classe, compte et liste les manquantes', () => {
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    s = link(s, 'c04', 'c07');
    s = link(s, 'c07', 'c13');
    s = link(s, 'c13', 'c07');
    s = link(s, 'c21', 'c04');
    const ev = core.evaluateBoard(model, s);
    assert.equal(ev.found, 2);
    assert.equal(ev.expected, 4);
    assert.equal(ev.placed, 5);
    assert.equal(ev.total, 30);
    assert.equal(ev.byCategory.inversee.length, 1);
    assert.equal(ev.byCategory.a_discuter.length, 1);
    assert.deepEqual(ev.missing.map((l) => `${l.from}>${l.to}`).sort(), ['c13>c21', 'c21>c18']);
    const stats = core.outgoingStats(model, s);
    assert.deepEqual(stats.c21, { expectedOut: 6, foundOut: 0, remaining: 6 });
    assert.deepEqual(stats.c04, { expectedOut: 1, foundOut: 1, remaining: 0 });
    assert.deepEqual(stats.c18, { expectedOut: 0, foundOut: 0, remaining: 0 });
  });

  test('point d’étape : message et historique', () => {
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    s = link(s, 'c04', 'c07');
    const msg = core.checkpointMessage(model, s);
    assert.match(msg.text, /1 flèche\(s\) sur 4/);
    assert.equal(msg.allFound, false);
    const { state, check } = core.recordCheckpoint(model, s, { now: NOW });
    assert.deepEqual(check, { lot: 2, at: NOW, found: 1, expected: 4 });
    assert.equal(state.checks.length, 1);
  });
});

describe('indices (post-it) déterministes', () => {
  test('cible = la carte avec le plus de manques, puis le plus petit numéro ; crans 1→4', () => {
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    // Lot 1 posé : chaque carte a une flèche manquante (c04>c07, c07>c13, c13>c21, c21>c18) →
    // ex æquo, la cible est le plus petit numéro.
    const first = core.nextHint(model, s, { now: NOW });
    assert.equal(first.hint.kind, 'hint');
    assert.equal(first.hint.target, 'c04');
    assert.equal(first.hint.rung, 1);
    assert.equal(first.hint.text, model.hints.readingHints.c04);
    assert.equal(first.state.notes.length, 1);
    assert.equal(first.state.notes[0].kind, 'hint');
    assert.equal(first.state.notes[0].color, core.HINT_NOTE_COLOR);
    assert.equal(first.state.notes[0].cardId, 'c04');
    assert.deepEqual(first.state.hints.log, [{ target: 'c04', rung: 1, at: NOW }]);

    // Même état → même indice (aucun aléatoire).
    const again = core.nextHint(model, s, { now: NOW });
    assert.deepEqual(again.hint, first.hint);

    s = first.state;
    const second = core.nextHint(model, s, { now: NOW });
    assert.equal(second.hint.target, 'c04');
    assert.equal(second.hint.rung, 2);
    assert.match(second.hint.text, /3 flèches arrivent sur la carte 7/, 'convergence sur l’effet');
    s = second.state;
    const third = core.nextHint(model, s, { now: NOW });
    assert.equal(third.hint.rung, 3);
    assert.match(third.hint.text, /Cherche ce que provoque la carte 4/);
    s = third.state;
    const fourth = core.nextHint(model, s, { now: NOW });
    assert.equal(fourth.hint.rung, 4);
    assert.deepEqual(fourth.hint.link, { from: 'c04', to: 'c07' });
    assert.match(fourth.hint.text, /carte 4 vers la carte 7/);

    // Accepter la révélation : flèche normale, marquée révélée ; le post-it se ferme.
    const accepted = core.acceptRevealedLink(model, fourth.state, fourth.hint.noteId, { now: NOW });
    assert.ok(accepted.link);
    assert.equal(accepted.link.revealed, true);
    assert.equal(accepted.link.from, 'c04');
    assert.equal(accepted.state.notes.find((n) => n.id === fourth.hint.noteId).dismissed, true);
    // c04 n'a plus de manque : la cible change et repart du cran Lire.
    const fifth = core.nextHint(model, accepted.state, { now: NOW });
    assert.equal(fifth.hint.target, 'c07');
    assert.equal(fifth.hint.rung, 1);
  });

  test('carrefour : avec deux lots posés, c21 (cinq manques) est la cible et le cran 2 le dit', () => {
    const s = placeLots(core.createInitialState(model, { now: NOW }), [1, 2]);
    const h1 = core.nextHint(model, s, { now: NOW });
    assert.equal(h1.hint.target, 'c21');
    const h2 = core.nextHint(model, h1.state, { now: NOW });
    assert.match(h2.hint.text, /carte 21 « La Terre se réchauffe » est un carrefour : 6 flèches/);
    // Révélations successives : chaque cran 4 révèle une flèche différente de c21.
    let st = core.nextHint(model, h2.state, { now: NOW }).state;
    const r1 = core.nextHint(model, st, { now: NOW });
    assert.equal(r1.hint.rung, 4);
    assert.equal(r1.hint.link.to, 'c16');
    const r2 = core.nextHint(model, r1.state, { now: NOW });
    assert.equal(r2.hint.rung, 4);
    assert.equal(r2.hint.link.to, 'c17', 'la flèche déjà révélée n’est pas reproposée');
  });

  test('plus aucune flèche manquante : message à 0 et proposition de continuer, état inchangé', () => {
    let s = core.createInitialState(model, { now: NOW });
    for (const id of core.lotCards(model, 1))
      s = core.placeCard(model, s, id, { x: 10, y: 10, now: NOW });
    for (const l of core.expectedLinks(model, s)) s = link(s, l.from, l.to);
    const r = core.nextHint(model, s, { now: NOW });
    assert.equal(r.hint.kind, 'none');
    assert.match(r.hint.text, /0 flèche/);
    assert.equal(r.hint.suggestNextLot, true);
    assert.equal(r.state, s);
  });

  test('cible changée quand la dernière cible n’a plus de manque', () => {
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    const h = core.nextHint(model, s, { now: NOW });
    s = h.state;
    s = link(s, 'c21', 'c18');
    const h2 = core.nextHint(model, s, { now: NOW });
    assert.equal(h2.hint.target, 'c04', 'ex æquo (1 manque) : plus petit numéro');
  });
});

describe('post-it de l’élève', () => {
  test('ajout borné, texte tronqué, décalé hors des cartes, suppression ; indice seulement fermé', () => {
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    const added = core.addNote(model, s, {
      text: 'x'.repeat(400),
      x: 10,
      y: 10,
      color: 'green',
      now: NOW,
    });
    assert.ok(added.note);
    assert.equal(added.note.text.length, core.FRESQUE_LIMITS.maxNoteText);
    const r = core.noteRect(added.note);
    for (const pos of Object.values(added.state.cards)) {
      const c = core.cardRect(pos);
      const overlap = r.x < c.x + c.w && r.x + r.w > c.x && r.y < c.y + c.h && r.y + r.h > c.y;
      assert.equal(overlap, false, 'un post-it ne touche jamais une carte');
    }
    s = core.updateNote(
      added.state,
      added.note.id,
      { text: 'idée', color: 'blue', x: 60, y: 60 },
      { now: NOW },
    );
    assert.equal(s.notes[0].text, 'idée');
    assert.equal(s.notes[0].color, 'blue');
    s = core.removeNote(s, added.note.id, { now: NOW });
    assert.equal(s.notes.length, 0);
    for (let i = 0; i < core.FRESQUE_LIMITS.maxNotes; i += 1) {
      s = core.addNote(model, s, { text: `n${i}`, x: 50, y: 50, now: NOW }).state;
    }
    assert.equal(core.addNote(model, s, { text: 'trop', now: NOW }).note, null);
    const hint = core.nextHint(model, s, { now: NOW });
    const closed = core.removeNote(hint.state, hint.hint.noteId, { now: NOW });
    assert.equal(closed.notes.find((n) => n.id === hint.hint.noteId).dismissed, true);
  });
});

describe('fin, correction, créativité', () => {
  test('isComplete exige 21 cartes posées ET la correction ouverte, quel que soit le niveau ou le score', () => {
    for (const level of core.FRESQUE_LEVELS) {
      let s = placeLots(core.createInitialState(model, { level, now: NOW }), [1, 2]);
      assert.equal(core.isComplete(model, s), false);
      s = placeLots(s, [3]);
      assert.equal(core.isComplete(model, s), false, 'tout posé mais correction non ouverte');
      s = core.markCorrectionViewed(s, { now: NOW });
      assert.equal(core.isComplete(model, s), true);
      assert.equal(core.summarize(model, s).linksFound, 0);
      assert.equal(core.summarize(model, s).completed, true);
    }
    let s = core.markCorrectionViewed(core.createInitialState(model, { now: NOW }), { now: NOW });
    assert.equal(core.isComplete(model, s), false, 'correction ouverte mais cartes manquantes');
    const later = core.markCorrectionViewed(s, { now: '2027-01-01T00:00:00.000Z' });
    assert.equal(later.correction.viewedAt, NOW, 'la première ouverture fait foi');
  });

  test('révélation des manquantes une à une puis toutes', () => {
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    s = link(s, 'c04', 'c07');
    const one = core.revealNextMissing(model, s, { now: NOW });
    assert.deepEqual(one.revealed, { from: 'c07', to: 'c13' });
    assert.deepEqual(one.state.correction.revealedMissing, ['c07>c13']);
    const two = core.revealNextMissing(model, one.state, { now: NOW });
    assert.deepEqual(two.revealed, { from: 'c13', to: 'c21' });
    const all = core.revealAllMissing(model, two.state, { now: NOW });
    assert.equal(all.correction.revealedMissing.length, 3);
    const none = core.revealNextMissing(model, all, { now: NOW });
    assert.equal(none.revealed, null);
  });

  test('créativité : titre borné, couleur de palette, carte marquante connue', () => {
    let s = core.createInitialState(model, { now: NOW });
    s = core.setCreative(
      model,
      s,
      { title: 't'.repeat(80), arrowColor: 'plum', favoriteCardId: 'c21' },
      { now: NOW },
    );
    assert.equal(s.creative.title.length, 60);
    assert.equal(s.creative.arrowColor, 'plum');
    assert.equal(s.creative.favoriteCardId, 'c21');
    s = core.setCreative(
      model,
      s,
      { arrowColor: 'rouge-fluo', favoriteCardId: 'c99' },
      { now: NOW },
    );
    assert.equal(s.creative.arrowColor, null);
    assert.equal(s.creative.favoriteCardId, null);
  });

  test('niveau libre à tout moment, sans rien perdre', () => {
    let s = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    s = link(s, 'c04', 'c07');
    const expert = core.setLevel(s, 'expert', { now: NOW });
    assert.equal(expert.level, 'expert');
    assert.equal(expert.links.length, 1);
    assert.equal(core.cardsOnTable(expert).length, 5);
    assert.equal(core.setLevel(s, 'ninja', { now: NOW }), s);
    const eclaireur = core.setLevel(expert, 'eclaireur', { now: NOW });
    assert.equal(eclaireur.showBands, true);
  });
});

describe('validateState', () => {
  const valid = () => placeLots(core.createInitialState(model, { now: NOW }), [1]);

  test('un état produit par le cœur est valide', () => {
    let s = valid();
    s = link(s, 'c04', 'c07');
    s = core.addNote(model, s, { text: 'ok', now: NOW }).state;
    s = core.nextHint(model, s, { now: NOW }).state;
    assert.deepEqual(core.validateState(model, s), { ok: true, errors: [] });
  });

  const broken = [
    [
      'carte inconnue',
      (s) => ({ ...s, cards: { ...s.cards, c99: { x: 1, y: 1, flipped: false } } }),
      /carte inconnue/,
    ],
    [
      'coordonnées hors bornes',
      (s) => ({ ...s, cards: { ...s.cards, c04: { x: 101, y: 1, flipped: false } } }),
      /hors 0–100/,
    ],
    [
      'texte trop long',
      (s) => ({
        ...s,
        notes: [{ id: 'n1', kind: 'note', text: 'x'.repeat(281), x: 1, y: 1, color: 'yellow' }],
      }),
      /trop long/,
    ],
    [
      'trop de post-it',
      (s) => ({
        ...s,
        notes: Array.from({ length: 41 }, (_, i) => ({
          id: `n${i}`,
          kind: 'note',
          text: '',
          x: 1,
          y: 1,
          color: 'yellow',
        })),
      }),
      /trop de post-it/,
    ],
    [
      'trop de flèches',
      (s) => ({
        ...s,
        links: Array.from({ length: 201 }, (_, i) => ({ id: `l${i}`, from: 'c04', to: 'c07' })),
      }),
      /trop de flèches/,
    ],
    [
      'flèche vers carte inconnue',
      (s) => ({ ...s, links: [{ id: 'l1', from: 'c04', to: 'c99' }] }),
      /carte inconnue/,
    ],
    ['boucle', (s) => ({ ...s, links: [{ id: 'l1', from: 'c04', to: 'c04' }] }), /boucle/],
    [
      'doublon',
      (s) => ({
        ...s,
        links: [
          { id: 'l1', from: 'c04', to: 'c07' },
          { id: 'l2', from: 'c04', to: 'c07' },
        ],
      }),
      /en double/,
    ],
    ['niveau inconnu', (s) => ({ ...s, level: 'ninja' }), /niveau inconnu/],
    ['étape inconnue', (s) => ({ ...s, step: 'lot9' }), /étape inconnue/],
    [
      'titre trop long',
      (s) => ({ ...s, creative: { ...s.creative, title: 't'.repeat(61) } }),
      /titre trop long/,
    ],
    ['zoom hors bornes', (s) => ({ ...s, viewport: { scale: 50, tx: 0, ty: 0 } }), /zoom/],
    ['mauvais jeu', (s) => ({ ...s, deckId: 'autre' }), /deckId/],
    [
      'révélation hors correction',
      (s) => ({ ...s, correction: { viewedAt: null, revealedMissing: ['c04>c21'] } }),
      /hors correction/,
    ],
  ];
  for (const [label, mutate, re] of broken) {
    test(`refuse : ${label}`, () => {
      const r = core.validateState(model, mutate(valid()));
      assert.equal(r.ok, false);
      assert.ok(
        r.errors.some((e) => re.test(e)),
        `erreurs : ${r.errors.join(' | ')}`,
      );
    });
  }

  test('taille sérialisée ≤ 64 Ko', () => {
    const s = valid();
    const notes = Array.from({ length: 40 }, (_, i) => ({
      id: `n${i}`,
      kind: 'note',
      text: 'x'.repeat(280),
      x: 1,
      y: 1,
      color: 'yellow',
    }));
    assert.equal(
      core.validateState(model, { ...s, notes }).ok,
      true,
      '40 × 280 caractères tiennent',
    );
    const huge = {
      ...s,
      creative: { ...s.creative, title: '' },
      hints: { log: [] },
      viewport: { scale: 1, tx: 0, ty: 0 },
    };
    huge.extra = 'y'.repeat(70 * 1024);
    const r = core.validateState(model, huge);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /volumineux/.test(e)));
  });
});

describe('migrateState', () => {
  test('complète les champs absents, garde le reste', () => {
    const raw = {
      v: 1,
      deckId: 'climat-junior-fr-v7-5',
      cards: { c04: { x: 1, y: 2, flipped: true } },
      level: 'expert',
    };
    const m = core.migrateState(raw);
    assert.equal(m.step, 'decouvrir');
    assert.equal(m.lotReached, 1);
    assert.deepEqual(m.links, []);
    assert.deepEqual(m.hints, { log: [] });
    assert.equal(m.showBands, false);
    assert.equal(m.cards.c04.flipped, true);
    assert.equal(core.validateState(model, m).ok, true);
    assert.equal(core.migrateState(null), null);
    assert.equal(core.migrateState({ v: 2, foo: 1 }).foo, 1, 'version supérieure : rendu tel quel');
    assert.equal(core.migrateState({}).level, 'explorateur');
  });
});

describe('diffStates et auteur', () => {
  test('événements du journal : pose, flèche, post-it, indice, point d’étape, lot, niveau, fin', () => {
    const s0 = core.createInitialState(model, { now: NOW });
    let s1 = placeLots(s0, [1]);
    s1 = link(s1, 'c04', 'c07');
    s1 = core.addNote(model, s1, { text: 'q', now: NOW }).state;
    s1 = core.nextHint(model, s1, { now: NOW }).state;
    s1 = core.recordCheckpoint(model, s1, { now: NOW }).state;
    s1 = core.setLevel(s1, 'eclaireur', { now: NOW });
    s1 = core.moveCard(model, s1, 'c04', 50, 50, { now: NOW });
    s1 = core.flipCard(model, s1, 'c04', { now: NOW });
    const events = core.diffStates(model, s0, s1);
    const types = events.map((e) => e.type);
    assert.equal(types.filter((t) => t === 'card_placed').length, 5);
    assert.ok(types.includes('link_added'));
    assert.equal(events.find((e) => e.type === 'link_added').payload.category, 'trouvee');
    assert.ok(types.includes('note_added'));
    assert.ok(types.includes('hint_requested'));
    assert.ok(types.includes('checkpoint'));
    assert.ok(types.includes('lot_opened'));
    assert.ok(types.includes('level_changed'));
    assert.ok(types.includes('step_changed'));
    assert.ok(!types.includes('completed'));
    assert.ok(!types.some((t) => /move|flip/.test(t)), 'pas de journal des déplacements');

    let done = placeLots(s1, [2, 3]);
    done = core.markCorrectionViewed(done, { now: NOW });
    const ev2 = core.diffStates(model, s1, done);
    assert.ok(ev2.map((e) => e.type).includes('correction_viewed'));
    assert.ok(ev2.map((e) => e.type).includes('completed'));
    assert.deepEqual(core.diffStates(model, done, done), []);
    const removed = core.removeLink(done, done.links[0].id, { now: NOW });
    assert.equal(core.diffStates(model, done, removed)[0].type, 'link_removed');
  });

  test('stampAuthor réécrit `by` sur les nouveaux éléments seulement', () => {
    let prev = placeLots(core.createInitialState(model, { now: NOW }), [1]);
    prev = core.addLink(model, prev, 'c04', 'c07', { now: NOW, by: 'ancien' }).state;
    let next = core.addLink(model, prev, 'c07', 'c13', { now: NOW, by: 'triche' }).state;
    next = core.addNote(model, next, { text: 'n', now: NOW, by: 'triche' }).state;
    const stamped = core.stampAuthor(prev, next, 'u42');
    assert.equal(stamped.links[0].by, 'ancien');
    assert.equal(stamped.links[1].by, 'u42');
    assert.equal(stamped.notes[0].by, 'u42');
  });
});

describe('fillTemplate', () => {
  test('remplace les variables connues, laisse les autres', () => {
    assert.equal(core.fillTemplate('{a} et {b} {c}', { a: 1, b: 'deux' }), '1 et deux {c}');
    assert.equal(core.fillTemplate(null, {}), '');
  });
});
