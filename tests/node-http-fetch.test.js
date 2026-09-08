'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { nodeHttpFetch } = require('../lib/nodeHttpFetch');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        url: (path = '/') => `http://127.0.0.1:${port}${path}`,
        async close() {
          await new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

test('nodeHttpFetch : GET JSON, POST formulaire, 5xx sans lever, redirection', async () => {
  const seen = { postBody: null, postType: null };
  const ctx = await listen((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sitename: 'ok' }));
      return;
    }
    if (req.url === '/boom') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'down' }));
      return;
    }
    if (req.url === '/gone') {
      res.writeHead(302, { Location: '/ok' });
      res.end();
      return;
    }
    if (req.url === '/echo' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        seen.postBody = Buffer.concat(chunks).toString('utf8');
        seen.postType = req.headers['content-type'];
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('echoed');
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  try {
    const ok = await nodeHttpFetch(ctx.url('/ok'));
    assert.equal(ok.status, 200);
    assert.equal(ok.ok, true);
    assert.deepEqual(await ok.json(), { sitename: 'ok' });

    const boom = await nodeHttpFetch(ctx.url('/boom'));
    assert.equal(boom.status, 503);
    assert.equal(boom.ok, false);
    assert.equal((await boom.json()).error, 'down');

    const redirected = await nodeHttpFetch(ctx.url('/gone'));
    assert.equal(redirected.status, 200);
    assert.equal(redirected.redirected, true);
    assert.deepEqual(await redirected.json(), { sitename: 'ok' });

    const form = new URLSearchParams();
    form.set('wstoken', 'secret');
    form.set('wsfunction', 'core_webservice_get_site_info');
    const posted = await nodeHttpFetch(ctx.url('/echo'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    assert.equal(posted.status, 200);
    assert.equal(await posted.text(), 'echoed');
    assert.match(seen.postBody, /wstoken=secret/);
    assert.match(seen.postType, /application\/x-www-form-urlencoded/);
  } finally {
    await ctx.close();
  }
});

test('nodeHttpFetch : AbortSignal → AbortError (comme fetch)', async () => {
  const ctx = await listen((_req, _res) => {
    /* volontairement pas de réponse : on abort avant */
  });
  try {
    const controller = new AbortController();
    const pending = nodeHttpFetch(ctx.url('/hang'), { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, (err) => err?.name === 'AbortError');
  } finally {
    await ctx.close();
  }
});
