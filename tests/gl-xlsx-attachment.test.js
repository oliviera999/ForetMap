'use strict';

/**
 * Tests purs de `lib/glXlsxAttachment` — sans base.
 *
 * Verrouille le contrat qui manquait : `wrapXlsxRoute` doit **envoyer** le classeur quand
 * le handler se contente de retourner `{ buffer, filename }`. Express ignorant la valeur
 * de retour d'un handler, l'absence d'envoi laissait la requête pendante et les six
 * boutons de téléchargement du panneau contenus lore sans effet.
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sendXlsxAttachment, wrapXlsxRoute, XLSX_CONTENT_TYPE } = require('../lib/glXlsxAttachment');

/** Réponse Express minimale : retient statut, en-têtes, corps, et si la réponse est partie. */
function mockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  let ended = false;
  return {
    get headersSent() {
      return ended;
    },
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      ended = true;
      body = payload;
      return this;
    },
    send(payload) {
      ended = true;
      body = payload;
      return this;
    },
    getResult() {
      return { statusCode, headers, body, ended };
    },
  };
}

describe('sendXlsxAttachment', () => {
  it('envoie le buffer avec les en-têtes de pièce jointe XLSX', () => {
    const res = mockRes();
    const buf = Buffer.from('PK\x03\x04faux-xlsx');
    sendXlsxAttachment(res, buf, 'demo.xlsx');
    const out = res.getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(out.headers['content-type'], XLSX_CONTENT_TYPE);
    assert.match(out.headers['content-disposition'], /demo\.xlsx/);
    assert.equal(out.headers['content-length'], String(buf.length));
    assert.equal(out.body.compare(buf), 0);
  });

  it('refuse un buffer vide plutôt que de livrer un fichier illisible', () => {
    const res = mockRes();
    sendXlsxAttachment(res, Buffer.alloc(0), 'vide.xlsx');
    const out = res.getResult();
    assert.equal(out.statusCode, 500);
    assert.equal(out.body.error, 'Fichier XLSX vide ou indisponible');
  });
});

describe('wrapXlsxRoute', () => {
  it('envoie automatiquement un retour { buffer, filename }', async () => {
    const buf = Buffer.from('PK\x03\x04classeur');
    const handler = wrapXlsxRoute(async () => ({
      buffer: buf,
      filename: 'modele-glossaire-lore.xlsx',
    }));
    const res = mockRes();
    await handler({}, res);
    const out = res.getResult();
    assert.equal(out.ended, true, 'la réponse doit partir — sinon requête pendante');
    assert.equal(out.headers['content-type'], XLSX_CONTENT_TYPE);
    assert.match(out.headers['content-disposition'], /modele-glossaire-lore\.xlsx/);
    assert.equal(out.body.compare(buf), 0);
  });

  it('n’envoie pas deux fois si le handler a déjà répondu lui-même', async () => {
    const buf = Buffer.from('PK\x03\x04deja');
    let sendCalls = 0;
    const handler = wrapXlsxRoute(async (_req, res) => sendXlsxAttachment(res, buf, 'direct.xlsx'));
    const res = mockRes();
    const originalSend = res.send.bind(res);
    res.send = (payload) => {
      sendCalls += 1;
      return originalSend(payload);
    };
    await handler({}, res);
    assert.equal(sendCalls, 1);
    assert.equal(res.getResult().body.compare(buf), 0);
  });

  it('laisse passer un retour qui n’est pas un classeur', async () => {
    const handler = wrapXlsxRoute(async () => ({ filename: 'sans-buffer.xlsx' }));
    const res = mockRes();
    await handler({}, res);
    assert.equal(res.getResult().ended, false);
  });

  it('mappe une exception en 500 JSON tant que la réponse n’est pas partie', async () => {
    const handler = wrapXlsxRoute(async () => {
      throw new Error('génération impossible');
    });
    const res = mockRes();
    await handler({}, res);
    const out = res.getResult();
    assert.equal(out.statusCode, 500);
    assert.equal(out.body.error, 'génération impossible');
  });

  it('laisse remonter l’erreur si la réponse est déjà partie', async () => {
    const handler = wrapXlsxRoute(async (_req, res) => {
      sendXlsxAttachment(res, Buffer.from('PK\x03\x04'), 'ok.xlsx');
      throw new Error('trop tard');
    });
    const res = mockRes();
    await assert.rejects(() => handler({}, res), /trop tard/);
  });
});
