import { z } from 'zod';

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

export const glMascotPackSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  type: z.enum(['gnome', 'unicorn']).optional(),
  renderer: z.enum(['sprite_cut', 'spritesheet', 'rive', 'fallback']),
  assets: z.array(assetSchema).default([]),
  states: z.array(stateSchema).default([]),
});

export function parseGlMascotPack(value) {
  return glMascotPackSchema.parse(value);
}

export function validateGlMascotPack(value) {
  const parsed = glMascotPackSchema.safeParse(value);
  return parsed;
}
