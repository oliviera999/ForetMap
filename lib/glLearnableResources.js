'use strict';

// Registre des ressources GL « apprenables » puis importables dans le carnet.
// Pour chaque type : vérification d'existence (utilisée par l'accusé « appris » et
// par l'import) et résolution d'un titre de repli. Le titre affiché est de préférence
// fourni par le client (qui connaît les noms de biomes / d'items) ; ces resolvers
// servent de garde-fou et de repli côté serveur.

const LEARNABLE_RESOURCE_TYPES = Object.freeze([
  'species',
  'glossary',
  'tutorial',
  'lore_glossary',
  'feuillet',
  'content_page',
  'ecosystem',
]);

const SLUG_RE = /^[a-z0-9_-]+$/i;

const RESOLVERS = {
  species: {
    async exists(db, ref) {
      const row = await db.queryOne(
        "SELECT species_code FROM gl_species WHERE species_code = ? AND statut = 'actif' LIMIT 1",
        [ref],
      );
      return !!row;
    },
    async title(db, ref) {
      const row = await db.queryOne(
        'SELECT nom_commun FROM gl_species WHERE species_code = ? LIMIT 1',
        [ref],
      );
      return row?.nom_commun ? String(row.nom_commun) : null;
    },
  },
  glossary: {
    async exists(db, ref) {
      const row = await db.queryOne(
        "SELECT glossary_code FROM gl_glossary_terms WHERE glossary_code = ? AND statut = 'actif' LIMIT 1",
        [ref],
      );
      return !!row;
    },
    async title(db, ref) {
      const row = await db.queryOne(
        'SELECT terme FROM gl_glossary_terms WHERE glossary_code = ? LIMIT 1',
        [ref],
      );
      return row?.terme ? String(row.terme) : null;
    },
  },
  tutorial: {
    async exists(db, ref) {
      const id = Number(ref);
      if (!Number.isFinite(id) || id <= 0) return false;
      const row = await db.queryOne('SELECT id FROM gl_tutorials WHERE id = ? LIMIT 1', [id]);
      return !!row;
    },
    async title(db, ref) {
      const id = Number(ref);
      if (!Number.isFinite(id) || id <= 0) return null;
      const row = await db.queryOne('SELECT title FROM gl_tutorials WHERE id = ? LIMIT 1', [id]);
      return row?.title ? String(row.title) : null;
    },
  },
  lore_glossary: {
    // `statut = 'actif'` comme species/glossary : un terme desactive ne figure dans aucune
    // liste de jeu, il ne doit donc pas rester marquable ni importable (audit J2, 2026-08).
    async exists(db, ref) {
      const row = await db.queryOne(
        "SELECT lore_code FROM gl_lore_glossary_terms WHERE lore_code = ? AND statut = 'actif' LIMIT 1",
        [ref],
      );
      return !!row;
    },
    async title(db, ref) {
      const row = await db.queryOne(
        'SELECT terme FROM gl_lore_glossary_terms WHERE lore_code = ? LIMIT 1',
        [ref],
      );
      return row?.terme ? String(row.terme) : null;
    },
  },
  feuillet: {
    // Idem : le carnet ne sert que les feuillets `statut = 'actif'` (routes/gl/lore.js),
    // un feuillet desactive ne doit pas rester marquable « etudie » (audit J2, 2026-08).
    //
    // Et pour un JOUEUR, le feuillet doit etre accessible : deja trouve par une de ses equipes
    // ou possede en propre. La regle « n'est propose que sur un feuillet deja accessible en
    // partie » n'etait tenue que par l'ecran ; un appel direct a l'API permettait de marquer
    // « etudie » un feuillet jamais rencontre (audit J1, 2026-08 ; A9, 2026-09). MJ, admin et
    // invite ne sont pas concernes (pas de progression propre).
    async exists(db, ref, context = null) {
      const row = await db.queryOne(
        "SELECT feuillet_code FROM gl_lore_feuillets WHERE feuillet_code = ? AND statut = 'actif' LIMIT 1",
        [ref],
      );
      if (!row) return false;
      const auth = context?.glAuth;
      if (auth?.userType !== 'gl_player' || auth?.userId == null) return true;
      const { loadPlayerFeuilletStates } = require('./glLoreFeuillets');
      const states = await loadPlayerFeuilletStates(db, String(auth.userId));
      return states instanceof Map ? states.has(String(ref)) : !!states?.[String(ref)];
    },
    async title(db, ref) {
      const row = await db.queryOne(
        'SELECT titre FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1',
        [ref],
      );
      return row?.titre ? String(row.titre) : null;
    },
  },
  content_page: {
    async exists(db, ref) {
      const row = await db.queryOne('SELECT slug FROM gl_content_pages WHERE slug = ? LIMIT 1', [
        ref,
      ]);
      return !!row;
    },
    async title(db, ref) {
      const row = await db.queryOne('SELECT title FROM gl_content_pages WHERE slug = ? LIMIT 1', [
        ref,
      ]);
      return row?.title ? String(row.title) : null;
    },
  },
  ecosystem: {
    // Un écosystème est identifié par son biome (slug). Source de vérité : la table
    // `gl_biomes` (registre fini des biomes réels, cible de la FK `gl_chapter_biomes`).
    // On valide donc l'existence réelle du biome plutôt que la seule présence d'espèces
    // (qui laissait passer tout slug bien formé).
    async exists(db, ref) {
      if (!SLUG_RE.test(ref)) return false;
      const row = await db.queryOne('SELECT 1 AS ok FROM gl_biomes WHERE slug = ? LIMIT 1', [ref]);
      return !!row;
    },
    async title(db, ref) {
      const row = await db.queryOne('SELECT nom FROM gl_biomes WHERE slug = ? LIMIT 1', [ref]);
      return row?.nom ? String(row.nom) : null;
    },
  },
};

function isLearnableResourceType(type) {
  return LEARNABLE_RESOURCE_TYPES.includes(String(type || '').trim());
}

/**
 * @param {object} db
 * @param {string} type
 * @param {string} ref
 * @param {{ glAuth?: object }|null} [context] lecteur courant — sert aux types dont l'existence
 *   depend de l'acces du lecteur (feuillet).
 */
async function resourceExists(db, type, ref, context = null) {
  const resolver = RESOLVERS[String(type || '').trim()];
  if (!resolver) return false;
  return resolver.exists(db, ref, context);
}

async function resolveResourceTitle(db, type, ref) {
  const resolver = RESOLVERS[String(type || '').trim()];
  if (!resolver) return null;
  try {
    return await resolver.title(db, ref);
  } catch (_err) {
    return null;
  }
}

module.exports = {
  LEARNABLE_RESOURCE_TYPES,
  isLearnableResourceType,
  resourceExists,
  resolveResourceTitle,
};
