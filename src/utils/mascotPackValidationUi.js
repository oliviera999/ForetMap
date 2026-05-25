/**
 * Helpers UI pour transformer les erreurs Zod du pack mascotte
 * en messages lisibles/actionnables.
 */

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
  return issues.map((it) => `• ${it.path} : ${it.message}`);
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
