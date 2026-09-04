import { renard2CutManifest, RENARD2_FRAMES_BASE } from './data/renard2-cut-manifest.js';
import { gnome1CutManifest, GNOME1_FRAMES_BASE } from './data/gnome1-cut-manifest.js';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from './browserStorage.js';

const VISIT_MASCOT_STORAGE_KEY = 'foretmap_visit_mascot_id';

/** Mascotte proposée par défaut (première visite ou valeur localStorage inconnue). */
const DEFAULT_VISIT_MASCOT_ID = 'renard2-cut-spritesheet';

/**
 * Ajouter une mascotte :
 * 1) Déposer les assets sous /public/assets/mascots/... ou /public/assets/rive/...
 * 2) Ajouter une entrée ici (renderer: 'rive' | 'spritesheet' | 'sprite_cut')
 * 3) `fallbackSilhouette` : forme du SVG de secours (gnome, spore, vine, moss, seed, swarm, sprout, scrap, olu, tanBird, backpackFox, backpackFox2)
 * 4) Renseigner les animations Rive par état si applicable ; pour `sprite_cut`, voir `spriteCut.stateFrames` (srcs, fps, optionnel frameDwellMs, displayScale). Pack JSON : docs/MASCOT_PACK.md.
 */
function buildRenard2CutSpriteCutConfig() {
  const stateFrames = {};
  for (const [state, { files, fps }] of Object.entries(renard2CutManifest)) {
    stateFrames[state] = {
      srcs: files.map((f) => `${RENARD2_FRAMES_BASE}/${f}`),
      fps: Math.max(1, Number(fps) || 1),
    };
  }
  return {
    frameWidth: 153,
    frameHeight: 160,
    pixelated: true,
    displayScale: 1,
    stateFrames,
  };
}

function buildGnome1CutSpriteCutConfig() {
  const stateFrames = {};
  for (const [state, { files, fps }] of Object.entries(gnome1CutManifest)) {
    stateFrames[state] = {
      srcs: files.map((f) => `${GNOME1_FRAMES_BASE}/${f}`),
      fps: Math.max(1, Number(fps) || 1),
    };
  }
  return {
    frameWidth: 113,
    frameHeight: 173,
    pixelated: true,
    displayScale: 1,
    stateFrames,
  };
}

const VISIT_MASCOT_CATALOG = [
  {
    id: 'sprout-rive',
    label: 'SPR0UT (Rive)',
    renderer: 'rive',
    fallbackSilhouette: 'sprout',
    rive: {
      src: '/assets/rive/sprout.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['move', 'Move', 'walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy'],
        talk: ['talk', 'Talk', 'speaking', 'Speaking'],
        angry: ['angry', 'Angry', 'alert', 'Alert'],
        alert: ['alert', 'Alert', 'angry', 'Angry'],
        surprise: ['surprise', 'Surprise', 'happy', 'Happy'],
      },
    },
  },
  {
    id: 'scrap-rive',
    label: 'SCR4P (Rive)',
    renderer: 'rive',
    fallbackSilhouette: 'scrap',
    rive: {
      src: '/assets/rive/scrap.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['move', 'Move', 'walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy'],
        talk: ['talk', 'Talk', 'speaking', 'Speaking'],
        alert: ['alert', 'Alert', 'angry', 'Angry'],
        angry: ['angry', 'Angry', 'alert', 'Alert'],
        surprise: ['surprise', 'Surprise', 'happy', 'Happy'],
      },
    },
  },
  {
    id: 'gnome-foret-rive',
    label: 'Gnome foret (Rive)',
    renderer: 'rive',
    fallbackSilhouette: 'gnome',
    fallbackVariant: 'forest',
    rive: {
      src: '/assets/rive/visit-mascot.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy', 'celebrate', 'Celebrate'],
      },
    },
  },
  {
    id: 'gnome-ambre-rive',
    label: 'Gnome ambre (Rive)',
    renderer: 'rive',
    fallbackSilhouette: 'gnome',
    fallbackVariant: 'amber',
    rive: {
      src: '/assets/rive/visit-mascot-amber.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy', 'celebrate', 'Celebrate'],
      },
    },
  },
  {
    id: 'gnome-punk-rive',
    label: 'Gnome punk (Rive)',
    renderer: 'rive',
    fallbackSilhouette: 'gnome',
    fallbackVariant: 'punk',
    rive: {
      src: '/assets/rive/visit-mascot-punk.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy', 'celebrate', 'Celebrate'],
      },
    },
  },
  {
    id: 'spore-rive',
    label: 'Spore (champignon)',
    renderer: 'rive',
    fallbackSilhouette: 'spore',
    rive: {
      src: '/assets/rive/visit-mascot-spore.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy', 'celebrate', 'Celebrate'],
      },
    },
  },
  {
    id: 'vine-rive',
    label: 'Liane (bourgeon)',
    renderer: 'rive',
    fallbackSilhouette: 'vine',
    rive: {
      src: '/assets/rive/visit-mascot-vine.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy', 'celebrate', 'Celebrate'],
      },
    },
  },
  {
    id: 'moss-rive',
    label: 'Mousse (blob)',
    renderer: 'rive',
    fallbackSilhouette: 'moss',
    rive: {
      src: '/assets/rive/visit-mascot-moss.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy', 'celebrate', 'Celebrate'],
      },
    },
  },
  {
    id: 'seed-rive',
    label: 'Graine (feuille)',
    renderer: 'rive',
    fallbackSilhouette: 'seed',
    rive: {
      src: '/assets/rive/visit-mascot-seed.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy', 'celebrate', 'Celebrate'],
      },
    },
  },
  {
    id: 'swarm-rive',
    label: 'Essaim (lucioles)',
    renderer: 'rive',
    fallbackSilhouette: 'swarm',
    rive: {
      src: '/assets/rive/visit-mascot-swarm.riv',
      stateAnimations: {
        idle: ['idle', 'Idle', 'IDLE'],
        walking: ['walk', 'Walk', 'walking', 'Walking'],
        happy: ['happy', 'Happy', 'celebrate', 'Celebrate'],
      },
    },
  },
  {
    id: 'sprite-template',
    label: 'Gnome template (spritesheet)',
    renderer: 'spritesheet',
    fallbackSilhouette: 'gnome',
    fallbackVariant: 'forest',
    spritesheet: {
      src: '/assets/mascots/template/mascot-spritesheet.png',
      frameWidth: 64,
      frameHeight: 64,
      stateFrames: {
        idle: { row: 0, frames: 1, fps: 1 },
        walking: { row: 1, frames: 6, fps: 10 },
        happy: { row: 2, frames: 6, fps: 12 },
      },
      pixelated: true,
    },
  },
  /*
   * OLU — planche **non livrée avec le dépôt** (`docs/MASCOT_NARRATEUR_OLU.md` §3.1a).
   *
   * L'entrée reste déclarée : elle réserve l'identifiant, et `buildVisitMascotSelectionOptions`
   * fait gagner, **à identifiant égal, l'entrée d'un pack publié**. Publier un pack mascotte
   * `olu-spritesheet` depuis le studio (les spritesheets vivent en médiathèque) suffit donc à
   * animer OLU, sans versionner un binaire — conforme à l'arbitrage §5.1.
   *
   * Tant qu'aucun pack ne la remplit, `VisitMapMascotSpritesheet` détecte l'image absente
   * (`onError`) et rend la silhouette SVG : c'est le niveau 3 du §4.1, pas une panne.
   *
   * ⚠️ Le découpage ci-dessous est une **hypothèse** posée avant toute planche : 12 états sur
   * 5 rangées, dont 4 partageant la rangée 3 à l'identique. Il est à confronter aux sprites
   * réels le jour où ils existent — c'est précisément la vérification demandée au §3.1a. Un
   * pack publié rend le sujet sans objet, puisqu'il apporte son propre découpage.
   *
   * Les 9 états canoniques absents de `stateFrames` (`angry`, `sleep`, `wave`, `dance`, `eat`,
   * `search`, `sad`, `love`, `point` — ajoutés au moteur après cette entrée) retombent sur
   * `idle`, faute de rangée où les loger. Les inventer reviendrait à décrire une planche qui
   * n'existe pas ; le repli est donc **assumé**, et figé par `tests/visit-mascot-catalog-states.test.js`.
   */
  {
    id: 'olu-spritesheet',
    label: 'OLU (spritesheet)',
    renderer: 'spritesheet',
    fallbackSilhouette: 'olu',
    spritesheet: {
      src: '/assets/mascots/olu/olu-spritesheet.png',
      frameWidth: 64,
      frameHeight: 64,
      // Pas de `stateAliases` : `resolveStateSpec` consulte `stateFrames` **avant** les alias,
      // or les six alias déclarés ici portaient des clés déjà présentes ci-dessous (trois
      // étaient même des identités, `spin -> spin`). Bloc entièrement inopérant, supprimé.
      stateFrames: {
        idle: { row: 0, frames: 4, fps: 4 },
        walking: { row: 1, frames: 6, fps: 10 },
        running: { row: 1, frames: 6, fps: 14 },
        talk: { row: 2, frames: 4, fps: 8 },
        happy: { row: 3, frames: 5, fps: 10 },
        happy_jump: { row: 3, frames: 5, fps: 10 },
        spin: { row: 3, frames: 5, fps: 12 },
        inspect: { row: 4, frames: 2, fps: 3 },
        map_read: { row: 4, frames: 2, fps: 3 },
        alert: { row: 2, frames: 4, fps: 11 },
        celebrate: { row: 3, frames: 5, fps: 12 },
        surprise: { row: 2, frames: 4, fps: 9 },
      },
      pixelated: true,
    },
  },
  {
    id: 'tan-bird-spritesheet',
    label: 'Oiseau tan (2 frames)',
    renderer: 'spritesheet',
    fallbackSilhouette: 'tanBird',
    spritesheet: {
      src: '/assets/mascots/tan-bird/tan-bird-spritesheet.png',
      frameWidth: 712,
      frameHeight: 637,
      stateFrames: {
        idle: { row: 0, frames: 1, fps: 1 },
        walking: { row: 0, frames: 2, fps: 8 },
        running: { row: 0, frames: 2, fps: 12 },
        happy: { row: 0, frames: 1, fps: 1 },
        happy_jump: { row: 0, frames: 1, fps: 1 },
        spin: { row: 0, frames: 1, fps: 1 },
        celebrate: { row: 0, frames: 1, fps: 1 },
        map_read: { row: 0, frames: 1, fps: 1 },
        inspect: { row: 0, frames: 1, fps: 1 },
        talk: { row: 0, frames: 1, fps: 1 },
        alert: { row: 0, frames: 1, fps: 1 },
        angry: { row: 0, frames: 1, fps: 1 },
        surprise: { row: 0, frames: 1, fps: 1 },
      },
      pixelated: false,
    },
  },
  {
    id: 'fox-backpack-spritesheet',
    label: 'Renard sac (spritesheet)',
    renderer: 'spritesheet',
    fallbackSilhouette: 'backpackFox',
    spritesheet: {
      src: '/assets/mascots/fox-backpack/fox-backpack-spritesheet.png',
      frameWidth: 153,
      frameHeight: 160,
      stateFrames: {
        /* Grille 6×4 (153×160) : ligne 0 poses, 1 course, 2 parole (cols 4–5 bulles neutralisées), 3 émotes */
        idle: { row: 0, frames: 3, fps: 3 },
        walking: { row: 1, frames: 5, fps: 10 },
        running: { row: 1, frames: 5, fps: 14 },
        talk: { row: 2, col: 0, frames: 4, fps: 8 },
        inspect: { row: 0, col: 2, frames: 1, fps: 1 },
        map_read: { row: 0, col: 0, frames: 1, fps: 1 },
        surprise: { row: 3, col: 0, frames: 1, fps: 2 },
        alert: { row: 3, col: 0, frames: 1, fps: 5 },
        angry: { row: 3, col: 0, frames: 1, fps: 7 },
        spin: { row: 3, col: 1, frames: 2, fps: 10 },
        happy: { row: 3, col: 3, frames: 3, fps: 9 },
        happy_jump: { row: 3, col: 3, frames: 3, fps: 11 },
        celebrate: { row: 3, col: 3, frames: 3, fps: 10 },
      },
      pixelated: true,
    },
  },
  {
    id: 'renard2-cut-spritesheet',
    label: 'Renard 2 (images découpées)',
    renderer: 'sprite_cut',
    fallbackSilhouette: 'backpackFox2',
    spriteCut: buildRenard2CutSpriteCutConfig(),
  },
  {
    id: 'gnome1',
    label: 'Gnome 1',
    renderer: 'sprite_cut',
    fallbackSilhouette: 'gnome',
    spriteCut: buildGnome1CutSpriteCutConfig(),
  },
];

function normalizeAllowedMascotIdsInput(raw) {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,\n;]+/g)
      .map((id) => String(id || '').trim())
      .filter(Boolean);
  }
  return [];
}

function getVisitMascotCatalog() {
  return VISIT_MASCOT_CATALOG.slice();
}

function isVisitMascotExtraEntry(mascotId, extraEntries = []) {
  const id = String(mascotId || '').trim();
  if (!id) return false;
  const extras = Array.isArray(extraEntries) ? extraEntries : [];
  return extras.some((entry) => entry && String(entry.id || '').trim() === id);
}

/**
 * Options de sélection : **une seule liste, deux origines à égalité** — mascottes livrées
 * avec l'application (catalogue statique) et packs publiés (`extraEntries`, ids `srv-…`).
 *
 * `allowedMascotIds` s'applique **aux deux** : liste vide = tout est proposé ; liste non
 * vide = seuls ces ids le sont, quelle que soit leur origine. Un pack reprenant l'id d'une
 * mascotte livrée remplace celle-ci (le pack est la version « à jour » de cet identifiant).
 */
function buildVisitMascotSelectionOptions(extraEntries = [], allowedMascotIds = []) {
  const extras = Array.isArray(extraEntries) ? extraEntries : [];
  const allowed = normalizeAllowedMascotIdsInput(allowedMascotIds).filter(
    (id, idx, arr) => arr.indexOf(id) === idx,
  );
  const isAllowed = (id) => allowed.length === 0 || allowed.includes(id);

  // Ordre : mascottes livrées (ordre du catalogue) puis packs publiés. À identifiant égal,
  // c'est l'entrée du pack qui est retenue (elle porte le libellé et les états à jour).
  const extraById = new Map();
  for (const extra of extras) {
    const id = String(extra?.id || '').trim();
    if (id && !extraById.has(id)) extraById.set(id, extra);
  }
  const merged = [];
  const seen = new Set();
  const push = (entry) => {
    const id = String(entry?.id || '').trim();
    if (!id || seen.has(id) || !isAllowed(id)) return;
    seen.add(id);
    merged.push(extraById.get(id) || entry);
  };
  for (const entry of getVisitMascotCatalog()) push(entry);
  for (const extra of extras) push(extra);
  return merged;
}

function getDefaultVisitMascotId(
  allowedMascotIds = null,
  extraEntries = [],
  forcedDefaultId = DEFAULT_VISIT_MASCOT_ID,
) {
  const normalizedAllowed = normalizeAllowedMascotIdsInput(allowedMascotIds)
    .filter((id, idx, arr) => arr.indexOf(id) === idx)
    .filter((id) => !!resolveVisitMascotEntry(id, extraEntries));
  const pickDefault = String(forcedDefaultId || '').trim() || DEFAULT_VISIT_MASCOT_ID;
  if (normalizedAllowed.length > 0) {
    if (normalizedAllowed.includes(pickDefault)) return pickDefault;
    if (normalizedAllowed.includes(DEFAULT_VISIT_MASCOT_ID)) return DEFAULT_VISIT_MASCOT_ID;
    return normalizedAllowed[0];
  }
  if (resolveVisitMascotEntry(pickDefault, extraEntries)) {
    return pickDefault;
  }
  if (VISIT_MASCOT_CATALOG.some((m) => m.id === DEFAULT_VISIT_MASCOT_ID)) {
    return DEFAULT_VISIT_MASCOT_ID;
  }
  return VISIT_MASCOT_CATALOG[0]?.id || '';
}

/** Entrées mascotte additionnelles (ex. packs serveur `sprite_cut`) : mêmes champs que le catalogue statique. */
function resolveVisitMascotEntry(mascotId, extraEntries = []) {
  const id = String(mascotId || '').trim();
  if (!id) return null;
  const extras = Array.isArray(extraEntries) ? extraEntries : [];
  const fromExtra = extras.find((m) => m && String(m.id || '').trim() === id);
  if (fromExtra) return fromExtra;
  return VISIT_MASCOT_CATALOG.find((m) => m.id === id) || null;
}

function getVisitMascotById(mascotId) {
  return resolveVisitMascotEntry(mascotId, []);
}

/**
 * Ramène un identifiant à une mascotte réellement disponible : l'id s'il existe (catalogue
 * livré **ou** pack publié) et qu'il est autorisé, sinon la mascotte par défaut.
 * Les packs ne bénéficient d'aucun passe-droit sur `allowedMascotIds`.
 */
function normalizeVisitMascotId(mascotId, extraEntries = [], options = {}) {
  const id = String(mascotId || '').trim();
  const allowedIds = normalizeAllowedMascotIdsInput(options.allowedMascotIds)
    .filter((allowedId, idx, arr) => arr.indexOf(allowedId) === idx)
    .filter((allowedId) => !!resolveVisitMascotEntry(allowedId, extraEntries));
  const isAllowed = allowedIds.length === 0 || allowedIds.includes(id);
  if (resolveVisitMascotEntry(id, extraEntries) && isAllowed) return id;
  return getDefaultVisitMascotId(allowedIds, extraEntries, options.defaultMascotId);
}

function getVisitMascotSupportedStates(mascotId, extraEntries = []) {
  const mascot = resolveVisitMascotEntry(mascotId, extraEntries);
  if (!mascot) return ['idle', 'walking', 'happy'];
  let stateSource = mascot?.rive?.stateAnimations;
  if (mascot?.renderer === 'spritesheet') {
    stateSource = mascot?.spritesheet?.stateFrames;
  } else if (mascot?.renderer === 'sprite_cut') {
    stateSource = mascot?.spriteCut?.stateFrames;
  }
  if (!stateSource || typeof stateSource !== 'object') {
    return ['idle', 'walking', 'happy'];
  }
  const states = Object.keys(stateSource)
    .map((state) => String(state || '').trim())
    .filter(Boolean);
  if (states.length === 0) return ['idle', 'walking', 'happy'];
  if (!states.includes('idle')) states.unshift('idle');
  return [...new Set(states)];
}

function loadVisitMascotId(extraEntries = [], options = {}) {
  const raw = safeLocalStorageGetItem(VISIT_MASCOT_STORAGE_KEY, null);
  return normalizeVisitMascotId(raw, extraEntries, options);
}

function saveVisitMascotId(mascotId, extraEntries = [], options = {}) {
  const id = normalizeVisitMascotId(mascotId, extraEntries, options);
  safeLocalStorageSetItem(VISIT_MASCOT_STORAGE_KEY, id);
  return id;
}

export {
  VISIT_MASCOT_STORAGE_KEY,
  getVisitMascotCatalog,
  buildVisitMascotSelectionOptions,
  isVisitMascotExtraEntry,
  getDefaultVisitMascotId,
  getVisitMascotById,
  resolveVisitMascotEntry,
  getVisitMascotSupportedStates,
  normalizeVisitMascotId,
  loadVisitMascotId,
  saveVisitMascotId,
};
