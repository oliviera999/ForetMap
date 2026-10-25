'use strict';

/**
 * Corpus « La Fresque du Climat – version Enfant (FR, v7.5) » — `public/fresques/climat-junior-fr-v7-5/`.
 *
 * Contrôle **statique** des fichiers de données et des images, sans base : le registre
 * `lib/fresqueDecks.js` est chargé en mode strict, puis chaque invariant du jeu est revérifié
 * ici indépendamment (ce test est le garde-fou de contenu du job CI « Contenu pédagogique »).
 *
 * Garde-fou de licence (CC BY-NC-ND, « sans modification ») : l'empreinte SHA-256 de chacune
 * des 92 images est figée ci-dessous. Toute retouche, recadrage, ré-encodage ou renommage fait
 * tomber ce test. Une nouvelle édition officielle va dans un NOUVEAU dossier versionné.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  FRESQUES_DIR,
  loadFresqueDecks,
  resetFresqueDecksForTests,
} = require('../../lib/fresqueDecks');

const DECK_ID = 'climat-junior-fr-v7-5';
const DIR = path.join(FRESQUES_DIR, DECK_ID);

/** Empreintes SHA-256 des 92 images livrées (paquet du 25/10/2026, contrôlé par SHA256SUMS). */
const IMAGE_SHA256 = Object.freeze({
  'c02-recto.sm.webp': 'd22ccc58d4622af89eba90acc2dfa45a9ff211b9d60233afecc03ff4bc7c7f13',
  'c02-recto.webp': '5093e609cfdd13933d16ee284222d579f547c59ebbaf8d171b9d984c641bb05e',
  'c02-verso.sm.webp': 'eca19e0f01db0aa915d15b13edb6931226de7869e157d98afc7f23cbcf4e3410',
  'c02-verso.webp': '18d6676cc5333e3135f6e64ab8f387d7bb1b1daf349972a662081abe3c91968b',
  'c03-recto.sm.webp': '926dfc026436dff140a3208d41243f44460387ae398191b0c714887be16b57f6',
  'c03-recto.webp': 'd319c6ea1cf66518f5aba43655c697a886ee1c7d4815071d0df5a91559805e5e',
  'c03-verso.sm.webp': '3b526f54b020d1d51516b85d34eeace5e824edd5463644d2c2feea1b859a2c8c',
  'c03-verso.webp': '6bbb164fd7f8db1315f066c06fce27ab291a6193a7605a3cce7d5fdf2269422e',
  'c04-recto.sm.webp': '296a1a0b2ba14bc21b237f30f83726b132d964d3834871d34f3799cd2bc7e8ec',
  'c04-recto.webp': 'e8899af0ac3f173afbe503b1027f1d66041611a6bc7f45864ff22a2404caa28d',
  'c04-verso.sm.webp': 'ac2fa344efffb0a9463021ef1909728d36c9b58c6007d8f0fad23a5ed3009734',
  'c04-verso.webp': '0fe60cfe4a65d16461376f4e6f352355d892080a803051d13aeabcc06da7fc0a',
  'c07-recto.sm.webp': '4c1eaf1f377d94fcda2762b4c5a720ea889b0975ce489fb5c87e4c0d98f15f34',
  'c07-recto.webp': 'a6d42a11c94cde58d9442f7245d46d38896bac5fdcbb9baecc975eae8358194a',
  'c07-verso.sm.webp': 'ebc0839f2a7dd6bf27d32b5f7c0594eb3cc0afea7c0bd71047aa797797f70abb',
  'c07-verso.webp': '196bd45468263d77b7549136a40d34cd9afad1d3102d135ca2acd65d24cb6aa3',
  'c08-recto.sm.webp': '636ca95c110b1e81015e0d6b41d5b5d3e6efe8bc176e151c845d8023e9562a15',
  'c08-recto.webp': 'fe1cb9c5aaf6f484690bd94fdee3721284975c4499d3e95fed0ffc0f8a2f8601',
  'c08-verso.sm.webp': 'e758aac2f4c1af2f8566d7339399127612414522739b4946684e003d59c3f5c4',
  'c08-verso.webp': 'aea077d328c7c71e00f3327e1dfeffaeea38d63917191e6dcda4b3c13ea3fc7b',
  'c13-recto.sm.webp': 'd7bde80d72487cd11e55578a76b5d14d625d124898c6588f9b779fd926218625',
  'c13-recto.webp': 'f051b8e5e655211238a9b8169191bafda6bd0eeb76df8196d1436dfbe6359d69',
  'c13-verso.sm.webp': '7c7115fc3f8f27b7b2d1d158391d806875525a2b6bdde2e6035454b7d7f1af63',
  'c13-verso.webp': '4161d8154ea57017db22e0825fa32af9a649a5509bc4d973aafacb68910b903a',
  'c16-recto.sm.webp': '3969b8ecf70da676615216874e63ab26c9f2cafcf8b22172054a7d1af4935068',
  'c16-recto.webp': 'a0a6e215740e347167f74edfdb0d319b956ef7b93d1a7bccd843041afa80be53',
  'c16-verso.sm.webp': '2ffb8cccc45bc03ac108b6391b8034081aa5012be85ac9965414493e3d5843a5',
  'c16-verso.webp': 'ade14a6ab45f8908f1eff412acefdc122f2203e01091e33b0c4e5092332d8fe0',
  'c17-recto.sm.webp': 'f28ef7aa9150db364284011f61e6ef7b85f62e49268845fe2097a36a73e52060',
  'c17-recto.webp': '825726588b4f6558443758a634dcb8684173c11b2558339794b97ea61679f77a',
  'c17-verso.sm.webp': 'a4c72d811d1c9928e41c1fef576dd04ede881235d95c3aed22f5b4ec20925d6e',
  'c17-verso.webp': 'a1309761af462fe1381f29f99f73003ef6c6701d5f0b08938c7dec23bea7181b',
  'c18-recto.sm.webp': 'adda0b9c7ff98347cbad3e387dea727d2bc4918a61ccce2e2e66f909b03e55c1',
  'c18-recto.webp': '5e0fde1a61b0c62152e0dabde014019cc7d3c1dc2c3567851a7f1d66703fc834',
  'c18-verso.sm.webp': 'f8a107f2fe95efcfd3ddc526786ce13f9a3816af98e4c3c6c7e752a94e8aed14',
  'c18-verso.webp': '55e34f6d38a818266bffdf26a510ead4f828e91ae089f48584b878069d5059cf',
  'c20-recto.sm.webp': '898392a34eb7ab8aef34d2c6d83ef43e9fd2edac103b7500fa8413ce7ac7b47c',
  'c20-recto.webp': '9df4d45ffee65e37de5fb11a50aa3d09d200ba50098dca12a8aecdb9767b96e9',
  'c20-verso.sm.webp': '66246e770dde22b0f8da07d2ce0123c5eb77febbdd271ea25cb339f7b9988eea',
  'c20-verso.webp': 'c013f8510543c5295f5684a7b1d6ced3b2932844b96a946451ec9f7445fd5683',
  'c21-recto.sm.webp': '17511b52bfb00c5d8cb6574dce2279529ab5bc84ec8e57fae6e63ecd9009682c',
  'c21-recto.webp': 'f7bd767ebd774eca9888f4b9a98559c1282a6f3fa5bf11ccb8ff2f20ace92b19',
  'c21-verso.sm.webp': '0ad974b5cb128c092ccc59355bbb972a40387fd95d2bd3dc440f463b25fdd948',
  'c21-verso.webp': '36c20dba7be11850607cf1accd2cdff14b0e39dd024f8ee0fe51704af4edd613',
  'c22-recto.sm.webp': 'b3f6f04c73a082184d4faf78125b7e2c2f46e26c067a0946f010f52863036b67',
  'c22-recto.webp': 'f50a89b78dc0e3848c83f9341fd7054e6423a45e70428223d9a7601e2057f9be',
  'c22-verso.sm.webp': '273d3e38e1b1611b4a3cae2ac140c823e2633620f0562657d215f60e1595a439',
  'c22-verso.webp': 'b4a8cdf900263c67fd7d997275095b714a8733d5445e09309a25a7e2de851c00',
  'c25-recto.sm.webp': '9a77a9306368bea311c60e2ac1a02219b31b847e64a09a299f36b2442c2cd70c',
  'c25-recto.webp': '05a0a030fdbf9062250ad722b81ac6148d30852ada74f6f5b2e68d06103f5eaf',
  'c25-verso.sm.webp': 'e952b245dc5c996931f1ba7dcee58575553bfbc6fd7eed24eff26772b2ee24e4',
  'c25-verso.webp': 'cb8e5965273e37575728b1c94a8178a4d436f13057ea2b4c607c185e97b23909',
  'c26-recto.sm.webp': 'aa6a56c1a5e6a00acad1f778aabacf74c130896b6909a4edda5c0ec5717f05f7',
  'c26-recto.webp': 'a12aade080f48448034b627ef7a937f9091ad217d071fe90acab6479fab705b2',
  'c26-verso.sm.webp': '67d5fc84ef3957f1da7c933e4c474d7eb7047f3d902c38f1ef1f609ff80ce19f',
  'c26-verso.webp': '9c5d73e8554795fa69f109250348ad31d19e65a75be803c8a5881b202f2ca3e1',
  'c30-recto.sm.webp': '948d48ac49e516efb727a337316affd967f421d3a08e60048b4f9877fb1eeb1c',
  'c30-recto.webp': 'ebb678b92dcbfeca5ed184956828618b992102af6f86652c269042517dd6c9fb',
  'c30-verso.sm.webp': '67b3e886d9c8cd0583b257c0897451f27c32fe91ddcb72a1605a8eb81fc52ad7',
  'c30-verso.webp': '69d432b2b86ee7f7a4e6c0de0a5868a935ea1d45157e3d24031a2ef1837f7b0f',
  'c32-recto.sm.webp': '1d1ab10237bedab235a17577fc7ad9d18a0e0c016a7e26c33c18d464709c7ecc',
  'c32-recto.webp': '79df45f0f7495c83ebd8801215b46291f65c49d97060d24b7ecdea5670a96fd3',
  'c32-verso.sm.webp': '0ac87317ca270be60b87c2228846c9dfce2386b7bfe09ae5421c114e17e7e6a8',
  'c32-verso.webp': 'f4e0148cef19c473808be19c7442abc848db919f4f3af519a3891444a004b2f8',
  'c33-recto.sm.webp': '4001eae171adddfb1d93ec51beae9159fe82048892ada0e3b72ee43a8e14d59a',
  'c33-recto.webp': 'f068430084be8177dff93aa062b2c09424285c12302e7e824a7061ee70a1e0f4',
  'c33-verso.sm.webp': '30a360092c82d0658dbab08dec9eed657a3fdb4c31641a388d0dbe9ed8b29f38',
  'c33-verso.webp': '60dd4131df33e72940d8633340c33dfbada4e0b00680535b7024b240cd30a212',
  'c34-recto.sm.webp': 'b369c4ef70ef09501b89fdf78e78f1efb248fd37399b02414f67810ae6de3013',
  'c34-recto.webp': '985d93977a2fbb32087f937941bfc24cf3607b368432ccf6e80599163d2b3036',
  'c34-verso.sm.webp': '61620c46ba230d3e29f9170d33a43f6c53c68972cc5b04ce0711453ca1aeca9b',
  'c34-verso.webp': '0dc0b992359c5c1c6feb38a9649713f120244ba446b4b0fe29f7665c5def7536',
  'c36-recto.sm.webp': '130aad2ae83c0e02146b230c6305fa592d80d911344518271ee92bf70ecb6e17',
  'c36-recto.webp': 'a48f96a23359355c7daba7d3a775fb585fc1669364036235c9a1b13de869915f',
  'c36-verso.sm.webp': '6477be379ecd610204a5a8bed97ef1259b7ec93c8a1439aeeaca9d97a9c9d48d',
  'c36-verso.webp': 'cfd9993142ef25f6176e70a95689410445f4fab1c2f9aeeb7f82b1ea9a7c4455',
  'c37-recto.sm.webp': '1eb58169681167fc9076649b4485790d1ed10925c3d866089182c21e774e2b95',
  'c37-recto.webp': '8e37269d79e03f552d6124138314b614f5c639efef14fbfbdd7eb16b8e54478d',
  'c37-verso.sm.webp': 'dd0a1b9af43a004a49a914e6cca5fb51952f1731a0f1299c84cd0884c1f17743',
  'c37-verso.webp': 'f9829e8718ebbe98dac957c385357160fcfc52adba10c8e7077737f4051e73eb',
  'c39-recto.sm.webp': 'e60912b650995b3b3ff6752e780fecc62193959d96876b3e4b5372abbf9a0b18',
  'c39-recto.webp': '357b680f000e370eba7c84c1b772d4e70e6bc5e7d5feb132543ba335a27e79f4',
  'c39-verso.sm.webp': 'af672f7557ef2abb82913a105eabbe620c4fba00d8430ab24aa7070374cbc0fb',
  'c39-verso.webp': 'bb42aa45ad66fa92f2b46e52f3e11723aafdd4e4749bddad178c93ab65694c7f',
  'licence-recto.sm.webp': '148f8d1bdc9277731c0f777e7c45aca663c700b3bd291ea4ee3ab5bef19d6f7f',
  'licence-recto.webp': 'e0ea6073ef10b9ecd153301e7a58d216363e2403ea0a69eeff66936569a0eb85',
  'licence-verso.sm.webp': 'b4adee7534045c3da0bc0aa809eb035be26651afcae67d7eb3e37c4374b4e649',
  'licence-verso.webp': '770f92d218d19f9fb850671fa10f0b1b8f4546c34e79575c9dde9f4c6d5e1fbc',
  'titre-recto.sm.webp': '1f77a6db2999b5f4fa686110199b60c1b69c00bf3355b8fcbbea4dd15d1f056b',
  'titre-recto.webp': 'd5f2ba96839b34e23e24f9a3fe8bd5a0ecdf32d65b754e17c6a4b4b72f7284bd',
  'titre-verso.sm.webp': '43be20c2de8a67aca53889ab724b44ad4d7f026905510db03ef09ab24cded734',
  'titre-verso.webp': '6b40721e15bba0366306e31d7510bc50e6c62f76d4c237768b7a7d5899d8ab91',
});

resetFresqueDecksForTests();
const registry = loadFresqueDecks({ strict: true, reset: true });
const entry = registry.get(DECK_ID);
const { deck, correction, hints } = entry;

test('le registre charge le jeu en mode strict', () => {
  assert.ok(entry, 'jeu absent du registre');
  assert.equal(deck.id, DECK_ID);
  assert.equal(deck.kind, 'cause_effect');
  assert.equal(entry.publicBase, `/fresques/${DECK_ID}/`);
});

test('21 cartes réparties en 3 lots de 5, 6 et 10, cohérentes avec deck.cards', () => {
  assert.equal(deck.cards.length, 21);
  assert.deepEqual(
    deck.lots.map((l) => l.cards.length),
    [5, 6, 10],
  );
  const inLots = deck.lots.flatMap((l) => l.cards);
  assert.equal(new Set(inLots).size, 21);
  for (const lot of deck.lots) {
    for (const id of lot.cards) {
      const card = deck.cards.find((c) => c.id === id);
      assert.ok(card, `carte ${id} inconnue`);
      assert.equal(card.lot, lot.number, `carte ${id} : lot incohérent`);
    }
  }
  // Annexe A du cahier des charges.
  assert.deepEqual(deck.lots[0].cards, ['c04', 'c07', 'c13', 'c18', 'c21']);
  assert.deepEqual(deck.lots[1].cards, ['c03', 'c16', 'c17', 'c20', 'c26', 'c36']);
  assert.deepEqual(deck.lots[2].cards, [
    'c02',
    'c08',
    'c22',
    'c25',
    'c30',
    'c32',
    'c33',
    'c34',
    'c37',
    'c39',
  ]);
});

test('toutes les images référencées existent et aucune image orpheline ne traîne', () => {
  const referenced = new Set();
  for (const card of deck.cards) {
    for (const key of ['recto', 'verso', 'rectoSmall', 'versoSmall']) referenced.add(card[key]);
  }
  for (const special of Object.values(deck.specialCards)) {
    referenced.add(special.recto);
    referenced.add(special.verso);
  }
  referenced.add(deck.attribution.noticeImage);
  for (const rel of referenced) {
    assert.ok(fs.existsSync(path.join(DIR, rel)), `image absente : ${rel}`);
  }
  const onDisk = fs.readdirSync(path.join(DIR, 'cards')).sort();
  assert.equal(onDisk.length, 92);
  // Les vignettes des cartes spéciales ne sont pas référencées par deck.json : on les tolère
  // (même nom + `.sm.webp`), rien d'autre.
  for (const file of onDisk) {
    const rel = `cards/${file}`;
    const full = file.replace(/\.sm\.webp$/, '.webp');
    assert.ok(
      referenced.has(rel) || referenced.has(`cards/${full}`),
      `image non référencée : ${rel}`,
    );
  }
});

test('garde-fou « sans modification » : empreinte SHA-256 de chaque image', () => {
  const onDisk = fs.readdirSync(path.join(DIR, 'cards')).sort();
  assert.deepEqual(onDisk, Object.keys(IMAGE_SHA256).sort());
  for (const [file, expected] of Object.entries(IMAGE_SHA256)) {
    const digest = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(DIR, 'cards', file)))
      .digest('hex');
    assert.equal(digest, expected, `image modifiée : ${file}`);
  }
});

test('30 flèches de correction entre cartes existantes, sans doublon ni boucle', () => {
  const ids = new Set(deck.cards.map((c) => c.id));
  assert.equal(correction.links.length, 30);
  assert.equal(correction.expected.total, 30);
  const keys = new Set();
  for (const { from, to } of correction.links) {
    assert.ok(ids.has(from), `carte inconnue ${from}`);
    assert.ok(ids.has(to), `carte inconnue ${to}`);
    assert.notEqual(from, to);
    keys.add(`${from}>${to}`);
  }
  assert.equal(keys.size, 30);
});

test('degrés sortants / entrants et cumul par lot recalculés = expected', () => {
  const out = {};
  const inn = {};
  for (const c of deck.cards) {
    out[c.id] = 0;
    inn[c.id] = 0;
  }
  for (const { from, to } of correction.links) {
    out[from] += 1;
    inn[to] += 1;
  }
  assert.deepEqual(out, correction.expected.outDegree);
  assert.deepEqual(inn, correction.expected.inDegree);

  const placed = new Set();
  const cumulative = {};
  for (const lot of deck.lots) {
    for (const id of lot.cards) placed.add(id);
    cumulative[String(lot.number)] = correction.links.filter(
      (l) => placed.has(l.from) && placed.has(l.to),
    ).length;
  }
  assert.deepEqual(cumulative, { 1: 4, 2: 10, 3: 30 });
  assert.deepEqual(cumulative, correction.expected.cumulativeByLot);
  // Annexe A : degrés sortants différents de 1 et convergences.
  assert.equal(out.c21, 6);
  assert.equal(out.c20, 3);
  assert.equal(inn.c32, 4);
  assert.equal(inn.c39, 4);
  assert.equal(inn.c07, 3);
});

test('une seule carte sans flèche sortante hors arrivée : la banquise (c18)', () => {
  const out = correction.expected.outDegree;
  const sinks = Object.keys(out).filter((id) => out[id] === 0);
  assert.deepEqual(sinks.sort(), ['c18', 'c39']);
  assert.equal(correction.expected.inDegree.c39, 4, 'c39 est l’arrivée');
});

test('chaque piège désigne des cartes existantes et une flèche hors correction', () => {
  const ids = new Set(deck.cards.map((c) => c.id));
  const official = new Set(correction.links.map((l) => `${l.from}>${l.to}`));
  const trapKeys = Object.keys(hints.traps);
  assert.ok(trapKeys.length >= 6, 'au moins six pièges attendus');
  for (const key of trapKeys) {
    const [from, to] = key.split('>');
    assert.ok(ids.has(from) && ids.has(to), `piège ${key} : carte inconnue`);
    assert.ok(!official.has(key), `piège ${key} : la flèche est dans la correction`);
  }
  assert.equal(hints.traps['c18>c22'].category, 'piege');
  assert.equal(hints.traps['c08>c07'].category, 'piege');
  assert.equal(hints.traps['c18>c25'].category, 'a_discuter');
  assert.equal(hints.traps['c21>c22'].category, 'raccourci');
});

test('chaque carte a un indice de lecture, chaque lot une introduction, chaque niveau un libellé', () => {
  for (const c of deck.cards) {
    assert.ok(String(hints.readingHints[c.id] || '').trim(), `pas d’indice pour ${c.id}`);
  }
  for (const lot of deck.lots) assert.ok(hints.lotIntros[String(lot.number)]);
  assert.deepEqual(Object.keys(hints.levels).sort(), ['eclaireur', 'expert', 'explorateur']);
  assert.equal(hints.tutorial.length, 5);
  assert.equal(hints.ladder.length, 4);
});

test('ton anti-culpabilisant : aucun « faux » ni « erreur » dans les textes élève', () => {
  const texts = [];
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const key of [
    'tutorial',
    'lotIntros',
    'readingHints',
    'templates',
    'feedback',
    'traps',
    'checkpoint',
    'completion',
    'levels',
  ]) {
    walk(hints[key]);
  }
  for (const text of texts) {
    assert.ok(!/\b(faux|fausse|erreur)\b/i.test(text), `mot interdit dans « ${text} »`);
  }
});

test('la disposition officielle couvre les 21 cartes en pourcentage', () => {
  assert.equal(correction.officialLayout.unit, 'percent');
  assert.deepEqual(
    Object.keys(correction.officialLayout.cards).sort(),
    deck.cards.map((c) => c.id).sort(),
  );
});

test('crédit et licence présents (CC BY-NC-ND, auteur, site)', () => {
  const a = deck.attribution;
  assert.equal(a.licence.id, 'CC-BY-NC-ND');
  assert.match(a.creditLine, /Fresque du Climat/);
  assert.match(a.creditLine, /Cédric Ringenbach/);
  assert.match(a.creditLine, /fresqueduclimat\.org/);
  assert.match(a.creditLine, /CC BY-NC-ND/);
  assert.ok(fs.existsSync(path.join(DIR, 'LICENCE-NOTICE.md')));
});

test('voix d’OLU : tutoriel, point d’étape et fin suivent la charte du narrateur', () => {
  // docs/MASCOT_NARRATEUR_OLU.md §2 : pas de flatterie, pas d'émoji, pas de « ! » sur une
  // surface d'apprentissage, 1 à 3 phrases par bulle, et les tournures que la charte exclut.
  const spoken = [
    ...hints.tutorial.map((s) => s.text),
    hints.checkpoint.allFound,
    hints.checkpoint.encourage,
    hints.checkpoint.nextLot,
    hints.completion.title,
    hints.completion.text,
    hints.feedback.trouvee,
  ];
  for (const text of spoken) {
    assert.ok(!/\b(Bravo|Excellent|Super)\b/i.test(text), `flatterie dans « ${text} »`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(text), `émoji dans « ${text} »`);
    assert.ok(!text.includes('!'), `« ! » dans « ${text} »`);
    assert.ok(
      !/n[’']hésite pas|Désolé|Tu me suis|C’est clair \?/i.test(text),
      `tournure exclue : « ${text} »`,
    );
  }
  for (const step of hints.tutorial) {
    const sentences = step.text.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length;
    assert.ok(sentences >= 1 && sentences <= 3, `${step.id} : ${sentences} phrases`);
  }
});
