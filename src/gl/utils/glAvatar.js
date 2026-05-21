import { withAppBase } from '../../services/api.js';

function normalizePath(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.replace(/^\/+/, '');
}

function buildDicebear(seed) {
  const safeSeed = encodeURIComponent(String(seed || 'gl'));
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${safeSeed}&radius=50`;
}

export function getGlAvatarUrl(profile, auth = null) {
  const rel = normalizePath(profile?.avatar_path);
  if (rel) return withAppBase(`/uploads/${rel}`);
  const seed = profile?.pseudo || profile?.display_name || profile?.email || auth?.displayName || auth?.userId || 'gl';
  return buildDicebear(seed);
}
