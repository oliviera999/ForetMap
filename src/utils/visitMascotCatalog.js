const VISIT_MASCOT_STORAGE_KEY = 'foretmap_visit_mascot_id';

/**
 * Ajouter une mascotte :
 * 1) Déposer les assets sous /public/assets/mascots/... ou /public/assets/rive/...
 * 2) Ajouter une entrée ici (renderer: 'rive' ou 'spritesheet')
 * 3) `fallbackSilhouette` : forme du SVG de secours (gnome, spore, vine, moss, seed, swarm)
 * 4) Renseigner les animations Rive par état si applicable
 */
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
  {
    id: 'olu-spritesheet',
    label: 'OLU (spritesheet)',
    renderer: 'spritesheet',
    fallbackSilhouette: 'olu',
    spritesheet: {
      src: '/assets/mascots/olu/olu-spritesheet.png',
      frameWidth: 64,
      frameHeight: 64,
      stateAliases: {
        happy_jump: 'happy_jump',
        happy: 'happy_jump',
        spin: 'spin',
        celebrate: 'celebrate',
        map_read: 'map_read',
        inspect: 'inspect',
      },
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
];

function getVisitMascotCatalog() {
  return VISIT_MASCOT_CATALOG.slice();
}

function getDefaultVisitMascotId() {
  return VISIT_MASCOT_CATALOG[0]?.id || '';
}

function getVisitMascotById(mascotId) {
  const id = String(mascotId || '').trim();
  return VISIT_MASCOT_CATALOG.find((m) => m.id === id) || null;
}

function normalizeVisitMascotId(mascotId) {
  return getVisitMascotById(mascotId)?.id || getDefaultVisitMascotId();
}

function getVisitMascotSupportedStates(mascotId) {
  const mascot = getVisitMascotById(mascotId);
  if (!mascot) return ['idle', 'walking', 'happy'];
  const stateSource = mascot?.renderer === 'spritesheet'
    ? mascot?.spritesheet?.stateFrames
    : mascot?.rive?.stateAnimations;
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

function loadVisitMascotId() {
  if (typeof window === 'undefined') return getDefaultVisitMascotId();
  const raw = window.localStorage.getItem(VISIT_MASCOT_STORAGE_KEY);
  return normalizeVisitMascotId(raw);
}

function saveVisitMascotId(mascotId) {
  const id = normalizeVisitMascotId(mascotId);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(VISIT_MASCOT_STORAGE_KEY, id);
  }
  return id;
}

export {
  VISIT_MASCOT_STORAGE_KEY,
  getVisitMascotCatalog,
  getDefaultVisitMascotId,
  getVisitMascotById,
  getVisitMascotSupportedStates,
  normalizeVisitMascotId,
  loadVisitMascotId,
  saveVisitMascotId,
};
