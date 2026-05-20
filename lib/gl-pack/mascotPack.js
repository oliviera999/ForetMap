'use strict';

const { z } = require('zod');

const assetSchema = z.object({
  key: z.string().min(1).max(160),
  src: z.string().min(1).max(2048),
});

const stateSchema = z.object({
  key: z.string().min(1).max(80),
  frames: z.array(z.number().int().nonnegative()).min(1),
  loop: z.boolean().optional(),
  fps: z.number().positive().max(120).optional(),
});

const glMascotPackSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  renderer: z.enum(['sprite_cut', 'spritesheet', 'rive', 'fallback']),
  assets: z.array(assetSchema).default([]),
  states: z.array(stateSchema).default([]),
});

function parseGlMascotPack(value) {
  return glMascotPackSchema.parse(value);
}

function validateGlMascotPack(value) {
  return glMascotPackSchema.safeParse(value);
}

module.exports = {
  glMascotPackSchema,
  parseGlMascotPack,
  validateGlMascotPack,
};
