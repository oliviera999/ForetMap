'use strict';

/**
 * Journaux et diagnostics transmis par le connecteur MCP (`foretmap_tail_logs`,
 * `foretmap_diagnostics`) : **liste blanche de champs** (contre-vérification de la PR #616, I2).
 *
 * La première version pseudonymisait les clés « qui ressemblent » à un identifiant de compte
 * (`userId`, `studentId`…) : toute clé imprévue passait (`newId`, `sourceId`, `teamId`,
 * `author`, `ctx.student.id`, `studentIds`…), ainsi que les identifiants placés dans un chemin
 * (`/api/gl/players/4217/journal`). On inverse donc la logique : **rien ne sort sauf ce qui est
 * nommé ici**, et le texte libre restant est nettoyé.
 *
 * Ligne de journal transmise — et rien d'autre :
 * - `level`, `time` (nombres), `requestId` (UUID généré par le serveur, sinon pseudonyme),
 *   `method` (verbe HTTP), `statusCode`, `durationMs` (nombres) ;
 * - `route` : le gabarit Express (`/api/tasks/:id/done`) seulement ; sans gabarit, `'autre'`
 *   — un chemin, même « normalisé », fuit (`/api/students/c04-mv/profile`,
 *   `/api/visit/zone-Lea_Martin` : troisième relecture) ;
 * - `msg` nettoyé ; `err.message` nettoyé ; `err.code` s'il est de la forme `ER_DUP_ENTRY`
 *   (ou un nombre), `err.type` s'il est un nom de classe d'erreur — sinon `'[valeur]'` ;
 *   ni pile, ni autre champ.
 *
 * Nettoyage du texte libre (`cleanText`) : e-mails, hachages et jetons masqués (`scrubString`),
 * littéraux entre apostrophes ou guillemets → `'[valeur]'` (`Duplicate entry 'lea.martin' for
 * key …` : la valeur en double est souvent une donnée personnelle ; une apostrophe d'élision,
 * précédée d'une lettre, n'ouvre pas de littéral), puis, en une seule passe, UUID (avec ou sans tirets) et suites hexadécimales de 16 caractères
 * ou plus → pseudonyme `id#xxxxxx`, adresses IPv4/IPv6 → `ip#xxxxxx`, nombres de 3 chiffres ou
 * plus → `[n]`. Le pseudonyme est un HMAC tronqué avec un **sel aléatoire tiré à chaque appel**
 * et jamais conservé : stable dans une réponse (corrélation), impossible à relier à un compte
 * ni d'un appel à l'autre.
 *
 * **Limite assumée** : un nom ou un pseudo écrit en clair dans le texte d'un message (`msg`,
 * `err.message`) ne peut pas être reconnu de façon sûre et n'est pas garanti absent. Les appels
 * `logger.*` du dépôt passent les identifiants en champs structurés (retirés ici), pas dans le
 * texte ; c'est la convention à tenir (`docs/MCP_REGISTRE_TRAITEMENT.md`).
 */

const crypto = require('node:crypto');
const net = require('node:net');
const { scrubString } = require('./sqlGuard');

const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const SERVER_REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_TEXT = 500;

// Une seule passe : un remplacement n'est jamais rescanné (un pseudonyme « id#123456 » ne
// redevient pas « id#[n] »). Ordre des alternatives = priorité.
const FREE_TEXT_RE = new RegExp(
  [
    '(?<uuid>\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b)',
    '(?<hex>\\b[0-9a-f]{16,}\\b)',
    '(?<ipv4>\\b(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}\\b)',
    // Candidat IPv6 (au moins deux « : »), confirmé par `net.isIP` : « 12:30:45 » reste intact.
    '(?<ipv6>[0-9a-f]*:[0-9a-f]*:[0-9a-f:.]*)',
    '(?<num>\\d{3,})',
  ].join('|'),
  'gi',
);

// Littéral SQL / texte cité : apostrophe ou guillemet qui ne suit pas une lettre ou un chiffre
// (une élision « l'outil » n'en ouvre pas).
const QUOTED_RE = /(?<![\p{L}\p{N}])'[^'\n]*'|(?<![\p{L}\p{N}])"[^"\n]*"/gu;
const ERROR_CODE_RE = /^[A-Z_0-9]{1,64}$/;
const ERROR_CLASS_RE = /^(?:[A-Z][A-Za-z]{0,48}Error|Error|DOMException|AggregateError)$/;
// Gabarit Express : segments littéraux, paramètres `:x`, jokers. Jamais de valeur.
const ROUTE_TEMPLATE_RE = /^\/[A-Za-z0-9_\-/:.*?()|]{0,200}$/;

/**
 * Gabarit de route transmis : celui d'Express (`req.route.path` préfixé de `baseUrl`, posé
 * par `lib/httpRequestLog.js`) ; `'autre'` si la ligne ne porte qu'un chemin.
 */
function routeOf(template, path) {
  if (typeof template === 'string' && ROUTE_TEMPLATE_RE.test(template)) return template;
  if (template != null || path != null) return 'autre';
  return undefined;
}

function createLogSanitizer() {
  const salt = crypto.randomBytes(16);
  const cache = new Map();
  const tag = (kind, value) => {
    const key = `${kind}:${value}`;
    if (!cache.has(key)) {
      const h = crypto.createHmac('sha256', salt).update(key).digest('hex').slice(0, 6);
      cache.set(key, `${kind}#${h}`);
    }
    return cache.get(key);
  };

  /** Texte libre : masquages puis identifiants, adresses et nombres longs remplacés. */
  function cleanText(text) {
    if (text == null) return undefined;
    const scrubbed = scrubString(String(text).slice(0, MAX_TEXT * 2)).replace(
      QUOTED_RE,
      "'[valeur]'",
    );
    const out = scrubbed.replace(FREE_TEXT_RE, (m, ...rest) => {
      const g = rest[rest.length - 1];
      if (g.uuid) return tag('id', m.toLowerCase().replace(/-/g, ''));
      if (g.hex) return tag('id', m.toLowerCase());
      if (g.ipv4) return tag('ip', m);
      if (g.ipv6) return net.isIP(m) === 6 ? tag('ip', m.toLowerCase()) : m;
      return '[n]';
    });
    return out.slice(0, MAX_TEXT);
  }

  /**
   * Ligne de journal **texte** lue sur disque (cron, Passenger, `startup.log`) par
   * `foretmap_read_file` / `foretmap_grep_files` : secrets reconnaissables masqués
   * (`secretMask.js` : jetons, `Bearer`, mot de passe dans une URL, `CLE=valeur`), e-mails,
   * littéraux cités, UUID / suites hexadécimales et adresses IP pseudonymisés comme ci-dessus.
   * Les nombres restent (horodatages, tailles, codes HTTP : sans eux un journal de cron est
   * illisible) ; la longueur d'une ligne est bornée à `maxChars`. Pour les fichiers source
   * (scripts, docs, migrations), `quotes: false` laisse les littéraux cités et
   * `identifiers: false` les UUID et adresses du texte (exemples de documentation) : seuls les
   * secrets, e-mails, hachages et jetons y sont masqués.
   */
  function cleanLogText(text, { maxChars = 2000, quotes = true, identifiers = true } = {}) {
    if (text == null) return '';
    const { maskSecrets } = require('./secretMask');
    let masked = maskSecrets(String(text).slice(0, maxChars * 2));
    // Journal : un littéral cité est souvent une donnée (`Duplicate entry 'lea.martin'`).
    // Source (scripts, docs, migrations) : les chaînes du code restent lisibles.
    if (quotes) masked = masked.replace(QUOTED_RE, "'[valeur]'");
    if (!identifiers) return masked.slice(0, maxChars);
    return masked
      .replace(FREE_TEXT_RE, (m, ...rest) => {
        const g = rest[rest.length - 1];
        if (g.uuid) return tag('id', m.toLowerCase().replace(/-/g, ''));
        if (g.hex) return /^\d+$/.test(m) ? m : tag('id', m.toLowerCase());
        if (g.ipv4) return tag('ip', m);
        if (g.ipv6) return net.isIP(m) === 6 ? tag('ip', m.toLowerCase()) : m;
        return m;
      })
      .slice(0, maxChars);
  }

  const iso = (v) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(v)
      ? v
      : undefined;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const bool = (v) => (typeof v === 'boolean' ? v : undefined);
  /** Mot technique court (verdict, statut, type d'évènement) : sinon nettoyé comme du texte. */
  const word = (v) => {
    if (v == null) return undefined;
    const s = String(v);
    return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(s) && !/\d{3,}/.test(s) ? s : cleanText(s);
  };

  function errorCode(v) {
    if (v == null) return undefined;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    return ERROR_CODE_RE.test(String(v)) ? String(v) : '[valeur]';
  }

  function errorClass(v) {
    if (v == null) return undefined;
    return ERROR_CLASS_RE.test(String(v)) ? String(v) : '[valeur]';
  }

  function requestId(v) {
    if (typeof v !== 'string' || !v) return undefined;
    return SERVER_REQUEST_ID_RE.test(v) ? v : tag('req', v);
  }

  /** Une entrée Pino (objet) réduite aux champs de la liste blanche. */
  function sanitizeLogEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { msg: cleanText(entry) };
    }
    const out = {
      level: num(entry.level),
      time: num(entry.time),
      msg: cleanText(entry.msg),
      requestId: requestId(entry.requestId),
      method: HTTP_METHODS.has(entry.method) ? entry.method : undefined,
      statusCode: num(entry.statusCode),
      durationMs: num(entry.durationMs),
      route: routeOf(entry.route, entry.path),
    };
    if (entry.err && typeof entry.err === 'object') {
      out.err = {
        type: errorClass(entry.err.type),
        code: errorCode(entry.err.code),
        message: cleanText(entry.err.message),
      };
    }
    return JSON.parse(JSON.stringify(out));
  }

  /** Ligne brute du tampon (JSON Pino attendu ; sinon texte nettoyé). */
  function sanitizeLogLine(line) {
    const text = String(line);
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return sanitizeLogEntry(parsed);
    } catch {
      /* ligne non JSON : traitée comme texte */
    }
    return { msg: cleanText(text) };
  }

  const httpSample = (s) => ({
    requestId: requestId(s?.requestId),
    method: HTTP_METHODS.has(s?.method) ? s.method : undefined,
    route: routeOf(s?.route, s?.path),
    statusCode: num(s?.statusCode),
    at: iso(s?.at),
  });
  const numbersOf = (obj, keys) =>
    Object.fromEntries(keys.map((k) => [k, num(obj?.[k])]).filter(([, v]) => v !== undefined));
  const countsByWord = (obj) =>
    Object.fromEntries(
      Object.entries(obj && typeof obj === 'object' ? obj : {})
        .slice(0, 100)
        .map(([k, v]) => [word(k), num(v)]),
    );

  /** Instantané `foretmap_diagnostics`, champ par champ. */
  function sanitizeDiagnostics(d = {}) {
    const m = d.metrics || {};
    const r = d.restarts || {};
    const gl = d.gl || {};
    const out = {
      ts: iso(d.ts),
      version: typeof d.version === 'string' ? d.version.slice(0, 40) : undefined,
      nodeVersion: typeof d.nodeVersion === 'string' ? d.nodeVersion.slice(0, 40) : undefined,
      nodeEnv: word(d.nodeEnv),
      uptimeSeconds: num(d.uptimeSeconds),
      memory: numbersOf(d.memory, ['rssMb', 'heapUsedMb', 'heapTotalMb']),
      database: { ok: bool(d.database?.ok), latencyMs: num(d.database?.latencyMs) },
      schema: {
        ok: bool(d.schema?.ok),
        current: num(d.schema?.current),
        latest: num(d.schema?.latest),
        pending: Array.isArray(d.schema?.pending) ? d.schema.pending.map(num) : undefined,
        error: word(d.schema?.error),
      },
      logBuffer: numbersOf(d.logBuffer, ['linesCount', 'maxLines']),
      metrics: {
        ...numbersOf(m, [
          'httpRequests',
          'http5xx',
          'http4xx',
          'http429',
          'httpSlow',
          'routeErrors',
          'rateLimit429Samples',
        ]),
        recentHttp5xx: (m.recentHttp5xx || []).slice(0, 50).map(httpSample),
        recentHttp429: (m.recentHttp429 || []).slice(0, 50).map(httpSample),
        deferredWrites: {
          ...numbersOf(m.deferredWrites, [
            'count',
            'refused',
            'viaBackgroundSync',
            'avgDelayMs',
            'maxDelayMs',
          ]),
          byRoute: Object.fromEntries(
            Object.entries(m.deferredWrites?.byRoute || {})
              .slice(0, 100)
              .map(([k, v]) => [routeOf(k, '') ?? 'autre', num(v)]),
          ),
        },
      },
      runtimeProcess: {
        pid: num(d.runtimeProcess?.pid),
        isWorker: bool(d.runtimeProcess?.cluster?.isWorker),
        workerId: num(d.runtimeProcess?.cluster?.workerId),
      },
      restarts: {
        enabled: bool(r.enabled),
        entriesTotal: num(r.entriesTotal),
        windowHours: num(r.windowHours),
        counts: numbersOf(r.counts, [
          'boots',
          'deployRestarts',
          'hostStops',
          'startupFailures',
          'crashes',
          'hardKills',
        ]),
        downtime: numbersOf(r.downtime, ['samples', 'totalMs', 'averageMs']),
        verdict: word(r.verdict),
        advice: typeof r.advice === 'string' ? r.advice.slice(0, 600) : undefined,
        recent: (r.recent || []).slice(0, 50).map((e) => ({
          at: iso(e?.at),
          event: word(e?.event),
          reason: word(e?.reason),
          kind: word(e?.kind),
          previousStop: word(e?.previousStop),
          previousStopReason: word(e?.previousStopReason),
          downtimeMs: num(e?.downtimeMs),
          lifetimeMs: num(e?.lifetimeMs),
          message: cleanText(e?.message),
        })),
        entriesBeforeWindow: num(r.entriesBeforeWindow),
      },
      gl: {
        ok: bool(gl.ok),
        gamesByStatus: countsByWord(gl.gamesByStatus),
        error: word(gl.error),
      },
    };
    return JSON.parse(JSON.stringify(out));
  }

  return { cleanLogText, cleanText, sanitizeDiagnostics, sanitizeLogEntry, sanitizeLogLine };
}

module.exports = { createLogSanitizer, routeOf };
