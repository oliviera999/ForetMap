'use strict';

const logger = require('./logger');

/**
 * Collecteur des signalements CSP (`report-uri`).
 *
 * ## Pourquoi ce n'est pas trois lignes
 *
 * Un `report-uri` sans garde est un **amplificateur de journal** : chaque page vue par chaque
 * élève peut produire plusieurs signalements, et une seule directive mal réglée en génère autant
 * que de chargements. Sur un hébergement mutualisé dont l'audit a montré qu'il tombe par
 * épuisement de ressources, écrire sans borne serait ajouter au problème qu'on cherche à
 * comprendre.
 *
 * Trois gardes, donc :
 *
 * 1. **Regroupement** — un signalement est identifié par (directive violée, origine bloquée). Les
 *    répétitions ne réécrivent rien : elles incrémentent un compteur.
 * 2. **Fenêtre** — le compteur est vidé toutes les `WINDOW_MS`, et la ligne de journal porte le
 *    total de la fenêtre. On sait donc « 1 400 fois » sans avoir écrit 1 400 lignes. Il n'y a
 *    **pas de minuterie** : la fenêtre est close par le signalement suivant. En trafic faible, la
 *    ligne peut donc être écrite longtemps après les violations qu'elle décrit — d'où le champ
 *    `windowStartedAt`, qui donne la date réelle des faits plutôt que celle de l'écriture.
 * 3. **Plafond de clés** — au-delà de `MAX_KEYS` signatures distinctes dans une fenêtre, les
 *    nouvelles sont comptées globalement sans créer d'entrée. Une page qui produirait des URI
 *    uniques à l'infini ne peut pas faire croître la table.
 *
 * Le corps est par ailleurs **borné à la lecture** (`limit`), et seuls des champs connus sont
 * journalisés — un signalement est du contenu fourni par le navigateur, donc non fiable.
 */

/** Fenêtre de regroupement. Assez longue pour absorber une rafale, assez courte pour rester lisible. */
const WINDOW_MS = 60_000;
/** Nombre maximal de signatures distinctes suivies simultanément. */
const MAX_KEYS = 40;
/** Taille maximale acceptée pour un corps de signalement. */
const BODY_LIMIT = '16kb';

const counters = new Map();
let windowStartedAt = Date.now();
let droppedKeys = 0;

/** Réduit une URI à son origine : c'est ce qui distingue une violation, pas le chemin exact. */
function toOrigin(value) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return '(vide)';
  // Les valeurs spéciales de la spécification ne sont pas des URL.
  if (!raw.includes('://')) return raw.slice(0, 60);
  try {
    return new URL(raw).origin;
  } catch (_) {
    return raw.slice(0, 60);
  }
}

/** Extrait les champs utiles des deux formats (CSP2 `csp-report`, Reporting API `reports+json`). */
function normalizeReport(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const body = entry['csp-report'] || entry.body || entry;
  if (!body || typeof body !== 'object') return null;
  const directive = String(
    body['effective-directive'] || body.effectiveDirective || body['violated-directive'] || '',
  )
    .trim()
    .split(/\s+/)[0];
  if (!directive) return null;
  return {
    directive: directive.slice(0, 40),
    blockedOrigin: toOrigin(body['blocked-uri'] ?? body.blockedURL),
    documentOrigin: toOrigin(body['document-uri'] ?? body.documentURL),
  };
}

function resetWindowIfNeeded(now) {
  if (now - windowStartedAt < WINDOW_MS) return;
  if (counters.size || droppedKeys) {
    const groupes = [...counters.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([key, v]) => ({ signature: key, count: v.count, document: v.documentOrigin }));
    logger.warn(
      {
        msg: 'csp_report_window',
        windowMs: WINDOW_MS,
        // Date d'ouverture de la fenêtre : sans minuterie, l'horodatage de la ligne est celui du
        // signalement qui l'a close, pas celui des violations comptées.
        windowStartedAt: new Date(windowStartedAt).toISOString(),
        distinctSignatures: counters.size,
        droppedSignatures: droppedKeys,
        groupes,
      },
      'Signalements CSP (Report-Only) sur la fenêtre écoulée',
    );
  }
  counters.clear();
  droppedKeys = 0;
  windowStartedAt = now;
}

/** Enregistre un signalement normalisé. Exporté pour les tests. */
function recordViolation(report, now = Date.now()) {
  resetWindowIfNeeded(now);
  if (!report) return false;
  const key = `${report.directive} ← ${report.blockedOrigin}`;
  const existing = counters.get(key);
  if (existing) {
    existing.count += 1;
    return true;
  }
  if (counters.size >= MAX_KEYS) {
    droppedKeys += 1;
    return false;
  }
  counters.set(key, { count: 1, documentOrigin: report.documentOrigin });
  return true;
}

/** Vide l'état (tests). */
function resetCspReportState(now = Date.now()) {
  counters.clear();
  droppedKeys = 0;
  windowStartedAt = now;
}

/** Vue de l'état courant (tests et diagnostics). */
function getCspReportState() {
  return {
    distinctSignatures: counters.size,
    droppedSignatures: droppedKeys,
    entries: [...counters.entries()].map(([signature, v]) => ({ signature, count: v.count })),
  };
}

/**
 * Gestionnaire de route. Répond **toujours** `204` : un navigateur ne lit pas cette réponse, et
 * renvoyer une erreur ne ferait que provoquer des réessais.
 */
function cspReportHandler(req, res) {
  try {
    const payload = req.body;
    const entries = Array.isArray(payload) ? payload : [payload];
    for (const entry of entries.slice(0, 20)) {
      recordViolation(normalizeReport(entry));
    }
  } catch (_) {
    // Un signalement mal formé n'est pas un incident : on l'ignore.
  }
  res.status(204).end();
}

module.exports = {
  WINDOW_MS,
  MAX_KEYS,
  BODY_LIMIT,
  normalizeReport,
  recordViolation,
  resetCspReportState,
  getCspReportState,
  cspReportHandler,
};
