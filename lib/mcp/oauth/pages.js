'use strict';

/**
 * Pages HTML du serveur d'autorisation (connexion, second facteur, consentement, erreur).
 *
 * Rendu serveur minimal, sans aucun script : pas de dépendance au build Vite, et une CSP
 * dédiée (`consentPageCsp`) qui n'autorise que les styles inline de la page et la soumission
 * du formulaire vers notre origine **et** vers l'origine de redirection du client (Chrome
 * applique `form-action` à la redirection 302 qui suit la soumission). Marque via
 * `lib/brand.js`, couleurs du thème forêt (`src/index.css`).
 */

const { getBrand } = require('../../brand');
const { SCOPES } = require('../config');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SCOPE_LABELS = Object.freeze({
  [SCOPES.READ]:
    'Lire le contenu pédagogique (espèces, cartes, glossaires, QCM, G&L) et les audits de cohérence — jamais les comptes ni les données des élèves',
  [SCOPES.WRITE]:
    'Préparer puis appliquer des corrections de contenu (chaque correction est montrée avant application et journalisée)',
  [SCOPES.OFFLINE]: 'Rester connecté (renouvellement automatique de l’accès)',
});

const STYLE = `
:root{--forest:#1a4731;--leaf:#2d6a4f;--cream:#fefae0;--ink:#1f2a24;--warn:#8a5a00;--danger:#9b2226}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--cream);color:var(--ink);line-height:1.5}
main{max-width:520px;margin:6vh auto;padding:0 16px}
.card{background:#fff;border:1px solid #d8d3b8;border-radius:14px;padding:24px;box-shadow:0 2px 10px rgba(26,71,49,.08)}
h1{font-size:1.3rem;color:var(--forest);margin:0 0 4px}p.sub{margin:0 0 16px;color:#4b5a51}
label{display:block;font-weight:600;margin:14px 0 6px}
input[type=text],input[type=password]{width:100%;min-height:44px;padding:10px 12px;border:1px solid #b9b49a;border-radius:10px;font-size:1rem}
button{min-height:44px;padding:10px 18px;border-radius:10px;border:0;font-size:1rem;font-weight:600;cursor:pointer}
.primary{background:var(--leaf);color:#fff}.secondary{background:#e9e5cc;color:var(--ink)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.box{background:#f4f1de;border-radius:10px;padding:12px 14px;margin:12px 0}
.box strong{color:var(--forest)}ul{margin:6px 0 0;padding-left:20px}
.warn{background:#fff4d6;border:1px solid #e6c36a;color:var(--warn);border-radius:10px;padding:10px 12px;margin:12px 0}
.err{background:#fde8e8;border:1px solid #e4a3a3;color:var(--danger);border-radius:10px;padding:10px 12px;margin:12px 0}
code{font-family:ui-monospace,monospace;font-size:.9em;word-break:break-all}
small{color:#5b675f}
`;

function layout(title, inner) {
  const brand = getBrand();
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} — ${esc(brand.appName)}</title>
<style>${STYLE}</style></head>
<body><main><div class="card">${inner}</div>
<p><small>${esc(brand.appName)}${brand.orgName ? ` · ${esc(brand.orgName)}` : ''} — connecteur Claude (MCP)</small></p>
</main></body></html>`;
}

/** Résumé de la demande : application, hôte de redirection, portées, avertissement loopback. */
function requestSummary(ctx) {
  const scopes = (ctx.scopes || []).map(
    (s) =>
      `<li>${esc((Object.hasOwn(SCOPE_LABELS, s) && SCOPE_LABELS[s]) || s)} <small>(<code>${esc(s)}</code>)</small></li>`,
  );
  const loopback = ctx.loopback
    ? `<div class="warn"><strong>Attention :</strong> la redirection se fait vers une adresse locale (<code>${esc(ctx.redirectHost)}</code>), utilisée par Claude Code sur un ordinateur. N’autorisez que si vous venez vous-même de lancer cette connexion depuis votre poste : n’importe quel programme local peut écouter cette adresse.</div>`
    : '';
  return `<div class="box">
<div><strong>Application :</strong> ${esc(ctx.clientName || ctx.clientHost)} <small>(identifiée par <code>${esc(ctx.clientHost)}</code>)</small></div>
<div><strong>Retour vers :</strong> <code>${esc(ctx.redirectHost)}</code></div>
<div><strong>Accès demandé :</strong><ul>${scopes.join('')}</ul></div>
</div>${loopback}`;
}

function hidden(name, value) {
  return `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
}

function loginPage(ctx) {
  return layout(
    'Connexion',
    `<h1>Connecter Claude à ${esc(getBrand().appName)}</h1>
<p class="sub">Connectez-vous avec votre compte enseignant ou administrateur.</p>
${requestSummary(ctx)}
${ctx.error ? `<div class="err" role="alert">${esc(ctx.error)}</div>` : ''}
<form method="post" action="/oauth/authorize" autocomplete="on">
${hidden('step', 'login')}${hidden('request', ctx.requestToken)}${hidden('csrf', ctx.csrf)}
<label for="identifier">E-mail ou pseudo</label>
<input id="identifier" name="identifier" type="text" autocomplete="username" required value="${esc(ctx.identifier || '')}">
<label for="password">Mot de passe</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<div class="row"><button class="primary" type="submit">Se connecter</button>
<button class="secondary" type="submit" name="decision" value="deny" formnovalidate>Annuler</button></div>
</form>`,
  );
}

function totpPage(ctx) {
  return layout(
    'Double authentification',
    `<h1>Double authentification</h1>
<p class="sub">Saisissez le code à 6 chiffres de votre application d’authentification, ou un code de secours.</p>
${requestSummary(ctx)}
${ctx.error ? `<div class="err" role="alert">${esc(ctx.error)}</div>` : ''}
<form method="post" action="/oauth/authorize" autocomplete="off">
${hidden('step', 'totp')}${hidden('request', ctx.requestToken)}${hidden('csrf', ctx.csrf)}${hidden('mfa', ctx.mfaToken)}
<label for="code">Code</label>
<input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="32" required>
<div class="row"><button class="primary" type="submit">Valider</button>
<button class="secondary" type="submit" name="decision" value="deny" formnovalidate>Annuler</button></div>
</form>`,
  );
}

function consentPage(ctx) {
  return layout(
    'Autoriser Claude',
    `<h1>Autoriser Claude ?</h1>
<p class="sub">Connecté(e) en tant que <strong>${esc(ctx.accountLabel)}</strong>.</p>
${requestSummary(ctx)}
<p><small>Vous pourrez retirer cet accès à tout moment dans les réglages de Claude ; un administrateur peut aussi retirer la permission « Connecteur Claude (MCP) ».</small></p>
<form method="post" action="/oauth/authorize">
${hidden('step', 'consent')}${hidden('request', ctx.requestToken)}${hidden('csrf', ctx.csrf)}${hidden('consent', ctx.consentToken)}
<div class="row"><button class="primary" type="submit" name="decision" value="approve">Autoriser</button>
<button class="secondary" type="submit" name="decision" value="deny">Refuser</button></div>
</form>`,
  );
}

function errorPage(message, detail) {
  return layout(
    'Erreur',
    `<h1>Connexion impossible</h1><div class="err" role="alert">${esc(message)}</div>${
      detail ? `<p><small>${esc(detail)}</small></p>` : ''
    }`,
  );
}

/** CSP de la page : aucun script, styles inline de la page, formulaire vers nous et le client. */
function consentPageCsp(redirectUri) {
  const targets = ["'self'"];
  try {
    const u = new URL(redirectUri);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]') {
      targets.push(`${u.protocol}//${u.hostname}:*`, `${u.protocol}//${u.hostname}`);
    } else {
      targets.push(u.origin);
    }
  } catch (_) {
    /* pas de redirection connue : formulaire vers nous seulement */
  }
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    `form-action ${targets.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
}

module.exports = { consentPage, consentPageCsp, errorPage, esc, loginPage, totpPage };
