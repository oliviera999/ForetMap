/**
 * Format « mascot pack » v1 / v2 : validation (Zod) et expansion vers `spriteCut` du catalogue visite.
 * v2 ajoute `interactionProfile` (comportements visite par pack).
 * @see docs/MASCOT_PACK.md
 */
import { z } from 'zod';
import { VISIT_MASCOT_STATE } from './visitMascotState.js';
import { interactionProfileSchema } from './visitMascotInteractionEvents.js';

const CANONICAL_STATE_KEYS = new Set(Object.values(VISIT_MASCOT_STATE));

const stateFrameSchemaV1 = z.object({
  files: z.array(z.string().min(1)).optional(),
  srcs: z.array(z.string().min(1)).optional(),
  fps: z.number().positive().max(120).optional(),
  frameDwellMs: z.array(z.number().min(16).max(60_000)).optional(),
}).superRefine((data, ctx) => {
  const nSrc = Array.isArray(data.srcs) ? data.srcs.length : 0;
  const nFiles = Array.isArray(data.files) ? data.files.length : 0;
  if (nSrc === 0 && nFiles === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Chaque état doit avoir `srcs` ou `files` non vide.' });
    return;
  }
  if (nSrc > 0 && nFiles > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Utiliser soit `srcs` soit `files`, pas les deux sur un même état.' });
  }
  const len = nSrc > 0 ? nSrc : nFiles;
  if (Array.isArray(data.frameDwellMs) && data.frameDwellMs.length > 0 && data.frameDwellMs.length !== len) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `frameDwellMs (${data.frameDwellMs.length}) doit avoir la même longueur que les images (${len}).`,
    });
  }
});

/** Corps commun (sans superRefine) : le merge Zod ne propage pas toujours les refinements du 2e opérande. */
const packBodyObjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  label: z.string().min(1).max(120),
  renderer: z.literal('sprite_cut'),
  framesBase: z.string().min(8).max(220),
  frameWidth: z.number().int().positive().max(2048),
  frameHeight: z.number().int().positive().max(2048),
  pixelated: z.boolean().optional(),
  displayScale: z.number().positive().max(4).optional(),
  fallbackSilhouette: z.string().min(1).max(40),
  stateAliases: z.record(z.string(), z.string()).optional(),
  stateFrames: z.record(z.string(), stateFrameSchemaV1),
});

function refineMascotPackBody(data, ctx) {
  for (const key of Object.keys(data.stateFrames)) {
    if (!CANONICAL_STATE_KEYS.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stateFrames', key],
        message: `État inconnu « ${key} » (hors VISIT_MASCOT_STATE).`,
      });
    }
  }
  if (data.stateAliases) {
    for (const [alias, target] of Object.entries(data.stateAliases)) {
      if (!CANONICAL_STATE_KEYS.has(alias)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stateAliases', alias], message: `Alias inconnu: ${alias}` });
      } else if (!data.stateFrames[target]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stateAliases', alias], message: `Cible absente pour ${alias} → ${target}` });
      }
    }
  }
}

export const mascotPackSchemaV1 = z.object({
  mascotPackVersion: z.literal(1),
}).merge(packBodyObjectSchema).superRefine(refineMascotPackBody);

export const mascotPackSchemaV2 = z.object({
  mascotPackVersion: z.literal(2),
  interactionProfile: interactionProfileSchema.optional(),
}).merge(packBodyObjectSchema).superRefine(refineMascotPackBody);

export const mascotPackSchemaUnion = z.discriminatedUnion('mascotPackVersion', [
  mascotPackSchemaV1,
  mascotPackSchemaV2,
]);

function normalizeFramesBase(base) {
  let b = String(base || '').trim();
  if (!b.endsWith('/')) b = `${b}/`;
  return b;
}

/** Préfixe API autorisé pour la médiathèque sprites partagée par carte. */
export function visitMascotSpriteLibraryAssetsPrefix(mapId) {
  const mid = String(mapId || '').trim();
  if (!mid || mid.length > 64) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(mid)) return null;
  return `/api/visit/mascot-sprite-library/${mid}/assets/`;
}

/**
 * @param {unknown} raw
 * @param {{
 *   relaxAssetPrefix?: boolean,
 *   allowedFramesBasePrefixes?: string[],
 * }} [opts]
 */
export function parseMascotPack(raw, opts = {}) {
  const relax = Boolean(opts.relaxAssetPrefix);
  const prefixList = Array.isArray(opts.allowedFramesBasePrefixes)
    ? opts.allowedFramesBasePrefixes.map((p) => normalizeFramesBase(String(p || ''))).filter(Boolean)
    : [];
  let candidate = raw;
  if (candidate && typeof candidate === 'object' && candidate.mascotPackVersion == null) {
    candidate = { ...candidate, mascotPackVersion: 1 };
  }
  const parsed = mascotPackSchemaUnion.safeParse(candidate);
  if (!parsed.success) return parsed;
  const data = parsed.data;
  const base = normalizeFramesBase(data.framesBase);
  if (!relax) {
    const okStatic = base.startsWith('/assets/mascots/');
    const okPrefix = prefixList.some((p) => base.startsWith(p));
    if (!okStatic && !okPrefix) {
      return {
        success: false,
        error: new z.ZodError([{
          code: z.ZodIssueCode.custom,
          path: ['framesBase'],
          message: 'framesBase doit commencer par /assets/mascots/ ou par un préfixe serveur autorisé (ou relaxAssetPrefix en dev).',
        }]),
      };
    }
  }
  return { success: true, data: { ...data, framesBase: base } };
}

/**
 * @deprecated Utiliser parseMascotPack (v1 et v2).
 * @param {unknown} raw
 * @param {{ relaxAssetPrefix?: boolean, allowedFramesBasePrefixes?: string[] }} [opts]
 */
export function parseMascotPackV1(raw, opts = {}) {
  const fixed = raw && typeof raw === 'object' && raw.mascotPackVersion == null
    ? { ...raw, mascotPackVersion: 1 }
    : raw;
  if (fixed && typeof fixed === 'object' && Number(fixed.mascotPackVersion) === 2) {
    return parseMascotPack(fixed, opts);
  }
  return parseMascotPack(fixed, opts);
}

/**
 * @param {z.infer<typeof mascotPackSchemaV1> & { framesBase: string } | z.infer<typeof mascotPackSchemaV2> & { framesBase: string }} pack
 */
export function expandMascotPackToSpriteCut(pack) {
  const base = normalizeFramesBase(pack.framesBase);
  const stateFrames = {};
  for (const [state, spec] of Object.entries(pack.stateFrames)) {
    let srcs = [];
    if (Array.isArray(spec.srcs) && spec.srcs.length) {
      srcs = spec.srcs.map((u) => String(u || '').trim()).filter(Boolean);
    } else if (Array.isArray(spec.files) && spec.files.length) {
      srcs = spec.files.map((f) => `${base}${String(f || '').replace(/^\//, '')}`);
    }
    const fps = Math.max(1, Number(spec.fps) || 8);
    const entry = {
      srcs,
      fps,
      ...(Array.isArray(spec.frameDwellMs) && spec.frameDwellMs.length === srcs.length
        ? { frameDwellMs: spec.frameDwellMs.map((n) => Math.max(33, Math.round(Number(n) || 100))) }
        : {}),
    };
    stateFrames[state] = entry;
  }
  const scale = pack.displayScale != null ? Number(pack.displayScale) : 1;
  return {
    frameWidth: pack.frameWidth,
    frameHeight: pack.frameHeight,
    pixelated: pack.pixelated !== false,
    displayScale: Number.isFinite(scale) && scale > 0 ? Math.min(4, Math.max(0.25, scale)) : 1,
    stateAliases: pack.stateAliases && Object.keys(pack.stateAliases).length ? pack.stateAliases : undefined,
    stateFrames,
  };
}

/**
 * @param {unknown} raw
 * @param {{ relaxAssetPrefix?: boolean, allowedFramesBasePrefixes?: string[] }} [opts]
 * @returns {{ ok: true, pack: object, spriteCut: ReturnType<typeof expandMascotPackToSpriteCut> } | { ok: false, error: z.ZodError }}
 */
export function validateMascotPack(raw, opts = {}) {
  const parsed = parseMascotPack(raw, opts);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const spriteCut = expandMascotPackToSpriteCut(parsed.data);
  return { ok: true, pack: parsed.data, spriteCut };
}

/**
 * Alias : accepte les packs v1 et v2.
 * @param {unknown} raw
 * @param {{ relaxAssetPrefix?: boolean, allowedFramesBasePrefixes?: string[] }} [opts]
 */
export function validateMascotPackV1(raw, opts = {}) {
  return validateMascotPack(raw, opts);
}
