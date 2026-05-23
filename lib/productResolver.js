function normalizeHost(host) {
  const raw = String(host || '').trim().toLowerCase();
  if (!raw) return '';
  const withoutPort = raw.split(':')[0];
  // www.gl.olution.info doit résoudre comme gl.olution.info (bi-produit).
  return withoutPort.startsWith('www.') ? withoutPort.slice(4) : withoutPort;
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
