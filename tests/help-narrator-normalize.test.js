// Normalisation et schéma Zod du réglage `content.help.narrator` (OLU).
// Volontairement **sans base de données** : ces règles sont pures, elles doivent
// pouvoir être vérifiées sans MySQL. Les routes sont couvertes par
// tests/help-narrator-routes.test.js.
const test = require('node:test');
const assert = require('node:assert');

const {
  HELP_NARRATOR_KEY,
  NARRATOR_EXPRESSIONS,
  NARRATOR_FRAMINGS,
  NARRATOR_SILHOUETTES,
  loadDefaultNarratorConfig,
  normalizeHelpNarratorConfig,
  buildPublicNarratorPayload,
  helpNarratorSchema,
} = require('../lib/helpNarrator');

test('la clé de réglage est distincte du corpus d’aide', () => {
  const { HELP_REGISTRY_KEY } = require('../lib/helpContent');
  assert.strictEqual(HELP_NARRATOR_KEY, 'content.help.narrator');
  assert.notStrictEqual(HELP_NARRATOR_KEY, HELP_REGISTRY_KEY);
});

test('les défauts sont exploitables tels quels et clonés à chaque appel', () => {
  const a = loadDefaultNarratorConfig();
  assert.deepStrictEqual(a, {
    enabled: true,
    speakerName: 'OLU',
    fallbackSilhouette: 'olu',
    portraits: {},
  });
  assert.ok(helpNarratorSchema.safeParse(a).success);

  a.portraits.neutre = { bust: '/x.webp' };
  assert.deepStrictEqual(loadDefaultNarratorConfig().portraits, {});
});

test('une entrée absente, nulle ou illisible retombe sur les défauts', () => {
  const defaults = loadDefaultNarratorConfig();
  for (const raw of [undefined, null, '', 'nawak', 42, []]) {
    assert.deepStrictEqual(normalizeHelpNarratorConfig(raw), defaults);
  }
});

test('l’interrupteur global n’est éteint que par un false explicite', () => {
  assert.strictEqual(normalizeHelpNarratorConfig({ enabled: false }).enabled, false);
  assert.strictEqual(normalizeHelpNarratorConfig({ enabled: true }).enabled, true);
  // Toute autre valeur laisse le narrateur actif : on n'éteint pas sur un typo.
  assert.strictEqual(normalizeHelpNarratorConfig({ enabled: 'non' }).enabled, true);
  assert.strictEqual(normalizeHelpNarratorConfig({}).enabled, true);
});

test('le nom de locuteur est rogné, tronqué, et peut être vidé', () => {
  assert.strictEqual(normalizeHelpNarratorConfig({ speakerName: '  Olu  ' }).speakerName, 'Olu');
  // Vider explicitement le nom est un choix valide : la bulle n'affiche alors pas d'étiquette.
  assert.strictEqual(normalizeHelpNarratorConfig({ speakerName: '' }).speakerName, '');
  assert.strictEqual(normalizeHelpNarratorConfig({ speakerName: '   ' }).speakerName, '');
  const long = normalizeHelpNarratorConfig({ speakerName: 'x'.repeat(120) });
  assert.strictEqual(long.speakerName.length, 40);
  assert.ok(helpNarratorSchema.safeParse(long).success);
});

test('la silhouette de repli doit appartenir à la liste connue', () => {
  for (const silhouette of NARRATOR_SILHOUETTES) {
    assert.strictEqual(
      normalizeHelpNarratorConfig({ fallbackSilhouette: silhouette }).fallbackSilhouette,
      silhouette,
    );
  }
  for (const bad of ['', 'licorne', 'OLU', 42, null]) {
    assert.strictEqual(
      normalizeHelpNarratorConfig({ fallbackSilhouette: bad }).fallbackSilhouette,
      'olu',
    );
  }
});

test('les 8 expressions canoniques sont acceptées, sur les 3 cadrages', () => {
  const portraits = {};
  for (const expression of NARRATOR_EXPRESSIONS) {
    portraits[expression] = {};
    for (const framing of NARRATOR_FRAMINGS) {
      portraits[expression][framing] = `/uploads/olu-${expression}-${framing}.webp`;
    }
  }
  const config = normalizeHelpNarratorConfig({ portraits });
  assert.deepStrictEqual(Object.keys(config.portraits).sort(), [...NARRATOR_EXPRESSIONS].sort());
  assert.deepStrictEqual(Object.keys(config.portraits.grave).sort(), [...NARRATOR_FRAMINGS].sort());
  assert.ok(helpNarratorSchema.safeParse(config).success);
});

test('une expression inconnue est écartée, une expression vide est omise', () => {
  const config = normalizeHelpNarratorConfig({
    portraits: {
      parle: { bust: '/uploads/parle.webp' },
      // Ni l'expression inconnue, ni celle dont aucune URL n'est retenue ne survivent :
      // l'absence fait retomber le front sur `neutre` puis sur le SVG (§5.2).
      hilare: { bust: '/uploads/hilare.webp' },
      grave: {},
      content: { bust: '   ' },
    },
  });
  assert.deepStrictEqual(config.portraits, { parle: { bust: '/uploads/parle.webp' } });
});

test('seules les URL servables dans un <img> sont retenues', () => {
  const accepted = [
    '/uploads/a.webp',
    '/a.png',
    'http://cdn.test/a.webp',
    'HTTPS://cdn.test/a.png',
  ];
  for (const src of accepted) {
    assert.deepStrictEqual(
      normalizeHelpNarratorConfig({ portraits: { neutre: { bust: src } } }).portraits.neutre,
      { bust: src },
      `URL refusée à tort : ${src}`,
    );
  }

  const refused = [
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    '//evil.test/a.png', // protocole-relatif : sort du site sans le dire
    'uploads/a.webp', // relatif ambigu selon la page courante
    'ftp://cdn.test/a.png',
    `/uploads/${'x'.repeat(600)}.webp`,
  ];
  for (const src of refused) {
    assert.deepStrictEqual(
      normalizeHelpNarratorConfig({ portraits: { neutre: { bust: src } } }).portraits,
      {},
      `URL acceptée à tort : ${src}`,
    );
  }
});

test('un cadrage inconnu est ignoré sans faire tomber l’expression', () => {
  const config = normalizeHelpNarratorConfig({
    portraits: { neutre: { bust: '/uploads/n.webp', torse: '/uploads/t.webp' } },
  });
  assert.deepStrictEqual(config.portraits.neutre, { bust: '/uploads/n.webp' });
});

test('la normalisation est idempotente et le payload public identique', () => {
  const raw = {
    enabled: true,
    speakerName: 'OLU',
    fallbackSilhouette: 'backpackFox',
    portraits: { neutre: { bust: '/uploads/n.webp' }, parle: { face: '/uploads/p.webp' } },
  };
  const once = normalizeHelpNarratorConfig(raw);
  assert.deepStrictEqual(normalizeHelpNarratorConfig(once), once);
  // Rien n'est retiré à la sortie publique : la configuration ne contient aucun secret.
  assert.deepStrictEqual(buildPublicNarratorPayload(raw), once);
});
