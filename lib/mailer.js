const { getBrand } = require('./brand');
const logger = require('./logger');

// Chargé au premier envoi d'email (~+15 Mo de RSS au boot sinon — audit charge
// serveur, piste 1) : nodemailer ne sert qu'aux résets de mot de passe et alertes.
let nodemailerLazy = null;
function getNodemailer() {
  if (!nodemailerLazy) nodemailerLazy = require('nodemailer');
  return nodemailerLazy;
}

let transporter = null;
let warnedNotConfigured = false;

function getTransporter() {
  if (transporter) return transporter;
  const nodemailer = getNodemailer();

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
  return process.env.SMTP_FROM || `${getBrand().appName} <no-reply@foretmap.local>`;
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
    `Une demande de réinitialisation de mot de passe (${roleLabel}) a été reçue sur ${getBrand().appName}.`,
    'Si vous êtes à l’origine de cette demande, utilisez ce lien :',
    resetUrl,
    '',
    'Ce lien est valable 60 minutes et ne peut être utilisé qu’une fois.',
    'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.',
  ].join('\n');

  const html = `
    <p>Bonjour ${escapeHtml(safeName)},</p>
    <p>Une demande de réinitialisation de mot de passe (${escapeHtml(roleLabel)}) a été reçue sur ${escapeHtml(getBrand().appName)}.</p>
    <p>Si vous êtes à l’origine de cette demande, utilisez ce lien :</p>
    <p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
    <p>Ce lien est valable 60 minutes et ne peut être utilisé qu’une fois.</p>
    <p>Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.</p>
  `;

  await tx.sendMail({
    from: getFromAddress(),
    to,
    subject: `${getBrand().appName} - Réinitialisation du mot de passe`,
    text,
    html,
  });
  return true;
}

/**
 * Envoi du courriel de réinitialisation **sans l'attendre** (AC5, audit sécurité 2026-09-30).
 *
 * « Mot de passe oublié » répond le même message que le compte existe ou non ; mais en
 * attendant le SMTP, la réponse était bien plus lente pour un compte existant (et tombait en
 * 500 sur un SMTP en panne) — l'existence du compte se lisait au chronomètre. L'erreur
 * éventuelle est journalisée, jamais renvoyée.
 *
 * @param {object} args mêmes arguments que `sendPasswordResetEmail`
 * @param {object} [context] champs de log (`requestId`, `userType`…)
 */
function queuePasswordResetEmail(args, context = {}) {
  Promise.resolve()
    .then(() => sendPasswordResetEmail(args))
    .catch((err) => {
      logger.error({ err, ...context }, 'Échec d’envoi du courriel de réinitialisation');
    });
}

/**
 * Avertit l'**ancienne** adresse qu'elle n'est plus celle du compte (audit sécurité
 * 2026-09-30, AC2/AC3) : un changement d'e-mail suivi d'un « mot de passe oublié » est la voie
 * classique pour rendre durable une prise de compte. Aucun lien d'action, pas de nouvelle
 * adresse en clair (seulement masquée). `false` si SMTP n'est pas configuré.
 */
async function sendEmailChangedNotice({ to, displayName, newEmailMasked, changedBy }) {
  const tx = getTransporter();
  if (!tx) return false;
  const appName = getBrand().appName;
  const safeName = (displayName || '').trim() || 'Utilisateur';
  const byLine =
    changedBy === 'admin'
      ? 'Ce changement a été fait par un responsable de l’application.'
      : 'Ce changement a été fait depuis « Mon profil ».';
  const target = newEmailMasked ? ` (nouvelle adresse : ${newEmailMasked})` : '';
  const text = [
    `Bonjour ${safeName},`,
    '',
    `L’adresse e-mail de votre compte ${appName} vient d’être remplacée${target}.`,
    byLine,
    'Toutes les sessions ouvertes ont été déconnectées.',
    '',
    'Si vous n’êtes pas à l’origine de ce changement, contactez sans attendre un administrateur de l’établissement.',
  ].join('\n');
  const html = `
    <p>Bonjour ${escapeHtml(safeName)},</p>
    <p>L’adresse e-mail de votre compte ${escapeHtml(appName)} vient d’être remplacée${escapeHtml(target)}.</p>
    <p>${escapeHtml(byLine)}</p>
    <p>Toutes les sessions ouvertes ont été déconnectées.</p>
    <p>Si vous n’êtes pas à l’origine de ce changement, contactez sans attendre un administrateur de l’établissement.</p>
  `;
  await tx.sendMail({
    from: getFromAddress(),
    to,
    subject: `${appName} - Adresse e-mail modifiée`,
    text,
    html,
  });
  return true;
}

/**
 * Libellés des avertissements de double authentification : l'événement, puis la conduite à
 * tenir si la personne n'en est pas à l'origine.
 */
const TOTP_NOTICE_TEXTS = Object.freeze({
  enabled: {
    subject: 'Double authentification activée',
    line: 'La double authentification vient d’être activée sur votre compte.',
  },
  device_changed: {
    subject: 'Appareil de double authentification remplacé',
    line: 'L’application qui fournit vos codes de double authentification vient d’être remplacée.',
  },
  backup_codes_regenerated: {
    subject: 'Nouveaux codes de secours',
    line: 'Un nouveau lot de codes de secours vient d’être créé ; les anciens ne fonctionnent plus.',
  },
  backup_code_used: {
    subject: 'Code de secours utilisé',
    line: 'Un code de secours vient d’être utilisé pour vous connecter.',
  },
  reset: {
    subject: 'Double authentification réinitialisée',
    line: 'La double authentification de votre compte vient d’être réinitialisée par un administrateur. Vous la configurerez de nouveau à votre prochaine connexion.',
  },
});

/**
 * Avertit le titulaire d'un compte d'un changement de sa double authentification. Aucun lien
 * d'action, aucun code. `false` si SMTP n'est pas configuré ou l'événement inconnu.
 * @param {{ to: string, displayName?: string, event: keyof typeof TOTP_NOTICE_TEXTS }} args
 */
async function sendTotpSecurityNotice({ to, displayName, event }) {
  const texts = TOTP_NOTICE_TEXTS[event];
  const tx = getTransporter();
  if (!tx || !texts || !to) return false;
  const appName = getBrand().appName;
  const safeName = (displayName || '').trim() || 'Utilisateur';
  const warning =
    'Si vous n’êtes pas à l’origine de cette action, contactez sans attendre un administrateur de l’établissement et changez votre mot de passe.';
  const text = [`Bonjour ${safeName},`, '', `${texts.line} (${appName})`, '', warning].join('\n');
  const html = `
    <p>Bonjour ${escapeHtml(safeName)},</p>
    <p>${escapeHtml(texts.line)} (${escapeHtml(appName)})</p>
    <p>${escapeHtml(warning)}</p>
  `;
  await tx.sendMail({
    from: getFromAddress(),
    to,
    subject: `${appName} - ${texts.subject}`,
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
  const safeSubject = String(subject || `Alerte ${getBrand().appName}`).trim();
  const body = String(text || '').trim();
  try {
    await tx.sendMail({
      from: getFromAddress(),
      to,
      subject: `[${getBrand().appName} ops] ${safeSubject}`,
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
  queuePasswordResetEmail,
  sendEmailChangedNotice,
  sendTotpSecurityNotice,
  sendOpsAlert,
};
