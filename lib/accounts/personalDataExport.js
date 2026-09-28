'use strict';

/**
 * Export des données personnelles d'une personne sous forme d'archive ZIP (RGPD art. 15
 * et 20 — audit du 28/09/2026, recommandation R4).
 *
 * Contenu de l'archive :
 *   - `donnees.json` : une section par entrée du registre (`lib/accounts/exportRegistry.js`),
 *     lignes brutes moins les colonnes secrètes ;
 *   - `fichiers/…`   : les fichiers déposés par la personne (photos, pièces jointes),
 *     à leur chemin relatif sous `uploads/` ;
 *   - `LISEZMOI.txt` : explication en français de ce que contient l'archive.
 *
 * Une table absente (installation en retard de migration) ou une colonne manquante ne fait
 * pas échouer l'export : la section est listée comme indisponible.
 */

const fs = require('fs');
const { queryAll, queryOne } = require('../../database');
const { getAbsolutePath } = require('../uploads');
const { getBrand } = require('../brand');
const logger = require('../logger');
const {
  FORET_EXPORT_ENTRIES,
  GL_EXPORT_ENTRIES,
  GLOBAL_SECRET_COLUMNS,
} = require('./exportRegistry');

let AdmZipLazy = null;
function getAdmZip() {
  if (!AdmZipLazy) AdmZipLazy = require('adm-zip');
  return AdmZipLazy;
}

/** Plafond cumulé des fichiers joints : au-delà, les fichiers restants sont listés sans être copiés. */
function maxExportFilesBytes() {
  const raw = parseInt(process.env.FORETMAP_EXPORT_MAX_FILES_BYTES, 10);
  if (Number.isFinite(raw) && raw >= 1024 * 1024) return raw;
  return 300 * 1024 * 1024;
}

const SKIPPABLE_SQL_ERRORS = new Set(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR']);

function stripColumns(row, exclude) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (exclude.has(key)) continue;
    out[key] = Buffer.isBuffer(value) ? value.toString('base64') : value;
  }
  return out;
}

async function collectEntries(entries, subject, sections, unavailable, filePaths) {
  for (const entry of entries) {
    let rows;
    try {
      rows = await queryAll(
        `SELECT * FROM ${entry.table} WHERE ${entry.where}`,
        entry.params(subject),
      );
    } catch (err) {
      if (SKIPPABLE_SQL_ERRORS.has(err?.code)) {
        unavailable.push(entry.section);
        continue;
      }
      throw err;
    }
    const exclude = new Set([...GLOBAL_SECRET_COLUMNS, ...(entry.exclude || [])]);
    const clean = rows.map((row) => stripColumns(row, exclude));
    if (sections[entry.section]) {
      sections[entry.section].lignes.push(...clean);
    } else {
      sections[entry.section] = { libelle: entry.label, lignes: clean };
    }
    if (typeof entry.files === 'function') {
      for (const row of rows) {
        for (const p of entry.files(row) || []) {
          if (typeof p === 'string' && p.trim()) filePaths.add(p.trim().replace(/^\/+/, ''));
        }
      }
    }
  }
}

function addFiles(zip, filePaths) {
  const budget = maxExportFilesBytes();
  let used = 0;
  const included = [];
  const missing = [];
  const skipped = [];
  for (const rel of [...filePaths].sort()) {
    let abs;
    try {
      abs = getAbsolutePath(rel);
    } catch {
      missing.push(rel);
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      missing.push(rel);
      continue;
    }
    if (!stat.isFile()) {
      missing.push(rel);
      continue;
    }
    if (used + stat.size > budget) {
      skipped.push(rel);
      continue;
    }
    zip.addFile(`fichiers/${rel.replace(/\\/g, '/')}`, fs.readFileSync(abs));
    used += stat.size;
    included.push(rel);
  }
  return { included, missing, skipped };
}

function buildReadme({ subjectLabel, sections, unavailable, files, generatedAt }) {
  const brand = getBrand();
  const lines = [
    `Export de vos données personnelles — ${brand.appName} (${brand.orgName})`,
    '',
    `Personne concernée : ${subjectLabel}`,
    `Archive générée le : ${generatedAt}`,
    '',
    'Ce dossier rassemble les données que l’application conserve à votre sujet, au titre',
    'du droit d’accès et du droit à la portabilité (RGPD, articles 15 et 20).',
    '',
    '- « donnees.json » contient vos données, rangées par rubrique. Ce format se lit avec',
    '  un éditeur de texte ou se réimporte dans un autre outil.',
    '- Le dossier « fichiers » contient les photos et pièces jointes que vous avez déposées.',
    '',
    'Les mots de passe ne figurent jamais dans l’export : ils ne sont conservés que sous',
    'une forme chiffrée irréversible.',
    '',
    'Rubriques :',
  ];
  for (const section of Object.values(sections)) {
    lines.push(`  - ${section.libelle} : ${section.lignes.length} élément(s)`);
  }
  if (unavailable.length) {
    lines.push('', 'Rubriques non disponibles sur cette installation :');
    for (const key of unavailable) lines.push(`  - ${key}`);
  }
  lines.push('', `Fichiers joints : ${files.included.length}`);
  if (files.missing.length) {
    lines.push(`Fichiers référencés mais introuvables sur le serveur : ${files.missing.length}`);
  }
  if (files.skipped.length) {
    lines.push(
      `Fichiers non joints (taille totale de l’archive dépassée) : ${files.skipped.length}.`,
      'Demandez-les à l’administrateur de l’application.',
    );
  }
  lines.push(
    '',
    'Pour toute question, pour faire rectifier ou effacer ces données, adressez-vous à',
    'l’administrateur de l’application ou au délégué à la protection des données de',
    'l’établissement.',
    '',
  );
  return lines.join('\r\n');
}

function packArchive({ subjectLabel, subjectMeta, sections, unavailable, filePaths }) {
  const AdmZip = getAdmZip();
  const zip = new AdmZip();
  const generatedAt = new Date().toISOString();
  const files = addFiles(zip, filePaths);
  const payload = {
    format: 'foretmap-personal-data-export',
    version: 1,
    genere_le: generatedAt,
    personne: subjectMeta,
    sections,
    sections_indisponibles: unavailable,
    fichiers: {
      joints: files.included,
      introuvables: files.missing,
      non_joints_taille: files.skipped,
    },
  };
  zip.addFile('donnees.json', Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
  zip.addFile(
    'LISEZMOI.txt',
    Buffer.from(buildReadme({ subjectLabel, sections, unavailable, files, generatedAt }), 'utf8'),
  );
  return { buffer: zip.toBuffer(), payload };
}

function exportFilename(prefix, id) {
  const day = new Date().toISOString().slice(0, 10);
  const safeId =
    String(id)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 40) || 'compte';
  return `${prefix}-${safeId}-${day}.zip`;
}

/**
 * Archive d'un compte ForetMap (table `users`), avec la partie G&L de ses joueurs liés.
 * @returns {Promise<{ buffer: Buffer, filename: string, payload: object } | null>} `null` si le compte n'existe pas.
 */
async function buildForetUserExport(userId) {
  const user = await queryOne(
    'SELECT id, user_type, first_name, last_name, pseudo, display_name FROM users WHERE id = ? LIMIT 1',
    [String(userId)],
  );
  if (!user) return null;
  const subject = {
    userId: String(user.id),
    userType: String(user.user_type || 'student'),
    firstName: user.first_name || '',
    lastName: user.last_name || '',
  };
  const sections = {};
  const unavailable = [];
  const filePaths = new Set();
  await collectEntries(FORET_EXPORT_ENTRIES, subject, sections, unavailable, filePaths);

  let linkedPlayers = [];
  try {
    linkedPlayers = await queryAll('SELECT id FROM gl_players WHERE linked_foretmap_user_id = ?', [
      subject.userId,
    ]);
  } catch (err) {
    if (!SKIPPABLE_SQL_ERRORS.has(err?.code)) throw err;
  }
  for (const player of linkedPlayers) {
    await collectEntries(
      GL_EXPORT_ENTRIES,
      { playerId: player.id },
      sections,
      unavailable,
      filePaths,
    );
  }

  const label =
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.display_name ||
    user.pseudo ||
    user.id;
  const { buffer, payload } = packArchive({
    subjectLabel: label,
    subjectMeta: { produit: 'foret', id: subject.userId, type: subject.userType },
    sections,
    unavailable: [...new Set(unavailable)],
    filePaths,
  });
  logger.info(
    { userId: subject.userId, bytes: buffer.length, files: payload.fichiers.joints.length },
    'Export des données personnelles généré',
  );
  return { buffer, filename: exportFilename('donnees-personnelles', subject.userId), payload };
}

/**
 * Archive d'un joueur G&L (table `gl_players`), limitée au produit G&L.
 * @returns {Promise<{ buffer: Buffer, filename: string, payload: object } | null>} `null` si le joueur n'existe pas.
 */
async function buildGlPlayerExport(playerId) {
  const player = await queryOne('SELECT * FROM gl_players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) return null;
  const sections = {};
  const unavailable = [];
  const filePaths = new Set();
  // L'identité du joueur (nom, courriel) vit dans son compte `users` lié : seule cette fiche
  // est reprise, pas le reste de l'activité ForetMap.
  if (player.linked_foretmap_user_id) {
    const accountEntry = FORET_EXPORT_ENTRIES.find((e) => e.section === 'compte');
    await collectEntries(
      [accountEntry],
      { userId: String(player.linked_foretmap_user_id) },
      sections,
      unavailable,
      filePaths,
    );
  }
  await collectEntries(
    GL_EXPORT_ENTRIES,
    { playerId: player.id },
    sections,
    unavailable,
    filePaths,
  );
  const { buffer, payload } = packArchive({
    subjectLabel: player.display_name || player.pseudo || `joueur ${player.id}`,
    subjectMeta: { produit: 'gl', id: player.id },
    sections,
    unavailable,
    filePaths,
  });
  logger.info(
    { playerId: player.id, bytes: buffer.length, files: payload.fichiers.joints.length },
    'Export des données personnelles G&L généré',
  );
  return { buffer, filename: exportFilename('donnees-personnelles-gl', player.id), payload };
}

/** Envoie une archive d'export en pièce jointe (jamais mise en cache). */
function sendExportArchive(res, archive) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', String(archive.buffer.length));
  return res.end(archive.buffer);
}

module.exports = {
  buildForetUserExport,
  buildGlPlayerExport,
  sendExportArchive,
  maxExportFilesBytes,
};
