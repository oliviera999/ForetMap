const VISIT_MASCOT_STORAGE_KEY = 'foretmap_visit_mascot_id';

/**
 * Ajouter une mascotte :
 * 1) Déposer les assets sous /public/assets/mascots/...
 * 2) Ajouter une entrée ici (renderer: 'rive' ou 'spritesheet')
 * 3) Renseigner les animations par état (idle/walking/happy)
 */
const VISIT_MASCOT_CATALOG = [
  {
    id: 'gnome-foret-rive',
    label: 'Gnome foret (Rive)',
    renderer: 'rive',
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
    id: 'sprite-template',
    label: 'Gnome template (spritesheet)',
    renderer: 'spritesheet',
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
  normalizeVisitMascotId,
  loadVisitMascotId,
  saveVisitMascotId,
};
