#!/usr/bin/env node
'use strict';

/**
 * Crédits photo des QCM Gnomes & Licornes (`gl_qcm_questions.photo_credit` /
 * `photo_licence`) : complète ce qui manque depuis Wikimedia Commons.
 *
 * Pourquoi : les photos viennent de Commons (`photo_description_url` = page `File:…`, ou
 * `wikipedia_title` dont l'image de page est sur Commons) sous licences CC qui imposent de
 * nommer l'auteur ; 55 questions en production ont une licence sans auteur, ou ni l'un ni
 * l'autre. Rien n'est écrit sans **source identifiée** : un fichier Commons résolu, puis ses
 * métadonnées `extmetadata` (`Artist`, `LicenseShortName`, `Credit`, `LicenseUrl`). Une
 * colonne déjà renseignée n'est jamais écrasée.
 *
 * API : `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata`
 * (titre `File:…`), et pour un `wikipedia_title` seul, `prop=pageimages&piprop=name` sur
 * fr.wikipedia pour obtenir le nom de fichier. Un délai sépare chaque appel (`--delay`,
 * défaut 1 000 ms) et l'agent utilisateur est générique (politique Wikimedia).
 *
 * Usage :
 *   node scripts/gl-photo-credits-backfill.js                 # simulation (défaut)
 *   node scripts/gl-photo-credits-backfill.js --apply         # écrit en base
 *   node scripts/gl-photo-credits-backfill.js --limit=10 --delay=1500 --rapport=logs
 *
 * Sortie : rapport JSON sur stdout (comptes et cas restants par code de question — aucune
 * donnée de personne) ; avec `--rapport=<dossier>`, le même JSON est écrit dans
 * `<dossier>/gl-photo-credits-<AAAA-MM-JJ>.json`.
 */

const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');

const USER_AGENT = 'ForetMap/1.0 (outil pédagogique ; crédits photo Commons ; node)';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const FRWIKI_API = 'https://fr.wikipedia.org/w/api.php';

/* ------------------------------------------------------------------ fonctions pures */

/** Retire les balises HTML, décode les entités courantes, réduit les blancs. */
function stripHtml(value) {
  return String(value == null ? '' : value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Un crédit nomme un auteur, jamais ses coordonnées (audit CS2, migration 313) : adresses
 * e-mail et URL retirées, parenthèses vides nettoyées.
 */
function sanitizeCredit(value) {
  return stripHtml(value)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[,;]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** Normalise une licence Commons (`LicenseShortName`) vers les libellés déjà en base. */
function normalizeLicence(value) {
  const raw = stripHtml(value);
  if (!raw) return '';
  if (/^public domain$/i.test(raw) || /^pd(-|$)/i.test(raw)) return 'Public domain';
  if (/^cc0/i.test(raw)) return 'CC0';
  const cc = /^cc[ -]?(by(?:[ -]sa)?(?:[ -]nc)?(?:[ -]nd)?)[ -]?([\d.]+)?/i.exec(raw);
  if (cc) {
    const variant = cc[1].toUpperCase().replace(/\s+/g, '-');
    return `CC ${variant}${cc[2] ? ` ${cc[2]}` : ''}`.trim();
  }
  if (/^gfdl/i.test(raw)) return 'GFDL';
  return raw.slice(0, 120);
}

/**
 * `extmetadata` d'une réponse `imageinfo` → `{ credit, licence, licenceUrl }`.
 * `credit` vient de `Artist`, à défaut de `Credit` ; chaîne vide quand rien n'est exploitable.
 * @param {object|null} extmetadata
 * @returns {{ credit: string, licence: string, licenceUrl: string }}
 */
function extractCreditFromExtmetadata(extmetadata) {
  const meta = extmetadata && typeof extmetadata === 'object' ? extmetadata : {};
  const value = (key) => (meta[key] && meta[key].value != null ? String(meta[key].value) : '');
  let credit = sanitizeCredit(value('Artist'));
  if (!credit) credit = sanitizeCredit(value('Credit'));
  const licence = normalizeLicence(value('LicenseShortName'));
  const licenceUrl = stripHtml(value('LicenseUrl')).slice(0, 1024);
  return { credit, licence, licenceUrl };
}

/** `https://commons.wikimedia.org/wiki/File:Nom.jpg` → `File:Nom.jpg` (décodé), sinon ''. */
function fileTitleFromDescriptionUrl(url) {
  const raw = String(url || '').trim();
  const m = /\/wiki\/((?:File|Fichier|Image):[^?#]+)/i.exec(raw);
  if (!m) return '';
  let title;
  try {
    title = decodeURIComponent(m[1]);
  } catch {
    title = m[1];
  }
  return `File:${title.replace(/^(File|Fichier|Image):/i, '').replace(/_/g, ' ')}`;
}

/** `https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Nom.jpg/960px-Nom.jpg` → `File:Nom.jpg`. */
function fileTitleFromUploadUrl(url) {
  const raw = String(url || '').trim();
  const m =
    /upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i.exec(
      raw,
    );
  if (!m) return '';
  let name;
  try {
    name = decodeURIComponent(m[1]);
  } catch {
    name = m[1];
  }
  return `File:${name.replace(/_/g, ' ')}`;
}

/** Première page d'une réponse `query.pages` (objet ou tableau, selon `formatversion`). */
function firstPage(json) {
  const pages = json && json.query && json.query.pages;
  if (!pages) return null;
  if (Array.isArray(pages)) return pages[0] || null;
  const keys = Object.keys(pages);
  return keys.length ? pages[keys[0]] : null;
}

/** Réponse Commons `imageinfo` → `extmetadata` de la première page, ou `null`. */
function extmetadataFromCommonsResponse(json) {
  const page = firstPage(json);
  const info = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
  return info && info.extmetadata ? info.extmetadata : null;
}

/** Réponse frwiki `pageimages` → `File:<pageimage>` ou ''. */
function fileTitleFromPageimagesResponse(json) {
  const page = firstPage(json);
  const name = page && page.pageimage ? String(page.pageimage) : '';
  return name ? `File:${name.replace(/_/g, ' ')}` : '';
}

/**
 * Décide ce qu'il faut écrire pour une ligne : seulement les colonnes vides, seulement si
 * la métadonnée existe. L'URL de licence n'accompagne que la licence écrite au même passage
 * (même source) : jamais collée sous une licence saisie autrement. `{}` quand rien n'est à
 * écrire.
 */
function planRowUpdate(row, extracted) {
  const update = {};
  const empty = (v) => v == null || String(v).trim() === '';
  if (empty(row.photo_credit) && extracted.credit) update.photo_credit = extracted.credit;
  if (empty(row.photo_licence) && extracted.licence) update.photo_licence = extracted.licence;
  if (update.photo_licence && empty(row.photo_licence_url) && extracted.licenceUrl) {
    update.photo_licence_url = extracted.licenceUrl;
  }
  return update;
}

function parseFlags(argv) {
  const flags = { apply: false, limit: null, delayMs: 1000, rapportDir: null };
  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (arg === '--apply') flags.apply = true;
    else if (arg === '--dry-run') flags.apply = false;
    else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      flags.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    } else if (arg.startsWith('--delay=')) {
      const n = Number(arg.slice('--delay='.length));
      flags.delayMs = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1000;
    } else if (arg.startsWith('--rapport=')) {
      flags.rapportDir = arg.slice('--rapport='.length) || null;
    }
  }
  return flags;
}

/* ------------------------------------------------------------------ réseau */

function fetchJson(url, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: 'application/json' } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 2 * 1024 * 1024) req.destroy(new Error('Réponse trop volumineuse'));
        });
        res.on('end', () => {
          const status = Number(res.statusCode || 0);
          if (status < 200 || status >= 300) return reject(new Error(`HTTP ${status}`));
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(new Error(`JSON invalide : ${err.message}`));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Délai dépassé (${timeoutMs} ms)`)));
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCommonsExtmetadata(fileTitle) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'extmetadata',
    iiextmetadatafilter: 'Artist|Credit|LicenseShortName|LicenseUrl',
    titles: fileTitle,
    format: 'json',
    formatversion: '2',
  });
  return extmetadataFromCommonsResponse(await fetchJson(`${COMMONS_API}?${params}`));
}

async function fetchFrwikiPageImage(title) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'pageimages',
    piprop: 'name',
    titles: String(title).replace(/_/g, ' '),
    redirects: '1',
    format: 'json',
    formatversion: '2',
  });
  return fileTitleFromPageimagesResponse(await fetchJson(`${FRWIKI_API}?${params}`));
}

/* ------------------------------------------------------------------ traitement */

const SELECT_MISSING = `
  SELECT question_code, photo_url, photo_description_url, wikipedia_title,
         photo_credit, photo_licence, photo_licence_url
    FROM gl_qcm_questions
   WHERE photo_url IS NOT NULL AND photo_url <> ''
     AND ((photo_credit IS NULL OR TRIM(photo_credit) = '')
       OR (photo_licence IS NULL OR TRIM(photo_licence) = ''))
   ORDER BY question_code`;

/**
 * Résout le fichier Commons d'une ligne : page de description, puis URL de téléversement,
 * puis image de la page Wikipédia (un appel réseau dans ce dernier cas).
 */
async function resolveFileTitle(row, { fetchPageImage }) {
  const fromDesc = fileTitleFromDescriptionUrl(row.photo_description_url);
  if (fromDesc) return { title: fromDesc, source: 'photo_description_url' };
  const fromUpload = fileTitleFromUploadUrl(row.photo_url);
  if (fromUpload) return { title: fromUpload, source: 'photo_url' };
  if (row.wikipedia_title) {
    const fromWiki = await fetchPageImage(row.wikipedia_title);
    if (fromWiki) return { title: fromWiki, source: 'wikipedia_title' };
  }
  return { title: '', source: null };
}

/**
 * Boucle principale, injectable pour les tests (`deps.fetchExtmetadata`, `deps.fetchPageImage`).
 */
async function backfill(db, flags, deps = {}) {
  const fetchExtmetadata = deps.fetchExtmetadata || fetchCommonsExtmetadata;
  const fetchPageImage = deps.fetchPageImage || fetchFrwikiPageImage;
  const wait = deps.sleep || sleep;
  let rows = await db.queryAll(SELECT_MISSING);
  if (flags.limit) rows = rows.slice(0, flags.limit);

  const report = {
    generated_at: new Date().toISOString(),
    mode: flags.apply ? 'apply' : 'dry-run',
    candidates: rows.length,
    updated: 0,
    unchanged: 0,
    remaining: [],
    sources: { photo_description_url: 0, photo_url: 0, wikipedia_title: 0 },
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (i > 0 && flags.delayMs > 0) await wait(flags.delayMs);
    let resolved;
    try {
      resolved = await resolveFileTitle(row, { fetchPageImage });
    } catch (err) {
      report.remaining.push({
        question_code: row.question_code,
        reason: `résolution : ${err.message}`,
      });
      continue;
    }
    if (!resolved.title) {
      report.remaining.push({
        question_code: row.question_code,
        reason: 'aucun fichier Commons identifiable',
      });
      continue;
    }
    let extmetadata;
    try {
      extmetadata = await fetchExtmetadata(resolved.title);
    } catch (err) {
      report.remaining.push({
        question_code: row.question_code,
        reason: `Commons : ${err.message}`,
      });
      continue;
    }
    if (!extmetadata) {
      report.remaining.push({
        question_code: row.question_code,
        reason: `fichier sans métadonnées (${resolved.title})`,
      });
      continue;
    }
    const extracted = extractCreditFromExtmetadata(extmetadata);
    const update = planRowUpdate(row, extracted);
    const keys = Object.keys(update);
    if (!keys.length) {
      report.remaining.push({
        question_code: row.question_code,
        reason: `métadonnées sans ${!extracted.credit ? 'auteur' : 'licence'} exploitable (${resolved.title})`,
      });
      continue;
    }
    report.sources[resolved.source] += 1;
    if (flags.apply) {
      await db.execute(
        `UPDATE gl_qcm_questions SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = NOW() WHERE question_code = ?`,
        [...keys.map((k) => update[k]), row.question_code],
      );
    }
    report.updated += 1;
  }
  report.unchanged = rows.length - report.updated - report.remaining.length;
  return report;
}

function writeReportFile(report, dir) {
  const target = path.resolve(dir);
  fs.mkdirSync(target, { recursive: true });
  const file = path.join(target, `gl-photo-credits-${report.generated_at.slice(0, 10)}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const flags = parseFlags(process.argv.slice(2));
  const db = require('../database');
  try {
    const report = await backfill(db, flags);
    if (flags.rapportDir) report.rapport_file = writeReportFile(report, flags.rapportDir);
    console.log(JSON.stringify(report, null, 2));
    if (!flags.apply) {
      console.error(
        `Simulation : ${report.updated} ligne(s) seraient complétées, ${report.remaining.length} restante(s). Relancer avec --apply pour écrire.`,
      );
    }
  } finally {
    if (typeof db.endPool === 'function') await db.endPool().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
}

module.exports = {
  USER_AGENT,
  backfill,
  extractCreditFromExtmetadata,
  extmetadataFromCommonsResponse,
  fileTitleFromDescriptionUrl,
  fileTitleFromPageimagesResponse,
  fileTitleFromUploadUrl,
  normalizeLicence,
  parseFlags,
  planRowUpdate,
  sanitizeCredit,
  stripHtml,
};
