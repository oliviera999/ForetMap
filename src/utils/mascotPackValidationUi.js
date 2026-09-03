/**
 * Validation UI des packs mascotte **visite** (ForetMap).
 *
 * Les helpers neutres (extraction / mise en forme des erreurs Zod) viennent du module
 * partagé `src/shared/mascot-pack/validationUi.js` ; l'assainissement du brouillon studio,
 * qui dépend de `mascotPackEditorFrames` (code produit), est défini ici.
 */
import { normalizePackStateFramesForFramesBase } from './mascotPackEditorFrames.js';

export function sanitizeFrameEntries(values) {
  if (!Array.isArray(values)) return [];
  return values.map((v) => String(v || '').trim()).filter(Boolean);
}

/** Moteurs auxquels `stateFrames` est interdit (cf. `RENDERER_FIELDS`, `src/utils/mascotPack.js`). */
const RENDERERS_SANS_STATE_FRAMES = new Set(['rive', 'spritesheet']);

export function sanitizeMascotPackDraft(pack) {
  if (!pack || typeof pack !== 'object') return {};
  const next = { ...pack };

  // `stateFrames` **n'appartient qu'à `sprite_cut`** : la table `RENDERER_FIELDS` de
  // `src/utils/mascotPack.js` pose qu'un pack ne décrit qu'un moteur, et refuse les blocs des
  // autres. Or la suite de cette fonction écrit `next.stateFrames` **sans condition** : pour
  // un pack `rive` ou `spritesheet`, elle y posait un `{}`, que la validation rejetait aussitôt —
  // « Champ « stateFrames » réservé aux packs « sprite_cut » : ce pack est « rive ». »
  //
  // Le pack était pourtant valide en base : c'est le passage par le studio qui l'invalidait. Ces
  // packs devenaient donc **impossibles à enregistrer**, l'erreur s'affichant à l'ouverture sans
  // que personne ait rien modifié.
  //
  // Même défaut, même forme que celui déjà fermé sur `framesBase` : un champ propre à un moteur
  // écrit pour tous.
  //
  // Le test porte sur les moteurs **explicitement** autres, pas sur « tout sauf `sprite_cut` » :
  // un brouillon en cours de création n'a pas encore de `renderer`, et lui retirer ses états
  // serait détruire le travail en cours pour un champ qu'aucune règle ne lui interdit encore.
  // Un `renderer` manquant est une erreur que la validation signale pour ce qu'elle est.
  if (RENDERERS_SANS_STATE_FRAMES.has(String(next.renderer || '').trim())) {
    delete next.stateFrames;
    return next;
  }

  const rawStates =
    next.stateFrames && typeof next.stateFrames === 'object' && !Array.isArray(next.stateFrames)
      ? next.stateFrames
      : {};
  const cleanedStates = {};
  for (const [stateKey, rawSpec] of Object.entries(rawStates)) {
    if (!rawSpec || typeof rawSpec !== 'object') continue;
    const spec = { ...rawSpec };
    const hasSrcMode = Object.prototype.hasOwnProperty.call(spec, 'srcs');
    const hasFileMode = Object.prototype.hasOwnProperty.call(spec, 'files');
    const srcs = sanitizeFrameEntries(spec.srcs);
    const files = sanitizeFrameEntries(spec.files);
    const cleaned = {
      ...spec,
      fps: Math.max(1, Number(spec.fps) || 8),
    };
    delete cleaned.srcs;
    delete cleaned.files;

    if (hasSrcMode && !hasFileMode) {
      if (srcs.length === 0) continue;
      cleaned.srcs = srcs;
    } else if (!hasSrcMode && hasFileMode) {
      if (files.length === 0) continue;
      cleaned.files = files;
      if (Array.isArray(cleaned.frameDwellMs)) {
        const dwell = cleaned.frameDwellMs
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v >= 16 && v <= 60_000);
        if (dwell.length === files.length) cleaned.frameDwellMs = dwell;
        else delete cleaned.frameDwellMs;
      }
    } else {
      if (srcs.length > 0) {
        cleaned.srcs = srcs;
      } else if (files.length > 0) {
        cleaned.files = files;
      } else {
        continue;
      }
    }
    cleanedStates[stateKey] = cleaned;
  }
  next.stateFrames = cleanedStates;
  return normalizePackStateFramesForFramesBase(next);
}

export {
  extractMascotPackValidationIssues,
  extractZodValidationIssues,
  toMascotPackIssueLines,
  toValidationIssueLines,
  toFriendlyVisitPackIssueMessage,
} from '../shared/mascot-pack/validationUi.js';
