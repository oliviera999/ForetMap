/**
 * Format « mascot pack » v1 : validation (Zod) et expansion vers `spriteCut` du catalogue visite.
 * @see docs/MASCOT_PACK.md
 */
import { z } from 'zod';
import { VISIT_MASCOT_STATE } from './visitMascotState.js';

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

export const mascotPackSchemaV1 = z.object({
  mascotPackVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  label: z.string().min(1).max(120),
  renderer: z.literal('sprite_cut'),
  framesBase: z.string().min(8).max(200),
  frameWidth: z.number().int().positive().max(2048),
  frameHeight: z.number().int().positive().max(2048),
  pixelated: z.boolean().optional(),
  displayScale: z.number().positive().max(4).optional(),
  fallbackSilhouette: z.string().min(1).max(40),
  stateAliases: z.record(z.string(), z.string()).optional(),
  stateFrames: z.record(z.string(), stateFrameSchemaV1),
}).superRefine((data, ctx) => {
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
});

function normalizeFramesBase(base) {
  let b = String(base || '').trim();
  if (!b.endsWith('/')) b = `${b}/`;
  return b;
}

/**
 * @param {unknown} raw
 * @param {{ relaxAssetPrefix?: boolean }} [opts] — `relaxAssetPrefix`: autorise `blob:` / `data:` et tout préfixe `framesBase` (outil dev).
 */
export function parseMascotPackV1(raw, opts = {}) {
  const relax = Boolean(opts.relaxAssetPrefix);
  const parsed = mascotPackSchemaV1.safeParse(raw);
  if (!parsed.success) return parsed;
  const data = parsed.data;
  const base = normalizeFramesBase(data.framesBase);
  if (!relax) {
    if (!base.startsWith('/assets/mascots/')) {
      return {
        success: false,
        error: new z.ZodError([{
          code: z.ZodIssueCode.custom,
          path: ['framesBase'],
          message: 'framesBase doit commencer par /assets/mascots/ (ou utiliser relaxAssetPrefix en dev).',
        }]),
      };
    }
  }
  return { success: true, data: { ...data, framesBase: base } };
}

/**
 * @param {z.infer<typeof mascotPackSchemaV1> & { framesBase: string }} pack
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
 * @param {{ relaxAssetPrefix?: boolean }} [opts]
 * @returns {{ ok: true, pack: object, spriteCut: ReturnType<typeof expandMascotPackToSpriteCut> } | { ok: false, error: z.ZodError }}
 */
export function validateMascotPackV1(raw, opts = {}) {
  const parsed = parseMascotPackV1(raw, opts);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const spriteCut = expandMascotPackToSpriteCut(parsed.data);
  return { ok: true, pack: parsed.data, spriteCut };
}
