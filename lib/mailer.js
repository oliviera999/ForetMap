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
    <p>Bonjour ${safeName},</p>
    <p>Une demande de réinitialisation de mot de passe (${roleLabel}) a été reçue sur ForetMap.</p>
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

module.exports = {
  sendPasswordResetEmail,
};
