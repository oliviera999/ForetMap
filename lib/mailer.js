const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;
let warnedNotConfigured = false;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const forceJson = String(process.env.SMTP_JSON_TRANSPORT || '').toLowerCase() === 'true';

  if (forceJson) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  if (!host) {
    if (!warnedNotConfigured) {
      warnedNotConfigured = true;
      logger.warn('SMTP non configuré: aucun email de réinitialisation ne sera envoyé.');
    }
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  return transporter;
}

function getFromAddress() {
  return process.env.SMTP_FROM || 'ForetMap <no-reply@foretmap.local>';
}

/** Échappe les caractères HTML pour neutraliser toute injection via une valeur
 *  contrôlée par l'utilisateur interpolée dans le corps HTML de l'email. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendPasswordResetEmail({ to, displayName, resetUrl, roleLabel }) {
  const tx = getTransporter();
  if (!tx) return false;
  const safeName = (displayName || '').trim() || 'Utilisateur';
  const text = [
    `Bonjour ${safeName},`,
    '',
    `Une demande de réinitialisation de mot de passe (${roleLabel}) a été reçue sur ForetMap.`,
    'Si vous êtes à l’origine de cette demande, utilisez ce lien :',
    resetUrl,
    '',
    'Ce lien est valable 60 minutes et ne peut être utilisé qu’une fois.',
    'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.',
  ].join('\n');

  const html = `
    <p>Bonjour ${escapeHtml(safeName)},</p>
    <p>Une demande de réinitialisation de mot de passe (${escapeHtml(roleLabel)}) a été reçue sur ForetMap.</p>
    <p>Si vous êtes à l’origine de cette demande, utilisez ce lien :</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>Ce lien est valable 60 minutes et ne peut être utilisé qu’une fois.</p>
    <p>Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.</p>
  `;

  await tx.sendMail({
    from: getFromAddress(),
    to,
    subject: 'ForetMap - Réinitialisation du mot de passe',
    text,
    html,
  });
  return true;
}

/** Alerte d'exploitation (déploiement/santé) envoyée à l'équipe.
 *  Destinataire : OPS_ALERT_TO, sinon SMTP_USER. Sans SMTP configuré → no-op (false).
 *  Ne lève jamais : la chaîne d'appel (cron) ne doit pas casser sur un SMTP indisponible. */
async function sendOpsAlert({ subject, text }) {
  const to = process.env.OPS_ALERT_TO || process.env.SMTP_USER || '';
  const tx = getTransporter();
  if (!tx || !to) {
    if (!to) logger.warn("OPS_ALERT_TO/SMTP_USER absents : alerte d'exploitation non envoyée.");
    return false;
  }
  const safeSubject = String(subject || 'Alerte ForetMap').trim();
  const body = String(text || '').trim();
  try {
    await tx.sendMail({
      from: getFromAddress(),
      to,
      subject: `[ForetMap ops] ${safeSubject}`,
      text: body,
      html: `<pre style="font:13px/1.5 monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
    });
    return true;
  } catch (err) {
    logger.error({ err }, "Échec d'envoi de l'alerte d'exploitation.");
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendOpsAlert,
};
