'use strict';

// Test de lib/mailer.sendOpsAlert — sans réseau (jsonTransport) ni base de données.
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');

let sendOpsAlert;

before(() => {
  process.env.SMTP_JSON_TRANSPORT = 'true';
  ({ sendOpsAlert } = require('../lib/mailer'));
});

describe('sendOpsAlert', () => {
  beforeEach(() => {
    delete process.env.OPS_ALERT_TO;
    delete process.env.SMTP_USER;
  });

  it('envoie quand un destinataire est configuré (OPS_ALERT_TO)', async () => {
    process.env.OPS_ALERT_TO = 'ops@example.com';
    const ok = await sendOpsAlert({
      subject: 'Déploiement KO',
      text: 'post-deploy-check a échoué',
    });
    assert.equal(ok, true);
  });

  it('retombe sur SMTP_USER si OPS_ALERT_TO absent', async () => {
    process.env.SMTP_USER = 'smtp-user@example.com';
    const ok = await sendOpsAlert({ subject: 'Test', text: 'corps' });
    assert.equal(ok, true);
  });

  it('no-op (false) sans destinataire configuré', async () => {
    const ok = await sendOpsAlert({ subject: 'Test', text: 'corps' });
    assert.equal(ok, false);
  });
});
