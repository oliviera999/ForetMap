'use strict';

/**
 * Outils MCP de **lecture du contenu pédagogique** (ForetMap + Gnomes & Licornes).
 *
 * Tout passe par `withReadOnly` (transaction READ ONLY, délai max, LIMIT forcé, liste blanche
 * de tables). Les colonnes nominatives (`created_by`, `*_user_id`, e-mails…) ne sont jamais
 * sélectionnées ; `scrubValue` les retirerait de toute façon en sortie.
 */

const { z } = require('zod');
const { withReadOnly } = require('../readDb');
const { McpToolError } = require('../registry');
const {
  READ_ONLY,
  READ_REQUIRES,
  compact,
  excerpt,
  likePattern,
  page,
  paged,
  paginationShape,
} = require('./common');

const SEARCH_TYPES = [
  'species',
  'gl_species',
  'glossary',
  'gl_glossary',
  'lore_glossary',
  'tutorial',
  'qcm',
  'gl_qcm',
  'gl_qcm_lore',
  'zone',
  'marker',
];

/* ------------------------------------------------------------------ search */

async function searchContent(args) {
  const q = String(args.q || '').trim();
  if (q.length < 2) throw new McpToolError('Requête trop courte (2 caractères minimum)');
  const like = likePattern(q);
  const wanted = new Set(args.types?.length ? args.types : SEARCH_TYPES);
  const per = Math.min(50, args.limit ?? 10);
  return withReadOnly(async (db) => {
    const results = [];
    const push = (type, rows, map) => rows.forEach((r) => results.push({ type, ...map(r) }));
    if (wanted.has('species')) {
      const rows = await db.select(
        `SELECT p.id, p.name, p.scientific_name, p.description
           FROM plants p
          WHERE p.name LIKE ? OR p.scientific_name LIKE ? OR p.second_name LIKE ?
             OR p.id IN (SELECT a.plant_id FROM plant_name_aliases a WHERE a.alias LIKE ?)
          ORDER BY p.name`,
        [like, like, like, like],
        { limit: per },
      );
      push('species', rows, (r) => ({
        id: r.id,
        title: r.name,
        subtitle: r.scientific_name,
        excerpt: excerpt(r.description, q),
      }));
    }
    if (wanted.has('gl_species')) {
      const rows = await db.select(
        `SELECT id, species_code, nom_commun, nom_scientifique, description_courte
           FROM gl_species
          WHERE nom_commun LIKE ? OR nom_scientifique LIKE ? OR mots_cles LIKE ?
          ORDER BY nom_commun`,
        [like, like, like],
        { limit: per },
      );
      push('gl_species', rows, (r) => ({
        id: r.species_code,
        title: r.nom_commun,
        subtitle: r.nom_scientifique,
        excerpt: excerpt(r.description_courte, q),
      }));
    }
    const glossaries = [
      ['glossary', 'glossary_terms', 'glossary_code'],
      ['gl_glossary', 'gl_glossary_terms', 'glossary_code'],
      ['lore_glossary', 'gl_lore_glossary_terms', 'lore_code'],
    ];
    for (const [type, table, codeCol] of glossaries) {
      if (!wanted.has(type)) continue;
      const rows = await db.select(
        `SELECT ${codeCol} AS code, terme, definition_courte FROM ${table}
          WHERE terme LIKE ? OR variantes LIKE ? OR definition_courte LIKE ?
          ORDER BY terme`,
        [like, like, like],
        { limit: per },
      );
      push(type, rows, (r) => ({
        id: r.code,
        title: r.terme,
        excerpt: excerpt(r.definition_courte, q),
      }));
    }
    if (wanted.has('tutorial')) {
      const rows = await db.select(
        `SELECT id, title, summary FROM tutorials
          WHERE is_active = 1 AND (title LIKE ? OR summary LIKE ? OR html_content LIKE ?)
          ORDER BY title`,
        [like, like, like],
        { limit: per },
      );
      push('tutorial', rows, (r) => ({ id: r.id, title: r.title, excerpt: excerpt(r.summary, q) }));
    }
    const qcms = [
      ['qcm', 'quiz_questions'],
      ['gl_qcm', 'gl_qcm_questions'],
      ['gl_qcm_lore', 'gl_qcm_lore_questions'],
    ];
    for (const [type, table] of qcms) {
      if (!wanted.has(type)) continue;
      const rows = await db.select(
        `SELECT question_code, question, niveau, difficulte FROM ${table}
          WHERE question LIKE ? OR tags LIKE ? ORDER BY question_code`,
        [like, like],
        { limit: per },
      );
      push(type, rows, (r) => ({
        id: r.question_code,
        title: excerpt(r.question, q, 120),
        niveau: r.niveau,
        difficulte: r.difficulte,
      }));
    }
    if (wanted.has('zone')) {
      const rows = await db.select(
        `SELECT id, map_id, name, description FROM zones
          WHERE name LIKE ? OR description LIKE ? OR search_aliases LIKE ? ORDER BY name`,
        [like, like, like],
        { limit: per },
      );
      push('zone', rows, (r) => ({
        id: r.id,
        title: r.name,
        map_id: r.map_id,
        excerpt: excerpt(r.description, q),
      }));
    }
    if (wanted.has('marker')) {
      const rows = await db.select(
        `SELECT id, map_id, label, note FROM map_markers
          WHERE label LIKE ? OR note LIKE ? OR search_aliases LIKE ? ORDER BY label`,
        [like, like, like],
        { limit: per },
      );
      push('marker', rows, (r) => ({
        id: r.id,
        title: r.label,
        map_id: r.map_id,
        excerpt: excerpt(r.note, q),
      }));
    }
    return { q, count: results.length, results: results.map(compact) };
  });
}

/* ----------------------------------------------------------------- espèces */

async function getForetmapSpecies(db, id) {
  const p = await db.one(
    `SELECT id, name, emoji, second_name, scientific_name, accepted_scientific_name, taxon_rank,
            taxon_kingdom, taxon_phylum, taxon_class, taxon_order, taxon_family, taxon_genus,
            taxon_group, gbif_key, clade_id, habitat_type, trophic_role, life_cycle, origin_status,
            iucn_status, is_edible, toxicity_level, hazard_exposure, hazard_notes, hazard_reviewed,
            health_risk, health_notes, description, habitat, ecosystem_role, human_utility,
            identification_criteria, lookalike_species, remarks, sources, photo_credit,
            photo_licence
       FROM plants WHERE id = ?`,
    [id],
  );
  if (!p) throw new McpToolError(`Espèce ForetMap ${id} introuvable`, 'MCP_NOT_FOUND');
  const [aliases, photos, lookalikes, interactions, zones, markers, maps, keys, qcm, glossary] =
    await Promise.all([
      db.select(
        'SELECT alias, kind FROM plant_name_aliases WHERE plant_id = ? ORDER BY sort_order',
        [id],
      ),
      db.select(
        `SELECT id, kind, url, credit, licence, source, source_url, confirmed
           FROM plant_photos WHERE plant_id = ? ORDER BY kind, sort_order`,
        [id],
      ),
      db.select(
        `SELECT l.lookalike_plant_id AS id, p.name, l.note
           FROM plant_lookalikes l JOIN plants p ON p.id = l.lookalike_plant_id
          WHERE l.plant_id = ?`,
        [id],
      ),
      db.select(
        `SELECT id, interaction_type, from_id, from_name, to_id, to_name, evidence_level,
                source_ref, description
           FROM v_food_web WHERE from_id = ? OR to_id = ? ORDER BY interaction_type`,
        [id, id],
      ),
      db.select(
        `SELECT z.id, z.name, z.map_id FROM zone_species zs JOIN zones z ON z.id = zs.zone_id
          WHERE zs.plant_id = ? ORDER BY z.name`,
        [id],
      ),
      db.select(
        `SELECT m.id, m.label, m.map_id FROM marker_species ms JOIN map_markers m ON m.id = ms.marker_id
          WHERE ms.plant_id = ? ORDER BY m.label`,
        [id],
      ),
      db.select(
        `SELECT map_id, presence_status, validation_status, frequency FROM map_species
          WHERE plant_id = ? ORDER BY map_id`,
        [id],
      ),
      db.select(
        `SELECT DISTINCT k.id, k.slug, k.title
           FROM id_key_leads l JOIN id_key_couplets c ON c.id = l.couplet_id
           JOIN id_keys k ON k.id = c.key_id
          WHERE l.plant_id = ? ORDER BY k.title`,
        [id],
      ),
      db.select(
        `SELECT question_code FROM quiz_question_species WHERE plant_id = ?
         UNION
         SELECT question_code FROM resource_question_links
          WHERE resource_type = 'plant' AND resource_ref = ? AND status = 'approved'`,
        [id, String(id)],
        { limit: 100 },
      ),
      db.select(
        `SELECT g.glossary_code, g.terme FROM glossary_term_species gs
           JOIN glossary_terms g ON g.glossary_code = gs.glossary_code
          WHERE gs.plant_id = ? ORDER BY g.terme`,
        [id],
      ),
    ]);
  return {
    dataset: 'foretmap',
    species: compact(p),
    aliases,
    photos: photos.map(compact),
    lookalikes,
    interactions,
    presence: { zones, markers, maps },
    id_keys: keys,
    qcm_codes: qcm.map((r) => r.question_code),
    glossary_terms: glossary,
  };
}

async function getGlSpecies(db, code) {
  const s = await db.one(
    `SELECT id, species_code, biome_slug, type, nom_commun, nom_scientifique, taxon_rank,
            taxon_source, taxon_source_url, groupe, famille, statut_iucn, endemique,
            role_ecologique, adaptations_cles, regime_alimentaire, reproduction,
            description_courte, anecdote, mots_cles, wikipedia_url, photo_url, photo_credit,
            photo_licence, photo_licence_url, statut
       FROM gl_species WHERE species_code = ?`,
    [code],
  );
  if (!s) throw new McpToolError(`Espèce G&L ${code} introuvable`, 'MCP_NOT_FOUND');
  const [interactions, qcm] = await Promise.all([
    db.select(
      `SELECT i.id, i.interaction_type, f.species_code AS from_code, f.nom_commun AS from_name,
              t.species_code AS to_code, t.nom_commun AS to_name, i.description
         FROM gl_species_interactions i
         JOIN gl_species f ON f.id = i.from_species_id
         LEFT JOIN gl_species t ON t.id = i.to_species_id
        WHERE i.from_species_id = ? OR i.to_species_id = ?`,
      [s.id, s.id],
    ),
    db.select(
      `SELECT question_code FROM gl_resource_question_links
        WHERE resource_type = 'species' AND resource_ref = ? AND status = 'approved'`,
      [code],
      { limit: 100 },
    ),
  ]);
  return {
    dataset: 'gl',
    species: compact(s),
    interactions,
    qcm_codes: qcm.map((r) => r.question_code),
  };
}

/* ------------------------------------------------------------------- cartes */

async function listMaps() {
  return withReadOnly(async (db) => {
    const maps = await db.select(
      `SELECT m.id, m.label, m.is_active, m.pedago_level,
              (SELECT COUNT(*) FROM zones z WHERE z.map_id = m.id) AS zones,
              (SELECT COUNT(*) FROM map_markers k WHERE k.map_id = m.id) AS markers,
              (SELECT COUNT(*) FROM map_species s WHERE s.map_id = m.id) AS registry_species
         FROM maps m ORDER BY m.sort_order, m.label`,
      [],
      { limit: 200 },
    );
    return { items: maps };
  });
}

async function getMap(args) {
  return withReadOnly(async (db) => {
    const map = await db.one(
      'SELECT id, label, is_active, pedago_level, gps_enabled FROM maps WHERE id = ?',
      [args.map_id],
    );
    if (!map) throw new McpToolError(`Carte ${args.map_id} introuvable`, 'MCP_NOT_FOUND');
    const pg = page(args, 200);
    const [zones, markers, zoneSpecies, markerSpecies, registry, routes] = await Promise.all([
      db.select(
        `SELECT id, name, emoji, description, special, hidden_surfaces FROM zones
          WHERE map_id = ? ORDER BY name`,
        [map.id],
        pg,
      ),
      db.select(
        `SELECT id, label, emoji, plant_name, note, hidden_surfaces FROM map_markers
          WHERE map_id = ? ORDER BY label`,
        [map.id],
        pg,
      ),
      db.select(
        `SELECT zs.zone_id, zs.plant_id, p.name FROM zone_species zs
           JOIN zones z ON z.id = zs.zone_id JOIN plants p ON p.id = zs.plant_id
          WHERE z.map_id = ?`,
        [map.id],
        { limit: 500 },
      ),
      db.select(
        `SELECT ms.marker_id, ms.plant_id, p.name FROM marker_species ms
           JOIN map_markers m ON m.id = ms.marker_id JOIN plants p ON p.id = ms.plant_id
          WHERE m.map_id = ?`,
        [map.id],
        { limit: 500 },
      ),
      db.select(
        `SELECT s.plant_id, p.name, s.presence_status, s.validation_status, s.frequency
           FROM map_species s JOIN plants p ON p.id = s.plant_id WHERE s.map_id = ? ORDER BY p.name`,
        [map.id],
        { limit: 500 },
      ),
      db.select(
        'SELECT id, slug, title, is_published FROM map_routes WHERE map_id = ? ORDER BY sort_order',
        [map.id],
      ),
    ]);
    const byZone = new Map();
    for (const r of zoneSpecies) {
      if (!byZone.has(r.zone_id)) byZone.set(r.zone_id, []);
      byZone.get(r.zone_id).push({ id: r.plant_id, name: r.name });
    }
    const byMarker = new Map();
    for (const r of markerSpecies) {
      if (!byMarker.has(r.marker_id)) byMarker.set(r.marker_id, []);
      byMarker.get(r.marker_id).push({ id: r.plant_id, name: r.name });
    }
    return {
      map: compact(map),
      zones: zones.map((z) => compact({ ...z, species: byZone.get(z.id) || [] })),
      markers: markers.map((m) => compact({ ...m, species: byMarker.get(m.id) || [] })),
      registry_species: registry.map(compact),
      routes,
    };
  });
}

/* ----------------------------------------------------------- clés et réseau */

async function getIdKey(args) {
  return withReadOnly(async (db) => {
    const key = await db.one(
      `SELECT id, slug, title, description, map_id, scope_label, niveau, is_published
         FROM id_keys WHERE ${args.slug ? 'slug = ?' : 'id = ?'}`,
      [args.slug ?? args.id],
    );
    if (!key) throw new McpToolError('Clé de détermination introuvable', 'MCP_NOT_FOUND');
    const couplets = await db.select(
      'SELECT id, number FROM id_key_couplets WHERE key_id = ? ORDER BY number',
      [key.id],
      { limit: 500 },
    );
    const leads = await db.select(
      `SELECT l.id, l.couplet_id, l.sort_order, l.statement, l.next_couplet_id, l.plant_id,
              p.name AS plant_name
         FROM id_key_leads l JOIN id_key_couplets c ON c.id = l.couplet_id
         LEFT JOIN plants p ON p.id = l.plant_id
        WHERE c.key_id = ? ORDER BY c.number, l.sort_order`,
      [key.id],
      { limit: 500 },
    );
    const byCouplet = new Map(couplets.map((c) => [c.id, { ...c, leads: [] }]));
    for (const l of leads) byCouplet.get(l.couplet_id)?.leads.push(compact(l));
    return { key: compact(key), couplets: [...byCouplet.values()] };
  });
}

async function getFoodWeb(args) {
  return withReadOnly(async (db) => {
    const pg = page(args, 200);
    if (args.dataset === 'gl') {
      const params = [];
      let where = '1=1';
      if (args.species) {
        where = '(f.species_code = ? OR t.species_code = ?)';
        params.push(args.species, args.species);
      }
      const rows = await db.select(
        `SELECT i.id, i.interaction_type, f.species_code AS from_code, f.nom_commun AS from_name,
                t.species_code AS to_code, t.nom_commun AS to_name, i.description
           FROM gl_species_interactions i
           JOIN gl_species f ON f.id = i.from_species_id
           LEFT JOIN gl_species t ON t.id = i.to_species_id
          WHERE ${where} ORDER BY i.interaction_type, f.nom_commun`,
        params,
        pg,
      );
      return { dataset: 'gl', ...paged(rows, pg) };
    }
    let sql = `SELECT id, interaction_type, from_id, from_name, from_role, to_id, to_name, to_role,
                      evidence_level, source_ref, description FROM v_food_web`;
    const params = [];
    if (args.species_id) {
      sql += ' WHERE from_id = ? OR to_id = ?';
      params.push(args.species_id, args.species_id);
    } else if (args.map_id) {
      const presence = `(SELECT ms.plant_id FROM map_species ms WHERE ms.map_id = ?
        UNION SELECT zs.plant_id FROM zone_species zs JOIN zones z ON z.id = zs.zone_id WHERE z.map_id = ?
        UNION SELECT mk.plant_id FROM marker_species mk JOIN map_markers m ON m.id = mk.marker_id WHERE m.map_id = ?)`;
      sql += ` WHERE from_id IN ${presence} OR to_id IN ${presence}`;
      params.push(args.map_id, args.map_id, args.map_id, args.map_id, args.map_id, args.map_id);
    }
    sql += ' ORDER BY interaction_type, from_name';
    const rows = await db.select(sql, params, pg);
    return { dataset: 'foretmap', ...paged(rows.map(compact), pg) };
  });
}

/* -------------------------------------------------------------------- QCM */

const QCM_TABLES = Object.freeze({
  foretmap: { table: 'quiz_questions', extra: 'categorie_slug, NULL AS biome_slug' },
  gl: { table: 'gl_qcm_questions', extra: 'categorie_slug, biome_slug' },
  lore: { table: 'gl_qcm_lore_questions', extra: 'categorie_slug, chapitre_slug AS biome_slug' },
});

async function listQcm(args) {
  const def =
    QCM_TABLES[
      Object.hasOwn(QCM_TABLES, args.dataset || 'foretmap')
        ? args.dataset || 'foretmap'
        : 'foretmap'
    ];
  return withReadOnly(async (db) => {
    const pg = page(args, 50);
    const where = [];
    const params = [];
    if (args.niveau) {
      where.push('niveau = ?');
      params.push(args.niveau);
    }
    if (args.difficulte) {
      where.push('difficulte = ?');
      params.push(args.difficulte);
    }
    if (args.categorie) {
      where.push('categorie_slug = ?');
      params.push(args.categorie);
    }
    if (args.biome_or_chapter && args.dataset !== 'foretmap') {
      where.push(args.dataset === 'lore' ? 'chapitre_slug = ?' : 'biome_slug = ?');
      params.push(args.biome_or_chapter);
    }
    if (args.species_id && args.dataset === 'foretmap') {
      where.push(
        'question_code IN (SELECT question_code FROM quiz_question_species WHERE plant_id = ?)',
      );
      params.push(args.species_id);
    }
    const rows = await db.select(
      `SELECT question_code, ${def.extra}, niveau, difficulte, statut, LEFT(question, 160) AS question
         FROM ${def.table} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY question_code`,
      params,
      pg,
    );
    return { dataset: args.dataset || 'foretmap', ...paged(rows.map(compact), pg) };
  });
}

async function getQcm(args) {
  const def =
    QCM_TABLES[
      Object.hasOwn(QCM_TABLES, args.dataset || 'foretmap')
        ? args.dataset || 'foretmap'
        : 'foretmap'
    ];
  return withReadOnly(async (db) => {
    const q = await db.one(`SELECT * FROM ${def.table} WHERE question_code = ?`, [args.code]);
    if (!q) throw new McpToolError(`Question ${args.code} introuvable`, 'MCP_NOT_FOUND');
    let links = [];
    if (args.dataset === 'gl' || args.dataset === 'lore') {
      links = await db.select(
        `SELECT resource_type, resource_ref, status, origin, is_gating FROM gl_resource_question_links
          WHERE question_code = ? AND question_dataset = ?`,
        [args.code, args.dataset === 'lore' ? 'qcm_lore' : 'qcm'],
      );
    } else {
      links = await db.select(
        `SELECT resource_type, resource_ref, status, origin, is_gating FROM resource_question_links
          WHERE question_code = ?`,
        [args.code],
      );
    }
    return {
      dataset: args.dataset || 'foretmap',
      question: compact(q),
      resource_links: links,
      note: 'Convention : le slot de feedback de la bonne réponse reste vide (feedback_correct le remplace).',
    };
  });
}

/* --------------------------------------------------------------- glossaire */

async function getGlossaryTerm(args) {
  return withReadOnly(async (db) => {
    const out = { query: args.term || args.code, matches: [] };
    const sources = [
      ['foretmap', 'glossary_terms', 'glossary_code'],
      ['gl', 'gl_glossary_terms', 'glossary_code'],
      ['lore', 'gl_lore_glossary_terms', 'lore_code'],
    ];
    for (const [dataset, table, codeCol] of sources) {
      if (args.dataset && args.dataset !== dataset) continue;
      const rows = args.code
        ? await db.select(`SELECT * FROM ${table} WHERE ${codeCol} = ?`, [args.code], { limit: 1 })
        : await db.select(
            `SELECT * FROM ${table} WHERE terme = ? OR variantes LIKE ? ORDER BY terme`,
            [args.term, likePattern(args.term)],
            { limit: 5 },
          );
      for (const r of rows) out.matches.push({ dataset, ...compact(r) });
    }
    if (out.matches.length === 0) throw new McpToolError('Terme introuvable', 'MCP_NOT_FOUND');
    return out;
  });
}

/* ----------------------------------------------------------------- G&L */

async function getGlBoard(args) {
  return withReadOnly(async (db) => {
    const chapters = await db.select(
      `SELECT id, slug, title, biome, plateau_number, order_index, gating_granularity,
              map_markers_visible, map_zones_visible
         FROM gl_chapters ${args.chapter ? 'WHERE slug = ? OR id = ?' : ''} ORDER BY order_index`,
      args.chapter ? [args.chapter, Number(args.chapter) || 0] : [],
      { limit: 20 },
    );
    const out = [];
    for (const ch of chapters) {
      const [markers, zones, biomes] = await Promise.all([
        db.select(
          `SELECT id, order_index, label, event_type, x_pct, y_pct, sous_biome_slug,
                  qcm_categorie_slug, qcm_question_code, event_config_json
             FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index, id`,
          [ch.id],
          { limit: 500 },
        ),
        db.select(
          'SELECT id, label, color, points_json FROM gl_kingdom_zones WHERE chapter_id = ? ORDER BY id',
          [ch.id],
          { limit: 200 },
        ),
        db.select(
          'SELECT biome_slug FROM gl_chapter_biomes WHERE chapter_id = ? ORDER BY order_index',
          [ch.id],
        ),
      ]);
      out.push({
        ...compact(ch),
        biomes: biomes.map((b) => b.biome_slug),
        cases: markers.map((m) => {
          let level = null;
          try {
            const cfg = m.event_config_json ? JSON.parse(m.event_config_json) : null;
            const pool = cfg?.question?.pool || null;
            if (pool)
              level = {
                niveaux: pool.niveaux || [],
                difficulte: [pool.difficulteMin ?? null, pool.difficulteMax ?? null],
              };
          } catch (_) {
            level = null;
          }
          const { event_config_json: _cfg, ...rest } = m;
          return compact({ ...rest, question_pool: level });
        }),
        frontier_zones: zones.map((z) => ({
          id: z.id,
          label: z.label,
          color: z.color,
          points: (() => {
            try {
              return JSON.parse(z.points_json);
            } catch {
              return null;
            }
          })(),
        })),
      });
    }
    return { chapters: out };
  });
}

async function getGlLore(args) {
  return withReadOnly(async (db) => {
    const pg = page(args, 50);
    if (args.code) {
      const f = await db.one(
        `SELECT feuillet_code, type, liasse, titre, incipit, biome_slug, plateau_number, zone_label,
                ordre_recit, mode_apparition, idee_cle, ancrage_scientifique, texte_accessible,
                texte, statut FROM gl_lore_feuillets WHERE feuillet_code = ?`,
        [args.code],
      );
      if (!f) throw new McpToolError('Feuillet introuvable', 'MCP_NOT_FOUND');
      return { feuillet: compact(f) };
    }
    const where = [];
    const params = [];
    if (args.statut) {
      where.push('statut = ?');
      params.push(args.statut);
    }
    if (args.plateau) {
      where.push('plateau_number = ?');
      params.push(args.plateau);
    }
    const rows = await db.select(
      `SELECT feuillet_code, type, titre, plateau_number, biome_slug, ordre_recit, statut,
              LEFT(incipit, 140) AS incipit
         FROM gl_lore_feuillets ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY plateau_number, ordre_recit, feuillet_code`,
      params,
      pg,
    );
    return paged(rows.map(compact), pg);
  });
}

/* ------------------------------------------------------------- définitions */

function buildContentTools() {
  return [
    {
      name: 'foretmap_search',
      title: 'Recherche plein texte',
      description:
        'Recherche dans tout le contenu pédagogique : espèces ForetMap (noms, noms scientifiques, alias) et G&L, glossaires ForetMap / G&L / lore, tutoriels, QCM (ForetMap, G&L, lore), zones et repères des cartes. Renvoie type + id + titre + court extrait. Utiliser ensuite l’outil « get » adapté au type.',
      inputSchema: z.strictObject({
        q: z.string().min(2).max(120).describe('Texte recherché (2 à 120 caractères)'),
        types: z
          .array(z.enum(SEARCH_TYPES))
          .max(SEARCH_TYPES.length)
          .optional()
          .describe('Types à interroger (défaut : tous)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Résultats max par type (défaut 10)'),
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: searchContent,
    },
    {
      name: 'foretmap_get_species',
      title: 'Fiche espèce complète',
      description:
        'Fiche complète d’une espèce : taxonomie, alias, photos avec crédit et licence, dangers et risques sanitaires, interactions trophiques (avec niveau de preuve et source), présence (zones, repères, registre des cartes), clés de détermination où elle apparaît, QCM et termes de glossaire liés. `dataset` = foretmap (id numérique) ou gl (species_code, ex. SP0015).',
      inputSchema: z.strictObject({
        dataset: z.enum(['foretmap', 'gl']).optional().describe('Jeu de données (défaut foretmap)'),
        id: z.number().int().positive().optional().describe('Identifiant ForetMap (plants.id)'),
        code: z.string().max(16).optional().describe('Code espèce G&L (gl_species.species_code)'),
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: (args) =>
        withReadOnly((db) => {
          if (args.dataset === 'gl') {
            if (!args.code) throw new McpToolError('`code` requis pour une espèce G&L');
            return getGlSpecies(db, args.code);
          }
          if (!args.id) throw new McpToolError('`id` requis pour une espèce ForetMap');
          return getForetmapSpecies(db, args.id);
        }),
    },
    {
      name: 'foretmap_list_maps',
      title: 'Liste des cartes',
      description:
        'Cartes ForetMap avec leur niveau pédagogique et les volumes de zones, repères et espèces du registre.',
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: listMaps,
    },
    {
      name: 'foretmap_get_map',
      title: 'Détail d’une carte',
      description:
        'Une carte : zones et repères (avec les espèces rattachées à chacun), registre d’espèces de la carte (statut de présence, validation), parcours. Paginer zones et repères avec limit/offset.',
      inputSchema: z.strictObject({
        map_id: z.string().min(1).max(32).describe('Identifiant de carte (maps.id)'),
        ...paginationShape,
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: getMap,
    },
    {
      name: 'foretmap_get_id_key',
      title: 'Clé de détermination',
      description:
        'Arbre complet d’une clé dichotomique : couplets numérotés, propositions, renvoi vers le couplet suivant ou vers l’espèce atteinte.',
      inputSchema: z.strictObject({
        id: z.number().int().positive().optional().describe('id_keys.id'),
        slug: z.string().max(120).optional().describe('id_keys.slug'),
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: (args) => {
        if (!args.id && !args.slug) throw new McpToolError('`id` ou `slug` requis');
        return getIdKey(args);
      },
    },
    {
      name: 'foretmap_get_food_web',
      title: 'Réseau trophique',
      description:
        'Relations entre espèces (prédation, pollinisation, décomposition…) avec niveau de preuve et source quand ils existent. ForetMap : filtrer par carte (`map_id`, espèces présentes par registre, zone ou repère) ou par espèce (`species_id`). G&L : `dataset: "gl"` et éventuellement `species` (species_code).',
      inputSchema: z.strictObject({
        dataset: z.enum(['foretmap', 'gl']).optional(),
        map_id: z.string().max(32).optional(),
        species_id: z.number().int().positive().optional(),
        species: z.string().max(16).optional(),
        ...paginationShape,
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: getFoodWeb,
    },
    {
      name: 'foretmap_list_qcm',
      title: 'Liste des QCM',
      description:
        'Questions d’un jeu : `foretmap` (quiz du site), `gl` (QCM des biomes G&L) ou `lore` (QCM du récit). Filtres : niveau, difficulté (1–3), catégorie, biome/chapitre, espèce (ForetMap). Paginé.',
      inputSchema: z.strictObject({
        dataset: z.enum(['foretmap', 'gl', 'lore']).optional(),
        niveau: z.string().max(64).optional(),
        difficulte: z.number().int().min(1).max(5).optional(),
        categorie: z.string().max(64).optional(),
        biome_or_chapter: z.string().max(64).optional(),
        species_id: z.number().int().positive().optional(),
        ...paginationShape,
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: listQcm,
    },
    {
      name: 'foretmap_get_qcm',
      title: 'Détail d’une question',
      description:
        'Une question complète (énoncé, choix, bonne réponse, feedbacks, photo et crédit) et ses rattachements aux ressources. Rappel de convention : le feedback du choix correct reste vide, c’est `feedback_correct` qui sert.',
      inputSchema: z.strictObject({
        dataset: z.enum(['foretmap', 'gl', 'lore']).optional(),
        code: z.string().min(1).max(16),
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: getQcm,
    },
    {
      name: 'foretmap_get_glossary_term',
      title: 'Terme de glossaire',
      description:
        'Définition(s) d’un terme dans les trois glossaires (ForetMap, G&L écologie, lore). Par `code` exact ou par `term` (terme ou variante). Utile pour comparer les définitions d’un même mot entre les deux produits.',
      inputSchema: z.strictObject({
        term: z.string().min(1).max(120).optional(),
        code: z.string().min(1).max(16).optional(),
        dataset: z.enum(['foretmap', 'gl', 'lore']).optional(),
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: (args) => {
        if (!args.term && !args.code) throw new McpToolError('`term` ou `code` requis');
        return getGlossaryTerm(args);
      },
    },
    {
      name: 'gl_get_board',
      title: 'Plateau G&L',
      description:
        'Chapitres (plateaux) de Gnomes & Licornes : biomes, cases ordonnées (type d’évènement, position en %, réglage du tirage de questions : niveaux et difficulté), zones de frontière (polygones). `chapter` = slug ou id pour un seul plateau.',
      inputSchema: z.strictObject({ chapter: z.string().max(96).optional() }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: getGlBoard,
    },
    {
      name: 'gl_get_lore',
      title: 'Feuillets du lore G&L',
      description:
        'Feuillets du récit G&L : liste filtrable par statut (actif, archive…) et plateau, ou un feuillet complet par `code`.',
      inputSchema: z.strictObject({
        code: z.string().max(64).optional(),
        statut: z.string().max(32).optional(),
        plateau: z.number().int().min(1).max(10).optional(),
        ...paginationShape,
      }),
      annotations: READ_ONLY,
      requires: READ_REQUIRES,
      handler: getGlLore,
    },
  ];
}

module.exports = { SEARCH_TYPES, buildContentTools };
