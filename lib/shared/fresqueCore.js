/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/fresque/fresqueCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Cœur partagé des activités « fresque » : des cartes posées sur une table, des flèches
 * cause → effet tracées entre elles, et une correction officielle pour les classer.
 *
 * Pur : aucun accès réseau, base ni DOM. Alimenté par les fichiers de données d'un jeu
 * (`deck.json`, `correction.json`, `hints.json` — voir `lib/fresqueDecks.js`). Utilisé par le
 * front (affichage, retours, indices) **et** par le serveur (validation, résumé, fin, journal),
 * via le miroir CJS `lib/shared/fresqueCore.js` régénéré par `npm run sync:shared-cores`.
 *
 * Premier jeu : La Fresque du Climat – version Enfant (CC BY-NC-ND). Rien ici n'est propre au
 * climat : un autre jeu « cause → effet » (fresque Tara Océan, trames d'espèces) se branche en
 * fournissant ses trois fichiers.
 *
 * Toutes les fonctions de mutation renvoient un **nouvel** état (l'entrée n'est jamais modifiée)
 * et acceptent `now` (ISO 8601) pour des tests déterministes.
 *
 * Pédagogie (cahier des charges § 3) : aucune catégorie ne s'appelle « faux » ou « erreur » ;
 * une flèche hors correction est « à discuter », une flèche renversée est « dans l'autre sens »,
 * une flèche qui saute une carte est un « raccourci ».
 */

const FRESQUE_STATE_VERSION = 1;

const FRESQUE_LEVELS = Object.freeze(['eclaireur', 'explorateur', 'expert']);
const FRESQUE_DEFAULT_LEVEL = 'explorateur';

const FRESQUE_STEP_DISCOVER = 'decouvrir';
const FRESQUE_STEP_UNDERSTAND = 'comprendre';

/** Catégories d'une flèche tracée (ordre de priorité de `classifyLink`). */
const LINK_CATEGORIES = Object.freeze([
  'boucle',
  'doublon',
  'trouvee',
  'piege',
  'inversee',
  'raccourci',
  'a_discuter',
]);
/** Catégories qui refusent la création de la flèche. */
const LINK_REFUSED_CATEGORIES = Object.freeze(['boucle', 'doublon']);

/** Repères visuels (icône + couleur CSS) : jamais la couleur seule (accessibilité). */
const LINK_CATEGORY_MARKS = Object.freeze({
  trouvee: { icon: '✓', tone: 'found', label: 'Dans la correction' },
  inversee: { icon: '⇄', tone: 'reversed', label: 'Dans l’autre sens' },
  raccourci: { icon: '⋯', tone: 'shortcut', label: 'Une étape sautée' },
  piege: { icon: '!', tone: 'trap', label: 'Piège classique' },
  a_discuter: { icon: '?', tone: 'discuss', label: 'À discuter' },
  manquante: { icon: '┄', tone: 'missing', label: 'Pas encore trouvée' },
});

const FRESQUE_LIMITS = Object.freeze({
  maxLinks: 200,
  maxNotes: 40,
  maxNoteText: 280,
  maxTitle: 60,
  maxStateBytes: 64 * 1024,
  maxHintLog: 400,
  maxChecks: 100,
  minScale: 0.1,
  maxScale: 12,
});

/** Couleurs des post-it de l'élève (les indices ont leur propre couleur, `hint`). */
const NOTE_COLORS = Object.freeze(['yellow', 'green', 'blue', 'pink', 'orange']);
const HINT_NOTE_COLOR = 'hint';
const NOTE_KINDS = Object.freeze(['note', 'hint']);

/** Palette de six couleurs contrastées pour les flèches (hors mode correction). */
const ARROW_COLORS = Object.freeze([
  { id: 'forest', hex: '#1f6f43', label: 'Vert forêt' },
  { id: 'sky', hex: '#1d4ed8', label: 'Bleu ciel' },
  { id: 'plum', hex: '#7e22ce', label: 'Prune' },
  { id: 'ember', hex: '#c2410c', label: 'Braise' },
  { id: 'slate', hex: '#334155', label: 'Ardoise' },
  { id: 'rose', hex: '#be123c', label: 'Rose' },
]);

/**
 * Géométrie de la table : proportions fixes 16:10, coordonnées en pourcentage. Une carte
 * (1719 × 1168) mesure 11 % de la largeur ; sa hauteur suit le ratio de l'image.
 */
const TABLE_ASPECT = 16 / 10;
const CARD_W_PCT = 11;
const CARD_H_PCT = Math.round(((CARD_W_PCT * TABLE_ASPECT) / (1719 / 1168)) * 100) / 100;
const NOTE_W_PCT = 9;
const NOTE_H_PCT = 9;

// --------------------------------------------------------------------------------------------
// Utilitaires
// --------------------------------------------------------------------------------------------

function linkKey(from, to) {
  return `${from}>${to}`;
}

function parseLinkKey(key) {
  const [from, to] = String(key || '').split('>');
  return { from, to };
}

/** Remplace `{clé}` par `vars[clé]` (clé absente : laissée telle quelle). */
function fillTemplate(template, vars = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null ? String(vars[key]) : m,
  );
}

function stepForLot(lotNumber) {
  return `lot${lotNumber}`;
}

function lotOfStep(step) {
  const m = /^lot(\d+)$/.exec(String(step || ''));
  return m ? Number(m[1]) : null;
}

function isoNow(now) {
  if (typeof now === 'string' && now) return now;
  if (now instanceof Date) return now.toISOString();
  return new Date().toISOString();
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Identifiant suivant d'une collection (`l1`, `l2`… / `n1`…) : déterministe, sans aléatoire. */
function nextId(items, prefix) {
  let max = 0;
  for (const item of items || []) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(String(item?.id || ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function cardRect(pos) {
  return { x: pos.x, y: pos.y, w: CARD_W_PCT, h: CARD_H_PCT };
}

function noteRect(pos) {
  return { x: pos.x, y: pos.y, w: NOTE_W_PCT, h: NOTE_H_PCT };
}

// --------------------------------------------------------------------------------------------
// Modèle du jeu
// --------------------------------------------------------------------------------------------

/**
 * Modèle normalisé d'un jeu : cartes par identifiant, lots, ensemble des liens de la
 * correction, adjacence, accessibilité (pour les raccourcis) et degrés recalculés.
 */
function buildDeckModel(deck, correction, hints) {
  if (!isPlainObject(deck) || !Array.isArray(deck.cards)) throw new TypeError('deck invalide');
  if (!isPlainObject(correction) || !Array.isArray(correction.links)) {
    throw new TypeError('correction invalide');
  }
  if (!isPlainObject(hints)) throw new TypeError('hints invalide');

  const cardsById = {};
  for (const card of deck.cards) cardsById[card.id] = card;
  const lots = (deck.lots || [])
    .map((lot) => ({ number: Number(lot.number), cards: [...lot.cards] }))
    .sort((a, b) => a.number - b.number);
  const lotByCard = {};
  for (const lot of lots) for (const id of lot.cards) lotByCard[id] = lot.number;
  const cardIds = lots.flatMap((lot) =>
    [...lot.cards].sort((a, b) => cardsById[a].number - cardsById[b].number),
  );

  const linkSet = new Set();
  const outAdj = {};
  const inAdj = {};
  for (const id of cardIds) {
    outAdj[id] = [];
    inAdj[id] = [];
  }
  const linkList = [];
  for (const { from, to } of correction.links) {
    if (!cardsById[from] || !cardsById[to] || from === to) continue;
    const key = linkKey(from, to);
    if (linkSet.has(key)) continue;
    linkSet.add(key);
    linkList.push({ from, to });
    outAdj[from].push(to);
    inAdj[to].push(from);
  }
  const byNumber = (a, b) => cardsById[a].number - cardsById[b].number;
  for (const id of cardIds) {
    outAdj[id].sort(byNumber);
    inAdj[id].sort(byNumber);
  }
  const outDegree = {};
  const inDegree = {};
  for (const id of cardIds) {
    outDegree[id] = outAdj[id].length;
    inDegree[id] = inAdj[id].length;
  }

  // Accessibilité en au moins deux flèches (raccourci) : parcours en largeur depuis chaque
  // carte, en notant la profondeur minimale.
  const reachableTwoPlus = {};
  for (const start of cardIds) {
    const depth = { [start]: 0 };
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of outAdj[cur]) {
        if (depth[next] === undefined) {
          depth[next] = depth[cur] + 1;
          queue.push(next);
        }
      }
    }
    reachableTwoPlus[start] = Object.keys(depth).filter((id) => depth[id] >= 2);
  }

  // Rôles structurels : puits = aucune flèche sortante. Une « arrivée » est un puits que
  // plusieurs chemins rejoignent (degré entrant ≥ 2) ; un puits à une seule entrée est une
  // carte « sans conséquence » dans ce jeu (le piège de la banquise). `card.role` peut forcer.
  const roles = {};
  for (const id of cardIds) {
    const forced = cardsById[id].role;
    if (forced === 'arrivee' || forced === 'sans_consequence') roles[id] = forced;
    else if (outDegree[id] === 0) roles[id] = inDegree[id] >= 2 ? 'arrivee' : 'sans_consequence';
    else roles[id] = 'relais';
  }

  const guideBands = [...(deck.guideBands || [])].sort((a, b) => a.order - b.order);
  const steps = [
    FRESQUE_STEP_DISCOVER,
    ...lots.map((l) => stepForLot(l.number)),
    FRESQUE_STEP_UNDERSTAND,
  ];

  return Object.freeze({
    id: deck.id,
    deck,
    correction,
    hints,
    cardsById,
    cardIds,
    lots,
    lotByCard,
    linkSet,
    linkList,
    outAdj,
    inAdj,
    outDegree,
    inDegree,
    reachableTwoPlus,
    roles,
    guideBands,
    steps,
    totalExpected: linkList.length,
  });
}

function cardTitle(model, id) {
  return model.cardsById[id]?.title || id;
}

function cardNumber(model, id) {
  return model.cardsById[id]?.number ?? null;
}

function lotCards(model, lotNumber) {
  const lot = model.lots.find((l) => l.number === Number(lotNumber));
  return lot ? [...lot.cards] : [];
}

/** Rectangle (en %) de la bande guidée d'une carte : colonnes de gauche à droite. */
function bandRect(model, bandId) {
  const n = model.guideBands.length;
  const index = model.guideBands.findIndex((b) => b.id === bandId);
  if (n === 0 || index < 0) return { x: 0, y: 0, w: 100, h: 100 };
  const w = 100 / n;
  return { x: index * w, y: 0, w, h: 100 };
}

// --------------------------------------------------------------------------------------------
// État du plateau (version 1)
// --------------------------------------------------------------------------------------------

function createInitialState(model, { level = FRESQUE_DEFAULT_LEVEL, now } = {}) {
  const lvl = FRESQUE_LEVELS.includes(level) ? level : FRESQUE_DEFAULT_LEVEL;
  return {
    v: FRESQUE_STATE_VERSION,
    deckId: model.id,
    level: lvl,
    step: FRESQUE_STEP_DISCOVER,
    lotReached: model.lots[0]?.number ?? 1,
    tutorialDone: false,
    showBands: lvl === 'eclaireur',
    cards: {},
    links: [],
    notes: [],
    hints: { log: [] },
    checks: [],
    correction: { viewedAt: null, revealedMissing: [] },
    creative: { title: '', arrowColor: null, favoriteCardId: null },
    viewport: { scale: 1, tx: 0, ty: 0 },
    clientSeq: 0,
    createdAt: isoNow(now),
    updatedAt: isoNow(now),
  };
}

/**
 * Complète un état lu (ancien client, champ absent) avec les valeurs par défaut de la
 * version 1. Ne valide pas (voir `validateState`). Version supérieure : rendu tel quel.
 */
function migrateState(raw) {
  if (!isPlainObject(raw)) return null;
  if (Number(raw.v) > FRESQUE_STATE_VERSION) return raw;
  const level = FRESQUE_LEVELS.includes(raw.level) ? raw.level : FRESQUE_DEFAULT_LEVEL;
  return {
    v: FRESQUE_STATE_VERSION,
    deckId: String(raw.deckId || ''),
    level,
    step: typeof raw.step === 'string' && raw.step ? raw.step : FRESQUE_STEP_DISCOVER,
    lotReached: Number.isInteger(raw.lotReached) && raw.lotReached >= 1 ? raw.lotReached : 1,
    tutorialDone: raw.tutorialDone === true,
    showBands: typeof raw.showBands === 'boolean' ? raw.showBands : level === 'eclaireur',
    cards: isPlainObject(raw.cards) ? { ...raw.cards } : {},
    links: Array.isArray(raw.links) ? raw.links.map((l) => ({ ...l })) : [],
    notes: Array.isArray(raw.notes) ? raw.notes.map((n) => ({ ...n })) : [],
    hints: { log: Array.isArray(raw.hints?.log) ? raw.hints.log.map((h) => ({ ...h })) : [] },
    checks: Array.isArray(raw.checks) ? raw.checks.map((c) => ({ ...c })) : [],
    correction: {
      viewedAt: raw.correction?.viewedAt || null,
      revealedMissing: Array.isArray(raw.correction?.revealedMissing)
        ? [...raw.correction.revealedMissing]
        : [],
    },
    creative: {
      title: typeof raw.creative?.title === 'string' ? raw.creative.title : '',
      arrowColor: raw.creative?.arrowColor || null,
      favoriteCardId: raw.creative?.favoriteCardId || null,
    },
    viewport: {
      scale: Number.isFinite(Number(raw.viewport?.scale)) ? Number(raw.viewport.scale) : 1,
      tx: Number.isFinite(Number(raw.viewport?.tx)) ? Number(raw.viewport.tx) : 0,
      ty: Number.isFinite(Number(raw.viewport?.ty)) ? Number(raw.viewport.ty) : 0,
    },
    clientSeq: Number.isInteger(raw.clientSeq) && raw.clientSeq >= 0 ? raw.clientSeq : 0,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

function isIsoOrNull(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.length <= 40);
}

/**
 * Validation stricte d'un état (bornes du cahier des charges § 5.2).
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateState(model, state) {
  const errors = [];
  const err = (m) => {
    if (errors.length < 20) errors.push(m);
  };
  if (!isPlainObject(state)) return { ok: false, errors: ['état absent'] };
  if (state.v !== FRESQUE_STATE_VERSION) err(`version ${state.v} non prise en charge`);
  if (state.deckId !== model.id) err('deckId ne correspond pas au jeu');
  if (!FRESQUE_LEVELS.includes(state.level)) err('niveau inconnu');
  if (!model.steps.includes(state.step)) err('étape inconnue');
  const lotNumbers = model.lots.map((l) => l.number);
  if (!lotNumbers.includes(state.lotReached)) err('lotReached hors lots');
  if (typeof state.tutorialDone !== 'boolean') err('tutorialDone doit être booléen');
  if (typeof state.showBands !== 'boolean') err('showBands doit être booléen');

  if (!isPlainObject(state.cards)) err('cards doit être un objet');
  else {
    const entries = Object.entries(state.cards);
    if (entries.length > model.cardIds.length) err('trop de cartes posées');
    for (const [id, pos] of entries) {
      if (!model.cardsById[id]) err(`carte inconnue ${id}`);
      if (!isPlainObject(pos)) {
        err(`position invalide ${id}`);
        continue;
      }
      for (const k of ['x', 'y']) {
        const v = Number(pos[k]);
        if (!Number.isFinite(v) || v < 0 || v > 100) err(`carte ${id} : ${k} hors 0–100`);
      }
      if (typeof pos.flipped !== 'boolean') err(`carte ${id} : flipped doit être booléen`);
      if (!isIsoOrNull(pos.placedAt)) err(`carte ${id} : placedAt invalide`);
    }
  }

  if (!Array.isArray(state.links)) err('links doit être un tableau');
  else {
    if (state.links.length > FRESQUE_LIMITS.maxLinks) err('trop de flèches');
    const ids = new Set();
    const pairs = new Set();
    for (const link of state.links) {
      if (!isPlainObject(link)) {
        err('flèche invalide');
        continue;
      }
      if (typeof link.id !== 'string' || !link.id || ids.has(link.id)) err('id de flèche invalide');
      ids.add(link.id);
      if (!model.cardsById[link.from] || !model.cardsById[link.to]) err('flèche : carte inconnue');
      if (link.from === link.to) err('flèche : boucle');
      const key = linkKey(link.from, link.to);
      if (pairs.has(key)) err(`flèche en double ${key}`);
      pairs.add(key);
      if (link.color != null && !ARROW_COLORS.some((c) => c.id === link.color)) {
        err('couleur de flèche inconnue');
      }
      if (link.revealed !== undefined && typeof link.revealed !== 'boolean')
        err('revealed invalide');
      if (!isIsoOrNull(link.createdAt)) err('flèche : createdAt invalide');
    }
  }

  if (!Array.isArray(state.notes)) err('notes doit être un tableau');
  else {
    if (state.notes.length > FRESQUE_LIMITS.maxNotes) err('trop de post-it');
    const ids = new Set();
    for (const note of state.notes) {
      if (!isPlainObject(note)) {
        err('post-it invalide');
        continue;
      }
      if (typeof note.id !== 'string' || !note.id || ids.has(note.id))
        err('id de post-it invalide');
      ids.add(note.id);
      if (!NOTE_KINDS.includes(note.kind)) err('post-it : kind inconnu');
      if (typeof note.text !== 'string') err('post-it : texte manquant');
      else if (note.text.length > FRESQUE_LIMITS.maxNoteText) err('post-it : texte trop long');
      for (const k of ['x', 'y']) {
        const v = Number(note[k]);
        if (!Number.isFinite(v) || v < 0 || v > 100) err(`post-it : ${k} hors 0–100`);
      }
      const colorOk =
        note.kind === 'hint' ? note.color === HINT_NOTE_COLOR : NOTE_COLORS.includes(note.color);
      if (!colorOk) err('post-it : couleur inconnue');
      if (note.cardId != null && !model.cardsById[note.cardId]) err('post-it : carte inconnue');
      if (note.dismissed !== undefined && typeof note.dismissed !== 'boolean') {
        err('post-it : dismissed invalide');
      }
      if (note.link != null) {
        if (
          !isPlainObject(note.link) ||
          !model.cardsById[note.link.from] ||
          !model.cardsById[note.link.to]
        ) {
          err('post-it : flèche révélée invalide');
        }
      }
    }
  }

  if (!isPlainObject(state.hints) || !Array.isArray(state.hints.log)) err('hints.log manquant');
  else {
    if (state.hints.log.length > FRESQUE_LIMITS.maxHintLog) err('historique d’indices trop long');
    for (const h of state.hints.log) {
      if (!isPlainObject(h) || !model.cardsById[h.target]) err('indice : cible inconnue');
      else if (!Number.isInteger(h.rung) || h.rung < 1 || h.rung > 4) err('indice : cran invalide');
    }
  }

  if (!Array.isArray(state.checks)) err('checks doit être un tableau');
  else if (state.checks.length > FRESQUE_LIMITS.maxChecks) err('trop de points d’étape');
  else {
    for (const c of state.checks) {
      if (!isPlainObject(c) || !lotNumbers.includes(c.lot)) err('point d’étape : lot inconnu');
    }
  }

  if (!isPlainObject(state.correction)) err('correction manquante');
  else {
    if (!isIsoOrNull(state.correction.viewedAt)) err('correction.viewedAt invalide');
    if (!Array.isArray(state.correction.revealedMissing)) err('revealedMissing invalide');
    else {
      for (const key of state.correction.revealedMissing) {
        if (!model.linkSet.has(key)) err(`révélation hors correction ${key}`);
      }
    }
  }

  if (!isPlainObject(state.creative)) err('creative manquant');
  else {
    if (typeof state.creative.title !== 'string') err('titre invalide');
    else if (state.creative.title.length > FRESQUE_LIMITS.maxTitle) err('titre trop long');
    if (
      state.creative.arrowColor != null &&
      !ARROW_COLORS.some((c) => c.id === state.creative.arrowColor)
    ) {
      err('couleur de flèches inconnue');
    }
    if (state.creative.favoriteCardId != null && !model.cardsById[state.creative.favoriteCardId]) {
      err('carte marquante inconnue');
    }
  }

  if (!isPlainObject(state.viewport)) err('viewport manquant');
  else {
    const s = Number(state.viewport.scale);
    if (!Number.isFinite(s) || s < FRESQUE_LIMITS.minScale || s > FRESQUE_LIMITS.maxScale) {
      err('zoom hors bornes');
    }
    for (const k of ['tx', 'ty']) {
      const v = Number(state.viewport[k]);
      if (!Number.isFinite(v) || Math.abs(v) > 1e6) err(`viewport.${k} invalide`);
    }
  }

  if (!Number.isInteger(state.clientSeq) || state.clientSeq < 0) err('clientSeq invalide');

  if (errors.length === 0) {
    const size = JSON.stringify(state).length;
    if (size > FRESQUE_LIMITS.maxStateBytes) err(`état trop volumineux (${size} octets)`);
  }
  return { ok: errors.length === 0, errors };
}

// --------------------------------------------------------------------------------------------
// Lecture de l'état
// --------------------------------------------------------------------------------------------

function cardsOnTable(state) {
  return Object.keys(state?.cards || {});
}

function isCardPlaced(state, id) {
  return Boolean(state?.cards?.[id]);
}

/** Cartes des lots ouverts (≤ `lotReached`) pas encore posées, dans l'ordre du jeu. */
function cardsInHand(model, state) {
  return model.cardIds.filter(
    (id) => model.lotByCard[id] <= state.lotReached && !isCardPlaced(state, id),
  );
}

function isLotComplete(model, state, lotNumber = state.lotReached) {
  return lotCards(model, lotNumber).every((id) => isCardPlaced(state, id));
}

function nextLotNumber(model, state) {
  const idx = model.lots.findIndex((l) => l.number === state.lotReached);
  return idx >= 0 && idx + 1 < model.lots.length ? model.lots[idx + 1].number : null;
}

/** Règle officielle : le lot suivant ne s'ouvre que lorsque toutes les cartes du lot sont posées. */
function canOpenNextLot(model, state) {
  return nextLotNumber(model, state) !== null && isLotComplete(model, state);
}

function openNextLot(model, state, { now } = {}) {
  if (!canOpenNextLot(model, state)) return state;
  const next = nextLotNumber(model, state);
  return { ...state, lotReached: next, step: stepForLot(next), updatedAt: isoNow(now) };
}

function allCardsPlaced(model, state) {
  return model.cardIds.every((id) => isCardPlaced(state, id));
}

function canEnterUnderstand(model, state) {
  return allCardsPlaced(model, state);
}

/** Étapes accessibles : celles déjà atteintes, plus « comprendre » quand tout est posé. */
function canGoToStep(model, state, step) {
  if (step === FRESQUE_STEP_DISCOVER) return true;
  if (step === FRESQUE_STEP_UNDERSTAND) {
    return canEnterUnderstand(model, state) || state.step === FRESQUE_STEP_UNDERSTAND;
  }
  const lot = lotOfStep(step);
  return lot !== null && lot <= state.lotReached && model.lots.some((l) => l.number === lot);
}

function setStep(model, state, step, { now } = {}) {
  if (!canGoToStep(model, state, step)) return state;
  return { ...state, step, updatedAt: isoNow(now) };
}

/** Liens de la correction dont les deux cartes sont posées (« attendus »). */
function expectedLinks(model, state) {
  return model.linkList.filter((l) => isCardPlaced(state, l.from) && isCardPlaced(state, l.to));
}

function findLink(state, from, to) {
  return (state.links || []).find((l) => l.from === from && l.to === to) || null;
}

// --------------------------------------------------------------------------------------------
// Classement d'une flèche (§ 4.4)
// --------------------------------------------------------------------------------------------

/**
 * @returns {{ category: string, text: string, trap: boolean, refused: boolean, mark: object|null }}
 */
function classifyLink(model, from, to, state = null) {
  const feedback = model.hints.feedback || {};
  const done = (category, text, trap = false) => ({
    category,
    text: String(text || ''),
    trap,
    refused: LINK_REFUSED_CATEGORIES.includes(category),
    mark: LINK_CATEGORY_MARKS[category] || null,
  });
  if (!model.cardsById[from] || !model.cardsById[to])
    return done('a_discuter', feedback.a_discuter);
  if (from === to) return done('boucle', feedback.boucle);
  if (state && findLink(state, from, to)) return done('doublon', feedback.doublon);
  const key = linkKey(from, to);
  if (model.linkSet.has(key)) return done('trouvee', feedback.trouvee);
  const trap = model.hints.traps?.[key];
  if (trap && trap.category) return done(trap.category, trap.text || feedback[trap.category], true);
  if (model.linkSet.has(linkKey(to, from))) return done('inversee', feedback.inversee);
  if ((model.reachableTwoPlus[from] || []).includes(to))
    return done('raccourci', feedback.raccourci);
  return done('a_discuter', feedback.a_discuter);
}

/**
 * Évalue le plateau : chaque flèche tracée reçoit sa catégorie, les flèches attendues absentes
 * sont listées, et les compteurs servent aux points d'étape et au suivi.
 */
function evaluateBoard(model, state) {
  const byCategory = { trouvee: [], piege: [], inversee: [], raccourci: [], a_discuter: [] };
  const links = (state.links || []).map((link) => {
    const c = classifyLink(model, link.from, link.to);
    const category = c.refused ? 'a_discuter' : c.category;
    const classified = { ...link, category, text: c.text, trap: c.trap };
    (byCategory[category] || byCategory.a_discuter).push(classified);
    return classified;
  });
  const drawn = new Set(links.map((l) => linkKey(l.from, l.to)));
  const expected = expectedLinks(model, state);
  const missing = expected.filter((l) => !drawn.has(linkKey(l.from, l.to)));
  return {
    links,
    byCategory,
    missing,
    found: byCategory.trouvee.length,
    expected: expected.length,
    placed: cardsOnTable(state).length,
    total: model.totalExpected,
    totalCards: model.cardIds.length,
  };
}

/**
 * Puces du niveau Éclaireur : pour chaque carte posée, nombre de flèches sortantes de la
 * correction (jeu complet), celles déjà trouvées, et le reste.
 */
function outgoingStats(model, state) {
  const found = {};
  for (const link of state.links || []) {
    if (model.linkSet.has(linkKey(link.from, link.to)))
      found[link.from] = (found[link.from] || 0) + 1;
  }
  const out = {};
  for (const id of cardsOnTable(state)) {
    const expectedOut = model.outDegree[id] || 0;
    const foundOut = found[id] || 0;
    out[id] = { expectedOut, foundOut, remaining: Math.max(0, expectedOut - foundOut) };
  }
  return out;
}

/** Flèches sortantes attendues (cartes posées) et manquantes par carte, triées. */
function missingOutgoingByCard(model, state) {
  const { missing } = evaluateBoard(model, state);
  const map = {};
  for (const l of missing) {
    if (!map[l.from]) map[l.from] = [];
    map[l.from].push(l.to);
  }
  for (const id of Object.keys(map)) {
    map[id].sort((a, b) => model.cardsById[a].number - model.cardsById[b].number);
  }
  return map;
}

// --------------------------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------------------------

function touch(state, now) {
  return { ...state, updatedAt: isoNow(now) };
}

/** Pose une carte (de la main) ou la déplace si elle est déjà sur la table. */
function placeCard(model, state, cardId, { x, y, now, flipped } = {}) {
  if (!model.cardsById[cardId]) return state;
  if (model.lotByCard[cardId] > state.lotReached) return state;
  const prev = state.cards[cardId];
  const pos = {
    x: clampPct(x ?? prev?.x ?? 0),
    y: clampPct(y ?? prev?.y ?? 0),
    flipped: typeof flipped === 'boolean' ? flipped : prev?.flipped === true,
    placedAt: prev?.placedAt || isoNow(now),
  };
  return touch({ ...state, cards: { ...state.cards, [cardId]: pos } }, now);
}

function moveCard(model, state, cardId, x, y, { now } = {}) {
  if (!state.cards[cardId]) return state;
  return placeCard(model, state, cardId, { x, y, now });
}

function flipCard(model, state, cardId, { now } = {}) {
  const prev = state.cards[cardId];
  if (!prev) return state;
  return touch(
    { ...state, cards: { ...state.cards, [cardId]: { ...prev, flipped: !prev.flipped } } },
    now,
  );
}

/**
 * Cherche une place libre (grille) qui ne recouvre ni carte ni post-it, dans un rectangle
 * (bande guidée ou table entière). Rend `null` si tout est occupé.
 */
function findFreeSpot(state, rect, size = { w: CARD_W_PCT, h: CARD_H_PCT }, options = {}) {
  const occupied = [
    ...Object.values(state.cards || {}).map(cardRect),
    ...(state.notes || []).filter((n) => !n.dismissed).map(noteRect),
    ...(options.extra || []),
  ];
  const margin = options.margin ?? 1.5;
  const stepX = size.w + margin;
  const stepY = size.h + margin;
  for (let y = rect.y + margin; y + size.h <= rect.y + rect.h; y += stepY) {
    for (let x = rect.x + margin; x + size.w <= rect.x + rect.w; x += stepX) {
      const candidate = { x, y, w: size.w, h: size.h };
      if (!occupied.some((o) => rectsOverlap(candidate, o))) {
        return { x: clampPct(x), y: clampPct(y) };
      }
    }
  }
  return null;
}

/** « Tout poser » : place les cartes restantes de la main sur des places libres. */
function placeAllHand(model, state, { now, useBands = state.level === 'eclaireur' } = {}) {
  let next = state;
  for (const id of cardsInHand(model, state)) {
    const card = model.cardsById[id];
    const rect =
      useBands && card.guideBand ? bandRect(model, card.guideBand) : { x: 0, y: 0, w: 100, h: 100 };
    const spot = findFreeSpot(next, rect) ||
      findFreeSpot(next, { x: 0, y: 0, w: 100, h: 100 }) || {
        x: 50 - CARD_W_PCT / 2,
        y: 50 - CARD_H_PCT / 2,
      };
    next = placeCard(model, next, id, { x: spot.x, y: spot.y, now });
  }
  return next;
}

/**
 * Trace une flèche cause → effet. Refusée (état inchangé) si boucle, doublon, carte absente de
 * la table ou plafond atteint ; sinon classée (le retour est affiché ou non selon le niveau).
 * @returns {{ state: object, result: object, link: object|null }}
 */
function addLink(model, state, from, to, options = {}) {
  const { now, by = null, color = null, revealed = false } = options;
  const result = classifyLink(model, from, to, state);
  if (result.refused) return { state, result, link: null };
  if (!isCardPlaced(state, from) || !isCardPlaced(state, to)) {
    return {
      state,
      result: { ...result, refused: true, category: 'hors_table', text: '' },
      link: null,
    };
  }
  if ((state.links || []).length >= FRESQUE_LIMITS.maxLinks) {
    return {
      state,
      result: { ...result, refused: true, category: 'plafond', text: '' },
      link: null,
    };
  }
  const link = {
    id: nextId(state.links, 'l'),
    from,
    to,
    color: color || null,
    revealed: revealed === true,
    createdAt: isoNow(now),
    by,
  };
  return { state: touch({ ...state, links: [...state.links, link] }, now), result, link };
}

function removeLink(state, linkId, { now } = {}) {
  if (!(state.links || []).some((l) => l.id === linkId)) return state;
  return touch({ ...state, links: state.links.filter((l) => l.id !== linkId) }, now);
}

function setLinkColor(state, linkId, color, { now } = {}) {
  if (color != null && !ARROW_COLORS.some((c) => c.id === color)) return state;
  return touch(
    {
      ...state,
      links: state.links.map((l) => (l.id === linkId ? { ...l, color: color || null } : l)),
    },
    now,
  );
}

/** Décale un post-it s'il recouvre une carte (les post-it ne touchent jamais une carte). */
function nudgeNoteAwayFromCards(state, pos) {
  const rect = noteRect(pos);
  const cards = Object.values(state.cards || {}).map(cardRect);
  if (!cards.some((c) => rectsOverlap(rect, c))) return { x: clampPct(pos.x), y: clampPct(pos.y) };
  const free = findFreeSpot(
    { cards: state.cards, notes: [] },
    { x: 0, y: 0, w: 100, h: 100 },
    { w: NOTE_W_PCT, h: NOTE_H_PCT },
    { margin: 1 },
  );
  return free || { x: clampPct(pos.x), y: clampPct(pos.y) };
}

function addNote(
  model,
  state,
  { text, x, y, color = NOTE_COLORS[0], cardId = null, now, by = null } = {},
) {
  const activeNotes = (state.notes || []).filter((n) => n.kind === 'note');
  if (activeNotes.length >= FRESQUE_LIMITS.maxNotes) return { state, note: null };
  const clean = String(text ?? '').slice(0, FRESQUE_LIMITS.maxNoteText);
  const pos = nudgeNoteAwayFromCards(state, { x: x ?? 45, y: y ?? 70 });
  const note = {
    id: nextId(state.notes, 'n'),
    kind: 'note',
    text: clean,
    x: pos.x,
    y: pos.y,
    color: NOTE_COLORS.includes(color) ? color : NOTE_COLORS[0],
    cardId: model.cardsById[cardId] ? cardId : null,
    createdAt: isoNow(now),
    by,
    dismissed: false,
  };
  return { state: touch({ ...state, notes: [...state.notes, note] }, now), note };
}

function updateNote(state, noteId, patch, { now } = {}) {
  if (!(state.notes || []).some((n) => n.id === noteId)) return state;
  return touch(
    {
      ...state,
      notes: state.notes.map((n) => {
        if (n.id !== noteId) return n;
        const next = { ...n };
        if (typeof patch.text === 'string' && n.kind === 'note') {
          next.text = patch.text.slice(0, FRESQUE_LIMITS.maxNoteText);
        }
        if (patch.x !== undefined) next.x = clampPct(patch.x);
        if (patch.y !== undefined) next.y = clampPct(patch.y);
        if (patch.color && n.kind === 'note' && NOTE_COLORS.includes(patch.color))
          next.color = patch.color;
        if (typeof patch.dismissed === 'boolean') next.dismissed = patch.dismissed;
        return next;
      }),
    },
    now,
  );
}

/** Un post-it élève est supprimé ; un post-it indice est seulement fermé (il reste dans l'historique). */
function removeNote(state, noteId, { now } = {}) {
  const note = (state.notes || []).find((n) => n.id === noteId);
  if (!note) return state;
  if (note.kind === 'hint') return updateNote(state, noteId, { dismissed: true }, { now });
  return touch({ ...state, notes: state.notes.filter((n) => n.id !== noteId) }, now);
}

function setLevel(state, level, { now } = {}) {
  if (!FRESQUE_LEVELS.includes(level) || level === state.level) return state;
  return touch({ ...state, level, showBands: level === 'eclaireur' ? true : state.showBands }, now);
}

function setShowBands(state, showBands, { now } = {}) {
  return touch({ ...state, showBands: showBands === true }, now);
}

function setTutorialDone(state, done = true, { now } = {}) {
  if (state.tutorialDone === done) return state;
  return touch({ ...state, tutorialDone: done === true }, now);
}

function setViewport(state, viewport) {
  const scale = Number(viewport?.scale);
  const tx = Number(viewport?.tx);
  const ty = Number(viewport?.ty);
  if (![scale, tx, ty].every(Number.isFinite)) return state;
  return {
    ...state,
    viewport: {
      scale: Math.min(FRESQUE_LIMITS.maxScale, Math.max(FRESQUE_LIMITS.minScale, scale)),
      tx: Math.round(tx * 100) / 100,
      ty: Math.round(ty * 100) / 100,
    },
  };
}

function setCreative(model, state, patch, { now } = {}) {
  const creative = { ...state.creative };
  if (typeof patch.title === 'string')
    creative.title = patch.title.slice(0, FRESQUE_LIMITS.maxTitle);
  if (patch.arrowColor !== undefined) {
    creative.arrowColor = ARROW_COLORS.some((c) => c.id === patch.arrowColor)
      ? patch.arrowColor
      : null;
  }
  if (patch.favoriteCardId !== undefined) {
    creative.favoriteCardId = model.cardsById[patch.favoriteCardId] ? patch.favoriteCardId : null;
  }
  return touch({ ...state, creative }, now);
}

/** Première ouverture de la correction : horodatée une fois pour toutes. */
function markCorrectionViewed(state, { now } = {}) {
  if (state.correction.viewedAt) return state;
  return touch({ ...state, correction: { ...state.correction, viewedAt: isoNow(now) } }, now);
}

/** Révèle la flèche manquante suivante (ordre : numéro de la cause, puis de l'effet). */
function revealNextMissing(model, state, { now } = {}) {
  const { missing } = evaluateBoard(model, state);
  const already = new Set(state.correction.revealedMissing);
  const sorted = [...missing].sort(
    (a, b) =>
      model.cardsById[a.from].number - model.cardsById[b.from].number ||
      model.cardsById[a.to].number - model.cardsById[b.to].number,
  );
  const next = sorted.find((l) => !already.has(linkKey(l.from, l.to)));
  if (!next) return { state, revealed: null };
  const key = linkKey(next.from, next.to);
  return {
    state: touch(
      {
        ...state,
        correction: {
          ...state.correction,
          revealedMissing: [...state.correction.revealedMissing, key],
        },
      },
      now,
    ),
    revealed: next,
  };
}

function revealAllMissing(model, state, { now } = {}) {
  const { missing } = evaluateBoard(model, state);
  const keys = new Set(state.correction.revealedMissing);
  for (const l of missing) keys.add(linkKey(l.from, l.to));
  return touch({ ...state, correction: { ...state.correction, revealedMissing: [...keys] } }, now);
}

/** Point d'étape : compteur trouvées / attendues pour le lot courant, mémorisé pour le suivi. */
function recordCheckpoint(model, state, { now } = {}) {
  const ev = evaluateBoard(model, state);
  const check = { lot: state.lotReached, at: isoNow(now), found: ev.found, expected: ev.expected };
  const checks = [...state.checks, check].slice(-FRESQUE_LIMITS.maxChecks);
  return { state: touch({ ...state, checks }, now), check };
}

function checkpointMessage(model, state) {
  const ev = evaluateBoard(model, state);
  const cp = model.hints.checkpoint || {};
  const found = fillTemplate(cp.found, { found: ev.found, expected: ev.expected });
  if (ev.expected > 0 && ev.found >= ev.expected)
    return { text: `${found} ${cp.allFound || ''}`.trim(), allFound: true, ...ev };
  return { text: `${found} ${cp.encourage || ''}`.trim(), allFound: false, ...ev };
}

// --------------------------------------------------------------------------------------------
// Indices (§ 4.5)
// --------------------------------------------------------------------------------------------

/**
 * Cible déterministe : parmi les cartes posées qui ont encore des flèches sortantes
 * manquantes, on continue la dernière cible tant qu'elle a des manques ; sinon celle qui en a
 * le plus, puis le plus petit numéro.
 */
function chooseHintTarget(model, state) {
  const missingByCard = missingOutgoingByCard(model, state);
  const candidates = Object.keys(missingByCard);
  if (!candidates.length) return null;
  const last = state.hints.log.length ? state.hints.log[state.hints.log.length - 1].target : null;
  if (last && missingByCard[last]) return last;
  candidates.sort(
    (a, b) =>
      missingByCard[b].length - missingByCard[a].length ||
      model.cardsById[a].number - model.cardsById[b].number,
  );
  return candidates[0];
}

/** Cran suivant pour une cible : un de plus que les indices déjà donnés sur elle (plafond 4). */
function nextRungFor(state, target) {
  const previous = state.hints.log.filter((h) => h.target === target);
  const lastRung = previous.length ? previous[previous.length - 1].rung : 0;
  return Math.min(4, lastRung + 1);
}

function structureHintText(model, state, target, missingTargets) {
  const t = model.hints.templates?.structure || {};
  const vars = (id, count) => ({
    number: cardNumber(model, id),
    title: cardTitle(model, id),
    count,
  });
  if ((model.outDegree[target] || 0) >= 3) {
    return fillTemplate(t.carrefour, vars(target, model.outDegree[target]));
  }
  const convergence = missingTargets.find((id) => (model.inDegree[id] || 0) >= 3);
  if (convergence) {
    return fillTemplate(t.convergence, vars(convergence, model.inDegree[convergence]));
  }
  const arrival = missingTargets.find((id) => model.roles[id] === 'arrivee');
  if (arrival) return fillTemplate(t.arrivee, vars(arrival, 0));
  const lot = model.lotByCard[target];
  const sinkInLot = lotCards(model, lot).some(
    (id) => model.roles[id] === 'sans_consequence' && isCardPlaced(state, id),
  );
  if (sinkInLot) return fillTemplate(t.sansConsequence, {});
  const remaining = evaluateBoard(model, state).missing.length;
  return fillTemplate(t.resteDuLot, { count: remaining });
}

/**
 * Indice suivant. Rend `{ hint, state }` : `hint.kind` vaut `none` quand aucune flèche ne manque
 * (message « reste du lot » à 0, proposition d'ouvrir la suite) et l'état est alors inchangé.
 * Sinon le post-it indice est ajouté à l'état et l'historique enregistre `{ target, rung, at }`.
 */
function nextHint(model, state, { now, by = null } = {}) {
  const target = chooseHintTarget(model, state);
  const t = model.hints.templates || {};
  if (!target) {
    const canNext = canOpenNextLot(model, state);
    return {
      hint: {
        kind: 'none',
        target: null,
        rung: 0,
        text: fillTemplate(t.structure?.resteDuLot, { count: 0 }),
        suggestNextLot: canNext,
        suggestUnderstand: !canNext && canEnterUnderstand(model, state),
        link: null,
      },
      state,
    };
  }
  const rung = nextRungFor(state, target);
  const missingTargets = missingOutgoingByCard(model, state)[target] || [];
  let text = '';
  let link = null;
  if (rung === 1) {
    text =
      model.hints.readingHints?.[target] ||
      fillTemplate(t.piste?.depuis, {
        number: cardNumber(model, target),
        title: cardTitle(model, target),
      });
  } else if (rung === 2) {
    text = structureHintText(model, state, target, missingTargets);
  } else if (rung === 3) {
    text = fillTemplate(t.piste?.depuis, {
      number: cardNumber(model, target),
      title: cardTitle(model, target),
    });
  } else {
    const alreadyRevealed = new Set(
      (state.notes || [])
        .filter((n) => n.kind === 'hint' && n.link)
        .map((n) => linkKey(n.link.from, n.link.to)),
    );
    const to =
      missingTargets.find((id) => !alreadyRevealed.has(linkKey(target, id))) || missingTargets[0];
    link = { from: target, to };
    text = fillTemplate(t.revelation, {
      fromNumber: cardNumber(model, target),
      toNumber: cardNumber(model, to),
    });
  }
  const ladder = (model.hints.ladder || []).find((l) => l.level === rung) || null;
  const anchor = state.cards[target];
  const pos = nudgeNoteAwayFromCards(state, {
    x: Math.min(100 - NOTE_W_PCT, (anchor?.x ?? 40) + CARD_W_PCT + 1),
    y: anchor?.y ?? 40,
  });
  const note = {
    id: nextId(state.notes, 'n'),
    kind: 'hint',
    text,
    x: pos.x,
    y: pos.y,
    color: HINT_NOTE_COLOR,
    cardId: target,
    link,
    rung,
    createdAt: isoNow(now),
    by,
    dismissed: false,
  };
  const log = [...state.hints.log, { target, rung, at: isoNow(now) }].slice(
    -FRESQUE_LIMITS.maxHintLog,
  );
  const nextState = touch({ ...state, notes: [...state.notes, note], hints: { log } }, now);
  return {
    hint: {
      kind: 'hint',
      target,
      rung,
      rungId: ladder?.id || null,
      rungLabel: ladder?.label || null,
      text,
      link,
      noteId: note.id,
    },
    state: nextState,
  };
}

/** L'élève accepte une flèche révélée : elle devient une flèche normale marquée `revealed`. */
function acceptRevealedLink(model, state, noteId, { now, by = null } = {}) {
  const note = (state.notes || []).find((n) => n.id === noteId && n.kind === 'hint' && n.link);
  if (!note) return { state, link: null };
  const added = addLink(model, state, note.link.from, note.link.to, { now, by, revealed: true });
  const dismissed = updateNote(added.state, noteId, { dismissed: true }, { now });
  return { state: dismissed, link: added.link };
}

// --------------------------------------------------------------------------------------------
// Fin, résumé, journal
// --------------------------------------------------------------------------------------------

/** Terminée : les cartes sont toutes posées ET la correction a été ouverte (niveau indifférent). */
function isComplete(model, state) {
  return allCardsPlaced(model, state) && Boolean(state.correction?.viewedAt);
}

function summarize(model, state) {
  const ev = evaluateBoard(model, state);
  return {
    deckId: model.id,
    level: state.level,
    step: state.step,
    lotReached: state.lotReached,
    cardsPlaced: ev.placed,
    cardsTotal: ev.totalCards,
    linksCount: (state.links || []).length,
    linksFound: ev.found,
    linksExpected: ev.expected,
    linksTotal: ev.total,
    hintsUsed: (state.hints?.log || []).length,
    notesCount: (state.notes || []).filter((n) => n.kind === 'note').length,
    correctionViewed: Boolean(state.correction?.viewedAt),
    completed: isComplete(model, state),
    title: state.creative?.title || '',
  };
}

/**
 * Événements du journal des gestes entre deux états (côté serveur, avec l'auteur). Pas
 * d'événement pour un simple déplacement, un retournement ou le zoom.
 */
function diffStates(model, prev, next) {
  const events = [];
  const push = (type, payload = {}) => events.push({ type, payload });
  const p = prev || createInitialState(model, { level: next.level });

  for (const id of Object.keys(next.cards || {})) {
    if (!p.cards?.[id]) push('card_placed', { cardId: id, lot: model.lotByCard[id] ?? null });
  }
  const prevLinks = new Map((p.links || []).map((l) => [linkKey(l.from, l.to), l]));
  const nextLinks = new Map((next.links || []).map((l) => [linkKey(l.from, l.to), l]));
  for (const [key, link] of nextLinks) {
    if (!prevLinks.has(key)) {
      const c = classifyLink(model, link.from, link.to);
      push('link_added', {
        from: link.from,
        to: link.to,
        category: c.category,
        revealed: link.revealed === true,
      });
    }
  }
  for (const [key, link] of prevLinks) {
    if (!nextLinks.has(key)) push('link_removed', { from: link.from, to: link.to });
  }
  const prevNotes = new Map((p.notes || []).map((n) => [n.id, n]));
  const nextNotes = new Map((next.notes || []).map((n) => [n.id, n]));
  for (const [id, note] of nextNotes) {
    if (!prevNotes.has(id) && note.kind === 'note')
      push('note_added', { noteId: id, length: note.text.length });
  }
  for (const [id, note] of prevNotes) {
    if (!nextNotes.has(id) && note.kind === 'note') push('note_removed', { noteId: id });
  }
  const prevHints = (p.hints?.log || []).length;
  for (const h of (next.hints?.log || []).slice(prevHints)) {
    push('hint_requested', { target: h.target, rung: h.rung });
  }
  for (const c of (next.checks || []).slice((p.checks || []).length)) {
    push('checkpoint', { lot: c.lot, found: c.found, expected: c.expected });
  }
  if (next.lotReached !== p.lotReached) push('lot_opened', { lot: next.lotReached });
  if (next.level !== p.level) push('level_changed', { from: p.level, to: next.level });
  if (next.step !== p.step) push('step_changed', { from: p.step, to: next.step });
  if (next.correction?.viewedAt && !p.correction?.viewedAt) push('correction_viewed', {});
  const prevRevealed = (p.correction?.revealedMissing || []).length;
  const nextRevealed = (next.correction?.revealedMissing || []).length;
  if (nextRevealed > prevRevealed) push('missing_revealed', { count: nextRevealed - prevRevealed });
  if ((next.creative?.title || '') !== (p.creative?.title || '')) push('title_changed', {});
  if ((next.creative?.favoriteCardId || null) !== (p.creative?.favoriteCardId || null)) {
    push('favorite_changed', { cardId: next.creative?.favoriteCardId || null });
  }
  if (isComplete(model, next) && !isComplete(model, p)) push('completed', {});
  return events;
}

/** Réécrit `by` sur tout élément nouveau (le serveur ne fait pas confiance au client). */
function stampAuthor(prev, next, userId) {
  const by = userId == null ? null : String(userId);
  const prevLinkIds = new Set((prev?.links || []).map((l) => l.id));
  const prevNoteIds = new Set((prev?.notes || []).map((n) => n.id));
  return {
    ...next,
    links: (next.links || []).map((l) => (prevLinkIds.has(l.id) ? l : { ...l, by })),
    notes: (next.notes || []).map((n) => (prevNoteIds.has(n.id) ? n : { ...n, by })),
  };
}

module.exports = {
  FRESQUE_STATE_VERSION,
  FRESQUE_LEVELS,
  FRESQUE_DEFAULT_LEVEL,
  FRESQUE_STEP_DISCOVER,
  FRESQUE_STEP_UNDERSTAND,
  LINK_CATEGORIES,
  LINK_REFUSED_CATEGORIES,
  LINK_CATEGORY_MARKS,
  FRESQUE_LIMITS,
  NOTE_COLORS,
  HINT_NOTE_COLOR,
  NOTE_KINDS,
  ARROW_COLORS,
  TABLE_ASPECT,
  CARD_W_PCT,
  CARD_H_PCT,
  NOTE_W_PCT,
  NOTE_H_PCT,
  linkKey,
  parseLinkKey,
  fillTemplate,
  stepForLot,
  lotOfStep,
  nextId,
  cardRect,
  noteRect,
  buildDeckModel,
  cardTitle,
  cardNumber,
  lotCards,
  bandRect,
  createInitialState,
  migrateState,
  validateState,
  cardsOnTable,
  isCardPlaced,
  cardsInHand,
  isLotComplete,
  nextLotNumber,
  canOpenNextLot,
  openNextLot,
  allCardsPlaced,
  canEnterUnderstand,
  canGoToStep,
  setStep,
  expectedLinks,
  findLink,
  classifyLink,
  evaluateBoard,
  outgoingStats,
  missingOutgoingByCard,
  placeCard,
  moveCard,
  flipCard,
  findFreeSpot,
  placeAllHand,
  addLink,
  removeLink,
  setLinkColor,
  nudgeNoteAwayFromCards,
  addNote,
  updateNote,
  removeNote,
  setLevel,
  setShowBands,
  setTutorialDone,
  setViewport,
  setCreative,
  markCorrectionViewed,
  revealNextMissing,
  revealAllMissing,
  recordCheckpoint,
  checkpointMessage,
  chooseHintTarget,
  nextRungFor,
  nextHint,
  acceptRevealedLink,
  isComplete,
  summarize,
  diffStates,
  stampAuthor,
};
