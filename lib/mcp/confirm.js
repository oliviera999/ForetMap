'use strict';

/**
 * Confirmation par code (hors Claude) pour les opérations sensibles du connecteur MCP.
 *
 * Flux :
 * 1. L'outil détecte qu'une confirmation est requise → `requestConfirmation` génère un code
 *    à 6 chiffres, l'envoie à l'e-mail du compte appelant, stocke `mcp_confirmations` et
 *    renvoie `{ confirmation_required, confirmation_id, summary }` **sans exécuter**.
 * 2. L'admin tape le code dans la conversation ; le modèle rappelle l'outil avec les mêmes
 *    arguments + `confirmation_id` + `confirmation_code`.
 * 3. `consumeConfirmation` vérifie : usage unique, 10 min, même utilisateur, même outil,
 *    même empreinte d'arguments, ≤ 3 essais. Puis l'outil exécute.
 *
 * `MCP_CONFIRM_REQUIRED=false` saute l'étape (audit `mcp.confirm.skipped`) — demande du
 * propriétaire pour un mode productivité sans e-mail.
 */

const crypto = require('node:crypto');
const { z } = require('zod');
const { queryOne, execute } = require('../../database');
const { logAudit } = require('../auditLog');
const { getMcpConfig } = require('./config');
const { McpToolError } = require('./registry');

const CONFIRM_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_PENDING_PER_USER = 5;
const LABEL = 'foretmap-mcp-confirm-v1';

/** Champs optionnels ajoutés aux schémas des outils qui peuvent exiger une confirmation. */
const confirmationFields = {
  confirmation_id: z
    .string()
    .uuid()
    .optional()
    .describe('Identifiant renvoyé lors de la demande de confirmation'),
  confirmation_code: z
    .string()
    .regex(/^\d{6}$/)
    .optional()
    .describe('Code à 6 chiffres reçu par e-mail'),
};

function hmacKey() {
  const { JWT_SECRET } = require('../../middleware/requireTeacher');
  const base = JWT_SECRET || 'dev-secret-change-in-production';
  return crypto.createHmac('sha256', base).update(LABEL).digest();
}

function hashCode(code) {
  return crypto.createHmac('sha256', hmacKey()).update(String(code)).digest('hex');
}

function codesMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Empreinte stable des arguments (champs de confirmation exclus). */
function hashArgs(args) {
  const clean = { ...(args || {}) };
  delete clean.confirmation_id;
  delete clean.confirmation_code;
  const canonical = JSON.stringify(clean, Object.keys(clean).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function sixDigitCode() {
  // 000000–999999, uniforme.
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

async function auditConfirm(action, user, payload) {
  await logAudit(action, 'mcp_confirmation', payload.confirmation_id || null, null, {
    actorUserType: user.userType,
    actorUserId: user.userId,
    result: payload.result || 'success',
    payload: {
      tool: payload.tool,
      confirmation_id: payload.confirmation_id || null,
      args_hash: payload.args_hash || null,
      reason: payload.reason || undefined,
    },
  });
}

/**
 * Point d'entrée pour un outil : si une confirmation est requise et absente/invalide,
 * demande (ou vérifie) ; sinon laisse exécuter.
 *
 * @param {{ tool: string, args: object, user: { userId, userType }, summary: string, needsConfirm: boolean }} opts
 * @returns {Promise<{ proceed: true, confirmationId: string|null, skipped: boolean }
 *   | { proceed: false, response: object }>}
 */
async function ensureConfirmed({ tool, args, user, summary, needsConfirm }) {
  const cfg = getMcpConfig();
  const argsHash = hashArgs(args);

  if (!needsConfirm) {
    return { proceed: true, confirmationId: null, skipped: false };
  }

  if (!cfg.confirmRequired) {
    await auditConfirm('mcp.confirm.skipped', user, {
      tool,
      args_hash: argsHash,
      result: 'success',
    });
    return { proceed: true, confirmationId: null, skipped: true };
  }

  const confirmationId = args?.confirmation_id ? String(args.confirmation_id) : null;
  const code = args?.confirmation_code ? String(args.confirmation_code) : null;

  if (!confirmationId || !code) {
    const requested = await requestConfirmation({ tool, user, argsHash, summary });
    return { proceed: false, response: requested };
  }

  await consumeConfirmation({
    confirmationId,
    code,
    tool,
    user,
    argsHash,
  });
  return { proceed: true, confirmationId, skipped: false };
}

async function requestConfirmation({ tool, user, argsHash, summary }) {
  const emailRow = await queryOne('SELECT email, display_name FROM users WHERE id = ? LIMIT 1', [
    String(user.userId),
  ]);
  const email = String(emailRow?.email || '').trim();
  if (!email) {
    throw new McpToolError(
      'Confirmation impossible : le compte appelant n’a pas d’adresse e-mail.',
      'MCP_CONFIRM_NO_EMAIL',
    );
  }

  const pending = await queryOne(
    `SELECT COUNT(*) AS n FROM mcp_confirmations
      WHERE user_id = ? AND status = 'pending' AND expires_at > NOW()`,
    [String(user.userId)],
  );
  if (Number(pending?.n || 0) >= MAX_PENDING_PER_USER) {
    throw new McpToolError(
      `Trop de confirmations en attente (max ${MAX_PENDING_PER_USER}). Attendez l’expiration ou consommez-en une.`,
      'MCP_CONFIRM_RATE',
    );
  }

  const code = sixDigitCode();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS);

  const send =
    requestConfirmation._sendEmail ||
    ((payload) => require('../mailer').sendMcpConfirmationCode(payload));
  const sent = await send({
    to: email,
    displayName: emailRow?.display_name || null,
    code,
    tool,
    summary: String(summary || '').slice(0, 500),
    expiresAt,
  });
  if (!sent) {
    throw new McpToolError(
      'Confirmation impossible : SMTP non configuré (aucun e-mail envoyé).',
      'MCP_CONFIRM_NO_SMTP',
    );
  }

  await execute(
    `INSERT INTO mcp_confirmations
       (id, user_id, tool, args_hash, code_hash, summary, attempts, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?)`,
    [
      id,
      String(user.userId),
      String(tool),
      argsHash,
      hashCode(code),
      String(summary || '').slice(0, 1000),
      expiresAt,
    ],
  );

  await auditConfirm('mcp.confirm.requested', user, {
    tool,
    confirmation_id: id,
    args_hash: argsHash,
  });

  return {
    confirmation_required: true,
    confirmation_id: id,
    summary: String(summary || '').slice(0, 1000),
    expires_in_seconds: Math.floor(CONFIRM_TTL_MS / 1000),
    next: 'Un code à 6 chiffres a été envoyé à l’e-mail du compte. Rappeler l’outil avec les mêmes arguments, confirmation_id et confirmation_code.',
  };
}

async function consumeConfirmation({ confirmationId, code, tool, user, argsHash }) {
  const row = await queryOne(
    `SELECT id, user_id, tool, args_hash, code_hash, attempts, status,
            (expires_at > NOW()) AS fresh
       FROM mcp_confirmations WHERE id = ? LIMIT 1`,
    [String(confirmationId)],
  );
  if (!row) {
    throw new McpToolError('Confirmation introuvable', 'MCP_CONFIRM_NOT_FOUND');
  }
  if (String(row.user_id) !== String(user.userId)) {
    throw new McpToolError('Cette confirmation appartient à un autre compte', 'MCP_FORBIDDEN');
  }
  if (String(row.tool) !== String(tool)) {
    throw new McpToolError('Confirmation liée à un autre outil', 'MCP_CONFIRM_MISMATCH');
  }
  if (String(row.args_hash) !== String(argsHash)) {
    throw new McpToolError(
      'Les arguments ont changé depuis la demande de confirmation',
      'MCP_CONFIRM_MISMATCH',
    );
  }
  if (row.status === 'consumed') {
    throw new McpToolError('Code déjà utilisé', 'MCP_CONFIRM_CONSUMED');
  }
  if (row.status === 'locked') {
    throw new McpToolError('Confirmation verrouillée (trop d’essais)', 'MCP_CONFIRM_LOCKED');
  }
  if (row.status === 'expired' || !Number(row.fresh)) {
    await execute(
      "UPDATE mcp_confirmations SET status = 'expired' WHERE id = ? AND status = 'pending'",
      [row.id],
    );
    await auditConfirm('mcp.confirm.expired', user, {
      tool,
      confirmation_id: row.id,
      args_hash: argsHash,
      result: 'failure',
    });
    throw new McpToolError(
      'Confirmation expirée : en demander une nouvelle',
      'MCP_CONFIRM_EXPIRED',
    );
  }
  if (row.status !== 'pending') {
    throw new McpToolError(`Confirmation déjà ${row.status}`, 'MCP_CONFIRM_STATE');
  }

  if (!codesMatch(hashCode(code), row.code_hash)) {
    const attempts = Number(row.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await execute(
        "UPDATE mcp_confirmations SET attempts = ?, status = 'locked' WHERE id = ? AND status = 'pending'",
        [attempts, row.id],
      );
      await auditConfirm('mcp.confirm.locked', user, {
        tool,
        confirmation_id: row.id,
        args_hash: argsHash,
        result: 'failure',
        reason: 'max_attempts',
      });
      throw new McpToolError(
        'Trop d’essais incorrects : confirmation verrouillée',
        'MCP_CONFIRM_LOCKED',
      );
    }
    await execute("UPDATE mcp_confirmations SET attempts = ? WHERE id = ? AND status = 'pending'", [
      attempts,
      row.id,
    ]);
    await auditConfirm('mcp.confirm.failed', user, {
      tool,
      confirmation_id: row.id,
      args_hash: argsHash,
      result: 'failure',
      reason: 'bad_code',
    });
    throw new McpToolError(
      `Code incorrect (essai ${attempts}/${MAX_ATTEMPTS})`,
      'MCP_CONFIRM_BAD_CODE',
    );
  }

  const marked = await execute(
    `UPDATE mcp_confirmations
        SET status = 'consumed', consumed_at = NOW(), attempts = attempts + 1
      WHERE id = ? AND status = 'pending'`,
    [row.id],
  );
  if (marked.affectedRows !== 1) {
    throw new McpToolError('Confirmation déjà consommée', 'MCP_CONFIRM_CONSUMED');
  }
  await auditConfirm('mcp.confirm.succeeded', user, {
    tool,
    confirmation_id: row.id,
    args_hash: argsHash,
  });
  return true;
}

module.exports = {
  CONFIRM_TTL_MS,
  MAX_ATTEMPTS,
  MAX_PENDING_PER_USER,
  confirmationFields,
  consumeConfirmation,
  ensureConfirmed,
  hashArgs,
  hashCode,
  requestConfirmation,
  sixDigitCode,
};
