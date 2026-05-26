/**
 * Helpers UI pour transformer les erreurs Zod du pack mascotte
 * en messages lisibles/actionnables.
 */

/**
 * @param {unknown} values
 * @returns {string[]}
 */
export function sanitizeFrameEntries(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

/**
 * Assainit un brouillon d'édition pour validation/sauvegarde:
 * - supprime les entrées vides dans files/srcs
 * - évite les modes mixtes files+srcs
 * - supprime les états sans images utiles
 *
 * @param {Record<string, unknown>} pack
 * @returns {Record<string, unknown>}
 */
export function sanitizeMascotPackDraft(pack) {
  if (!pack || typeof pack !== 'object') return {};
  const next = { ...pack };
  const rawStates = next.stateFrames && typeof next.stateFrames === 'object' && !Array.isArray(next.stateFrames)
    ? next.stateFrames
    : {};
  const cleanedStates = {};
  for (const [stateKey, rawSpec] of Object.entries(rawStates)) {
    if (!rawSpec || typeof rawSpec !== 'object') continue;
    const spec = { ...rawSpec };
    const hasSrcMode = Object.prototype.hasOwnProperty.call(spec, 'srcs');
    const hasFileMode = Object.prototype.hasOwnProperty.call(spec, 'files');
    const srcs = sanitizeFrameEntries(spec.srcs);
    const files = sanitizeFrameEntries(spec.files);
    const cleaned = {
      ...spec,
      fps: Math.max(1, Number(spec.fps) || 8),
    };
    delete cleaned.srcs;
    delete cleaned.files;

    if (hasSrcMode && !hasFileMode) {
      if (srcs.length === 0) continue;
      cleaned.srcs = srcs;
    } else if (!hasSrcMode && hasFileMode) {
      if (files.length === 0) continue;
      cleaned.files = files;
      if (Array.isArray(cleaned.frameDwellMs)) {
        const dwell = cleaned.frameDwellMs
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v >= 16 && v <= 60_000);
        if (dwell.length === files.length) cleaned.frameDwellMs = dwell;
        else delete cleaned.frameDwellMs;
      }
    } else {
      // Draft ambivalent: garder la source la plus utile.
      if (srcs.length > 0) {
        cleaned.srcs = srcs;
      } else if (files.length > 0) {
        cleaned.files = files;
      } else {
        continue;
      }
    }
    cleanedStates[stateKey] = cleaned;
  }
  next.stateFrames = cleanedStates;
  return next;
}

/**
 * @param {unknown} details
 * @returns {Array<{ path: string, message: string }>}
 */
export function extractMascotPackValidationIssues(details) {
  const issues = [];
  const pushIssue = (path, message) => {
    const msg = String(message || '').trim();
    if (!msg) return;
    issues.push({
      path: String(path || '').trim() || 'pack',
      message: msg,
    });
  };

  if (!details || typeof details !== 'object') return issues;

  // ZodError serialisée: { issues: [...] }
  const zodIssues = Array.isArray(details.issues) ? details.issues : null;
  if (zodIssues) {
    for (const it of zodIssues) {
      const path = Array.isArray(it?.path) ? it.path.map(String).join('.') : 'pack';
      pushIssue(path, it?.message);
    }
    return dedupeIssues(issues);
  }

  // format() Zod: objet imbriqué avec _errors
  walkFormattedIssueNode(details, '', pushIssue);
  return dedupeIssues(issues);
}

/**
 * @param {Array<{ path: string, message: string }>} issues
 * @returns {string[]}
 */
export function toMascotPackIssueLines(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return [];
  return issues.map((it) => `• ${it.path} : ${toFriendlyIssueMessage(it.path, it.message)}`);
}

/**
 * @param {unknown} node
 * @param {string} prefix
 * @param {(path: string, message: string) => void} onIssue
 */
function walkFormattedIssueNode(node, prefix, onIssue) {
  if (!node || typeof node !== 'object') return;
  const rootErrors = Array.isArray(node._errors) ? node._errors : [];
  for (const err of rootErrors) {
    onIssue(prefix || 'pack', err);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '_errors') continue;
    const next = prefix ? `${prefix}.${key}` : key;
    walkFormattedIssueNode(value, next, onIssue);
  }
}

/**
 * @param {Array<{ path: string, message: string }>} issues
 */
function dedupeIssues(issues) {
  const seen = new Set();
  const out = [];
  for (const issue of issues) {
    const sig = `${issue.path}::${issue.message}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(issue);
  }
  return out;
}

/**
 * @param {string} path
 * @param {string} message
 */
function toFriendlyIssueMessage(path, message) {
  const p = String(path || '');
  const msg = String(message || '');
  if (p.includes('stateFrames') && msg.includes('`srcs` ou `files` non vide')) {
    return 'Ajoutez au moins une image (fichier ou URL) pour cet état.';
  }
  if (p.includes('.srcs.') && /invalid input/i.test(msg)) {
    return 'URL vide ou invalide: saisissez une URL non vide ou retirez la ligne.';
  }
  if (msg.includes('Utiliser soit `srcs` soit `files`')) {
    return 'Choisissez un seul mode par état: fichiers relatifs OU URLs.';
  }
  return msg;
}
