#!/usr/bin/env node
/**
 * Sondes transport HTTP/1.1 vs HTTP/2 vers une base URL (prod ou locale).
 * Utile pour corréler les erreurs Chrome ERR_HTTP2_PROTOCOL_ERROR avec la pile o2switch / Tiger Protect.
 *
 * Usage:
 *   node scripts/prod-transport-probe.mjs
 *   node scripts/prod-transport-probe.mjs --base-url https://foretmap.olution.info
 *
 * Variables:
 *   FORETMAP_PROD_BASE_URL | DEPLOY_BASE_URL  (défaut https://foretmap.olution.info)
 *   FORETMAP_TRANSPORT_PROBE_JWT | FORETMAP_SOCKETIO_LOAD_JWT  (optionnel) — une connexion Socket.IO polling ~5s
 */

import http2 from 'node:http2';
import https from 'node:https';
import { URL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const UA = 'ForetMap-TransportProbe/1.0';
const DEFAULT_BASE = 'https://foretmap.olution.info';

function parseArgs(argv) {
  let baseUrl = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base-url' && argv[i + 1]) baseUrl = argv[i + 1];
  }
  if (!baseUrl) {
    baseUrl =
      String(process.env.FORETMAP_PROD_BASE_URL || process.env.DEPLOY_BASE_URL || '').trim() ||
      DEFAULT_BASE;
  }
  return baseUrl.replace(/\/+$/, '');
}

function http1Get(urlString, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain;q=0.9,*/*;q=0.8',
          'User-Agent': UA,
        },
        ALPNProtocols: ['http/1.1'],
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            bytes: Buffer.byteLength(raw, 'utf8'),
            snippet: raw.slice(0, 120).replace(/\s+/g, ' '),
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${timeoutMs}ms`)));
    req.on('error', reject);
    req.end();
  });
}

function http2SingleGet(origin, pathQuery, timeoutMs) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(origin, { timeout: timeoutMs });
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`h2 connect timeout ${timeoutMs}ms`));
    }, timeoutMs);

    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const req = client.request({
      ':method': 'GET',
      ':path': pathQuery,
      'user-agent': UA,
      accept: 'application/json, text/plain;q=0.9,*/*;q=0.8',
    });

    let raw = '';
    let st = 0;
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      st = Number(headers[':status']) || 0;
    });
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      clearTimeout(timer);
      client.close();
      resolve({
        status: st,
        ok: st >= 200 && st < 300,
        bytes: Buffer.byteLength(raw, 'utf8'),
        snippet: raw.slice(0, 120).replace(/\s+/g, ' '),
      });
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      client.close();
      reject(err);
    });
    req.end();
  });
}

function http2MultiplexGet(origin, paths, timeoutMs) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(origin, { timeout: timeoutMs });
    const deadline = setTimeout(() => {
      client.destroy();
      reject(new Error(`h2 multiplex timeout ${timeoutMs}ms`));
    }, timeoutMs);

    client.on('error', (err) => {
      clearTimeout(deadline);
      reject(err);
    });

    const results = [];
    let pending = paths.length;

    const doneOne = (entry) => {
      results.push(entry);
      pending -= 1;
      if (pending <= 0) {
        clearTimeout(deadline);
        client.close();
        resolve(results);
      }
    };

    for (const p of paths) {
      const req = client.request({
        ':method': 'GET',
        ':path': p,
        'user-agent': UA,
        accept: 'application/json, text/plain;q=0.9,*/*;q=0.8',
      });
      let raw = '';
      let st = 0;
      req.setEncoding('utf8');
      req.on('response', (headers) => {
        st = Number(headers[':status']) || 0;
      });
      req.on('data', (c) => {
        raw += c;
      });
      req.on('end', () => {
        doneOne({
          path: p,
          status: st,
          ok: st >= 200 && st < 300,
          bytes: Buffer.byteLength(raw, 'utf8'),
        });
      });
      req.on('error', (err) => {
        doneOne({ path: p, error: err.message });
      });
      req.end();
    }
  });
}

function probeSocketIoShort(baseUrl, token, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    try {
      const { io } = require('socket.io-client');
      const origin = new URL(baseUrl).origin;
      const socket = io(origin, {
        path: '/socket.io',
        auth: { token, mapId: 'foret' },
        transports: ['polling'],
        upgrade: false,
        reconnection: false,
        timeout: Math.min(15000, timeoutMs),
      });

      const t = setTimeout(() => {
        socket.disconnect();
        finish({ ok: false, reason: 'probe_timeout' });
      }, Math.min(12000, timeoutMs));

      socket.on('connect', () => {
        clearTimeout(t);
        socket.disconnect();
        finish({ ok: true, id: socket.id || null });
      });
      socket.on('connect_error', (err) => {
        clearTimeout(t);
        finish({ ok: false, reason: 'connect_error', message: err?.message || String(err) });
      });
    } catch (e) {
      finish({ ok: false, reason: 'require_failed', message: e?.message || String(e) });
    }
  });
}

async function timed(name, fn) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { name, ok: true, ms: Date.now() - t0, value };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, error: e?.message || String(e) };
  }
}

async function main() {
  const baseUrl = parseArgs(process.argv.slice(2));
  const origin = new URL(baseUrl).origin;
  const timeoutMs = 20000;
  const paths = [
    '/api/health',
    '/api/ready',
    '/api/version',
    '/socket.io/?EIO=4&transport=polling',
  ];

  const out = {
    baseUrl,
    origin,
    userAgent: UA,
    http1: {},
    http2: {},
    socketIoShort: null,
  };

  for (const p of paths) {
    const full = new URL(p, baseUrl).toString();
    const r = await timed(`h1:${p}`, () => http1Get(full, timeoutMs));
    out.http1[p] = r.ok ? r.value : { error: r.error, ms: r.ms };
  }

  for (const p of paths) {
    const r = await timed(`h2:${p}`, () => http2SingleGet(origin, p, timeoutMs));
    out.http2[`sequential${p}`] = r.ok ? r.value : { error: r.error, ms: r.ms };
  }

  const mux = await timed('h2:multiplex', () => http2MultiplexGet(origin, paths, timeoutMs));
  out.http2.multiplex = mux.ok ? mux.value : { error: mux.error, ms: mux.ms };

  const jwt = String(
    process.env.FORETMAP_TRANSPORT_PROBE_JWT || process.env.FORETMAP_SOCKETIO_LOAD_JWT || ''
  ).trim();
  if (jwt) {
    out.socketIoShort = await probeSocketIoShort(baseUrl, jwt, timeoutMs);
  }

  const h1AllOk = paths.every((p) => out.http1[p]?.ok === true);
  const h2SeqOk = paths.every((p) => {
    const v = out.http2[`sequential${p}`];
    return v && v.ok === true;
  });
  const muxOk =
    Array.isArray(out.http2.multiplex) &&
    out.http2.multiplex.length === paths.length &&
    out.http2.multiplex.every((x) => x.ok === true);

  out.summary = {
    http1AllOk: h1AllOk,
    http2SequentialAllOk: h2SeqOk,
    http2MultiplexAllOk: muxOk,
    socketIoSkipped: !jwt,
  };

  console.log(JSON.stringify(out, null, 2));

  if (!h1AllOk || !h2SeqOk || !muxOk) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[prod-transport-probe]', e);
  process.exit(1);
});
