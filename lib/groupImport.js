'use strict';

/**
 * Import / résolution de groupes ForetMap : parsing des références fichier,
 * recherche par slug ou nom, création automatique, rattachement de membres.
 */

const crypto = require('node:crypto');
const { queryAll, queryOne, execute } = require('../database');
const { canBypassGroupScope, isGroupInManageScope, normalizeId } = require('./groupScope');
const { syncStudentRoleFromGroups } = require('./groupRole');
const { asTrimmedString, normalizeImportHeader } = require('./shared/stringHelpers');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const { parseFirstSheetRows } = require('./spreadsheet');

const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const GROUP_KINDS = new Set(['class', 'team', 'unit', 'club']);

const GROUP_TEMPLATE_COLUMNS = [
  'Slug (optionnel)',
  'Nom',
  'Type (class|team|unit|club)',
  'Parent (slug ou nom)',
  'Description (optionnel)',
  'Accorde n3beur (oui/non)',
];

const GROUP_IMPORT_HEADER_ALIASES = new Map([
  ['slug', 'slug'],
  ['slug_optionnel', 'slug'],
  ['nom', 'name'],
  ['name', 'name'],
  ['type', 'kind'],
  ['type_class_team_unit_club', 'kind'],
  ['kind', 'kind'],
  ['parent', 'parent'],
  ['parent_slug_ou_nom', 'parent'],
  ['parent_group', 'parent'],
  ['description', 'description'],
  ['description_optionnel', 'description'],
  ['accorde_n3beur', 'grantsN3beur'],
  ['accorde_n3beur_oui_non', 'grantsN3beur'],
  ['grants_n3beur', 'grantsN3beur'],
  ['n3beur', 'grantsN3beur'],
]);

function normalizeGroupSlug(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || null;
}

function normalizeGroupKind(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'class';
  const fr = {
    classe: 'class',
    equipe: 'team',
    équipe: 'team',
    unite: 'unit',
    unité: 'unit',
    club: 'club',
  };
  const mapped = fr[raw] || raw;
  return GROUP_KINDS.has(mapped) ? mapped : null;
}

function parseBooleanOuiNon(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'oui', 'on', 'o'].includes(s)) return true;
  if (['0', 'false', 'no', 'non', 'off', 'n'].includes(s)) return false;
  return fallback;
}

/**
 * Cellule « Groupes » utilisateur : `6A | 6B` ou `6ème A > Atelier | 6B`.
 * @returns {{ path: string[] }[]}
 */
function parseGroupRefsCell(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s
    .split(/[|;]/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => ({
      path: token
        .split(/\s*>\s*|\s*\/\s*/)
        .map((p) => p.trim())
        .filter(Boolean),
    }))
    .filter((ref) => ref.path.length > 0);
}

function csvEscape(value) {
  const s = String(value ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildGroupTemplateWorkbookRows() {
  return [
    {
      [GROUP_TEMPLATE_COLUMNS[0]]: '6a',
      [GROUP_TEMPLATE_COLUMNS[1]]: '6ème A',
      [GROUP_TEMPLATE_COLUMNS[2]]: 'class',
      [GROUP_TEMPLATE_COLUMNS[3]]: '',
      [GROUP_TEMPLATE_COLUMNS[4]]: 'Classe principale — remplacer ou supprimer.',
      [GROUP_TEMPLATE_COLUMNS[5]]: 'non',
    },
    {
      [GROUP_TEMPLATE_COLUMNS[0]]: '',
      [GROUP_TEMPLATE_COLUMNS[1]]: 'Atelier sciences',
      [GROUP_TEMPLATE_COLUMNS[2]]: 'team',
      [GROUP_TEMPLATE_COLUMNS[3]]: '6ème A',
      [GROUP_TEMPLATE_COLUMNS[4]]: 'Sous-groupe de 6A (parent par nom ou slug).',
      [GROUP_TEMPLATE_COLUMNS[5]]: 'non',
    },
    {
      [GROUP_TEMPLATE_COLUMNS[0]]: '6b',
      [GROUP_TEMPLATE_COLUMNS[1]]: '6ème B',
      [GROUP_TEMPLATE_COLUMNS[2]]: 'class',
      [GROUP_TEMPLATE_COLUMNS[3]]: '',
      [GROUP_TEMPLATE_COLUMNS[4]]: 'Deuxième classe — le même fichier peut en lister plusieurs.',
      [GROUP_TEMPLATE_COLUMNS[5]]: 'non',
    },
    {
      [GROUP_TEMPLATE_COLUMNS[0]]: 'club-jardin',
      [GROUP_TEMPLATE_COLUMNS[1]]: 'Club jardin',
      [GROUP_TEMPLATE_COLUMNS[2]]: 'club',
      [GROUP_TEMPLATE_COLUMNS[3]]: '',
      [GROUP_TEMPLATE_COLUMNS[4]]: 'Exemple club (type club).',
      [GROUP_TEMPLATE_COLUMNS[5]]: 'oui',
    },
  ];
}

async function loadGroupsIndex() {
  const rows = await queryAll(
    'SELECT id, slug, name, kind, parent_group_id, is_active FROM `groups`',
  );
  const byId = new Map();
  const bySlug = new Map();
  const byName = new Map();
  for (const row of rows) {
    byId.set(String(row.id), row);
    if (row.slug) bySlug.set(String(row.slug).toLowerCase(), row);
    const nameKey = String(row.name || '')
      .trim()
      .toLowerCase();
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row);
  }
  return { byId, bySlug, byName, rows };
}

function findGroupInIndex(index, nameOrSlug) {
  const raw = String(nameOrSlug || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const slug = normalizeGroupSlug(raw);
  if (slug && index.bySlug.has(slug)) return index.bySlug.get(slug);
  if (index.byName.has(lower)) return index.byName.get(lower);
  if (slug && index.byName.has(slug)) return index.byName.get(slug);
  return null;
}

function rememberGroupInIndex(index, row) {
  index.byId.set(String(row.id), row);
  if (row.slug) index.bySlug.set(String(row.slug).toLowerCase(), row);
  const nameKey = String(row.name || '')
    .trim()
    .toLowerCase();
  if (nameKey) index.byName.set(nameKey, row);
  index.rows.push(row);
}

async function ensureUniqueGroupSlug(baseSlug, index) {
  let root = normalizeGroupSlug(baseSlug) || 'groupe';
  let n = 0;
  while (n < 200) {
    const candidate = n === 0 ? root : `${root}-${n}`;
    if (!index.bySlug.has(candidate)) {
      const db = await queryOne('SELECT id FROM `groups` WHERE slug = ? LIMIT 1', [candidate]);
      if (!db) return candidate;
    }
    n += 1;
  }
  throw new Error('Impossible de générer un slug de groupe unique');
}

/**
 * Crée un groupe et, si l'acteur n'a pas la vue globale, le place dans son
 * périmètre en l'ajoutant comme responsable.
 */
async function createGroupRecord({
  name,
  slug,
  kind = 'class',
  parentId = null,
  description = null,
  grantsN3beur = false,
  auth,
  index,
}) {
  const id = crypto.randomUUID();
  const finalSlug = await ensureUniqueGroupSlug(slug || name, index);
  const finalKind = normalizeGroupKind(kind) || 'class';
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, description, kind, parent_group_id, default_role_id, grants_n3beur_access, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?)`,
    [
      id,
      finalSlug,
      String(name).trim(),
      description,
      finalKind,
      parentId,
      grantsN3beur ? 1 : 0,
      normalizeId(auth?.userId),
    ],
  );
  const row = {
    id,
    slug: finalSlug,
    name: String(name).trim(),
    kind: finalKind,
    parent_group_id: parentId,
    is_active: 1,
  };
  rememberGroupInIndex(index, row);

  if (auth?.userId && auth?.userType && !canBypassGroupScope(auth)) {
    await execute(
      `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
       VALUES (?, ?, ?, 'manager')
       ON DUPLICATE KEY UPDATE role_in_group = 'manager'`,
      [id, String(auth.userId), String(auth.userType)],
    );
  }
  return row;
}

/**
 * Résout un chemin de groupes (ex. ['6ème A','Atelier']) : crée les manquants.
 * @returns {{ ok: true, group, created: string[] }|{ ok: false, error: string }}
 */
async function resolveGroupPath(auth, pathParts, index, { createMissing = true } = {}) {
  const created = [];
  let parentId = null;
  let current = null;
  for (let i = 0; i < pathParts.length; i += 1) {
    const label = pathParts[i];
    const existing = findGroupInIndex(index, label);
    if (existing) {
      if (Number(existing.is_active) === 0) {
        return { ok: false, error: `Groupe inactif : ${label}` };
      }
      if (parentId && String(existing.parent_group_id || '') !== String(parentId)) {
        // Même nom trouvé ailleurs : on accepte le match par nom/slug global (rentrée).
      }
      if (!(await isGroupInManageScope(auth, existing.id)) && !canBypassGroupScope(auth)) {
        // Hors périmètre : si on crée des enfants sous un parent hors scope → refus.
        // Pour un groupe existant hors scope, on refuse le rattachement.
        return { ok: false, error: `Groupe hors périmètre : ${label}` };
      }
      current = existing;
      parentId = existing.id;
      continue;
    }
    if (!createMissing) {
      return { ok: false, error: `Groupe introuvable : ${label}` };
    }
    if (parentId) {
      if (!(await isGroupInManageScope(auth, parentId)) && !canBypassGroupScope(auth)) {
        return { ok: false, error: `Parent hors périmètre pour créer « ${label} »` };
      }
    }
    // Sans parent et sans vue globale : createGroupRecord ajoute l'acteur comme manager.
    current = await createGroupRecord({
      name: label,
      slug: normalizeGroupSlug(label),
      kind: parentId ? 'team' : 'class',
      parentId,
      auth,
      index,
    });
    created.push(current.id);
    parentId = current.id;
  }
  if (!current) return { ok: false, error: 'Référence de groupe vide' };
  return { ok: true, group: current, created };
}

async function addUserToGroup(userId, userType, groupId, { roleInGroup = 'member' } = {}) {
  const ut = String(userType || '').toLowerCase();
  if (ut !== 'student' && ut !== 'teacher') {
    return { ok: false, status: 400, error: 'Type de compte non rattachable à un groupe' };
  }
  const group = await queryOne('SELECT id FROM `groups` WHERE id = ? AND is_active = 1 LIMIT 1', [
    groupId,
  ]);
  if (!group) return { ok: false, status: 404, error: 'Groupe introuvable ou inactif' };
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role_in_group = VALUES(role_in_group)`,
    [group.id, String(userId), ut, roleInGroup],
  );
  if (ut === 'student') {
    await syncStudentRoleFromGroups(String(userId), { groupId: group.id });
  }
  return { ok: true, group };
}

/**
 * Attache un utilisateur à une liste de refs groupes (crée si besoin).
 */
async function attachUserToGroupRefs(auth, userId, userType, groupRefs, index) {
  const attached = [];
  const created = [];
  const errors = [];
  for (const ref of groupRefs) {
    const resolved = await resolveGroupPath(auth, ref.path, index, { createMissing: true });
    if (!resolved.ok) {
      errors.push(resolved.error);
      continue;
    }
    created.push(...(resolved.created || []));
    const add = await addUserToGroup(userId, userType, resolved.group.id);
    if (!add.ok) {
      errors.push(add.error || 'Rattachement impossible');
      continue;
    }
    attached.push(resolved.group.id);
  }
  return { attached, created, errors };
}

function mapGroupImportRow(row = {}) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(key);
    const target = GROUP_IMPORT_HEADER_ALIASES.get(normalized);
    if (!target) continue;
    mapped[target] = value;
  }
  return {
    slug: normalizeOptionalString(mapped.slug),
    name: asTrimmedString(mapped.name),
    kind: normalizeGroupKind(mapped.kind),
    parent: normalizeOptionalString(mapped.parent),
    description: normalizeOptionalString(mapped.description),
    grantsN3beur: parseBooleanOuiNon(mapped.grantsN3beur, false),
  };
}

function validateGroupImportPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.name) errors.push({ row: rowNumber, field: 'name', error: 'Nom requis' });
  if (!payload.kind) {
    errors.push({
      row: rowNumber,
      field: 'kind',
      error: 'Type invalide (class, team, unit, club)',
    });
  }
  return errors;
}

/** Clé de dédoublonnage dans le fichier : slug normalisé, sinon nom. */
function groupImportDedupeKey(payload) {
  const fromSlug = normalizeGroupSlug(payload?.slug || payload?.name);
  if (fromSlug) return fromSlug;
  return String(payload?.name || '')
    .trim()
    .toLowerCase();
}

function pickLastNonEmptyGroupField(prev, next) {
  if (next === undefined || next === null) return prev;
  if (typeof next === 'string' && next.trim() === '') return prev;
  return next;
}

function mergeGroupImportPayloads(prev, next) {
  return {
    slug: pickLastNonEmptyGroupField(prev.slug, next.slug),
    name: pickLastNonEmptyGroupField(prev.name, next.name) || prev.name,
    kind: pickLastNonEmptyGroupField(prev.kind, next.kind) || prev.kind,
    parent: pickLastNonEmptyGroupField(prev.parent, next.parent),
    description: pickLastNonEmptyGroupField(prev.description, next.description),
    // Dernière ligne gagne toujours pour le booléen (valeur explicite ou défaut).
    grantsN3beur: Boolean(next.grantsN3beur),
  };
}

/**
 * Fusionne les lignes de groupes en double dans le fichier.
 * @returns {{ items: Array<{ payload, rowNumber, sourceRows }>, infos: object[] }}
 */
function mergeDuplicateGroupImportItems(items) {
  const byKey = new Map();
  for (const item of items || []) {
    const key = groupImportDedupeKey(item.payload);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        payload: { ...item.payload },
        rowNumber: item.rowNumber,
        sourceRows: [item.rowNumber],
      });
      continue;
    }
    prev.payload = mergeGroupImportPayloads(prev.payload, item.payload);
    prev.rowNumber = item.rowNumber;
    prev.sourceRows.push(item.rowNumber);
  }
  const infos = [];
  for (const entry of byKey.values()) {
    if (entry.sourceRows.length > 1) {
      infos.push({
        code: 'duplicate_rows_merged',
        rows: [...entry.sourceRows],
        message: `Lignes ${entry.sourceRows.join(', ')} : groupe « ${entry.payload.name} » — fusionnées (dernière ligne pour le reste).`,
      });
    }
  }
  return { items: [...byKey.values()], infos };
}

async function updateGroupRecord(
  existing,
  { name, kind, parentId, description, grantsN3beur },
  index,
) {
  const finalKind = normalizeGroupKind(kind) || existing.kind || 'class';
  const finalName = String(name || existing.name || '').trim();
  await execute(
    `UPDATE \`groups\`
        SET name = ?, description = ?, kind = ?, parent_group_id = ?, grants_n3beur_access = ?
      WHERE id = ?`,
    [finalName, description ?? null, finalKind, parentId, grantsN3beur ? 1 : 0, existing.id],
  );
  const row = {
    ...existing,
    name: finalName,
    kind: finalKind,
    parent_group_id: parentId,
    is_active: 1,
  };
  rememberGroupInIndex(index, row);
  return row;
}

async function resolveImportRowsFromBody(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Fichier import trop volumineux (max 8 Mo)');
  }
  const fileName = asTrimmedString(body.fileName).toLowerCase();
  if (fileName.endsWith('.csv')) {
    const { parseCsvRowsFromBuffer } = require('./studentRouteHelpers');
    return parseCsvRowsFromBuffer(buffer);
  }
  return parseFirstSheetRows(buffer);
}

/**
 * Import de groupes (dry-run ou apply). Plusieurs passes pour créer les parents d'abord.
 * Lignes en double dans le fichier : fusionnées (dernière ligne pour les champs) + message d'info.
 */
async function importGroupsFromRows(auth, rawRows, { dryRun = false } = {}) {
  const report = {
    dryRun,
    totals: {
      received: rawRows.length,
      valid: 0,
      created: 0,
      updated_existing: 0,
      skipped_invalid: 0,
      merged_duplicates: 0,
    },
    preview: [],
    errors: [],
    infos: [],
  };
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error('Aucune ligne importable détectée');
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Import limité à ${MAX_IMPORT_ROWS} lignes`);
  }

  const candidates = [];
  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const payload = mapGroupImportRow(row);
    const errors = validateGroupImportPayload(payload, rowNumber);
    if (errors.length) {
      report.totals.skipped_invalid += 1;
      report.errors.push(...errors);
      return;
    }
    candidates.push({ payload, rowNumber });
  });

  const { items: payloads, infos: mergeInfos } = mergeDuplicateGroupImportItems(candidates);
  report.infos.push(...mergeInfos);
  report.totals.merged_duplicates = mergeInfos.reduce(
    (acc, info) => acc + Math.max(0, (info.rows?.length || 0) - 1),
    0,
  );

  const index = await loadGroupsIndex();
  const pending = [...payloads];
  let guard = 0;
  while (pending.length > 0 && guard < payloads.length + 2) {
    guard += 1;
    const still = [];
    for (const item of pending) {
      const { payload, rowNumber } = item;
      let parentId = null;
      if (payload.parent) {
        const parent = findGroupInIndex(index, payload.parent);
        if (!parent) {
          still.push(item);
          continue;
        }
        parentId = parent.id;
        if (!(await isGroupInManageScope(auth, parentId)) && !canBypassGroupScope(auth)) {
          report.totals.skipped_invalid += 1;
          report.errors.push({
            row: rowNumber,
            field: 'parent',
            error: 'Parent hors périmètre',
          });
          continue;
        }
      } else if (!canBypassGroupScope(auth) && !dryRun) {
        // Top-level : création OK — l'acteur devient manager (périmètre élargi).
      }

      const existing = findGroupInIndex(index, payload.slug || payload.name);
      if (existing) {
        if (!(await isGroupInManageScope(auth, existing.id)) && !canBypassGroupScope(auth)) {
          report.totals.skipped_invalid += 1;
          report.errors.push({
            row: rowNumber,
            field: 'name',
            error: 'Groupe hors périmètre',
          });
          continue;
        }
        report.totals.updated_existing += 1;
        report.totals.valid += 1;
        if (!dryRun) {
          await updateGroupRecord(
            existing,
            {
              name: payload.name,
              kind: payload.kind,
              parentId,
              description: payload.description,
              grantsN3beur: payload.grantsN3beur,
            },
            index,
          );
        }
        if (report.preview.length < 20) {
          report.preview.push({
            row: rowNumber,
            action: dryRun ? 'update' : 'updated',
            id: existing.id,
            slug: existing.slug,
            name: payload.name,
          });
        }
        continue;
      }

      report.totals.valid += 1;
      if (dryRun) {
        if (report.preview.length < 20) {
          report.preview.push({
            row: rowNumber,
            action: 'create',
            slug: normalizeGroupSlug(payload.slug || payload.name),
            name: payload.name,
            parent: payload.parent || null,
          });
        }
        continue;
      }

      const created = await createGroupRecord({
        name: payload.name,
        slug: payload.slug || payload.name,
        kind: payload.kind,
        parentId,
        description: payload.description,
        grantsN3beur: payload.grantsN3beur,
        auth,
        index,
      });
      report.totals.created += 1;
      if (report.preview.length < 20) {
        report.preview.push({
          row: rowNumber,
          action: 'created',
          id: created.id,
          slug: created.slug,
          name: created.name,
        });
      }
    }
    if (still.length === pending.length) {
      for (const item of still) {
        report.totals.skipped_invalid += 1;
        report.errors.push({
          row: item.rowNumber,
          field: 'parent',
          error: `Parent introuvable : ${item.payload.parent}`,
        });
      }
      break;
    }
    pending.length = 0;
    pending.push(...still);
  }

  return report;
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  GROUP_TEMPLATE_COLUMNS,
  GROUP_KINDS,
  normalizeGroupSlug,
  normalizeGroupKind,
  parseBooleanOuiNon,
  parseGroupRefsCell,
  csvEscape,
  buildGroupTemplateWorkbookRows,
  loadGroupsIndex,
  findGroupInIndex,
  createGroupRecord,
  resolveGroupPath,
  addUserToGroup,
  attachUserToGroupRefs,
  mapGroupImportRow,
  validateGroupImportPayload,
  groupImportDedupeKey,
  mergeGroupImportPayloads,
  mergeDuplicateGroupImportItems,
  updateGroupRecord,
  resolveImportRowsFromBody,
  importGroupsFromRows,
};
