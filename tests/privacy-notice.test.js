'use strict';

// Notice « Vos données » (audit sécurité/RGPD du 30/09/2026, RG1) : ce que le serveur doit
// garantir pour qu'elle dise vrai.
//  1. Les durées affichées recopient les constantes du code : une purge raccourcie ou allongée
//     sans mise à jour de la notice ferait tomber ce test.
//  2. Le contact « données personnelles » est un réglage public, servi à TOUS les produits
//     (la notice se lit sans compte sur ForetMap, G&L, le plan et le plan des personnels).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function readConst(file, name) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const match = new RegExp(`const ${name} = ([0-9 *]+);`).exec(source);
  assert.ok(match, `${name} introuvable dans ${file}`);
  return match[1]
    .split('*')
    .map((part) => Number(part.trim()))
    .reduce((a, b) => a * b, 1);
}

async function loadNotice() {
  return import(path.join(ROOT, 'src/shared/privacy/privacyNoticeContent.js'));
}

test('notice : les durées de conservation affichées sont celles du code', async () => {
  const { PRIVACY_RETENTION: R } = await loadNotice();
  const purge = require('../scripts/purge-audit-logs');
  const { IDENTITY_SETTINGS } = require('../lib/settings/identity');

  assert.equal(R.securityDays, purge.DEFAULT_RETENTION_DAYS);
  assert.equal(R.historyDays, purge.DEFAULT_HISTORY_RETENTION_DAYS);
  assert.equal(R.activityDays, purge.DEFAULT_ACTIVITY_RETENTION_DAYS);
  assert.equal(R.usageCountersDays, purge.DEFAULT_VISITS_RETENTION_DAYS);
  assert.equal(R.ipFullDays, purge.DEFAULT_IP_RETENTION_DAYS);
  assert.equal(
    R.accountMonthsAfterDeparture,
    require('../lib/retention/policy').ACCOUNT_RETENTION_MONTHS,
  );
  assert.equal(R.sessionMinutes * 60, IDENTITY_SETTINGS['security.jwt_ttl_base_seconds'].default);
  assert.equal(
    R.sessionMaxHours * 3600,
    IDENTITY_SETTINGS['security.jwt_sliding_max_seconds'].default,
  );
  assert.equal(R.notificationsDays, readConst('lib/notifications.js', 'DEFAULT_RETENTION_DAYS'));
  assert.equal(
    R.passwordResetMinutes,
    readConst('lib/passwordReset.js', 'PASSWORD_RESET_TTL_MINUTES'),
  );
  assert.equal(R.guestVisitHours * 3600, readConst('routes/visit.js', 'ANON_TTL_SECONDS'));
  assert.equal(R.planAccessDays * 86400, readConst('lib/planAccess.js', 'PLAN_ACCESS_TTL_SECONDS'));
  assert.equal(
    R.staffPlanAccessDays * 86400,
    readConst('lib/staffPlanAccess.js', 'STAFF_PLAN_ACCESS_TTL_SECONDS'),
  );
});

test('réglage privacy.data_contact : public, texte borné, vide par défaut', async () => {
  const { PRIVACY_SETTINGS } = require('../lib/settings/privacy');
  const { PRIVACY_CONTACT_MAX_LENGTH } = await loadNotice();
  const meta = PRIVACY_SETTINGS['privacy.data_contact'];
  assert.ok(meta, 'réglage absent du registre');
  assert.equal(meta.scope, 'public');
  assert.equal(meta.type, 'string');
  assert.equal(meta.default, '');
  assert.equal(meta.maxLength, PRIVACY_CONTACT_MAX_LENGTH);
});

test('réglage privacy.data_contact : servi à chaque produit par /api/settings/public', () => {
  const { PUBLIC_SETTINGS_SCOPES, scopePublicSettings } = require('../lib/publicSettingsScope');
  const nested = {
    privacy: { data_contact: 'DPO : dpo@exemple.invalid', external_assets_mode: 'local' },
    ui: { auth: { allow_register: true } },
  };
  for (const product of Object.keys(PUBLIC_SETTINGS_SCOPES)) {
    const scoped = scopePublicSettings(nested, product);
    assert.equal(
      scoped?.privacy?.data_contact,
      'DPO : dpo@exemple.invalid',
      `contact absent pour le produit ${product}`,
    );
  }
});

test('notice du plan e-nov : celle du plan public, sous son propre nom', async () => {
  const { buildPrivacyNotice, PRIVACY_NOTICE_PRODUCTS } = await loadNotice();
  const { PRODUCT_IDS } = require('../lib/products');
  // Chaque produit du registre a sa notice : un produit ajouté sans elle ne la servirait pas.
  for (const id of PRODUCT_IDS) assert.ok(PRIVACY_NOTICE_PRODUCTS.includes(id), id);

  const brand = { orgName: 'Lycée Test', orgShortName: 'Test' };
  const enov = buildPrivacyNotice({ product: 'enov', brand });
  const plan = buildPrivacyNotice({ product: 'plan', brand });
  assert.equal(enov.productName, 'Plan e-nov Test');
  // Même contenu (aucune donnée, cookie de code), nom du produit mis à part.
  const strip = (notice) =>
    JSON.stringify(notice.sections).split(notice.productName).join('<produit>');
  assert.equal(strip(enov), strip(plan));
  assert.equal(enov.product, 'plan', 'mise en page du plan public');
});
