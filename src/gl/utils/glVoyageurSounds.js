/**
 * Sons du voyageur (audit de l'expérience joueur, § 12 → § 13) — **synthétisés** avec la
 * Web Audio API : aucun fichier audio, aucune dépendance, aucune question de licence.
 *
 * Deux interrupteurs, tous deux nécessaires pour entendre quelque chose :
 * - l'**admin** : module `voyageurSoundsEnabled` (poussé par AppGL via `setVoyageurSoundsAllowed`) ;
 * - l'**élève** : bouton du Seuil, mémorisé dans `localStorage` (`gl_voyageur_sfx_muted`).
 *
 * Volume volontairement bas (une classe entière peut jouer en même temps) et sons très courts
 * (≤ 0,6 s). Rien ne joue si l'onglet est caché, sans contexte audio (jsdom, vieux navigateur),
 * ou avant un geste de l'élève : les sons suivent toujours un clic, ce qui satisfait les
 * règles d'autoplay des navigateurs.
 */

export const GL_VOYAGEUR_SFX_MUTED_KEY = 'gl_voyageur_sfx_muted';
export const GL_VOYAGEUR_SFX_CHANGED_EVENT = 'gl:voyageur-sfx-changed';

const MASTER_GAIN = 0.16;

let allowedByAdmin = true;
let audioContext = null;

export function setVoyageurSoundsAllowed(allowed) {
  allowedByAdmin = allowed !== false;
}

export function isVoyageurSfxMuted() {
  try {
    return localStorage.getItem(GL_VOYAGEUR_SFX_MUTED_KEY) === '1';
  } catch (_) {
    return false;
  }
}

export function setVoyageurSfxMuted(muted) {
  try {
    localStorage.setItem(GL_VOYAGEUR_SFX_MUTED_KEY, muted ? '1' : '0');
  } catch (_) {
    // noop
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GL_VOYAGEUR_SFX_CHANGED_EVENT, { detail: { muted } }));
  }
}

function getContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch (_) {
      return null;
    }
  }
  if (audioContext.state === 'suspended') audioContext.resume?.().catch(() => {});
  return audioContext;
}

/** Fréquence d'une note (`C4`, `G#5`…) — notation anglo-saxonne, la4 = 440 Hz. */
export function noteFrequency(note) {
  const match = /^([A-G])(#?)(\d)$/.exec(String(note || ''));
  if (!match) return 440;
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[match[1]] + (match[2] ? 1 : 0);
  const octave = Number(match[3]) - 4;
  return 440 * 2 ** ((semis + octave * 12) / 12);
}

/**
 * Partitions (pures, testables) : liste de notes `{ at, dur, freq, to?, type, gain }` en
 * secondes. `to` = glissando vers cette fréquence.
 */
export function soundScore(kind, options = {}) {
  const n = (note, at, dur, type = 'triangle', gain = 1) => ({
    at,
    dur,
    freq: noteFrequency(note),
    type,
    gain,
  });
  switch (kind) {
    // Regard du proche : deux notes graves et boisées, comme un pas sur la mousse.
    case 'gain-proche':
      return [n('G3', 0, 0.16), n('C4', 0.09, 0.22)];
    // Regard du loin : une cloche claire qui monte.
    case 'gain-loin':
      return [n('E5', 0, 0.22, 'sine', 0.8), n('B5', 0.1, 0.32, 'sine', 0.7)];
    // Montée de niveau : arpège majeur.
    case 'level-up':
      return [n('C5', 0, 0.14), n('E5', 0.1, 0.14), n('G5', 0.2, 0.14), n('C6', 0.3, 0.28, 'sine')];
    // Sortilège lancé : un souffle qui monte.
    case 'spell':
      return [
        { at: 0, dur: 0.45, freq: 330, to: 990, type: 'sine', gain: 0.8 },
        n('E6', 0.32, 0.2, 'sine', 0.5),
      ];
    // Loupe : « tic-ting ».
    case 'loupe':
      return [n('A5', 0, 0.06, 'square', 0.35), n('E6', 0.07, 0.18, 'sine', 0.7)];
    // Gestes de mascotte : le cri change avec le peuple de l'équipe.
    case 'gesture-salut':
      return [n('D5', 0, 0.12), n('G5', 0.12, 0.2)];
    case 'gesture-danse':
      return [n('C5', 0, 0.1), n('E5', 0.12, 0.1), n('C5', 0.24, 0.1), n('G5', 0.36, 0.18)];
    case 'gesture-cri':
      return options.people === 'unicorn'
        ? [{ at: 0, dur: 0.5, freq: 660, to: 1320, type: 'sine', gain: 0.7 }]
        : [{ at: 0, dur: 0.4, freq: 196, to: 147, type: 'sawtooth', gain: 0.35 }];
    default:
      return [];
  }
}

/** Joue un son du voyageur, si l'admin et l'élève le permettent. Ne lève jamais. */
export function playVoyageurSound(kind, options = {}) {
  try {
    if (!allowedByAdmin || isVoyageurSfxMuted()) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    const score = soundScore(kind, options);
    if (!score.length) return false;
    const ctx = getContext();
    if (!ctx) return false;
    const start = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
    for (const note of score) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = note.type || 'triangle';
      const t0 = start + note.at;
      const t1 = t0 + note.dur;
      osc.frequency.setValueAtTime(note.freq, t0);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, t1);
      // Enveloppe courte : attaque 10 ms, décroissance exponentielle (pas de clic audible).
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, note.gain ?? 1), t0 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(env);
      env.connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
    return true;
  } catch (_) {
    return false;
  }
}
