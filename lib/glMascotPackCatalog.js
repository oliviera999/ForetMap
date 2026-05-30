'use strict';

const { queryAll } = require('../database');
const { validateGlMascotPack } = require('./gl-pack/mascotPack');

/**
 * Entrées catalogue GL à partir des packs persistés (`gl_mascot_packs`).
 * @returns {Promise<Array<object>>}
 */
async function loadGlMascotPackCatalogEntries() {
  let rows = [];
  try {
    rows = await queryAll(
      `SELECT id, name, payload_json
         FROM gl_mascot_packs
        ORDER BY updated_at DESC, id DESC`
    );
  } catch (_) {
    return [];
  }

  const out = [];
  for (const row of rows || []) {
    let payload = {};
    try {
      payload = row.payload_json ? JSON.parse(row.payload_json) : {};
    } catch (_) {
      continue;
    }
    const parsed = validateGlMascotPack(payload);
    if (!parsed.success) continue;
    const data = parsed.data;
    const id = String(data.id || '').trim();
    if (!id) continue;
    out.push({
      id,
      label: String(row.name || data.name || id).trim(),
      source: 'gl',
      type: data.type === 'unicorn' ? 'unicorn' : 'gnome',
      renderer: data.renderer || 'fallback',
      description: `Pack mascotte GL (#${Number(row.id)})`,
    });
  }
  return out;
}

module.exports = {
  loadGlMascotPackCatalogEntries,
};
