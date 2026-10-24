export function normalizeAvatarPath(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.replace(/^\/+/, '');
}

export function buildUploadedAvatarUrl(pathOrNull) {
  const rel = normalizeAvatarPath(pathOrNull);
  if (!rel) return null;
  return `/uploads/${rel}`;
}
