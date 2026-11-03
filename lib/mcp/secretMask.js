'use strict';

/**
 * Masquage et détection des secrets pour les outils d'exploitation du connecteur MCP
 * (`foretmap_read_file`, `foretmap_grep_files`, `foretmap_cron_status`, `foretmap_remember`).
 *
 * Deux usages :
 * - **masquer** (`maskSecrets`, `maskEnvContent`) : ce qui sort vers Claude ne contient jamais
 *   la valeur d'un secret reconnaissable ;
 * - **détecter** (`findSecretLike`) : `foretmap_remember` refuse une note qui ressemble à un
 *   secret ou à une donnée personnelle évidente.
 *
 * Formats de jetons inspirés des règles de gitleaks (https://github.com/gitleaks/gitleaks,
 * licence MIT), déjà reprises par `scripts/check-sensitive-files.js` ; réécrits ici (aucun code
 * copié), étendus aux formes vues dans des journaux : en-tête `Bearer`, mot de passe dans une
 * URL, paramètre de requête `token=` / `password=`, affectation `CLE_SECRETE=valeur`.
 */

const { scrubString } = require('./sqlGuard');

const MASK = '****';

/** Noms de variables ou de paramètres dont la valeur est un secret. */
const SENSITIVE_NAME_RE =
  /(?:pass(?:word|wd|phrase)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|credential|auth(?:orization)?|cookie|session|signature|salt|dsn|_key$|^key$)/i;

/** Jetons de formats connus (masqués où qu'ils apparaissent). */
const TOKEN_PATTERNS = Object.freeze([
  // Bloc de clé privée complet (PEM), y compris sur plusieurs lignes.
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/g,
  /\bGOCSPX-[A-Za-z0-9_-]{24,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[0-9A-Za-z-]{10,}/g,
  /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}|[sr]k_live_[A-Za-z0-9]{20,})/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bfmcp_(?:at|rt|ac)_[A-Za-z0-9_-]{16,}/g,
  /\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{20,}/g,
]);

/** `Authorization: Bearer xxx`, `Basic xxx`. */
const AUTH_HEADER_RE = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
/** Identifiants dans une URL : `scheme://user:motdepasse@hôte`. */
const URL_CREDENTIALS_RE = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi;
/** Paramètre de requête ou de formulaire sensible : `?token=…`, `&password=…`. */
const QUERY_PARAM_RE = /([?&;](?:[A-Za-z0-9_.-]*)=)([^&\s#"']+)/g;
/**
 * Affectation `NOM=valeur` / `NOM: valeur` / `"nom": "valeur"` dont le nom **contient** un mot
 * sensible. Seuls ces noms sont candidats : une affectation ordinaire qui précède
 * (`admin : password=…`) ne doit pas « consommer » la suite et la soustraire au masquage.
 */
const SENSITIVE_CORE =
  'pass(?:word|wd|phrase)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|credential|auth|cookie|session|signature|salt|dsn|key';
const ASSIGNMENT_RE = new RegExp(
  `((?:^|[\\s,{;(?&])["']?([A-Za-z0-9_.-]{0,40}(?:${SENSITIVE_CORE})[A-Za-z0-9_.-]{0,40})["']?\\s*(?:=|:)\\s*)("[^"\\n]*"|'[^'\\n]*'|[^\\s,;}&]+)`,
  'gi',
);
/** Préfixe d'un en-tête d'authentification : la valeur suit, déjà masquée par AUTH_HEADER_RE. */
const AUTH_SCHEME_RE = /^(?:Bearer|Basic|Token)$/i;

/**
 * Masque les secrets reconnaissables d'un texte (journal, script, documentation).
 * E-mails, hachages et jetons du site sont aussi masqués (`scrubString`).
 * @param {string} text
 * @returns {string}
 */
function maskSecrets(text) {
  let out = String(text ?? '');
  for (const re of TOKEN_PATTERNS) out = out.replace(re, '[secret masqué]');
  out = out
    .replace(AUTH_HEADER_RE, (m, kind) => `${kind} ${MASK}`)
    .replace(URL_CREDENTIALS_RE, (m, prefix) => `${prefix}:${MASK}@`)
    .replace(QUERY_PARAM_RE, (m, head) => {
      const name = head.slice(1, -1);
      return SENSITIVE_NAME_RE.test(name) || /^code$/i.test(name) ? `${head}${MASK}` : m;
    })
    .replace(ASSIGNMENT_RE, (m, head, name, value) => {
      if (!SENSITIVE_NAME_RE.test(name)) return m;
      if (value === MASK || /^\[.*masqu/.test(value) || AUTH_SCHEME_RE.test(value)) return m;
      return `${head}${MASK}`;
    });
  return scrubString(out);
}

/** Fichier d'environnement ou de configuration à secrets (`.env`, `.env.example`, `.my.cnf`…). */
function isEnvLikeFile(basename) {
  const b = String(basename || '').toLowerCase();
  return (
    /(?:^|\.)env(?:\.|$)/.test(b) ||
    ['.my.cnf', 'my.cnf', '.npmrc', '.netrc', '.pgpass', '.htpasswd', '.git-credentials'].includes(
      b,
    )
  );
}

/** Fichier de clé ou de certificat : contenu jamais transmis. */
function isKeyFile(basename) {
  const b = String(basename || '').toLowerCase();
  return (
    /\.(?:pem|key|p12|pfx|jks|keystore|der|asc|gpg|ppk)$/.test(b) ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/.test(b) ||
    /(?:^|[._-])(?:secret|credentials?)(?:[._-]|$)/.test(b)
  );
}

/**
 * Contenu d'un fichier d'environnement : **seuls les noms** de variables restent visibles
 * (`NOM=****`), sans dérogation ; commentaires et lignes libres sont masqués aussi (un
 * commentaire `# ancien mot de passe : …` fuirait sinon).
 * @param {string} text
 * @returns {string}
 */
function maskEnvContent(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const commented = /^#\s*/.exec(trimmed);
      const body = commented ? trimmed.slice(commented[0].length) : trimmed;
      // Ligne commentée : variable désactivée (`# NOM=…`) seulement si elle en a la forme
      // stricte ; tout autre commentaire (`# ancien : …`) est masqué en entier.
      const m = commented
        ? /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/.exec(body)
        : /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]/.exec(body);
      if (m) return `${commented ? '# ' : ''}${m[1]}=${MASK}`;
      if (/^\[[^\]]+\]$/.test(trimmed)) return trimmed; // section `[client]` d'un .my.cnf
      return commented ? '# [commentaire masqué]' : '[ligne masquée]';
    })
    .join('\n');
}

/**
 * Le texte ressemble-t-il à un secret ou à une donnée personnelle évidente ?
 * @param {string} text
 * @returns {string|null} raison du refus, ou `null`
 */
function findSecretLike(text) {
  const s = String(text ?? '');
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s)) return 'adresse e-mail';
  for (const re of TOKEN_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(s)) {
      re.lastIndex = 0;
      return 'jeton, clé ou hachage reconnaissable';
    }
  }
  AUTH_HEADER_RE.lastIndex = 0;
  if (AUTH_HEADER_RE.test(s)) return 'en-tête d’authentification';
  URL_CREDENTIALS_RE.lastIndex = 0;
  if (URL_CREDENTIALS_RE.test(s)) return 'mot de passe dans une URL';
  for (const m of s.matchAll(ASSIGNMENT_RE)) {
    const value = m[3].replace(/^["']|["']$/g, '');
    if (
      SENSITIVE_NAME_RE.test(m[2]) &&
      value &&
      value !== MASK &&
      !AUTH_SCHEME_RE.test(value) &&
      !/^[<….[]/.test(value)
    ) {
      return `valeur affectée à « ${m[2]} »`;
    }
  }
  // Longue suite aléatoire (clé, jeton opaque) : 32 caractères ou plus, majuscules, minuscules
  // et chiffres mêlés, entropie élevée. Un chemin (`migrations/325_mcp_exploitation`), un UUID
  // ou une empreinte de commit ne sont pas visés.
  for (const m of s.matchAll(/[A-Za-z0-9+/_=-]{32,}/g)) {
    const w = m[0];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w)) continue;
    if (/^[0-9a-f]{40}$/i.test(w)) continue;
    if (/\d/.test(w) && /[A-Z]/.test(w) && /[a-z]/.test(w) && shannonEntropy(w) >= 4) {
      return 'longue suite aléatoire (clé ou jeton probable)';
    }
  }
  return null;
}

/** Entropie de Shannon (bits par caractère). */
function shannonEntropy(w) {
  const counts = new Map();
  for (const c of w) counts.set(c, (counts.get(c) || 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / w.length;
    h -= p * Math.log2(p);
  }
  return h;
}

module.exports = {
  MASK,
  SENSITIVE_NAME_RE,
  findSecretLike,
  isEnvLikeFile,
  isKeyFile,
  maskEnvContent,
  maskSecrets,
};
