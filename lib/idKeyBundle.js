'use strict';

/**
 * Lecture d'une clé d'identification complète (couplets, propositions et leurs issues).
 * Extrait de `routes/id-keys.js` (migration 366) : issues `groupe` (espèces candidates de
 * `id_key_lead_plants`), `clade` (table `clades`) et renvoi `next_key_id` vers une autre clé.
 * Les propositions sortent par le sérialiseur unique `serializeLead` ; la clé porte aussi ses
 * tutoriels « avant de commencer » (`id_key_tutorials`).
 */

const { queryAll, queryOne } = require('../database');
const { serializeLead } = require('./shared/idKeyLeadCore');
const { ID_KEY_TOOL_ENUM } = require('./shared/pedagoEnums');

/** `SET` MySQL (« loupe,jumelles ») → tableau dans l'ordre du référentiel. */
function parseToolSet(raw) {
  if (raw == null || raw === '') return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(',');
  const wanted = new Set(parts.map((p) => String(p).trim()).filter(Boolean));
  return ID_KEY_TOOL_ENUM.values.filter((v) => wanted.has(v));
}

function placeholders(list) {
  return list.map(() => '?').join(', ');
}

/**
 * @param {number} keyId
 * @param {{ includeUnpublished?: boolean, forManager?: boolean }} [opts]
 *   - includeUnpublished : renvoyer la clé même en brouillon ;
 *   - forManager : un renvoi vers une clé non publiée reste visible (sinon il est masqué).
 */
async function loadKeyBundle(keyId, { includeUnpublished = false, forManager = false } = {}) {
  const key = await queryOne('SELECT * FROM id_keys WHERE id = ?', [keyId]);
  if (!key) return null;
  if (!includeUnpublished && !key.is_published) return null;
  const couplets = await queryAll(
    `SELECT id, key_id, number FROM id_key_couplets WHERE key_id = ? ORDER BY number ASC`,
    [keyId],
  );
  const coupletIds = couplets.map((c) => Number(c.id));
  let leads = [];
  if (coupletIds.length > 0) {
    leads = await queryAll(
      `SELECT l.*, p.name AS plant_name, p.emoji AS plant_emoji
         FROM id_key_leads l
         LEFT JOIN plants p ON p.id = l.plant_id
        WHERE l.couplet_id IN (${placeholders(coupletIds)})
        ORDER BY l.couplet_id ASC, l.sort_order ASC, l.id ASC`,
      coupletIds,
    );
  }

  const leadIds = leads.map((l) => Number(l.id));
  const groupByLead = new Map();
  if (leadIds.length > 0) {
    const rows = await queryAll(
      `SELECT lp.lead_id, lp.sort_order, p.id, p.name, p.emoji, p.photo
         FROM id_key_lead_plants lp
         JOIN plants p ON p.id = lp.plant_id
        WHERE lp.lead_id IN (${placeholders(leadIds)})
        ORDER BY lp.lead_id ASC, lp.sort_order ASC, p.name ASC`,
      leadIds,
    );
    for (const r of rows) {
      const lid = Number(r.lead_id);
      if (!groupByLead.has(lid)) groupByLead.set(lid, []);
      groupByLead.get(lid).push({
        id: Number(r.id),
        name: r.name,
        emoji: r.emoji || null,
        photo: r.photo || null,
      });
    }
  }

  const cladeIds = [...new Set(leads.map((l) => l.clade_id).filter(Boolean))];
  const cladeById = new Map();
  if (cladeIds.length > 0) {
    const rows = await queryAll(
      `SELECT id, name, shared_attribute, description
         FROM clades WHERE id IN (${placeholders(cladeIds)})`,
      cladeIds,
    );
    for (const r of rows) {
      cladeById.set(String(r.id), {
        id: String(r.id),
        name: r.name,
        shared_attribute: r.shared_attribute || null,
        description: r.description || null,
      });
    }
  }

  const nextKeyIds = [...new Set(leads.map((l) => l.next_key_id).filter((v) => v != null))].map(
    Number,
  );
  const nextKeyById = new Map();
  if (nextKeyIds.length > 0) {
    const rows = await queryAll(
      `SELECT id, slug, title, is_published FROM id_keys WHERE id IN (${placeholders(nextKeyIds)})`,
      nextKeyIds,
    );
    for (const r of rows) {
      nextKeyById.set(Number(r.id), {
        id: Number(r.id),
        slug: r.slug,
        title: r.title,
        is_published: Boolean(r.is_published),
      });
    }
  }

  const leadsByCouplet = new Map();
  for (const lead of leads) {
    const cid = Number(lead.couplet_id);
    if (!leadsByCouplet.has(cid)) leadsByCouplet.set(cid, []);
    const nextKey = lead.next_key_id != null ? nextKeyById.get(Number(lead.next_key_id)) : null;
    leadsByCouplet.get(cid).push(
      serializeLead(lead, {
        groupPlants: groupByLead.get(Number(lead.id)) || [],
        clade: lead.clade_id ? cladeById.get(String(lead.clade_id)) || null : null,
        // Un renvoi vers une clé non publiée n'est visible que du gestionnaire.
        nextKey: nextKey && (forManager || nextKey.is_published) ? nextKey : null,
      }),
    );
  }

  // Tutoriels « avant de commencer » : seuls les tutoriels actifs sont montrés aux élèves.
  const tutorialRows = await queryAll(
    `SELECT t.id, t.title, t.type, t.summary, t.source_url, t.source_file_path, t.is_active,
            kt.sort_order
       FROM id_key_tutorials kt
       JOIN tutorials t ON t.id = kt.tutorial_id
      WHERE kt.key_id = ?${forManager ? '' : ' AND t.is_active = 1'}
      ORDER BY kt.sort_order ASC, t.title ASC`,
    [keyId],
  );
  const tutorials = tutorialRows.map((t) => ({
    id: Number(t.id),
    title: t.title,
    type: t.type,
    summary: t.summary || null,
    source_url: t.source_url || null,
    source_file_path: t.source_file_path || null,
    is_active: Boolean(t.is_active),
    sort_order: Number(t.sort_order) || 0,
  }));

  return {
    id: Number(key.id),
    slug: key.slug,
    title: key.title,
    description: key.description || null,
    map_id: key.map_id || null,
    scope_label: key.scope_label || null,
    niveau: key.niveau,
    tool_required: parseToolSet(key.tool_required),
    safety_note: key.safety_note || null,
    allows_multiple_paths: Boolean(key.allows_multiple_paths),
    tutorial_ids: tutorials.map((t) => t.id),
    tutorials,
    is_published: Boolean(key.is_published),
    created_by: key.created_by || null,
    created_at: key.created_at,
    updated_at: key.updated_at,
    couplets: couplets.map((c) => ({
      id: Number(c.id),
      key_id: Number(c.key_id),
      number: Number(c.number),
      leads: leadsByCouplet.get(Number(c.id)) || [],
    })),
  };
}

module.exports = { loadKeyBundle, parseToolSet };
