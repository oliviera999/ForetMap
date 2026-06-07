'use strict';

const path = require('path');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const { withTransaction } = require('../database');
const { previewMediaFromBuffer, saveMediaFromBuffer, syncAssetManifests } = require('./mediaLibrary');
const { parseSpeciesWorkbook, applySpeciesImport } = require('./glSpeciesImport');
const { parseGlossaryWorkbook, applyGlossaryImport } = require('./glGlossaryImport');
const { parseSpellsWorkbook, applySpellsImport } = require('./glSpellsImport');
const { parseQcmWorkbook, applyQcmImport } = require('./glQcmImport');
const { parseChaptersWorkbook, applyChaptersImport } = require('./glChaptersImport');
const { parseChapterCharteWorkbook, applyChapterCharteImport } = require('./glChapterCharteImport');
const { parseFeuilletsWorkbook, applyFeuilletsImport } = require('./glLoreFeuilletsImport');
const { parseLoreGlossaryWorkbook, applyLoreGlossaryImport } = require('./glLoreGlossaryImport');

const { getGlImportMaxFileBytes, formatImportMaxFileLabel } = require('./glImportLimits');
const {
  MAX_ARCHIVE_BYTES,
  MAX_DECOMPRESSED_BYTES,
  MAX_FILE_COUNT,
  MAX_FILE_BYTES,
} = require('./contentLibraryUpload');

const CONTENT_LIBRARY_IMPORT_OPTIONS = {
  maxFileBytes: getGlImportMaxFileBytes('content_library'),
};

const KIND_META = {
  media: { label: 'Média', subTab: null },
  species: { label: 'Espèces', subTab: 'species' },
  glossary: { label: 'Glossaire', subTab: 'glossary' },
  lore_glossary: { label: 'Glossaire lore', subTab: 'lore-glossary' },
  spells: { label: 'Sortilèges', subTab: 'spells' },
  qcm: { label: 'QCM', subTab: 'qcm' },
  chapters: { label: 'Chapitres', subTab: 'chapters' },
  chapter_charte: { label: 'Charte chapitres', subTab: 'chapters' },
  lore_feuillets: { label: 'Carnet Sélène', subTab: 'lore-carnet' },
  unsupported: { label: 'Non pris en charge', subTab: null },
  unknown: { label: 'Inconnu', subTab: null },
};

function bulkError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function decodeBase64Payload(fileDataBase64) {
  const rawInput = asTrimmedString(fileDataBase64);
  if (!rawInput) throw bulkError('Contenu base64 requis');
  const raw = rawInput.includes(',') ? rawInput.split(',')[1] : rawInput;
  let buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch (_) {
    throw bulkError('Encodage base64 invalide');
  }
  if (!buffer || buffer.length === 0) throw bulkError('Fichier vide');
  return buffer;
}

function shouldSkipArchiveEntry(entryName) {
  const normalized = String(entryName || '').replace(/\\/g, '/');
  if (!normalized || normalized.endsWith('/')) return true;
  const base = path.basename(normalized);
  if (base.startsWith('.')) return true;
  if (normalized.includes('__MACOSX/')) return true;
  if (base === '.DS_Store') return true;
  if (normalized.split('/').some((part) => part === '..')) return true;
  return false;
}

function extractZipEntries(archiveBuffer) {
  if (!Buffer.isBuffer(archiveBuffer) || archiveBuffer.length === 0) {
    throw bulkError('Archive ZIP vide');
  }
  if (archiveBuffer.length > MAX_ARCHIVE_BYTES) {
    throw bulkError(`Archive trop volumineuse (max ${formatImportMaxFileLabel(MAX_ARCHIVE_BYTES)})`);
  }
  let zip;
  try {
    zip = new AdmZip(archiveBuffer);
  } catch (_) {
    throw bulkError('Archive ZIP illisible');
  }
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory && !shouldSkipArchiveEntry(entry.entryName));
  if (entries.length === 0) throw bulkError('Archive ZIP sans fichiers exploitables');
  if (entries.length > MAX_FILE_COUNT) {
    throw bulkError(`Trop de fichiers dans l'archive (max ${MAX_FILE_COUNT})`);
  }
  let totalSize = 0;
  const files = [];
  for (const entry of entries) {
    const fileName = path.basename(String(entry.entryName || '').replace(/\\/g, '/'));
    const buffer = entry.getData();
    totalSize += buffer.length;
    if (totalSize > MAX_DECOMPRESSED_BYTES) {
      throw bulkError(`Taille décompressée trop importante (max ${formatImportMaxFileLabel(MAX_DECOMPRESSED_BYTES)})`);
    }
    files.push({ fileName, buffer });
  }
  return files;
}

function normalizeSheetName(name) {
  return asTrimmedString(name).toLowerCase();
}

function normalizeHeaderKey(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function readWorkbookSheetNames(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return [];
  if (buffer.length > MAX_FILE_BYTES) return [];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
    return (wb.SheetNames || []).map(normalizeSheetName);
  } catch (_) {
    return [];
  }
}

function readSheetHeaderKeys(buffer, sheetName) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return new Set();
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', sheetRows: 2, cellDates: false });
    if (!wb.SheetNames.includes(sheetName)) return new Set();
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false, blankrows: false });
    if (!rows.length) return new Set();
    return new Set(Object.keys(rows[0]).map(normalizeHeaderKey));
  } catch (_) {
    return new Set();
  }
}

function hasAnySheet(sheetNames, candidates) {
  const set = new Set(sheetNames);
  return candidates.some((name) => set.has(normalizeSheetName(name)));
}

function classifyGlossaryKind(buffer, sheetNames) {
  if (!hasAnySheet(sheetNames, ['glossaire'])) return null;
  const headers = readSheetHeaderKeys(buffer, 'glossaire');
  const loreSignals = ['lore_code', 'role_recit', 'correspondance_reelle', 'chapitre_scope'];
  const sciSignals = ['glossary_code', 'etymologie', 'biomes_concernes', 'exemple'];
  const loreScore = loreSignals.filter((key) => headers.has(key)).length;
  const sciScore = sciSignals.filter((key) => headers.has(key)).length;
  if (loreScore > 0 && loreScore >= sciScore) return 'lore_glossary';
  if (sciScore > 0 && sciScore > loreScore) return 'glossary';
  if (loreScore > 0) return 'lore_glossary';
  if (sciScore > 0) return 'glossary';
  return 'unknown';
}

function classifyWorkbookKind(buffer) {
  const sheetNames = readWorkbookSheetNames(buffer);
  if (sheetNames.length === 0) return 'unknown';

  if (hasAnySheet(sheetNames, ['feuillets']) && hasAnySheet(sheetNames, ['plateaux'])) {
    return 'lore_feuillets';
  }
  if (hasAnySheet(sheetNames, ['chapitres']) && hasAnySheet(sheetNames, ['reperes', 'zones_royaume'])) {
    return 'chapters';
  }
  if (hasAnySheet(sheetNames, ['chapitres_charte']) && !hasAnySheet(sheetNames, ['chapitres'])) {
    return 'chapter_charte';
  }
  if (hasAnySheet(sheetNames, ['questions']) && hasAnySheet(sheetNames, ['categories'])) {
    return 'qcm';
  }
  if (hasAnySheet(sheetNames, ['sortileges'])) return 'spells';
  if (hasAnySheet(sheetNames, ['especes'])) return 'species';
  if (hasAnySheet(sheetNames, ['glossaire'])) {
    return classifyGlossaryKind(buffer, sheetNames) || 'unknown';
  }
  if (hasAnySheet(sheetNames, ['chapitres'])) return 'chapters';
  return 'unknown';
}

function isSpreadsheetFile(fileName, buffer) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') return true;
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  return false;
}

function classifyContentFile(fileName, buffer) {
  const name = asTrimmedString(fileName) || 'fichier';
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { kind: 'unknown', warnings: ['Fichier vide'] };
  }
  if (isSpreadsheetFile(name, buffer)) {
    if (buffer.length > MAX_FILE_BYTES) {
      return { kind: 'unknown', warnings: [`Fichier trop volumineux (max ${formatImportMaxFileLabel(MAX_FILE_BYTES)})`] };
    }
    const kind = classifyWorkbookKind(buffer);
    if (kind === 'unknown') {
      return { kind, warnings: ['Feuilles XLSX non reconnues pour un import catalogue'] };
    }
    return { kind, warnings: [] };
  }
  try {
    const preview = previewMediaFromBuffer(buffer, null, name);
    return { kind: 'media', mediaType: preview.mediaType, mimeType: preview.mimeType, warnings: [] };
  } catch (_) {
    return { kind: 'unknown', warnings: ['Type de fichier non reconnu (média ou XLSX catalogue attendu)'] };
  }
}

function buildEntryBase(fileName, buffer, classification) {
  const meta = KIND_META[classification.kind] || KIND_META.unknown;
  return {
    fileName,
    size: buffer.length,
    kind: classification.kind,
    kindLabel: meta.label,
    subTab: meta.subTab,
    mediaType: classification.mediaType || null,
    mimeType: classification.mimeType || null,
    warnings: classification.warnings || [],
    error: null,
    preview: null,
    canApply: ['media', 'species', 'glossary', 'lore_glossary', 'spells', 'qcm', 'chapters', 'chapter_charte', 'lore_feuillets'].includes(classification.kind),
  };
}

function summarizeReport(report) {
  if (!report || typeof report !== 'object') return {};
  if (report.totals) return report.totals;
  if (report.feuillets || report.plateaux) {
    return {
      feuillets: report.feuillets,
      plateaux: report.plateaux,
      dryRun: report.dryRun,
    };
  }
  return report;
}

async function dryRunCatalogImport(deps, kind, buffer, options = {}) {
  const parseOptions = CONTENT_LIBRARY_IMPORT_OPTIONS;
  switch (kind) {
    case 'species': {
      const { speciesRows, biomeRows } = parseSpeciesWorkbook(buffer, parseOptions);
      if (!speciesRows.length) throw new Error('Feuille especes absente ou vide');
      const report = await applySpeciesImport(deps, speciesRows, {
        dryRun: true,
        syncBiomes: options.syncBiomes !== false,
        biomeRows,
      });
      return summarizeReport(report);
    }
    case 'glossary': {
      const { glossaryRows } = parseGlossaryWorkbook(buffer, parseOptions);
      const report = await applyGlossaryImport(deps, glossaryRows, { dryRun: true });
      return summarizeReport(report);
    }
    case 'lore_glossary': {
      const { glossaryRows } = parseLoreGlossaryWorkbook(buffer, parseOptions);
      const report = await applyLoreGlossaryImport(deps, glossaryRows, { dryRun: true });
      return summarizeReport(report);
    }
    case 'spells': {
      const { spellRows, categoryRows } = parseSpellsWorkbook(buffer, parseOptions);
      const report = await applySpellsImport(deps, spellRows, {
        dryRun: true,
        syncCategories: options.syncCategories !== false,
        categoryRows,
      });
      return summarizeReport(report);
    }
    case 'qcm': {
      const { categoryRows, questionRows } = parseQcmWorkbook(buffer, parseOptions);
      const report = await applyQcmImport(deps, categoryRows, questionRows, { dryRun: true });
      return summarizeReport(report);
    }
    case 'chapters': {
      const parsed = parseChaptersWorkbook(buffer, parseOptions);
      return withTransaction(async (tx) => applyChaptersImport(
        { queryAll: tx.queryAll, execute: tx.execute },
        parsed,
        {
          dryRun: true,
          syncReperes: !!options.syncReperes,
          syncZones: !!options.syncZones,
          createdBy: options.createdBy ?? null,
        }
      )).then(summarizeReport);
    }
    case 'chapter_charte': {
      const { rows } = parseChapterCharteWorkbook(buffer, parseOptions);
      const report = await applyChapterCharteImport(deps, rows, { dryRun: true });
      return summarizeReport(report);
    }
    case 'lore_feuillets': {
      const parsed = parseFeuilletsWorkbook(buffer, parseOptions);
      const report = await applyFeuilletsImport(deps, parsed, { dryRun: true });
      return {
        ...summarizeReport(report),
        rowErrors: parsed.rowErrors?.length || 0,
      };
    }
    default:
      throw new Error(`Import catalogue non supporté pour ${kind}`);
  }
}

async function applyCatalogImport(deps, kind, buffer, options = {}) {
  const parseOptions = CONTENT_LIBRARY_IMPORT_OPTIONS;
  switch (kind) {
    case 'species': {
      const { speciesRows, biomeRows } = parseSpeciesWorkbook(buffer, parseOptions);
      return applySpeciesImport(deps, speciesRows, {
        dryRun: false,
        syncBiomes: options.syncBiomes !== false,
        biomeRows,
      });
    }
    case 'glossary': {
      const { glossaryRows } = parseGlossaryWorkbook(buffer, parseOptions);
      return applyGlossaryImport(deps, glossaryRows, { dryRun: false });
    }
    case 'lore_glossary': {
      const { glossaryRows } = parseLoreGlossaryWorkbook(buffer, parseOptions);
      return applyLoreGlossaryImport(deps, glossaryRows, { dryRun: false });
    }
    case 'spells': {
      const { spellRows, categoryRows } = parseSpellsWorkbook(buffer, parseOptions);
      return applySpellsImport(deps, spellRows, {
        dryRun: false,
        syncCategories: options.syncCategories !== false,
        categoryRows,
      });
    }
    case 'qcm': {
      const { categoryRows, questionRows } = parseQcmWorkbook(buffer, parseOptions);
      return applyQcmImport(deps, categoryRows, questionRows, { dryRun: false });
    }
    case 'chapters': {
      const parsed = parseChaptersWorkbook(buffer, parseOptions);
      return withTransaction(async (tx) => applyChaptersImport(
        { queryAll: tx.queryAll, execute: tx.execute },
        parsed,
        {
          dryRun: false,
          syncReperes: !!options.syncReperes,
          syncZones: !!options.syncZones,
          createdBy: options.createdBy ?? null,
        }
      ));
    }
    case 'chapter_charte': {
      const { rows } = parseChapterCharteWorkbook(buffer, parseOptions);
      return applyChapterCharteImport(deps, rows, { dryRun: false });
    }
    case 'lore_feuillets': {
      const parsed = parseFeuilletsWorkbook(buffer, parseOptions);
      return applyFeuilletsImport(deps, parsed, { dryRun: false });
    }
    default:
      throw bulkError(`Import catalogue non supporté pour ${kind}`);
  }
}

async function analyzeFileEntry(deps, fileName, buffer) {
  const classification = classifyContentFile(fileName, buffer);
  const entry = buildEntryBase(fileName, buffer, classification);
  if (entry.kind === 'media') {
    try {
      entry.preview = previewMediaFromBuffer(buffer, entry.mimeType, fileName);
      entry.canApply = true;
    } catch (err) {
      entry.error = err.message || 'Analyse média impossible';
      entry.canApply = false;
    }
    return entry;
  }
  if (!entry.canApply) return entry;
  try {
    entry.preview = await dryRunCatalogImport(deps, entry.kind, buffer);
  } catch (err) {
    entry.error = err.message || 'Analyse import impossible';
    entry.canApply = false;
  }
  return entry;
}

function buildSummary(entries) {
  const summary = {
    total: entries.length,
    byKind: {},
    errors: entries.filter((entry) => entry.error).length,
    applyable: entries.filter((entry) => entry.canApply && !entry.error).length,
  };
  for (const entry of entries) {
    summary.byKind[entry.kind] = (summary.byKind[entry.kind] || 0) + 1;
  }
  return summary;
}

function normalizeIncomingFilesJson(body = {}) {
  const archive = body.archive;
  if (archive && (archive.fileDataBase64 || archive.fileData || archive.buffer)) {
    const buffer = archive.buffer || decodeBase64Payload(archive.fileDataBase64 || archive.fileData);
    return extractZipEntries(buffer);
  }
  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) throw bulkError('files[] ou archive requis');
  if (files.length > MAX_FILE_COUNT) {
    throw bulkError(`Trop de fichiers (max ${MAX_FILE_COUNT})`);
  }
  return files.map((file, index) => {
    const fileName = asTrimmedString(file.fileName) || `fichier-${index + 1}`;
    const buffer = file.buffer || decodeBase64Payload(file.fileDataBase64 || file.fileData);
    if (buffer.length > MAX_FILE_BYTES && isSpreadsheetFile(fileName, buffer)) {
      throw bulkError(`${fileName} : fichier trop volumineux (max ${formatImportMaxFileLabel(MAX_FILE_BYTES)})`);
    }
    return { fileName, buffer };
  });
}

function resolveIncomingFileList(uploadPayload = {}) {
  if (!uploadPayload.transport) {
    return normalizeIncomingFilesJson(uploadPayload);
  }
  if (uploadPayload.transport === 'multipart') {
    if (uploadPayload.archive?.buffer) {
      return extractZipEntries(uploadPayload.archive.buffer);
    }
    const uploadedFiles = Array.isArray(uploadPayload.uploadedFiles) ? uploadPayload.uploadedFiles : [];
    if (uploadedFiles.length === 0) throw bulkError('files[] ou archive requis');
    if (uploadedFiles.length > MAX_FILE_COUNT) {
      throw bulkError(`Trop de fichiers (max ${MAX_FILE_COUNT})`);
    }
    return uploadedFiles.map((file, index) => {
      const fileName = asTrimmedString(file.fileName) || `fichier-${index + 1}`;
      const buffer = file.buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw bulkError(`${fileName} : fichier vide`);
      }
      if (buffer.length > MAX_FILE_BYTES && isSpreadsheetFile(fileName, buffer)) {
        throw bulkError(`${fileName} : fichier trop volumineux (max ${formatImportMaxFileLabel(MAX_FILE_BYTES)})`);
      }
      return { fileName, buffer };
    });
  }
  const body = uploadPayload.transport === 'json' ? (uploadPayload.body || {}) : uploadPayload;
  return normalizeIncomingFilesJson(body);
}

async function analyzeContentLibraryBulk(deps, uploadPayload = {}) {
  const incoming = resolveIncomingFileList(uploadPayload);
  const entries = [];
  for (const file of incoming) {
    entries.push(await analyzeFileEntry(deps, file.fileName, file.buffer));
  }
  return { entries, summary: buildSummary(entries) };
}

async function applyContentLibraryBulk(deps, uploadPayload = {}, options = {}) {
  const isLegacyPayload = !uploadPayload.transport;
  const body = uploadPayload.transport === 'json' || isLegacyPayload
    ? (isLegacyPayload ? uploadPayload : (uploadPayload.body || {}))
    : uploadPayload;
  const entriesInput = Array.isArray(uploadPayload.entries)
    ? uploadPayload.entries
    : (Array.isArray(body.entries) ? body.entries : []);
  if (entriesInput.length === 0) throw bulkError('entries requis');
  if (entriesInput.length > MAX_FILE_COUNT) {
    throw bulkError(`Trop de fichiers à appliquer (max ${MAX_FILE_COUNT})`);
  }

  let archiveFileMap = null;
  let uploadedFileMap = null;
  if (uploadPayload.transport === 'multipart') {
    if (uploadPayload.archive?.buffer) {
      const extracted = extractZipEntries(uploadPayload.archive.buffer);
      archiveFileMap = new Map(extracted.map((file) => [file.fileName, file.buffer]));
    }
    if (Array.isArray(uploadPayload.uploadedFiles) && uploadPayload.uploadedFiles.length > 0) {
      uploadedFileMap = new Map(uploadPayload.uploadedFiles.map((file) => [file.fileName, file.buffer]));
    }
  } else if (body.archive && (body.archive.fileDataBase64 || body.archive.fileData)) {
    const extracted = extractZipEntries(decodeBase64Payload(body.archive.fileDataBase64 || body.archive.fileData));
    archiveFileMap = new Map(extracted.map((file) => [file.fileName, file.buffer]));
  }

  const results = [];
  for (const item of entriesInput) {
    const fileName = asTrimmedString(item.fileName) || 'fichier';
    const kind = asTrimmedString(item.kind);
    const itemOptions = item.options && typeof item.options === 'object' ? item.options : {};
    const result = { fileName, kind, ok: false, error: null, result: null };
    try {
      let buffer = null;
      if (archiveFileMap) {
        buffer = archiveFileMap.get(fileName);
        if (!buffer) throw bulkError(`Fichier introuvable dans l'archive : ${fileName}`);
      } else if (uploadedFileMap?.has(fileName)) {
        buffer = uploadedFileMap.get(fileName);
      } else {
        buffer = decodeBase64Payload(item.fileDataBase64 || item.fileData);
      }
      if (kind === 'media') {
        result.result = saveMediaFromBuffer(buffer, item.mimeType || null, fileName, { skipManifestSync: true });
        result.ok = true;
      } else if (KIND_META[kind]?.subTab || ['chapter_charte', 'lore_feuillets', 'lore_glossary'].includes(kind)) {
        result.result = await applyCatalogImport(deps, kind, buffer, {
          ...itemOptions,
          createdBy: options.createdBy ?? null,
        });
        result.ok = true;
      } else {
        throw bulkError(`Nature non applicable : ${kind || 'inconnue'}`);
      }
    } catch (err) {
      result.error = err.message || 'Application impossible';
      if (Number.isFinite(err?.status)) result.status = err.status;
    }
    results.push(result);
  }

  const mediaApplied = results.some((row) => row.ok && row.kind === 'media');
  let assetManifest = null;
  if (mediaApplied) {
    assetManifest = syncAssetManifests();
  }

  return {
    results,
    summary: {
      total: results.length,
      applied: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
    },
    assetManifest,
  };
}

module.exports = {
  MAX_ARCHIVE_BYTES,
  MAX_FILE_BYTES,
  MAX_DECOMPRESSED_BYTES,
  MAX_FILE_COUNT,
  KIND_META,
  classifyContentFile,
  extractZipEntries,
  decodeBase64Payload,
  resolveIncomingFileList,
  analyzeContentLibraryBulk,
  applyContentLibraryBulk,
};
