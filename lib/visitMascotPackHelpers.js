'use strict';

/**
 * Logique pure des packs mascotte de `routes/visit.js` (O10) : templates de packs,
 * sérialisation des lignes SQL, validations de noms de fichiers/chemins relatifs et
 * mapping d'erreurs SQL → réponses publiques. Aucune I/O, aucun accès req/res/DB.
 */

const path = require('path');

function visitMascotPackAssetRelativeDir(packId) {
  const id = String(packId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return `visit_mascot_packs/${id}`;
}

function sanitizeMascotPackAssetFilename(name) {
  const base = path.basename(String(name || '').trim());
  if (!base || base.length > 128 || !/^[a-zA-Z0-9._-]+$/.test(base)) return null;
  return base;
}

function buildDefaultVisitMascotPackJson(catalogId) {
  const slug =
    String(catalogId || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') || 'brouillon';
  const base = buildRenard2CatalogPackTemplate(slug);
  return {
    ...base,
    id: slug,
    label: 'Nouveau pack (brouillon)',
  };
}

const VISIT_MASCOT_CATALOG_MODEL_META = Object.freeze({
  'sprout-rive': { label: 'SPR0UT', fallbackSilhouette: 'sprout' },
  'scrap-rive': { label: 'SCR4P', fallbackSilhouette: 'scrap' },
  'gnome-foret-rive': { label: 'Gnome foret', fallbackSilhouette: 'gnome' },
  'gnome-ambre-rive': { label: 'Gnome ambre', fallbackSilhouette: 'gnome' },
  'gnome-punk-rive': { label: 'Gnome punk', fallbackSilhouette: 'gnome' },
  'spore-rive': { label: 'Spore', fallbackSilhouette: 'spore' },
  'vine-rive': { label: 'Liane', fallbackSilhouette: 'vine' },
  'moss-rive': { label: 'Mousse', fallbackSilhouette: 'moss' },
  'seed-rive': { label: 'Graine', fallbackSilhouette: 'seed' },
  'swarm-rive': { label: 'Essaim', fallbackSilhouette: 'swarm' },
  'sprite-template': {
    label: 'Gnome template',
    fallbackSilhouette: 'gnome',
    sourceImage: '/assets/mascots/template/mascot-spritesheet.png',
  },
  'olu-spritesheet': {
    label: 'OLU',
    fallbackSilhouette: 'olu',
    sourceImage: '/assets/mascots/olu/olu-spritesheet.png',
  },
  'tan-bird-spritesheet': {
    label: 'Oiseau tan',
    fallbackSilhouette: 'tanBird',
    sourceImage: '/assets/mascots/tan-bird/tan-bird-spritesheet.png',
  },
  'fox-backpack-spritesheet': { label: 'Renard sac', fallbackSilhouette: 'backpackFox' },
  'renard2-cut-spritesheet': { label: 'Renard 2', fallbackSilhouette: 'backpackFox2' },
});

function listVisitMascotCatalogTemplateIds() {
  return Object.keys(VISIT_MASCOT_CATALOG_MODEL_META);
}

function buildSingleFrameMascotTemplate(
  slug,
  title,
  silhouette,
  sourceImage = '/assets/mascots/renard2-cut/frames/cell-r0-c0.png',
) {
  return {
    mascotPackVersion: 2,
    id: slug,
    label: `${title} (modèle)`,
    renderer: 'sprite_cut',
    framesBase: '/assets/mascots/renard2-cut/frames/',
    frameWidth: 153,
    frameHeight: 160,
    pixelated: true,
    displayScale: 1,
    fallbackSilhouette: silhouette || 'backpackFox2',
    stateFrames: {
      idle: { srcs: [sourceImage], fps: 1 },
      walking: { srcs: [sourceImage], fps: 1 },
      running: { srcs: [sourceImage], fps: 1 },
      talk: { srcs: [sourceImage], fps: 1 },
      inspect: { srcs: [sourceImage], fps: 1 },
      map_read: { srcs: [sourceImage], fps: 1 },
      surprise: { srcs: [sourceImage], fps: 1 },
      alert: { srcs: [sourceImage], fps: 1 },
      angry: { srcs: [sourceImage], fps: 1 },
      spin: { srcs: [sourceImage], fps: 1 },
      happy: { srcs: [sourceImage], fps: 1 },
      happy_jump: { srcs: [sourceImage], fps: 1 },
      celebrate: { srcs: [sourceImage], fps: 1 },
    },
  };
}

function serializeVisitMascotPackRow(row) {
  let pack = {};
  try {
    pack = JSON.parse(row.pack_json);
  } catch (_) {
    pack = {};
  }
  return {
    id: row.id,
    catalog_id: row.catalog_id,
    map_id: row.map_id,
    label: row.label,
    is_published: !!Number(row.is_published),
    created_at: row.created_at,
    updated_at: row.updated_at,
    pack,
  };
}

function classifyMascotPackModuleError(moduleErr) {
  const msg = String(moduleErr?.message || moduleErr || '');
  if (/cannot find (module|package).+zod|err_module_not_found.+zod/i.test(msg)) {
    return {
      reason: 'missing_runtime_dependency',
      hint: 'La dépendance runtime `zod` est introuvable sur le serveur (installer les dépendances de production à jour).',
    };
  }
  if (/visitMascotState\.js|visitMascotInteractionEvents\.js/i.test(msg)) {
    return {
      reason: 'incomplete_lib_mirror',
      hint: 'Le miroir `lib/visit-pack/` est incomplet (fichiers auxiliaires manquants).',
    };
  }
  if (/cannot find module|cannot find package|err_module_not_found/i.test(msg)) {
    return {
      reason: 'validator_module_missing',
      hint: 'Le module de validation des packs mascotte est introuvable (exécuter `npm run build` et redéployer `lib/visit-pack/`).',
    };
  }
  return {
    reason: 'validator_import_error',
    hint: 'Erreur de chargement du validateur des packs mascotte (consulter les logs serveur).',
  };
}

function mapVisitMascotPackSqlError(err) {
  if (!err) return null;
  if (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE') {
    return {
      status: 503,
      body: {
        error:
          'Table MySQL `visit_mascot_packs` absente : appliquer le schéma (`sql/schema_foretmap.sql`) ou la migration `072_visit_mascot_packs.sql`, puis redémarrer l’application.',
        code: 'visit_mascot_packs_table_missing',
      },
    };
  }
  if (err.errno === 1452 || err.code === 'ER_NO_REFERENCED_ROW_2') {
    return {
      status: 400,
      body: {
        error: 'Référence invalide (utilisateur ou carte) pour ce pack mascotte.',
        code: 'visit_mascot_pack_referential_integrity',
      },
    };
  }
  return null;
}

function visitMascotSpriteLibraryRelativeDir(mapId) {
  const mid = String(mapId || '').trim();
  if (!mid || mid.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(mid)) return null;
  return `visit_mascot_sprite_library/${mid}`;
}

function visitMascotSpriteLibraryAssetsApiPrefix(mapId) {
  const mid = String(mapId || '').trim();
  if (!visitMascotSpriteLibraryRelativeDir(mid)) return null;
  return `/api/visit/mascot-sprite-library/${mid}/assets/`;
}

function mascotPackAllowedFramesPrefixesForMap(mapId, packUuid) {
  const out = ['/assets/mascots/'];
  const pPack =
    packUuid && /^[0-9a-f-]{36}$/i.test(String(packUuid))
      ? `/api/visit/mascot-packs/${String(packUuid).trim()}/assets/`
      : null;
  if (pPack) out.push(pPack);
  const pLib = visitMascotSpriteLibraryAssetsApiPrefix(mapId);
  if (pLib) out.push(pLib);
  return out;
}

function mapVisitMascotSpriteLibSqlError(err) {
  if (!err) return null;
  if (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE') {
    return {
      status: 503,
      body: {
        error:
          'Table MySQL `visit_mascot_sprite_library` absente : appliquer la migration `074_visit_mascot_sprite_library.sql` ou le schéma, puis redémarrer.',
        code: 'visit_mascot_sprite_library_table_missing',
      },
    };
  }
  if (err.errno === 1452 || err.code === 'ER_NO_REFERENCED_ROW_2') {
    return {
      status: 400,
      body: {
        error: 'Référence invalide pour la bibliothèque sprites visite.',
        code: 'visit_mascot_sprite_library_referential_integrity',
      },
    };
  }
  return null;
}

/** Template pack v2 aligné sur le catalogue statique `renard2-cut-spritesheet`. */
function buildRenard2CatalogPackTemplate(newPackIdSlug) {
  const slug =
    String(newPackIdSlug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') || 'renard2-clone';
  const framesBase = '/assets/mascots/renard2-cut/frames/';
  return {
    mascotPackVersion: 2,
    id: slug,
    label: 'Renard 2 (copie modèle)',
    renderer: 'sprite_cut',
    framesBase,
    frameWidth: 153,
    frameHeight: 160,
    pixelated: true,
    displayScale: 1,
    fallbackSilhouette: 'backpackFox2',
    stateFrames: {
      idle: { files: ['cell-r0-c0.png', 'cell-r0-c1.png', 'cell-r0-c2.png'], fps: 3 },
      walking: {
        files: [
          'cell-r1-c0.png',
          'cell-r1-c1.png',
          'cell-r1-c2.png',
          'cell-r1-c3.png',
          'cell-r1-c4.png',
        ],
        fps: 10,
      },
      running: {
        files: [
          'cell-r1-c0.png',
          'cell-r1-c1.png',
          'cell-r1-c2.png',
          'cell-r1-c3.png',
          'cell-r1-c4.png',
        ],
        fps: 14,
      },
      talk: {
        files: ['cell-r2-c0.png', 'cell-r2-c1.png', 'cell-r2-c2.png', 'cell-r2-c3.png'],
        fps: 8,
      },
      inspect: { files: ['cell-r0-c2.png'], fps: 1 },
      map_read: { files: ['cell-r0-c0.png'], fps: 1 },
      surprise: { files: ['cell-r3-c0.png'], fps: 2 },
      alert: { files: ['cell-r3-c0.png'], fps: 5 },
      angry: { files: ['cell-r3-c0.png'], fps: 7 },
      spin: { files: ['cell-r3-c1.png', 'cell-r3-c2.png'], fps: 10 },
      happy: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 9 },
      happy_jump: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 11 },
      celebrate: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 10 },
    },
  };
}

function buildFoxBackpackCatalogPackTemplate(newPackIdSlug) {
  const slug =
    String(newPackIdSlug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') || 'fox-backpack-clone';
  const framesBase = '/assets/mascots/fox-backpack/cells/';
  return {
    mascotPackVersion: 2,
    id: slug,
    label: 'Renard sac (copie modèle)',
    renderer: 'sprite_cut',
    framesBase,
    frameWidth: 153,
    frameHeight: 160,
    pixelated: true,
    displayScale: 1,
    fallbackSilhouette: 'backpackFox',
    stateFrames: {
      idle: { files: ['cell-r0-c0.png', 'cell-r0-c1.png', 'cell-r0-c2.png'], fps: 3 },
      walking: {
        files: [
          'cell-r1-c0.png',
          'cell-r1-c1.png',
          'cell-r1-c2.png',
          'cell-r1-c3.png',
          'cell-r1-c4.png',
        ],
        fps: 10,
      },
      running: {
        files: [
          'cell-r1-c0.png',
          'cell-r1-c1.png',
          'cell-r1-c2.png',
          'cell-r1-c3.png',
          'cell-r1-c4.png',
        ],
        fps: 14,
      },
      talk: {
        files: ['cell-r2-c0.png', 'cell-r2-c1.png', 'cell-r2-c2.png', 'cell-r2-c3.png'],
        fps: 8,
      },
      inspect: { files: ['cell-r0-c2.png'], fps: 1 },
      map_read: { files: ['cell-r0-c0.png'], fps: 1 },
      surprise: { files: ['cell-r3-c0.png'], fps: 2 },
      alert: { files: ['cell-r3-c0.png'], fps: 5 },
      angry: { files: ['cell-r3-c0.png'], fps: 7 },
      spin: { files: ['cell-r3-c1.png', 'cell-r3-c2.png'], fps: 10 },
      happy: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 9 },
      happy_jump: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 11 },
      celebrate: { files: ['cell-r3-c3.png', 'cell-r3-c4.png', 'cell-r3-c5.png'], fps: 10 },
    },
  };
}

function buildVisitCatalogPackTemplate(catalogTemplateId, newPackIdSlug) {
  const id = String(catalogTemplateId || '').trim();
  if (!id) return null;
  const slug =
    String(newPackIdSlug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') || 'catalog-clone';
  if (id === 'renard2-cut-spritesheet') return buildRenard2CatalogPackTemplate(slug);
  if (id === 'fox-backpack-spritesheet') return buildFoxBackpackCatalogPackTemplate(slug);
  const meta = VISIT_MASCOT_CATALOG_MODEL_META[id];
  if (!meta) return null;
  return buildSingleFrameMascotTemplate(
    slug,
    meta.label || id,
    meta.fallbackSilhouette,
    meta.sourceImage,
  );
}

module.exports = {
  VISIT_MASCOT_CATALOG_MODEL_META,
  visitMascotPackAssetRelativeDir,
  sanitizeMascotPackAssetFilename,
  buildDefaultVisitMascotPackJson,
  listVisitMascotCatalogTemplateIds,
  buildSingleFrameMascotTemplate,
  serializeVisitMascotPackRow,
  classifyMascotPackModuleError,
  mapVisitMascotPackSqlError,
  visitMascotSpriteLibraryRelativeDir,
  visitMascotSpriteLibraryAssetsApiPrefix,
  mascotPackAllowedFramesPrefixesForMap,
  mapVisitMascotSpriteLibSqlError,
  buildRenard2CatalogPackTemplate,
  buildFoxBackpackCatalogPackTemplate,
  buildVisitCatalogPackTemplate,
};
