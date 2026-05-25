export function normalizeAvatarPath(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.replace(/^\/+/, '');
}

export function buildDicebearAvatarUrl(seed, style = 'adventurer-neutral') {
  const safeSeed = encodeURIComponent(String(seed || 'foretmap'));
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${safeSeed}&radius=50`;
}

export function buildUploadedAvatarUrl(pathOrNull) {
  const rel = normalizeAvatarPath(pathOrNull);
  if (!rel) return null;
  return `/uploads/${rel}`;
}
