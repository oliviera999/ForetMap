'use strict';

/**
 * Tests purs de lib/glXlsxAttachment — sans BDD.
 * Verrouille le contrat critique : wrapXlsxRoute doit envoyer le buffer quand le
 * handler retourne { buffer, filename } (sinon Express ignore la valeur et le
 * téléchargement admin reste pendant / vide).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sendXlsxAttachment, wrapXlsxRoute, XLSX_CONTENT_TYPE } = require('../lib/glXlsxAttachment');

function mockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  let ended = false;
  return {
    headers,
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
  it('envoie le buffer avec les en-têtes XLSX', () => {
    const res = mockRes();
    const buf = Buffer.from('PK\x03\x04fake-xlsx');
    sendXlsxAttachment(res, buf, 'demo.xlsx');
    const out = res.getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(out.headers['content-type'], XLSX_CONTENT_TYPE);
    assert.match(out.headers['content-disposition'], /demo\.xlsx/);
    assert.equal(out.headers['content-length'], String(buf.length));
    assert.ok(Buffer.isBuffer(out.body));
    assert.equal(out.body.compare(buf), 0);
  });

  it('refuse un buffer vide', () => {
    const res = mockRes();
    sendXlsxAttachment(res, Buffer.alloc(0), 'empty.xlsx');
    const out = res.getResult();
    assert.equal(out.statusCode, 500);
    assert.equal(out.body.error, 'Fichier XLSX vide ou indisponible');
  });
});

describe('wrapXlsxRoute', () => {
  it('envoie automatiquement un retour { buffer, filename }', async () => {
    const buf = Buffer.from('PK\x03\x04workbook');
    const handler = wrapXlsxRoute(async () => ({
      buffer: buf,
      filename: 'modele-glossaire-lore.xlsx',
    }));
    const res = mockRes();
    await handler({}, res);
    const out = res.getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(out.headers['content-type'], XLSX_CONTENT_TYPE);
    assert.match(out.headers['content-disposition'], /modele-glossaire-lore\.xlsx/);
    assert.equal(out.body.compare(buf), 0);
  });

  it('ne renvoie pas deux fois si sendXlsxAttachment a déjà été appelé', async () => {
    const buf = Buffer.from('PK\x03\x04already');
    let sendCalls = 0;
    const handler = wrapXlsxRoute(async (_req, res) => sendXlsxAttachment(res, buf, 'direct.xlsx'));
    const res = mockRes();
    const originalSend = res.send.bind(res);
    res.send = (payload) => {
      sendCalls += 1;
      return originalSend(payload);
    };
    await handler({}, res);
    const out = res.getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.compare(buf), 0);
    assert.equal(sendCalls, 1);
  });

  it('mappe une exception en 500 JSON si la réponse n’est pas partie', async () => {
    const handler = wrapXlsxRoute(async () => {
      throw new Error('génération impossible');
    });
    const res = mockRes();
    await handler({}, res);
    const out = res.getResult();
    assert.equal(out.statusCode, 500);
    assert.equal(out.body.error, 'génération impossible');
  });
});
