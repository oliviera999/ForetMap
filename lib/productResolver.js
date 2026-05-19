function normalizeHost(host) {
  const raw = String(host || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split(':')[0];
}

function normalizeProductOverride(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'gl') return 'gl';
  if (raw === 'foret') return 'foret';
  return null;
}

function resolveProductFromRequest(req) {
  const override = normalizeProductOverride(req?.get?.('x-foretmap-product'));
  if (override) return override;
  const host = normalizeHost(req?.hostname || req?.get?.('host') || '');
  if (host.startsWith('gl.')) return 'gl';
  return 'foret';
}

module.exports = {
  resolveProductFromRequest,
  normalizeHost,
};
