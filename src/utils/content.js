function readNestedValue(source, dottedPath) {
  const parts = String(dottedPath || '').split('.').filter(Boolean);
  if (parts.length === 0) return undefined;
  let ref = source;
  for (const part of parts) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return undefined;
    ref = ref[part];
  }
  return ref;
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function getContentText(publicSettings, key, fallback = '') {
  const raw = readNestedValue(publicSettings?.content, key);
  const next = normalizeText(raw);
  if (!next) return String(fallback || '');
  return next;
}

export { getContentText };
