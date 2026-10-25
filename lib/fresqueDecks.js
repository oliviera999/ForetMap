'use strict';

/**
 * Registre des jeux de cartes « fresque » (moteur générique cartes + flèches cause → effet +
 * correction ; premier jeu : La Fresque du Climat, version Enfant).
 *
 * Un jeu = un dossier versionné `public/fresques/<deckId>/` servi tel quel (copié dans `dist/`
 * au build) qui contient `deck.json` (cartes, lots, crédits), `correction.json` (flèches de la
 * correction officielle) et `hints.json` (textes d'aide originaux ForetMap), plus `cards/`.
 *
 * Le registre lit tous les dossiers au démarrage, valide la structure (zod) et la cohérence
 * entre fichiers, puis sert d'unique source pour l'API : un identifiant hors registre est
 * refusé, aucun chemin n'est jamais construit à partir d'une saisie.
 *
 * Licence des cartes (CC BY-NC-ND) : le registre expose les chemins d'images tels quels et le
 * crédit obligatoire (`attribution.creditLine`) ; voir `LICENCE-NOTICE.md` dans le dossier.
 */

const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');
const logger = require('./logger');

const FRESQUES_DIR = path.join(__dirname, '..', 'public', 'fresques');
const DECK_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const CARD_ID_RE = /^c\d{2}$/;
const IMAGE_PATH_RE = /^cards\/[a-z0-9][a-z0-9.-]*\.webp$/;
const LINK_KEY_RE = /^c\d{2}>c\d{2}$/;

const FEEDBACK_CATEGORIES = ['trouvee', 'inversee', 'raccourci', 'a_discuter', 'piege'];
/** Catégories qu'un piège (`hints.traps`) peut imposer à une flèche. */
const TRAP_CATEGORIES = ['piege', 'raccourci', 'a_discuter'];

const imagePath = z.string().regex(IMAGE_PATH_RE, 'chemin d’image attendu : cards/<nom>.webp');
const pct = z.number().min(0).max(100);

const cardSchema = z
  .object({
    id: z.string().regex(CARD_ID_RE),
    number: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    lot: z.number().int().positive(),
    recto: imagePath,
    verso: imagePath,
    rectoSmall: imagePath,
    versoSmall: imagePath,
    alt: z.object({ recto: z.string().min(1), verso: z.string().min(1) }),
    guideBand: z.string().min(1).nullable().optional(),
  })
  .passthrough();

const specialCardSchema = z
  .object({
    recto: imagePath,
    verso: imagePath,
    versoRole: z.string().min(1).optional(),
    alt: z.string().min(1),
  })
  .passthrough();

const deckSchema = z
  .object({
    schema: z.literal('foretmap.fresque.deck/1'),
    id: z.string().regex(DECK_ID_RE),
    kind: z.enum(['cause_effect']),
    title: z.string().trim().min(1).max(160),
    shortTitle: z.string().trim().min(1).max(80),
    language: z.string().min(2),
    audience: z.string().min(1),
    edition: z.object({ name: z.string(), version: z.string(), date: z.string() }).passthrough(),
    attribution: z
      .object({
        author: z.string().min(1),
        publisher: z.string().min(1),
        website: z.string().url(),
        licence: z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          url: z.string().url(),
        }),
        creditLine: z.string().min(10),
        noticeImage: imagePath,
      })
      .passthrough(),
    image: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      format: z.string(),
      smallMaxSide: z.number().int().positive(),
    }),
    specialCards: z.object({ titre: specialCardSchema, licence: specialCardSchema }).passthrough(),
    lots: z
      .array(
        z.object({
          number: z.number().int().positive(),
          cards: z.array(z.string().regex(CARD_ID_RE)).min(1),
        }),
      )
      .min(1),
    cards: z.array(cardSchema).min(2),
    guideBands: z
      .array(z.object({ id: z.string().min(1), label: z.string().min(1), order: z.number() }))
      .default([]),
    correction: z.string().min(1),
    hints: z.string().min(1),
  })
  .passthrough();

const correctionSchema = z
  .object({
    schema: z.literal('foretmap.fresque.correction/1'),
    deck: z.string().regex(DECK_ID_RE),
    links: z
      .array(z.object({ from: z.string().regex(CARD_ID_RE), to: z.string().regex(CARD_ID_RE) }))
      .min(1),
    expected: z
      .object({
        total: z.number().int().nonnegative(),
        cumulativeByLot: z.record(z.string(), z.number().int().nonnegative()),
        outDegree: z.record(z.string(), z.number().int().nonnegative()),
        inDegree: z.record(z.string(), z.number().int().nonnegative()),
      })
      .passthrough(),
    officialLayout: z
      .object({
        unit: z.literal('percent'),
        cards: z.record(z.string(), z.object({ x: pct, y: pct })),
      })
      .passthrough(),
  })
  .passthrough();

const hintsSchema = z
  .object({
    schema: z.literal('foretmap.fresque.hints/1'),
    deck: z.string().regex(DECK_ID_RE),
    tone: z.string().min(1),
    tutorial: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(1),
    lotIntros: z.record(z.string(), z.string().min(1)),
    ladder: z
      .array(
        z.object({
          level: z.number().int().positive(),
          id: z.string().min(1),
          label: z.string().min(1),
          source: z.string().min(1),
        }),
      )
      .min(1),
    readingHints: z.record(z.string(), z.string().min(1)),
    templates: z.object({
      structure: z.object({
        carrefour: z.string().min(1),
        convergence: z.string().min(1),
        sansConsequence: z.string().min(1),
        arrivee: z.string().min(1),
        resteDuLot: z.string().min(1),
      }),
      piste: z.object({ depuis: z.string().min(1), vers: z.string().min(1) }),
      revelation: z.string().min(1),
    }),
    feedback: z
      .object({
        trouvee: z.string().min(1),
        inversee: z.string().min(1),
        raccourci: z.string().min(1),
        a_discuter: z.string().min(1),
        doublon: z.string().min(1),
        boucle: z.string().min(1),
      })
      .passthrough(),
    traps: z.record(
      z.string().regex(LINK_KEY_RE),
      z.object({ category: z.enum(TRAP_CATEGORIES), text: z.string().min(1) }),
    ),
    checkpoint: z.object({
      found: z.string().min(1),
      allFound: z.string().min(1),
      encourage: z.string().min(1),
      nextLot: z.string().min(1),
    }),
    completion: z.object({
      title: z.string().min(1),
      text: z.string().min(1),
      notePrompt: z.string().min(1),
    }),
    levels: z.record(
      z.enum(['eclaireur', 'explorateur', 'expert']),
      z.object({ label: z.string().min(1), summary: z.string().min(1) }),
    ),
  })
  .passthrough();

class FresqueDeckError extends Error {
  constructor(deckId, message) {
    super(`Jeu de fresque « ${deckId} » : ${message}`);
    this.name = 'FresqueDeckError';
    this.deckId = deckId;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function formatIssues(error) {
  return (error?.issues || [])
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
    .join(' ; ');
}

function parseWith(schema, raw, deckId, label) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new FresqueDeckError(deckId, `${label} invalide — ${formatIssues(result.error)}`);
  }
  return result.data;
}

/**
 * Contrôles de cohérence entre les trois fichiers et le dossier `cards/`.
 * @returns {string[]} erreurs (vide si tout va bien)
 */
function crossCheck({ dir, deck, correction, hints }) {
  const errors = [];
  const cardIds = new Set(deck.cards.map((c) => c.id));
  if (cardIds.size !== deck.cards.length) errors.push('identifiants de cartes en double');
  if (correction.deck !== deck.id) errors.push('correction.deck ≠ deck.id');
  if (hints.deck !== deck.id) errors.push('hints.deck ≠ deck.id');

  const lotNumbers = new Set();
  const cardsInLots = new Set();
  for (const lot of deck.lots) {
    if (lotNumbers.has(lot.number)) errors.push(`lot ${lot.number} déclaré deux fois`);
    lotNumbers.add(lot.number);
    for (const id of lot.cards) {
      if (!cardIds.has(id)) errors.push(`lot ${lot.number} : carte inconnue ${id}`);
      if (cardsInLots.has(id)) errors.push(`carte ${id} dans deux lots`);
      cardsInLots.add(id);
      const card = deck.cards.find((c) => c.id === id);
      if (card && card.lot !== lot.number) {
        errors.push(`carte ${id} : lot ${card.lot} ≠ lot déclaré ${lot.number}`);
      }
    }
  }
  for (const id of cardIds) {
    if (!cardsInLots.has(id)) errors.push(`carte ${id} absente des lots`);
  }

  const bandIds = new Set(deck.guideBands.map((b) => b.id));
  for (const card of deck.cards) {
    if (card.guideBand && !bandIds.has(card.guideBand)) {
      errors.push(`carte ${card.id} : bande inconnue ${card.guideBand}`);
    }
    for (const key of ['recto', 'verso', 'rectoSmall', 'versoSmall']) {
      if (!fs.existsSync(path.join(dir, card[key]))) {
        errors.push(`carte ${card.id} : image absente ${card[key]}`);
      }
    }
  }
  for (const [name, special] of Object.entries(deck.specialCards)) {
    for (const key of ['recto', 'verso']) {
      if (!fs.existsSync(path.join(dir, special[key]))) {
        errors.push(`carte spéciale ${name} : image absente ${special[key]}`);
      }
    }
  }
  if (!fs.existsSync(path.join(dir, deck.attribution.noticeImage))) {
    errors.push(`image de crédit absente ${deck.attribution.noticeImage}`);
  }

  const seenLinks = new Set();
  for (const link of correction.links) {
    if (!cardIds.has(link.from)) errors.push(`correction : carte inconnue ${link.from}`);
    if (!cardIds.has(link.to)) errors.push(`correction : carte inconnue ${link.to}`);
    if (link.from === link.to) errors.push(`correction : boucle ${link.from}`);
    const key = `${link.from}>${link.to}`;
    if (seenLinks.has(key)) errors.push(`correction : flèche en double ${key}`);
    seenLinks.add(key);
  }
  if (correction.expected.total !== correction.links.length) {
    errors.push(
      `expected.total (${correction.expected.total}) ≠ ${correction.links.length} flèches`,
    );
  }
  for (const id of Object.keys(correction.officialLayout.cards)) {
    if (!cardIds.has(id)) errors.push(`disposition officielle : carte inconnue ${id}`);
  }
  for (const key of Object.keys(hints.traps)) {
    const [from, to] = key.split('>');
    if (!cardIds.has(from) || !cardIds.has(to)) errors.push(`piège ${key} : carte inconnue`);
    if (seenLinks.has(key)) errors.push(`piège ${key} : la flèche est dans la correction`);
  }
  for (const id of Object.keys(hints.readingHints)) {
    if (!cardIds.has(id)) errors.push(`indice de lecture : carte inconnue ${id}`);
  }
  for (const id of cardIds) {
    if (!hints.readingHints[id]) errors.push(`carte ${id} sans indice de lecture`);
  }
  for (const lot of deck.lots) {
    if (!hints.lotIntros[String(lot.number)]) errors.push(`lot ${lot.number} sans introduction`);
  }
  return errors;
}

/**
 * Charge un dossier de jeu. Lève `FresqueDeckError` au moindre défaut : on préfère un jeu
 * absent du registre à un jeu incohérent servi aux élèves.
 */
function loadDeckDir(dir, expectedId) {
  const deckFile = path.join(dir, 'deck.json');
  if (!fs.existsSync(deckFile)) return null;
  const deck = parseWith(deckSchema, readJson(deckFile), expectedId, 'deck.json');
  if (deck.id !== expectedId) {
    throw new FresqueDeckError(expectedId, `deck.id « ${deck.id} » ≠ nom du dossier`);
  }
  const safeName = (name, label) => {
    const base = path.basename(String(name || ''));
    if (base !== name || !/^[a-z0-9_.-]+\.json$/i.test(base)) {
      throw new FresqueDeckError(expectedId, `${label} : nom de fichier refusé « ${name} »`);
    }
    return path.join(dir, base);
  };
  const correction = parseWith(
    correctionSchema,
    readJson(safeName(deck.correction, 'deck.correction')),
    expectedId,
    'correction.json',
  );
  const hints = parseWith(
    hintsSchema,
    readJson(safeName(deck.hints, 'deck.hints')),
    expectedId,
    'hints.json',
  );
  const errors = crossCheck({ dir, deck, correction, hints });
  if (errors.length) {
    throw new FresqueDeckError(expectedId, `incohérences — ${errors.slice(0, 8).join(' ; ')}`);
  }
  return Object.freeze({
    id: deck.id,
    dir,
    publicBase: `/fresques/${deck.id}/`,
    deck,
    correction,
    hints,
  });
}

/** @type {Map<string, object>|null} */
let registry = null;
let registryDir = null;

/**
 * Lit tous les jeux du dossier (une fois ; `reset` pour relire). Un jeu invalide est journalisé
 * et ignoré, les autres restent servis.
 * @param {{ dir?: string, reset?: boolean, strict?: boolean }} [options] `strict` : relance
 *   l'erreur du premier jeu invalide (tests de contenu).
 */
function loadFresqueDecks({ dir = FRESQUES_DIR, reset = false, strict = false } = {}) {
  if (registry && !reset && registryDir === dir) return registry;
  const next = new Map();
  let names = [];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && DECK_ID_RE.test(d.name))
      .map((d) => d.name)
      .sort();
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }
  for (const name of names) {
    try {
      const entry = loadDeckDir(path.join(dir, name), name);
      if (entry) next.set(entry.id, entry);
    } catch (err) {
      if (strict) throw err;
      logger.error({ err, deckId: name }, 'Jeu de fresque ignoré (fichiers invalides)');
    }
  }
  registry = next;
  registryDir = dir;
  return registry;
}

function resetFresqueDecksForTests() {
  registry = null;
  registryDir = null;
}

/** Jeu complet (deck + correction + hints) ou `null` si l'identifiant est hors registre. */
function getFresqueDeck(deckId) {
  const id = String(deckId || '').trim();
  if (!DECK_ID_RE.test(id)) return null;
  return loadFresqueDecks().get(id) || null;
}

/** Résumé public d'un jeu (liste des jeux disponibles). */
function summarizeFresqueDeck(entry) {
  const { deck } = entry;
  return {
    id: deck.id,
    kind: deck.kind,
    title: deck.title,
    shortTitle: deck.shortTitle,
    language: deck.language,
    audience: deck.audience,
    edition: { name: deck.edition.name, version: deck.edition.version, date: deck.edition.date },
    cardCount: deck.cards.length,
    lotCount: deck.lots.length,
    expectedLinks: entry.correction.expected.total,
    attribution: deck.attribution,
    publicBase: entry.publicBase,
    titleImage: `${entry.publicBase}${deck.specialCards.titre.rectoSmall || deck.specialCards.titre.recto}`,
  };
}

function listFresqueDecks() {
  return [...loadFresqueDecks().values()].map(summarizeFresqueDeck);
}

module.exports = {
  FRESQUES_DIR,
  DECK_ID_RE,
  CARD_ID_RE,
  FEEDBACK_CATEGORIES,
  TRAP_CATEGORIES,
  FresqueDeckError,
  deckSchema,
  correctionSchema,
  hintsSchema,
  crossCheck,
  loadDeckDir,
  loadFresqueDecks,
  resetFresqueDecksForTests,
  getFresqueDeck,
  listFresqueDecks,
  summarizeFresqueDeck,
};
