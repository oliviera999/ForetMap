'use strict';

/**
 * Sous-ensemble de `fetch` basé sur `http` / `https` natifs (pas undici).
 *
 * Sur un hébergeur CloudLinux (o2switch), l'espace d'adressage du process est souvent
 * plafonné à 4 Gio. `globalThis.fetch` (undici) compile le parseur llhttp en WebAssembly,
 * qui réserve jusqu'à 4 Gio de mémoire linéaire — `WebAssembly.instantiate` échoue alors
 * (`RangeError: Out of memory: Cannot allocate Wasm memory`). Les modules `http`/`https`
 * utilisent le parseur C++ et restent utilisables.
 *
 * Couverture volontairement minimale : GET/POST, corps texte / Buffer / URLSearchParams,
 * `AbortSignal`, redirections GET. Suffisant pour le client Moodle et le contrôle JWKS LTI.
 */

const http = require('node:http');
const https = require('node:https');

const MAX_REDIRECTS = 5;

function toHeaderObject(headers) {
  if (!headers) return {};
  if (typeof headers.forEach === 'function') {
    const out = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  return { ...headers };
}

function encodeBody(body) {
  if (body == null) return null;
  if (typeof body === 'string' || Buffer.isBuffer(body)) return body;
  if (typeof body.toString === 'function' && typeof body.append === 'function') {
    return body.toString();
  }
  return String(body);
}

function abortError() {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function makeResponse({ status, statusText, headers, buffer, url, redirected }) {
  const text = () => Promise.resolve(buffer.toString('utf8'));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText || '',
    url,
    redirected,
    headers: {
      get(name) {
        const raw = headers[String(name).toLowerCase()];
        if (raw == null) return null;
        return Array.isArray(raw) ? raw.join(', ') : String(raw);
      },
    },
    text,
    json: async () => JSON.parse(await text()),
  };
}

function requestOnce(url, { method, headers, body, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new TypeError(`nodeHttpFetch : protocole non supporté (${parsed.protocol})`));
      return;
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const payload = method === 'GET' || method === 'HEAD' ? null : encodeBody(body);
    const hdrs = toHeaderObject(headers);
    if (payload != null && hdrs['Content-Length'] == null && hdrs['content-length'] == null) {
      hdrs['Content-Length'] = Buffer.byteLength(payload);
    }

    let settled = false;
    let removeAbort = () => {};
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      removeAbort();
      fn(arg);
    };

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: hdrs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          finish(resolve, {
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: res.headers,
            buffer: Buffer.concat(chunks),
            url: parsed.href,
          });
        });
        res.on('error', (error) => finish(reject, error));
      },
    );

    const onAbort = () => {
      req.destroy();
      finish(reject, abortError());
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => signal.removeEventListener('abort', onAbort);
    }
    req.on('error', (error) => finish(reject, error));
    if (payload != null) req.write(payload);
    req.end();
  });
}

/**
 * @param {string|URL} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ ok: boolean, status: number, statusText: string, url: string, redirected: boolean, headers: { get(name: string): string|null }, text(): Promise<string>, json(): Promise<any> }>}
 */
async function nodeHttpFetch(url, init = {}) {
  let current = String(url);
  let method = String(init.method || 'GET').toUpperCase();
  let body = init.body;
  let redirected = false;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const raw = await requestOnce(current, {
      method,
      headers: init.headers,
      body,
      signal: init.signal,
    });
    const location = raw.headers.location;
    const isRedirect = raw.status >= 300 && raw.status < 400 && location;
    if (isRedirect && hop < MAX_REDIRECTS) {
      current = new URL(location, current).href;
      redirected = true;
      if (
        raw.status === 303 ||
        ((raw.status === 301 || raw.status === 302) && method !== 'GET' && method !== 'HEAD')
      ) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    return makeResponse({ ...raw, redirected });
  }
  throw new Error('nodeHttpFetch : trop de redirections');
}

module.exports = { nodeHttpFetch, MAX_REDIRECTS };
