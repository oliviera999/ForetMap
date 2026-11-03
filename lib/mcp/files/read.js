'use strict';

/**
 * Lecture seule des fichiers du serveur pour le connecteur MCP : liste, lecture (offset/limit
 * ou fin de fichier), recherche bornée. Racines et anti-traversée : `roots.js`.
 *
 * Garde-fous, **sans dérogation** :
 * - fichier **binaire** refusé (octet nul ou plus de 10 % de caractères de contrôle dans les
 *   8 premiers ko), comme les archives (`.gz`, `.zip`…) ;
 * - fichier d'**environnement** (`.env`, `.env.*`, `.my.cnf`, `.npmrc`…) : seuls les **noms**
 *   de variables sont transmis (`CLE=****`) ;
 * - fichier de **clé ou de certificat** (`.pem`, `.key`, `id_rsa`…) : contenu jamais transmis ;
 * - tout autre contenu passe par `logSanitizer.cleanLogText` : secrets reconnaissables
 *   (jetons, `Bearer`, mot de passe dans une URL, `NOM_SECRET=valeur`), e-mails, hachages
 *   masqués ; dans les journaux, littéraux cités, identifiants et IP pseudonymisés ;
 * - tailles bornées : lecture de 2 Mo au plus par fichier (fin de fichier pour `tail`),
 *   500 lignes et 200 000 caractères au plus par réponse, recherche sur 300 fichiers au plus,
 *   200 résultats au plus, motif de 200 caractères au plus et délai de recherche borné.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createLogSanitizer } = require('../logSanitizer');
const { isEnvLikeFile, isKeyFile, maskEnvContent } = require('../secretMask');
const { McpFileAccessError, PINO_ROOT, getFileRoots, resolveInRoot } = require('./roots');

const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 500;
const MAX_LINE_CHARS = 2000;
const MAX_LIST_ENTRIES = 500;
const MAX_GREP_FILES = 300;
const MAX_GREP_RESULTS = 200;
const MAX_GREP_MS = 3000;
const BINARY_EXT_RE =
  /\.(?:gz|tgz|zip|7z|bz2|xz|tar|enc|png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf|mp3|mp4|webm|ogg|wav|sqlite3?|db|bin|exe|so|dylib|node|wasm)$/i;
/** Dossiers jamais parcourus (volumineux ou hors sujet). */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'uploads', 'backups']);

/** Une racine « journal » (texte libre) ou « source » (dépôt) ? */
function isLogRoot(root) {
  return (
    ['logs', 'startup', 'startup-diag', 'passenger'].includes(root.name) ||
    /\.log$|\.ndjson$/.test(root.real)
  );
}

function looksBinary(buf) {
  if (!buf.length) return false;
  let ctrl = 0;
  for (const byte of buf) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) ctrl += 1;
  }
  return ctrl / buf.length > 0.1;
}

/** Classe le fichier : `env`, `key`, `binary` ou `text`. */
function classify(real) {
  const base = path.basename(real);
  if (isKeyFile(base)) return 'key';
  if (isEnvLikeFile(base)) return 'env';
  if (BINARY_EXT_RE.test(base)) return 'binary';
  const fd = fs.openSync(real, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return looksBinary(buf.subarray(0, n)) ? 'binary' : 'text';
  } finally {
    fs.closeSync(fd);
  }
}

function readSlice(real, size, { tail }) {
  const len = Math.min(size, MAX_READ_BYTES);
  const start = tail ? size - len : 0;
  const fd = fs.openSync(real, 'r');
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, start);
    let text = buf.subarray(0, n).toString('utf8');
    // Début coupé au milieu d'une ligne (lecture de fin) : la première ligne partielle tombe.
    if (tail && start > 0) text = text.slice(text.indexOf('\n') + 1);
    return { text, partial: size > len, startByte: start };
  } finally {
    fs.closeSync(fd);
  }
}

function makeCleaner(root) {
  const { cleanLogText } = createLogSanitizer();
  const logLike = isLogRoot(root);
  return (line) =>
    cleanLogText(line, {
      maxChars: MAX_LINE_CHARS,
      quotes: logLike,
      identifiers: logLike,
    });
}

/** Racines disponibles, ou contenu d'un dossier. */
function listFiles({ root: rootName, path: rel = '', recursive = false } = {}) {
  if (!rootName) {
    const { roots, missing } = getFileRoots();
    return {
      roots: [
        ...roots.map((r) => ({ name: r.name, kind: r.kind, description: r.description })),
        {
          name: PINO_ROOT,
          kind: 'virtual',
          description: 'Tampon Pino en mémoire (foretmap_read_file root="pino")',
        },
      ],
      missing: missing.length ? missing : undefined,
      hint: 'foretmap_list_files avec root (et path) pour le contenu d’un dossier ; foretmap_read_file pour lire.',
    };
  }
  if (rootName === PINO_ROOT) {
    const { getBufferedLineCount, getMaxLines } = require('../../logBuffer');
    return {
      root: PINO_ROOT,
      entries: [
        { name: 'buffer', type: 'virtual', lines: getBufferedLineCount(), maxLines: getMaxLines() },
      ],
    };
  }
  const { root, real, rel: relOut } = resolveInRoot(rootName, rel);
  const st = fs.statSync(real);
  const describe = (p, name, depth = 0) => {
    let s;
    try {
      s = fs.lstatSync(p);
    } catch {
      return null;
    }
    const type = s.isSymbolicLink() ? 'symlink' : s.isDirectory() ? 'dir' : 'file';
    return {
      name,
      type,
      size: type === 'file' ? s.size : undefined,
      modified: s.mtime.toISOString(),
      depth: depth || undefined,
    };
  };
  if (!st.isDirectory()) {
    return { root: root.name, entries: [describe(real, path.basename(real))] };
  }
  const entries = [];
  let truncated = false;
  const walk = (dir, prefix, depth) => {
    let names;
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (entries.length >= MAX_LIST_ENTRIES) {
        truncated = true;
        return;
      }
      if (SKIP_DIRS.has(name)) continue;
      const p = path.join(dir, name);
      const e = describe(p, prefix ? `${prefix}/${name}` : name, depth);
      if (!e) continue;
      entries.push(e);
      if (recursive && e.type === 'dir' && depth < 4) walk(p, e.name, depth + 1);
    }
  };
  walk(real, '', 0);
  return { root: root.name, path: relOut, entries, truncated: truncated || undefined };
}

/**
 * Lit un fichier : lignes `offset`…`offset+limit` (1-indexées), ou les `tail` dernières.
 * @param {{ root: string, path?: string, offset?: number, limit?: number, tail?: number }} args
 */
function readFile(args) {
  if (args.root === PINO_ROOT) return readPino(args);
  const { root, real, rel } = resolveInRoot(args.root, args.path || '');
  const st = fs.statSync(real);
  if (!st.isFile()) throw new McpFileAccessError('Ce chemin est un dossier : foretmap_list_files');
  const kind = classify(real);
  if (kind === 'binary') {
    throw new McpFileAccessError('Fichier binaire : lecture refusée', 'MCP_FILE_BINARY');
  }
  if (kind === 'key') {
    return {
      root: root.name,
      path: rel,
      size: st.size,
      masked: 'key',
      content: '[fichier de clé ou de certificat : contenu jamais transmis]',
    };
  }
  const limit = Math.min(MAX_LINES, Math.max(1, args.limit ?? (args.tail ? args.tail : 200)));
  const tailMode = Number.isInteger(args.tail) && args.tail > 0;
  const { text, partial } = readSlice(real, st.size, { tail: tailMode });
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let from;
  let selected;
  if (tailMode) {
    const n = Math.min(args.tail, MAX_LINES);
    selected = lines.slice(-n);
    from = null;
  } else {
    from = Math.max(1, args.offset ?? 1);
    selected = lines.slice(from - 1, from - 1 + limit);
  }
  let content;
  if (kind === 'env') {
    content = maskEnvContent(selected.join('\n'));
  } else {
    const clean = makeCleaner(root);
    content = selected.map(clean).join('\n');
  }
  const out = {
    root: root.name,
    path: rel,
    size: st.size,
    modified: st.mtime.toISOString(),
    masked: kind === 'env' ? 'env (noms de variables seulement)' : undefined,
    total_lines: partial ? undefined : lines.length,
    partial: partial || undefined,
    from_line: from ?? undefined,
    returned_lines: selected.length,
    content,
  };
  if (!tailMode && from - 1 + selected.length < lines.length) {
    out.next_offset = from + selected.length;
  }
  if (partial) {
    out.note = tailMode
      ? `Fichier de plus de ${MAX_READ_BYTES / 1024 / 1024} Mo : seule la fin a été lue.`
      : `Fichier de plus de ${MAX_READ_BYTES / 1024 / 1024} Mo : seul le début est lisible par offset ; utiliser tail pour la fin.`;
  }
  return out;
}

function readPino(args) {
  const { tailLogLines, getBufferedLineCount } = require('../../logBuffer');
  const n = Math.min(MAX_LINES, Math.max(1, args.tail ?? args.limit ?? 200));
  const { sanitizeLogLine } = createLogSanitizer();
  const entries = tailLogLines(n).map(sanitizeLogLine);
  return {
    root: PINO_ROOT,
    returned_lines: entries.length,
    buffer_lines: getBufferedLineCount(),
    entries,
    note: 'Tampon Pino en mémoire : liste blanche de champs, comme foretmap_tail_logs.',
  };
}

function compilePattern(pattern, { regex = false, ignoreCase = true } = {}) {
  const p = String(pattern || '');
  if (!p || p.length > 200)
    throw new McpFileAccessError('Motif vide ou trop long (200 caractères au plus)');
  if (!regex) {
    return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ignoreCase ? 'i' : '');
  }
  // Motifs à backtracking catastrophique les plus courants : quantificateur appliqué à un
  // groupe déjà quantifié (`(a+)+`, `(.*)*`), références arrière.
  if (/\([^)]*[+*][^)]*\)\s*[+*{]/.test(p) || /\\[1-9]/.test(p)) {
    throw new McpFileAccessError('Motif refusé (quantificateurs imbriqués ou référence arrière)');
  }
  try {
    return new RegExp(p, ignoreCase ? 'i' : '');
  } catch {
    throw new McpFileAccessError('Expression régulière invalide');
  }
}

/**
 * Recherche un motif dans les fichiers texte d'une racine (récursif, borné).
 * @param {{ root: string, path?: string, pattern: string, regex?: boolean, ignore_case?: boolean, glob?: string, max_results?: number }} args
 */
function grepFiles(args) {
  if (args.root === PINO_ROOT) {
    throw new McpFileAccessError('Le tampon Pino se lit avec foretmap_read_file (root « pino »)');
  }
  const re = compilePattern(args.pattern, {
    regex: !!args.regex,
    ignoreCase: args.ignore_case !== false,
  });
  const maxResults = Math.min(MAX_GREP_RESULTS, Math.max(1, args.max_results ?? 50));
  const nameFilter = args.glob
    ? new RegExp(
        `^${String(args.glob)
          .slice(0, 60)
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')}$`,
        'i',
      )
    : null;
  const { root, real } = resolveInRoot(args.root, args.path || '');
  const clean = makeCleaner(root);
  const started = Date.now();
  const results = [];
  let scanned = 0;
  let skipped = 0;
  let truncated = false;
  const files = [];
  const collect = (p, depth) => {
    if (files.length >= MAX_GREP_FILES) {
      truncated = true;
      return;
    }
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) {
      // Suivi seulement si la cible reste dans la racine (même règle que la lecture).
      try {
        const target = fs.realpathSync(p);
        const { isInside } = require('./roots');
        if (!isInside(root.real, target)) return;
        st = fs.statSync(target);
        p = target;
      } catch {
        return;
      }
    }
    if (st.isDirectory()) {
      if (depth > 6) return;
      for (const name of fs.readdirSync(p).sort()) {
        if (!SKIP_DIRS.has(name)) collect(path.join(p, name), depth + 1);
      }
    } else if (st.isFile() && (!nameFilter || nameFilter.test(path.basename(p)))) {
      files.push(p);
    }
  };
  collect(real, 0);
  for (const file of files) {
    if (results.length >= maxResults || Date.now() - started > MAX_GREP_MS) {
      truncated = true;
      break;
    }
    let kind;
    try {
      kind = classify(file);
    } catch {
      continue;
    }
    if (kind !== 'text') {
      skipped += 1;
      continue;
    }
    scanned += 1;
    const size = fs.statSync(file).size;
    // Journal de plus de 2 Mo : seule la fin est parcourue, numéros de ligne alors inconnus.
    const { text, partial } = readSlice(file, size, { tail: isLogRoot(root) });
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      // Recherche sur la ligne déjà nettoyée : un secret masqué ne se retrouve pas par motif.
      const line = clean(lines[i]);
      if (re.test(line)) {
        results.push({
          file: path.relative(root.real, file) || path.basename(file),
          line: partial ? null : i + 1,
          text: line.slice(0, 500),
        });
        if (results.length >= maxResults) break;
      }
    }
  }
  return {
    root: root.name,
    pattern: String(args.pattern),
    files_scanned: scanned,
    files_skipped: skipped || undefined,
    count: results.length,
    truncated: truncated || undefined,
    results,
    note: skipped
      ? 'Fichiers binaires, de clés et d’environnement exclus de la recherche (lire un .env avec foretmap_read_file : noms seulement).'
      : undefined,
  };
}

module.exports = {
  MAX_LINES,
  MAX_READ_BYTES,
  classify,
  grepFiles,
  listFiles,
  looksBinary,
  readFile,
};
