import { formatBytesLabel } from '../services/apiGLUpload.js';

export const DEFAULT_CONTENT_LIBRARY_LIMITS = {
  maxArchiveBytes: 50 * 1024 * 1024,
  maxFileBytes: 32 * 1024 * 1024,
  maxDecompressedBytes: 100 * 1024 * 1024,
  maxFileCount: 200,
};

export const ANALYZE_UPLOAD_CONCURRENCY = 3;

export function isZipFile(file) {
  return /\.zip$/i.test(String(file?.name || ''));
}

export function resolveSelectionMode(files = []) {
  const list = Array.from(files || []).filter(Boolean);
  if (list.length === 0) return { mode: 'empty', files: [], zipFile: null, ignoredCount: 0 };
  const zipFiles = list.filter(isZipFile);
  if (zipFiles.length > 0) {
    const zipFile = zipFiles[0];
    const ignoredCount = list.length - 1;
    return { mode: 'archive', files: [zipFile], zipFile, ignoredCount };
  }
  return { mode: 'files', files: list, zipFile: null, ignoredCount: 0 };
}

export function validateContentLibrarySelection(
  files = [],
  limits = DEFAULT_CONTENT_LIBRARY_LIMITS,
) {
  const resolved = resolveSelectionMode(files);
  const errors = [];
  const warnings = [];

  if (resolved.mode === 'empty') {
    errors.push('Sélectionnez au moins un fichier.');
    return { ok: false, errors, warnings, resolved };
  }

  if (resolved.ignoredCount > 0) {
    warnings.push(
      `Archive ZIP détectée : les ${resolved.ignoredCount} autre(s) fichier(s) seront ignorés pour l’analyse.`,
    );
  }

  if (resolved.files.length > limits.maxFileCount) {
    errors.push(`Trop de fichiers (max ${limits.maxFileCount}).`);
  }

  for (const file of resolved.files) {
    const maxBytes = resolved.mode === 'archive' ? limits.maxArchiveBytes : limits.maxFileBytes;
    const maxLabel = formatBytesLabel(maxBytes);
    if (file.size > maxBytes) {
      errors.push(`${file.name} : fichier trop volumineux (max ${maxLabel}).`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    resolved,
  };
}

export async function runPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const results = new Array(list.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(list[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, list.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

export function findSelectedSourceFile(selectedFiles = [], entry = {}) {
  const preferred = asTrimmedString(entry.sourceFileName) || asTrimmedString(entry.fileName);
  if (!preferred) return null;
  return (
    selectedFiles.find((file) => file.name === preferred) ||
    selectedFiles.find((file) => file.name === entry.fileName) ||
    null
  );
}

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function mergeAnalyzeResponses(responses = [], sourceFiles = []) {
  const entries = [];
  for (let index = 0; index < responses.length; index += 1) {
    const response = responses[index];
    const sourceFileName = sourceFiles[index]?.name;
    if (!Array.isArray(response?.entries)) continue;
    for (const entry of response.entries) {
      entries.push({
        ...entry,
        sourceFileName: sourceFileName || entry.fileName,
      });
    }
  }
  const summary = {
    total: entries.length,
    applyable: entries.filter((entry) => entry.canApply && !entry.error).length,
    errors: entries.filter((entry) => entry.error).length,
    byKind: {},
  };
  for (const entry of entries) {
    summary.byKind[entry.kind] = (summary.byKind[entry.kind] || 0) + 1;
  }
  return { entries, summary };
}
