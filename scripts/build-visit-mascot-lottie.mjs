/**
 * Génère src/assets/lottie/visit-mascot.json
 * Personnage « rétro-moderne » : gros yeux, bouche simple, jambes animées (pas) sur frames 1–30 ; frame 0 = idle.
 * Exécution : node scripts/build-visit-mascot-lottie.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const out = path.join(root, 'src', 'assets', 'lottie', 'visit-mascot.json');

const F = [0.102, 0.278, 0.192, 1];
const LEAF = [0.176, 0.416, 0.310, 1];
const CREAM = [0.996, 0.98, 0.878, 1];
const BOOT = [0.42, 0.26, 0.15, 1];
const SAGE = [0.322, 0.718, 0.533, 1];
const WHITE = [1, 1, 1, 1];
const BLACK = [0.06, 0.12, 0.1, 1];
const MINT = [0.718, 0.894, 0.78, 1];

function fl(c, nm) {
  return { ty: 'fl', c: { a: 0, k: c }, o: { a: 0, k: 100 }, r: 1, nm };
}

function tr(p, a, r, nm = 'T') {
  const rot = typeof r === 'number' ? { a: 0, k: r } : r;
  return {
    ty: 'tr',
    p: { a: 0, k: p },
    a: { a: 0, k: a },
    s: { a: 0, k: [100, 100] },
    r: rot,
    o: { a: 0, k: 100 },
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
    nm,
  };
}

/** Keyframes rotation jambe : idle t=0 à 0°, marche t=1..30 boucle (même pose t=1 et t=30). */
function legRotKeyframes(phase) {
  const k = [
    { t: 0, s: [0] },
    { t: 1, s: [22 * phase] },
    { t: 15, s: [-20 * phase] },
    { t: 30, s: [22 * phase] },
  ];
  return { a: 1, k };
}

function gr(nm, ix, ...items) {
  return {
    ty: 'gr',
    it: items,
    nm,
    np: items.length,
    cix: 2,
    bm: 0,
    ix,
    hd: false,
  };
}

/** Jambe : pivot hanche en haut du segment. phase +1 gauche, -1 droite pour déphasage marche. */
function legGroup(nm, ix, xHip, phase) {
  const boot = {
    ty: 'rc',
    d: 1,
    s: { a: 0, k: [13, 10] },
    p: { a: 0, k: [0, 34] },
    r: { a: 0, k: 4 },
    nm: 'Boot',
  };
  const shin = {
    ty: 'rc',
    d: 1,
    s: { a: 0, k: [12, 26] },
    p: { a: 0, k: [0, 14] },
    r: { a: 0, k: 5 },
    nm: 'Shin',
  };
  const inner = gr(
    `${nm}Geo`,
    1,
    shin,
    fl(LEAF, 'LegFill'),
    boot,
    fl(BOOT, 'BootFill'),
    tr([0, 0], [0, 0], 0, 'Tinner')
  );
  return gr(
    nm,
    ix,
    inner,
    tr([xHip, -6], [0, -6], legRotKeyframes(phase), 'Hip')
  );
}

/** Bras simple, balancement léger opposé aux jambes. */
function armGroup(nm, ix, xSide, phase) {
  const arm = {
    ty: 'rc',
    d: 1,
    s: { a: 0, k: [9, 22] },
    p: { a: 0, k: [0, 10] },
    r: { a: 0, k: 4 },
    nm: 'Arm',
  };
  const inner = gr(`${nm}Geo`, 1, arm, fl([0.22, 0.45, 0.33, 1], 'Sleeve'), tr([0, 0], [0, 0], 0));
  const rk = {
    a: 1,
    k: [
      { t: 0, s: [0] },
      { t: 1, s: [-12 * phase] },
      { t: 15, s: [14 * phase] },
      { t: 30, s: [-12 * phase] },
    ],
  };
  return gr(nm, ix, inner, tr([xSide, -38], [0, -32], rk, 'Shoulder'));
}

const shadow = gr(
  'Shadow',
  1,
  {
    ty: 'el',
    d: 1,
    s: { a: 0, k: [44, 12] },
    p: { a: 0, k: [0, 2] },
    nm: 'Sh',
  },
  fl([0.1, 0.2, 0.15, 0.35], 'ShFill'),
  tr([0, 0], [0, 0], 0)
);

const torso = gr(
  'Torso',
  10,
  {
    ty: 'rc',
    d: 1,
    s: { a: 0, k: [46, 44] },
    p: { a: 0, k: [0, -32] },
    r: { a: 0, k: 16 },
    nm: 'TorsoRc',
  },
  fl(LEAF, 'TorsoFill'),
  {
    ty: 'st',
    c: { a: 0, k: F },
    o: { a: 0, k: 100 },
    w: { a: 0, k: 2.5 },
    lc: 2,
    lj: 2,
    nm: 'TorsoSt',
  },
  tr([0, 0], [0, 0], 0)
);

const head = gr(
  'Head',
  20,
  {
    ty: 'el',
    d: 1,
    s: { a: 0, k: [56, 56] },
    p: { a: 0, k: [0, -72] },
    nm: 'HeadEl',
  },
  fl(CREAM, 'Face'),
  {
    ty: 'st',
    c: { a: 0, k: F },
    o: { a: 0, k: 100 },
    w: { a: 0, k: 3 },
    lc: 2,
    lj: 2,
    nm: 'HeadSt',
  },
  tr([0, 0], [0, 0], 0)
);

/** Casquette pixel-moderne : deux blocs + visière. */
const cap = gr(
  'Cap',
  21,
  {
    ty: 'rc',
    d: 1,
    s: { a: 0, k: [40, 14] },
    p: { a: 0, k: [0, -88] },
    r: { a: 0, k: 6 },
    nm: 'CapTop',
  },
  fl(SAGE, 'CapFill'),
  {
    ty: 'rc',
    d: 1,
    s: { a: 0, k: [48, 8] },
    p: { a: 0, k: [2, -80] },
    r: { a: 0, k: 3 },
    nm: 'CapVisor',
  },
  fl([0.2, 0.5, 0.38, 1], 'Visor'),
  tr([0, 0], [0, 0], 0)
);

function eyeSide(x) {
  return gr(
    x > 0 ? 'EyeR' : 'EyeL',
    30 + (x > 0 ? 1 : 0),
    {
      ty: 'el',
      d: 1,
      s: { a: 0, k: [20, 22] },
      p: { a: 0, k: [x, -74] },
      nm: 'EyeWhite',
    },
    fl(WHITE, 'W'),
    {
      ty: 'st',
      c: { a: 0, k: F },
      o: { a: 0, k: 100 },
      w: { a: 0, k: 2 },
      lc: 2,
      lj: 2,
      nm: 'EyeSt',
    },
    tr([0, 0], [0, 0], 0)
  );
}

function pupilSide(x) {
  return gr(
    x > 0 ? 'PupilR' : 'PupilL',
    40 + (x > 0 ? 1 : 0),
    {
      ty: 'el',
      d: 1,
      s: { a: 0, k: [8, 10] },
      p: { a: 0, k: [x + 3, -73] },
      nm: 'Pupil',
    },
    fl(BLACK, 'P'),
    tr([0, 0], [0, 0], 0)
  );
}

/** Reflet « jeu vidéo » sur les pupilles. */
function shineSide(x) {
  return gr(
    x > 0 ? 'ShineR' : 'ShineL',
    50 + (x > 0 ? 1 : 0),
    {
      ty: 'el',
      d: 1,
      s: { a: 0, k: [3, 3] },
      p: { a: 0, k: [x + 5, -75] },
      nm: 'Shine',
    },
    fl([0.95, 0.98, 1, 1], 'Sh'),
    tr([0, 0], [0, 0], 0)
  );
}

const mouth = gr(
  'Mouth',
  60,
  {
    ty: 'rc',
    d: 1,
    s: { a: 0, k: [16, 6] },
    p: { a: 0, k: [0, -62] },
    r: { a: 0, k: 3 },
    nm: 'MouthRc',
  },
  fl(MINT, 'MouthFill'),
  {
    ty: 'st',
    c: { a: 0, k: F },
    o: { a: 0, k: 100 },
    w: { a: 0, k: 1.5 },
    lc: 2,
    lj: 2,
    nm: 'MouthSt',
  },
  tr([0, 0], [0, 0], 0)
);

const shapes = [
  shadow,
  legGroup('LegR', 2, 13, -1),
  legGroup('LegL', 3, -13, 1),
  armGroup('ArmR', 4, 28, -1),
  armGroup('ArmL', 5, -28, 1),
  torso,
  head,
  cap,
  eyeSide(-14),
  eyeSide(14),
  pupilSide(-14),
  pupilSide(14),
  shineSide(-14),
  shineSide(14),
  mouth,
];

const layer = {
  ddd: 0,
  ind: 1,
  ty: 4,
  nm: 'RetroBuddy',
  sr: 1,
  ks: {
    o: { a: 0, k: 100 },
    r: { a: 0, k: 0 },
    p: {
      a: 1,
      k: [
        { t: 0, s: [64, 132, 0] },
        { t: 1, s: [64, 130, 0] },
        { t: 8, s: [64, 128, 0] },
        { t: 15, s: [64, 130, 0] },
        { t: 23, s: [64, 128, 0] },
        { t: 30, s: [64, 130, 0] },
      ],
    },
    a: { a: 0, k: [0, 0, 0] },
    s: { a: 0, k: [100, 100, 100] },
  },
  ao: 0,
  shapes,
  ip: 0,
  op: 31,
  st: 0,
  bm: 0,
};

const json = {
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 31,
  w: 128,
  h: 148,
  nm: 'VisitRetroBuddy',
  ddd: 0,
  assets: [],
  layers: [layer],
  markers: [
    { tm: 0, cm: 'idle', dr: 0 },
    { tm: 1, cm: 'walk', dr: 0 },
  ],
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(json, null, 0), 'utf8');
console.log('Wrote', out);
