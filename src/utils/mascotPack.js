/**
 * Format « mascot pack » v1 / v2 : validation (Zod) et expansion vers `spriteCut` du catalogue visite.
 * v2 ajoute `interactionProfile` (comportements visite par pack).
 * @see docs/MASCOT_PACK.md
 */
import { z } from 'zod';
import { VISIT_MASCOT_STATE } from './visitMascotState.js';
import {
  interactionProfileSchema,
  VISIT_MASCOT_INTERACTION_EVENT_KEYS,
} from './visitMascotInteractionEvents.js';
import { dialogProfileSchema } from './visitMascotDialogEvents.js';

const CANONICAL_STATE_KEYS = new Set(Object.values(VISIT_MASCOT_STATE));
const RESERVED_TRIGGER_KEYS = new Set(VISIT_MASCOT_INTERACTION_EVENT_KEYS);

/** Format commun des clés personnalisées (états & déclencheurs) : kebab/snake-case. */
const CUSTOM_KEY_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/** État d'animation personnalisé déclaré par le pack (clé + libellé prof). */
const customStateSchema = z.object({
  key: z.string().regex(CUSTOM_KEY_RE).max(40),
  label: z.string().min(1).max(60),
});

/**
 * Déclencheur personnalisé (comportement piloté par les données du pack) :
 * - `periodic` : joue `state` toutes les `everyMs` (comportement ambiant) ;
 * - `tap` : joue `state` au clic/tap sur la mascotte.
 */
const customTriggerSchema = z.object({
  key: z.string().regex(CUSTOM_KEY_RE).max(40),
  label: z.string().min(1).max(60),
  type: z.enum(['periodic', 'tap']),
  state: z.string().min(1).max(40),
  durationMs: z.number().int().min(200).max(60_000),
  everyMs: z.number().int().min(1000).max(600_000).optional(),
  dialog: z.array(z.string().max(160)).max(12).optional(),
});

const stateFrameSchemaV1 = z
  .object({
    files: z.array(z.string().min(1)).optional(),
    srcs: z.array(z.string().min(1)).optional(),
    fps: z.number().positive().max(120).optional(),
    frameDwellMs: z.array(z.number().min(16).max(60_000)).optional(),
  })
  .superRefine((data, ctx) => {
    const nSrc = Array.isArray(data.srcs) ? data.srcs.length : 0;
    const nFiles = Array.isArray(data.files) ? data.files.length : 0;
    if (nSrc === 0 && nFiles === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Chaque état doit avoir `srcs` ou `files` non vide.',
      });
      return;
    }
    if (nSrc > 0 && nFiles > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Utiliser soit `srcs` soit `files`, pas les deux sur un même état.',
      });
    }
    const len = nSrc > 0 ? nSrc : nFiles;
    if (
      Array.isArray(data.frameDwellMs) &&
      data.frameDwellMs.length > 0 &&
      data.frameDwellMs.length !== len
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `frameDwellMs (${data.frameDwellMs.length}) doit avoir la même longueur que les images (${len}).`,
      });
    }
  });

/** Corps commun (sans superRefine) : le merge Zod ne propage pas toujours les refinements du 2e opérande. */
const packBodyObjectSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(64),
  label: z.string().min(1).max(120),
  renderer: z.literal('sprite_cut'),
  framesBase: z.string().min(8).max(220),
  frameWidth: z.number().int().positive().max(2048),
  frameHeight: z.number().int().positive().max(2048),
  pixelated: z.boolean().optional(),
  displayScale: z.number().positive().max(4).optional(),
  fallbackSilhouette: z.string().min(1).max(40),
  /** Modèle catalogue d’origine (`visitMascotCatalog.js`) lors d’un clonage studio. */
  clonedFromCatalogId: z.string().max(64).optional(),
  stateAliases: z.record(z.string(), z.string()).optional(),
  stateFrames: z.record(z.string(), stateFrameSchemaV1),
  /** États d'animation personnalisés (au-delà de la palette canonique VISIT_MASCOT_STATE). */
  customStates: z.array(customStateSchema).max(24).optional(),
  /** Déclencheurs personnalisés (comportements ambiants / au tap) pilotés par le pack. */
  customTriggers: z.array(customTriggerSchema).max(16).optional(),
});

/** Ensemble des clés d'état acceptées par un pack : canoniques + `customStates`. */
function collectAllowedStateKeys(data) {
  const allowed = new Set(CANONICAL_STATE_KEYS);
  if (Array.isArray(data.customStates)) {
    for (const cs of data.customStates) {
      if (cs && typeof cs.key === 'string') allowed.add(cs.key);
    }
  }
  return allowed;
}

function refineMascotPackBody(data, ctx) {
  const allowedStates = collectAllowedStateKeys(data);

  // États personnalisés : pas de collision avec la palette canonique, clés uniques.
  if (Array.isArray(data.customStates)) {
    const seen = new Set();
    data.customStates.forEach((cs, idx) => {
      if (CANONICAL_STATE_KEYS.has(cs.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customStates', idx, 'key'],
          message: `« ${cs.key} » est déjà un état canonique : choisir une autre clé.`,
        });
      }
      if (seen.has(cs.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customStates', idx, 'key'],
          message: `État personnalisé en double : ${cs.key}.`,
        });
      }
      seen.add(cs.key);
    });
  }

  for (const key of Object.keys(data.stateFrames)) {
    if (!allowedStates.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stateFrames', key],
        message: `État inconnu « ${key} » (hors VISIT_MASCOT_STATE et customStates).`,
      });
    }
  }
  if (data.stateAliases) {
    for (const [alias, target] of Object.entries(data.stateAliases)) {
      if (!allowedStates.has(alias)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stateAliases', alias],
          message: `Alias inconnu: ${alias}`,
        });
      } else if (!data.stateFrames[target]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stateAliases', alias],
          message: `Cible absente pour ${alias} → ${target}`,
        });
      }
    }
  }

  // Règles d'interaction (v2) : l'état transitoire doit exister (canonique ou personnalisé).
  if (data.interactionProfile && typeof data.interactionProfile === 'object') {
    for (const [eventKey, rule] of Object.entries(data.interactionProfile)) {
      if (rule && rule.mode === 'transient' && !allowedStates.has(String(rule.state || ''))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['interactionProfile', eventKey, 'state'],
          message: `État « ${rule.state} » inconnu (hors VISIT_MASCOT_STATE et customStates).`,
        });
      }
    }
  }

  // Déclencheurs personnalisés : clés uniques, non réservées, état valide, everyMs si périodique.
  if (Array.isArray(data.customTriggers)) {
    const seen = new Set();
    data.customTriggers.forEach((trig, idx) => {
      if (RESERVED_TRIGGER_KEYS.has(trig.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customTriggers', idx, 'key'],
          message: `« ${trig.key} » est un déclencheur prédéfini : choisir une autre clé.`,
        });
      }
      if (seen.has(trig.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customTriggers', idx, 'key'],
          message: `Déclencheur personnalisé en double : ${trig.key}.`,
        });
      }
      seen.add(trig.key);
      if (!allowedStates.has(String(trig.state || ''))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customTriggers', idx, 'state'],
          message: `État « ${trig.state} » inconnu (hors VISIT_MASCOT_STATE et customStates).`,
        });
      }
      if (trig.type === 'periodic' && !(Number(trig.everyMs) >= 1000)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customTriggers', idx, 'everyMs'],
          message: 'Un déclencheur périodique nécessite `everyMs` (≥ 1000 ms).',
        });
      }
    });
  }
}

export const mascotPackSchemaV1 = z
  .object({
    mascotPackVersion: z.literal(1),
  })
  .merge(packBodyObjectSchema)
  .superRefine(refineMascotPackBody);

export const mascotPackSchemaV2 = z
  .object({
    mascotPackVersion: z.literal(2),
    interactionProfile: interactionProfileSchema.optional(),
    dialogProfile: dialogProfileSchema.optional(),
  })
  .merge(packBodyObjectSchema)
  .superRefine(refineMascotPackBody);

export const mascotPackSchemaUnion = z.discriminatedUnion('mascotPackVersion', [
  mascotPackSchemaV1,
  mascotPackSchemaV2,
]);

function normalizeFramesBase(base) {
  let b = String(base || '').trim();
  if (!b.endsWith('/')) b = `${b}/`;
  return b;
}

/**
 * Schéma de pack **unifié** (étape 5 convergence, aligné sur GL) : `states` peut être
 * fourni comme **tableau** `[{ key, label?, files?|srcs?, fps?, frameDwellMs? }]` au lieu
 * de l'objet `stateFrames` + `customStates`. Cette fonction **désucre** la forme tableau
 * vers la représentation interne (`stateFrames` + `customStates`) **avant** validation,
 * de sorte que tout l'aval (validation, expansion, runtime) reste inchangé.
 *
 * Non cassant : les packs en forme historique (`stateFrames`/`customStates`) passent tels
 * quels. Une entrée `states[]` à clé non canonique **déclare** l'état (→ `customStates`).
 *
 * @param {unknown} raw
 * @returns {unknown}
 */
export function normalizeUnifiedStates(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.states)) return raw;
  const stateFrames = {};
  const customStates = [];
  const seenCustom = new Set();
  for (const entry of raw.states) {
    if (!entry || typeof entry !== 'object') continue;
    const key = String(entry.key || '').trim();
    if (!key) continue;
    const spec = {};
    if (Array.isArray(entry.srcs)) spec.srcs = entry.srcs;
    if (Array.isArray(entry.files)) spec.files = entry.files;
    if (entry.fps != null) spec.fps = entry.fps;
    if (Array.isArray(entry.frameDwellMs)) spec.frameDwellMs = entry.frameDwellMs;
    stateFrames[key] = spec;
    if (!CANONICAL_STATE_KEYS.has(key) && !seenCustom.has(key)) {
      seenCustom.add(key);
      customStates.push({ key, label: String(entry.label || key).slice(0, 60) });
    }
  }
  const { states: _drop, ...rest } = raw;
  const out = {
    ...rest,
    // `states[]` prime sur un éventuel `stateFrames` historique en cas de collision de clés.
    stateFrames: {
      ...(rest.stateFrames && typeof rest.stateFrames === 'object' ? rest.stateFrames : {}),
      ...stateFrames,
    },
  };
  if (customStates.length) {
    const existing = Array.isArray(rest.customStates) ? rest.customStates : [];
    const existingKeys = new Set(existing.map((c) => c && c.key).filter(Boolean));
    out.customStates = [...existing, ...customStates.filter((c) => !existingKeys.has(c.key))];
  }
  return out;
}

/**
 * Forme inverse : produit le tableau `states[]` unifié depuis un pack validé
 * (`stateFrames` + `customStates`). Utile pour l'export portable et l'édition future.
 * @param {{ stateFrames?: object, customStates?: Array<{key:string,label?:string}> }} pack
 * @returns {Array<object>}
 */
export function mascotPackToUnifiedStates(pack) {
  const labelByKey = {};
  for (const cs of Array.isArray(pack?.customStates) ? pack.customStates : []) {
    if (cs && cs.key) labelByKey[cs.key] = cs.label || cs.key;
  }
  const states = [];
  for (const [key, spec] of Object.entries(pack?.stateFrames || {})) {
    const entry = { key };
    if (labelByKey[key]) entry.label = labelByKey[key];
    if (Array.isArray(spec?.srcs)) entry.srcs = spec.srcs;
    if (Array.isArray(spec?.files)) entry.files = spec.files;
    if (spec?.fps != null) entry.fps = spec.fps;
    if (Array.isArray(spec?.frameDwellMs)) entry.frameDwellMs = spec.frameDwellMs;
    states.push(entry);
  }
  return states;
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
    ? opts.allowedFramesBasePrefixes
        .map((p) => normalizeFramesBase(String(p || '')))
        .filter(Boolean)
    : [];
  let candidate = raw;
  if (candidate && typeof candidate === 'object' && candidate.mascotPackVersion == null) {
    candidate = { ...candidate, mascotPackVersion: 1 };
  }
  // Schéma unifié : désucre `states[]` (forme tableau) vers `stateFrames`/`customStates`.
  candidate = normalizeUnifiedStates(candidate);
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
        error: new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: ['framesBase'],
            message:
              'framesBase doit commencer par /assets/mascots/ ou par un préfixe serveur autorisé (ou relaxAssetPrefix en dev).',
          },
        ]),
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
  const fixed =
    raw && typeof raw === 'object' && raw.mascotPackVersion == null
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
    stateAliases:
      pack.stateAliases && Object.keys(pack.stateAliases).length ? pack.stateAliases : undefined,
    stateFrames,
    customStates:
      Array.isArray(pack.customStates) && pack.customStates.length ? pack.customStates : undefined,
    customTriggers:
      Array.isArray(pack.customTriggers) && pack.customTriggers.length
        ? pack.customTriggers
        : undefined,
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
