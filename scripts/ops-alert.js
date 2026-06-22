#!/usr/bin/env node
'use strict';

// Envoi d'une alerte d'exploitation par email (déploiement/santé).
// Réutilise lib/mailer.js (mêmes variables SMTP_*) ; destinataire OPS_ALERT_TO || SMTP_USER.
//
// Usage :
//   node scripts/ops-alert.js "Sujet court" "Corps du message"
//   echo "corps multi-lignes" | node scripts/ops-alert.js "Sujet court"
//
// Ne renvoie JAMAIS un code d'erreur : appelé depuis le cron de déploiement, il ne
// doit pas faire échouer la chaîne si le SMTP est indisponible (il loggue seulement).

require('dotenv').config();
const { sendOpsAlert } = require('../lib/mailer');

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => {
      data += c;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

(async () => {
  const subject = process.argv[2] || 'Alerte';
  let text = process.argv[3];
  if (!text) text = (await readStdin()).trim();
  if (!text) text = subject;

  try {
    const sent = await sendOpsAlert({ subject, text });
    process.stdout.write(
      sent ? '[ops-alert] envoyé\n' : '[ops-alert] non envoyé (SMTP non configuré)\n',
    );
  } catch (err) {
    process.stdout.write(`[ops-alert] erreur ignorée: ${err && err.message}\n`);
  }
  process.exit(0);
})();
