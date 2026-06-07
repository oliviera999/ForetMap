'use strict';

const XLSX = require('xlsx');
const { asTrimmedString } = require('./glLoreGlossaryMatch');

const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const FEUILLETS_SHEET = 'feuillets';
const PLATEAUX_SHEET = 'plateaux';

const VALID_TYPES = new Set(['copiste', 'message', 'feuillet', 'reponse', 'scene', 'vierge']);
const VALID_MODES = new Set([
  'cover', 'preface', 'insert', 'boite', 'band', 'marginalia', 'pole', 'biome',
  'corbeau', 'ancre_biome', 'carnet_route', 'scene', 'cloture',
]);

/** Alias narratifs du corpus Sélène → slugs catalogue `gl_biomes`. */
const LORE_BIOME_SLUG_ALIASES = new Map([
  ['jungle', 'jungle_afc'],
  ['caduc', 'foret_caducifoliee'],
  ['toundra-hiver', 'toundra'],
  ['toundra_hiver', 'toundra'],
  ['toundra-ete', 'toundra'],
  ['toundra_ete', 'toundra'],
]);

function normalizeLoreBiomeSlug(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;
  let slug = raw.toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').trim();
  if (!slug) return null;
  if (LORE_BIOME_SLUG_ALIASES.has(slug)) {
    return LORE_BIOME_SLUG_ALIASES.get(slug);
  }
  return slug;
}

const FEUILLET_HEADER_ALIASES = new Map([
  ['id', 'legacy_id'],
  ['code', 'feuillet_code'],
  ['type', 'type'],
  ['liasse', 'liasse'],
  ['titre', 'titre'],
  ['incipit', 'incipit'],
  ['biome_slug', 'biome_slug'],
  ['biome_nom', 'biome_nom'],
  ['plateau', 'plateau_number'],
  ['zone', 'zone_label'],
  ['visage', 'visage_label'],
  ['ordre_voyage', 'ordre_voyage'],
  ['ordre_liasse', 'ordre_liasse'],
  ['ordre_recit', 'ordre_recit'],
  ['mode_apparition', 'mode_apparition'],
  ['usage', 'usage_note'],
  ['lisibilite', 'lisibilite'],
  ['effacement', 'effacement'],
  ['vierge', 'vierge'],
  ['vitesse_effacement', 'vitesse_effacement'],
  ['repalissement', 'repalissement'],
  ['tenir', 'tenir'],
  ['cout_gemme', 'cout_gemme'],
  ['gain_coeur', 'gain_coeur'],
  ['themes', 'themes'],
  ['ancrage_scientifique', 'ancrage_scientifique'],
  ['references_scientifiques', 'references_scientifiques'],
  ['lien_qcm_biome', 'lien_qcm_biome'],
  ['lien_canal', 'lien_canal'],
  ['lien_ref', 'lien_ref'],
  ['lien_pays', 'lien_pays'],
  ['lien_ordre_recit', 'lien_ordre_recit'],
  ['lien_note', 'lien_note'],
  ['signature', 'signature'],
  ['idee_cle', 'idee_cle'],
  ['contexte', 'contexte'],
  ['texte_accessible', 'texte_accessible'],
  ['texte', 'texte'],
  ['image_url', 'image_url'],
  ['image_coupe_url', 'image_coupe_url'],
]);

const MAX_FEUILLET_IMAGE_URL_LENGTH = 512;

function normalizeImportHeader(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  if (!s || s === '—' || s === '-') return null;
  return s;
}

function normalizeFeuilletImageUrl(value, field, warnings = []) {
  const s = normalizeOptionalString(value);
  if (!s) return null;
  if (s.includes('..')) {
    warnings.push({ field, warning: 'URL image suspecte (.. interdit)' });
  }
  const lower = s.toLowerCase();
  if (!s.startsWith('/uploads/') && !lower.startsWith('http://') && !lower.startsWith('https://')) {
    warnings.push({ field, warning: 'URL image non reconnue (attendu /uploads/... ou http...)' });
  }
  return s.slice(0, MAX_FEUILLET_IMAGE_URL_LENGTH);
}

function parseIntField(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseOptionalIntField(value) {
  const raw = normalizeOptionalString(value);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeLienCanal(value) {
  const s = normalizeOptionalString(value);
  if (!s) return null;
  return s.toLowerCase();
}

function parseBoolField(value) {
  const s = asTrimmedString(value).toLowerCase();
  return s === 'oui' || s === '1' || s === 'true';
}

function normalizeType(value) {
  const s = asTrimmedString(value).toLowerCase();
  return VALID_TYPES.has(s) ? s : null;
}

function normalizeMode(value) {
  const s = asTrimmedString(value).toLowerCase();
  return VALID_MODES.has(s) ? s : 'boite';
}

function readSheetRows(wb, sheetName) {
  if (!wb.SheetNames.includes(sheetName)) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false, blankrows: false });
}

function mapFeuilletRow(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = FEUILLET_HEADER_ALIASES.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

function buildFeuilletPayload(mapped = {}) {
  const feuilletCode = asTrimmedString(mapped.feuillet_code);
  const type = normalizeType(mapped.type) || 'feuillet';
  const errors = [];
  const warnings = [];
  if (!feuilletCode) errors.push({ field: 'feuillet_code', error: 'Code feuillet obligatoire' });
  return {
    payload: {
      feuillet_code: feuilletCode,
      legacy_id: parseIntField(mapped.legacy_id, null) || null,
      type,
      liasse: normalizeOptionalString(mapped.liasse),
      titre: normalizeOptionalString(mapped.titre),
      incipit: normalizeOptionalString(mapped.incipit),
      biome_slug: normalizeLoreBiomeSlug(mapped.biome_slug),
      plateau_number: parseIntField(mapped.plateau_number, 0) || null,
      zone_label: normalizeOptionalString(mapped.zone_label),
      visage_label: normalizeOptionalString(mapped.visage_label),
      ordre_voyage: parseIntField(mapped.ordre_voyage, 0),
      ordre_liasse: parseIntField(mapped.ordre_liasse, 0),
      ordre_recit: parseIntField(mapped.ordre_recit, 0),
      mode_apparition: normalizeMode(mapped.mode_apparition),
      usage_note: normalizeOptionalString(mapped.usage_note),
      lisibilite: normalizeOptionalString(mapped.lisibilite),
      effacement: asTrimmedString(mapped.effacement || 'non').toLowerCase() || 'non',
      vierge: parseBoolField(mapped.vierge) ? 1 : 0,
      vitesse_effacement: normalizeOptionalString(mapped.vitesse_effacement),
      repalissement: normalizeOptionalString(mapped.repalissement),
      tenir: normalizeOptionalString(mapped.tenir),
      cout_gemme: parseIntField(mapped.cout_gemme, 0),
      gain_coeur: parseIntField(mapped.gain_coeur, 0),
      themes: normalizeOptionalString(mapped.themes),
      ancrage_scientifique: normalizeOptionalString(mapped.ancrage_scientifique),
      references_scientifiques: normalizeOptionalString(mapped.references_scientifiques),
      lien_qcm_biome: normalizeOptionalString(mapped.lien_qcm_biome),
      lien_canal: normalizeLienCanal(mapped.lien_canal),
      lien_ref: normalizeOptionalString(mapped.lien_ref),
      lien_pays: parseOptionalIntField(mapped.lien_pays),
      lien_ordre_recit: parseOptionalIntField(mapped.lien_ordre_recit),
      lien_note: normalizeOptionalString(mapped.lien_note),
      signature: normalizeOptionalString(mapped.signature),
      idee_cle: normalizeOptionalString(mapped.idee_cle),
      contexte: normalizeOptionalString(mapped.contexte),
      texte_accessible: normalizeOptionalString(mapped.texte_accessible),
      texte: normalizeOptionalString(mapped.texte),
      image_url: normalizeFeuilletImageUrl(mapped.image_url, 'image_url', warnings),
      image_coupe_url: normalizeFeuilletImageUrl(mapped.image_coupe_url, 'image_coupe_url', warnings),
      statut: 'actif',
    },
    errors,
    warnings,
  };
}

function buildPlateauPayload(row = {}) {
  const plateauNumber = parseIntField(row.plateau ?? row.plateau_number, 0);
  const zoneLabel = normalizeOptionalString(row.zone ?? row.zone_label);
  if (!plateauNumber || !zoneLabel) return null;
  const biomesRaw = normalizeOptionalString(row.biomes ?? row.biomes_slugs) || '';
  const biomesSlugs = biomesRaw
    .split(/[;,|]+/)
    .map((s) => normalizeLoreBiomeSlug(s))
    .filter(Boolean)
    .join('; ');
  return {
    plateau_number: plateauNumber,
    zone_label: zoneLabel,
    visage_label: normalizeOptionalString(row.visage ?? row.visage_label),
    biomes_slugs: biomesSlugs || null,
  };
}

function resolveFeuilletsImportBody(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64 || body.fileData);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  return parseFeuilletsWorkbook(buffer);
}

function parseFeuilletsWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Fichier XLSX vide ou illisible');
  }
  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`Fichier trop volumineux (max ${MAX_IMPORT_FILE_BYTES} octets)`);
  }
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const rawRows = readSheetRows(wb, FEUILLETS_SHEET);
  if (rawRows.length === 0) throw new Error(`Feuille « ${FEUILLETS_SHEET} » absente ou vide`);
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Trop de lignes (max ${MAX_IMPORT_ROWS})`);
  }
  const feuilletRows = [];
  const rowErrors = [];
  const rowWarnings = [];
  for (let i = 0; i < rawRows.length; i += 1) {
    const mapped = mapFeuilletRow(rawRows[i]);
    const { payload, errors, warnings } = buildFeuilletPayload(mapped);
    if (errors.length) {
      rowErrors.push({ row: i + 2, errors });
      continue;
    }
    if (warnings.length) {
      rowWarnings.push({ row: i + 2, code: payload.feuillet_code, warnings });
    }
    feuilletRows.push(payload);
  }
  const plateauRows = readSheetRows(wb, PLATEAUX_SHEET)
    .map(buildPlateauPayload)
    .filter(Boolean);
  return { feuilletRows, plateauRows, rowErrors, rowWarnings };
}

async function upsertPlateau(deps, payload, dryRun) {
  if (dryRun) return { action: 'upsert' };
  await deps.execute(
    `INSERT INTO gl_lore_plateaux (plateau_number, zone_label, visage_label, biomes_slugs, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       visage_label = VALUES(visage_label),
       biomes_slugs = VALUES(biomes_slugs),
       updated_at = NOW()`,
    [payload.plateau_number, payload.zone_label, payload.visage_label, payload.biomes_slugs]
  );
  return { action: 'upsert' };
}

async function upsertFeuillet(deps, payload, knownBiomes, dryRun) {
  if (payload.biome_slug && knownBiomes && !knownBiomes.has(payload.biome_slug)) {
    const err = new Error(`Biome inconnu: ${payload.biome_slug}`);
    err.statusCode = 400;
    throw err;
  }
  if (dryRun) return { action: 'upsert', code: payload.feuillet_code };
  await deps.execute(
    `INSERT INTO gl_lore_feuillets (
       feuillet_code, legacy_id, type, liasse, titre, incipit, biome_slug,
       plateau_number, zone_label, visage_label, ordre_voyage, ordre_liasse, ordre_recit,
       mode_apparition, usage_note, lisibilite, effacement, vierge, vitesse_effacement,
       repalissement, tenir, cout_gemme, gain_coeur, themes, ancrage_scientifique,
       references_scientifiques, lien_qcm_biome, lien_canal, lien_ref, lien_pays,
       lien_ordre_recit, lien_note, signature, idee_cle, contexte,
       texte_accessible, texte, image_url, image_coupe_url, statut, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       legacy_id = VALUES(legacy_id),
       type = VALUES(type),
       liasse = VALUES(liasse),
       titre = VALUES(titre),
       incipit = VALUES(incipit),
       biome_slug = VALUES(biome_slug),
       plateau_number = VALUES(plateau_number),
       zone_label = VALUES(zone_label),
       visage_label = VALUES(visage_label),
       ordre_voyage = VALUES(ordre_voyage),
       ordre_liasse = VALUES(ordre_liasse),
       ordre_recit = VALUES(ordre_recit),
       mode_apparition = VALUES(mode_apparition),
       usage_note = VALUES(usage_note),
       lisibilite = VALUES(lisibilite),
       effacement = VALUES(effacement),
       vierge = VALUES(vierge),
       vitesse_effacement = VALUES(vitesse_effacement),
       repalissement = VALUES(repalissement),
       tenir = VALUES(tenir),
       cout_gemme = VALUES(cout_gemme),
       gain_coeur = VALUES(gain_coeur),
       themes = VALUES(themes),
       ancrage_scientifique = VALUES(ancrage_scientifique),
       references_scientifiques = VALUES(references_scientifiques),
       lien_qcm_biome = VALUES(lien_qcm_biome),
       lien_canal = COALESCE(VALUES(lien_canal), lien_canal),
       lien_ref = COALESCE(VALUES(lien_ref), lien_ref),
       lien_pays = COALESCE(VALUES(lien_pays), lien_pays),
       lien_ordre_recit = COALESCE(VALUES(lien_ordre_recit), lien_ordre_recit),
       lien_note = COALESCE(VALUES(lien_note), lien_note),
       signature = VALUES(signature),
       idee_cle = VALUES(idee_cle),
       contexte = VALUES(contexte),
       texte_accessible = VALUES(texte_accessible),
       texte = VALUES(texte),
       image_url = COALESCE(VALUES(image_url), image_url),
       image_coupe_url = COALESCE(VALUES(image_coupe_url), image_coupe_url),
       statut = VALUES(statut),
       updated_at = NOW()`,
    [
      payload.feuillet_code,
      payload.legacy_id,
      payload.type,
      payload.liasse,
      payload.titre,
      payload.incipit,
      payload.biome_slug,
      payload.plateau_number,
      payload.zone_label,
      payload.visage_label,
      payload.ordre_voyage,
      payload.ordre_liasse,
      payload.ordre_recit,
      payload.mode_apparition,
      payload.usage_note,
      payload.lisibilite,
      payload.effacement,
      payload.vierge,
      payload.vitesse_effacement,
      payload.repalissement,
      payload.tenir,
      payload.cout_gemme,
      payload.gain_coeur,
      payload.themes,
      payload.ancrage_scientifique,
      payload.references_scientifiques,
      payload.lien_qcm_biome,
      payload.lien_canal,
      payload.lien_ref,
      payload.lien_pays,
      payload.lien_ordre_recit,
      payload.lien_note,
      payload.signature,
      payload.idee_cle,
      payload.contexte,
      payload.texte_accessible,
      payload.texte,
      payload.image_url,
      payload.image_coupe_url,
      payload.statut,
    ]
  );
  return { action: 'upsert', code: payload.feuillet_code };
}

async function applyFeuilletsImport(deps, { feuilletRows, plateauRows, rowWarnings }, options = {}) {
  const dryRun = options.dryRun !== false;
  const biomeRows = await deps.queryAll('SELECT slug FROM gl_biomes');
  const knownBiomes = new Set(biomeRows.map((r) => String(r.slug)));
  const report = {
    dryRun,
    plateaux: { upserted: 0 },
    feuillets: { upserted: 0, skipped: 0, errors: [], warnings: Array.isArray(rowWarnings) ? rowWarnings : [] },
  };

  for (const plateau of plateauRows || []) {
    await upsertPlateau(deps, plateau, dryRun);
    report.plateaux.upserted += 1;
  }

  for (const payload of feuilletRows || []) {
    try {
      await upsertFeuillet(deps, payload, knownBiomes, dryRun);
      report.feuillets.upserted += 1;
    } catch (err) {
      report.feuillets.errors.push({ code: payload.feuillet_code, error: err.message });
      report.feuillets.skipped += 1;
    }
  }
  return report;
}

function buildFeuilletsTemplateWorkbook() {
  const wb = XLSX.utils.book_new();
  const headers = [...FEUILLET_HEADER_ALIASES.values()];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([headers, ['ex-feuillet', 'feuillet', 'I', 'Titre', '', 'jungle_afc', 1, 'Tropiques africains', '', 100, 1, 1, 'boite']]),
    FEUILLETS_SHEET
  );
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function loadFeuilletsExportRows(deps) {
  return deps.queryAll(
    `SELECT feuillet_code, legacy_id, type, liasse, titre, incipit, biome_slug,
            plateau_number, zone_label, visage_label, ordre_voyage, ordre_liasse, ordre_recit,
            mode_apparition, usage_note, lisibilite, effacement, vierge, vitesse_effacement,
            repalissement, tenir, cout_gemme, gain_coeur, themes, ancrage_scientifique,
            references_scientifiques, lien_qcm_biome, lien_canal, lien_ref, lien_pays,
            lien_ordre_recit, lien_note, signature, idee_cle, contexte,
            texte_accessible, texte, image_url, image_coupe_url, statut
       FROM gl_lore_feuillets
      ORDER BY ordre_voyage ASC, ordre_liasse ASC, feuillet_code ASC`
  );
}

function buildFeuilletsExportWorkbook(rows) {
  const wb = XLSX.utils.book_new();
  const headers = [...FEUILLET_HEADER_ALIASES.values()];
  const data = [headers];
  for (const row of rows || []) {
    data.push([
      row.legacy_id ?? '',
      row.feuillet_code,
      row.type,
      row.liasse ?? '',
      row.titre ?? '',
      row.incipit ?? '',
      row.biome_slug ?? '',
      row.plateau_number ?? '',
      row.zone_label ?? '',
      row.visage_label ?? '',
      row.ordre_voyage ?? 0,
      row.ordre_liasse ?? 0,
      row.ordre_recit ?? 0,
      row.mode_apparition ?? 'boite',
      row.usage_note ?? '',
      row.lisibilite ?? '',
      row.effacement ?? 'non',
      row.vierge ? 'oui' : 'non',
      row.vitesse_effacement ?? '',
      row.repalissement ?? '',
      row.tenir ?? '',
      row.cout_gemme ?? 0,
      row.gain_coeur ?? 0,
      row.themes ?? '',
      row.ancrage_scientifique ?? '',
      row.references_scientifiques ?? '',
      row.lien_qcm_biome ?? '',
      row.lien_canal ?? '',
      row.lien_ref ?? '',
      row.lien_pays ?? '',
      row.lien_ordre_recit ?? '',
      row.lien_note ?? '',
      row.signature ?? '',
      row.idee_cle ?? '',
      row.contexte ?? '',
      row.texte_accessible ?? '',
      row.texte ?? '',
      row.image_url ?? '',
      row.image_coupe_url ?? '',
      row.statut ?? 'actif',
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), FEUILLETS_SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  MAX_IMPORT_ROWS,
  parseFeuilletsWorkbook,
  resolveFeuilletsImportBody,
  applyFeuilletsImport,
  buildFeuilletsTemplateWorkbook,
  buildFeuilletsExportWorkbook,
  loadFeuilletsExportRows,
  buildFeuilletPayload,
  normalizeLoreBiomeSlug,
  normalizeFeuilletImageUrl,
};
