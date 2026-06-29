const { z } = require('zod');
const assetSchema = z.object({
  key: z.string().min(1).max(160),
  src: z.string().min(1).max(2048),
});

const stateSchema = z.object({
  key: z.string().min(1).max(80),
  /** Libellé optionnel affiché dans le studio (sinon la clé est utilisée). */
  label: z.string().max(60).optional(),
  frames: z.array(z.number().int().nonnegative()).min(1),
  loop: z.boolean().optional(),
  fps: z.number().positive().max(120).optional(),
});

const GL_TRIGGER_KEY_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/**
 * Déclencheur personnalisé GL (comportement piloté par les données du pack) :
 * - `periodic` : joue `state` toutes les `everyMs` ms ;
 * - `tap` : joue `state` au clic/tap sur la mascotte.
 */
const glTriggerSchema = z.object({
  key: z.string().regex(GL_TRIGGER_KEY_RE).max(40),
  label: z.string().min(1).max(60),
  type: z.enum(['periodic', 'tap']),
  state: z.string().min(1).max(80),
  durationMs: z.number().int().min(200).max(60_000),
  everyMs: z.number().int().min(1000).max(600_000).optional(),
});

const glMascotPackSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(160),
    type: z.enum(['gnome', 'unicorn']).optional(),
    renderer: z.enum(['sprite_cut', 'spritesheet', 'rive', 'fallback']),
    assets: z.array(assetSchema).default([]),
    states: z.array(stateSchema).default([]),
    /** Déclencheurs personnalisés (comportements ambiants / au tap). */
    triggers: z.array(glTriggerSchema).max(16).optional(),
  })
  .superRefine((data, ctx) => {
    if (!Array.isArray(data.triggers)) return;
    const stateKeys = new Set((data.states || []).map((s) => String(s.key || '').toLowerCase()));
    const seen = new Set();
    data.triggers.forEach((trig, idx) => {
      if (seen.has(trig.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['triggers', idx, 'key'],
          message: `Déclencheur en double : ${trig.key}.`,
        });
      }
      seen.add(trig.key);
      if (!stateKeys.has(String(trig.state || '').toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['triggers', idx, 'state'],
          message: `État « ${trig.state} » absent des états du pack.`,
        });
      }
      if (trig.type === 'periodic' && !(Number(trig.everyMs) >= 1000)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['triggers', idx, 'everyMs'],
          message: 'Un déclencheur périodique nécessite `everyMs` (≥ 1000 ms).',
        });
      }
    });
  });

function parseGlMascotPack(value) {
  return glMascotPackSchema.parse(value);
}

function validateGlMascotPack(value) {
  const parsed = glMascotPackSchema.safeParse(value);
  return parsed;
}

module.exports = {
  glMascotPackSchema,
  parseGlMascotPack,
  validateGlMascotPack,
};
