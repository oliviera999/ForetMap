'use strict';

/**
 * Lecture agrégée du domaine « cartes » pour `foretmap_maps inventory` (lot D3) : la vue
 * historique `v_zone_inventory` (espèces rattachées à chaque zone), en transaction READ ONLY.
 * Aucune donnée nominative. SQL écrit ici, paramétré.
 */

const { withReadOnly } = require('../readDb');

const TRUSTED = { astValidated: true };
const READ_OPTS = { appPool: true };

/**
 * Inventaire des espèces par zone (`v_zone_inventory`), regroupé par zone.
 * @param {{ map_id?: string, zone_id?: string, plant_id?: number }} args
 */
async function zoneInventory(args = {}) {
  const where = ['1 = 1'];
  const params = [];
  if (args.map_id) {
    where.push('v.map_id = ?');
    params.push(String(args.map_id));
  }
  if (args.zone_id) {
    where.push('v.zone_id = ?');
    params.push(String(args.zone_id));
  }
  if (args.plant_id) {
    where.push('v.plant_id = ?');
    params.push(Number(args.plant_id));
  }
  return withReadOnly(async (db) => {
    const rows = await db.raw(
      `SELECT v.zone_id, v.zone_name, v.map_id, v.plant_id, v.plant_name, v.emoji, v.trophic_role
         FROM v_zone_inventory v
        WHERE ${where.join(' AND ')}
        ORDER BY v.map_id, v.zone_name, v.plant_name
        LIMIT 5000`,
      params,
      TRUSTED,
    );
    const zones = new Map();
    for (const r of rows) {
      const key = String(r.zone_id);
      if (!zones.has(key)) {
        zones.set(key, {
          zone_id: r.zone_id,
          zone_name: r.zone_name,
          map_id: r.map_id,
          species: [],
        });
      }
      zones.get(key).species.push({
        plant_id: Number(r.plant_id),
        name: r.plant_name,
        emoji: r.emoji || null,
        trophic_role: r.trophic_role || null,
      });
    }
    const list = [...zones.values()];
    return {
      perimetre: {
        map_id: args.map_id || null,
        zone_id: args.zone_id || null,
        plant_id: args.plant_id || null,
      },
      zones: list.length,
      links: rows.length,
      items: list,
    };
  }, READ_OPTS);
}

module.exports = { zoneInventory };
