'use strict';

/**
 * Garde SSRF pour le relais d'images (lot B — traceurs RGPD).
 * Résolution DNS exhaustive + refus des plages privées / réservées via `net.BlockList`.
 */

const dns = require('dns');
const net = require('net');
const https = require('https');
const { BlockList } = require('net');

const LOOKUP_TIMEOUT_MS = 5_000;

/** Plages non routables / réservées (IPv4 + IPv6). */
function buildPrivateBlockList() {
  const list = new BlockList();
  // IPv4
  list.addSubnet('0.0.0.0', 8, 'ipv4');
  list.addSubnet('10.0.0.0', 8, 'ipv4');
  list.addSubnet('100.64.0.0', 10, 'ipv4'); // CGNAT
  list.addSubnet('127.0.0.0', 8, 'ipv4');
  list.addSubnet('169.254.0.0', 16, 'ipv4');
  list.addSubnet('172.16.0.0', 12, 'ipv4');
  list.addSubnet('192.0.0.0', 24, 'ipv4');
  list.addSubnet('192.0.2.0', 24, 'ipv4');
  list.addSubnet('192.168.0.0', 16, 'ipv4');
  list.addSubnet('198.18.0.0', 15, 'ipv4');
  list.addSubnet('198.51.100.0', 24, 'ipv4');
  list.addSubnet('203.0.113.0', 24, 'ipv4');
  list.addSubnet('224.0.0.0', 4, 'ipv4'); // multicast
  list.addSubnet('240.0.0.0', 4, 'ipv4');
  // IPv6
  list.addSubnet('::', 128, 'ipv6');
  list.addSubnet('::1', 128, 'ipv6');
  list.addSubnet('fc00::', 7, 'ipv6');
  list.addSubnet('fe80::', 10, 'ipv6');
  list.addSubnet('ff00::', 8, 'ipv6');
  return list;
}

const PRIVATE_BLOCK_LIST = buildPrivateBlockList();

/**
 * Déroule une IPv4 mappée en IPv6 (`::ffff:a.b.c.d`) vers l'IPv4.
 * @param {string} address
 * @returns {{ family: 4|6, address: string }}
 */
function unwrapAddress(address) {
  const s = String(address || '')
    .trim()
    .toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapped) return { family: 4, address: mapped[1] };
  if (net.isIPv4(s)) return { family: 4, address: s };
  if (net.isIPv6(s)) return { family: 6, address: s };
  return null;
}

/**
 * @param {string} address
 * @returns {boolean}
 */
function isPublicIpAddress(address) {
  const unwrapped = unwrapAddress(address);
  if (!unwrapped) return false;
  const type = unwrapped.family === 4 ? 'ipv4' : 'ipv6';
  return !PRIVATE_BLOCK_LIST.check(unwrapped.address, type);
}

/**
 * Refuse les formes décimale / octale trompeuses d'IPv4 (ex. `2130706433`, `0177.0.0.1`).
 * @param {string} hostname
 * @returns {boolean}
 */
function looksLikeOpaqueIpv4Literal(hostname) {
  const h = String(hostname || '').trim();
  if (/^\d+$/.test(h)) return true; // entier décimal
  if (/^0[0-7]+(\.|$)/.test(h)) return true; // octal
  return false;
}

/**
 * Résout le nom et retourne la première adresse publique, ou `null`.
 * @param {string} hostname
 * @returns {Promise<{ address: string, family: 4|6 }|null>}
 */
function resolvePublicAddress(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase();
  if (!host) return Promise.resolve(null);
  if (looksLikeOpaqueIpv4Literal(host)) return Promise.resolve(null);

  const literal = unwrapAddress(host);
  if (literal) {
    return Promise.resolve(isPublicIpAddress(literal.address) ? literal : null);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
    dns.lookup(host, { all: true, verbatim: true }, (err, addresses) => {
      clearTimeout(timer);
      if (err || !Array.isArray(addresses) || addresses.length === 0) {
        resolve(null);
        return;
      }
      for (const entry of addresses) {
        const family = entry.family === 6 ? 6 : 4;
        if (isPublicIpAddress(entry.address)) {
          resolve({ address: entry.address, family });
          return;
        }
      }
      resolve(null);
    });
  });
}

/**
 * GET HTTPS vers une URL déjà normalisée, connexion sur l'IP validée (anti-rebinding).
 * @param {string} urlString
 * @param {{ timeoutMs?: number, headers?: Record<string,string> }} [opts]
 * @returns {Promise<{ status: number, headers: { get: (n: string) => string|null }, body: Buffer }>}
 */
async function httpsGetPinned(urlString, opts = {}) {
  const url = new URL(urlString);
  if (url.protocol !== 'https:') throw new Error('HTTPS only');
  const pinned = await resolvePublicAddress(url.hostname);
  if (!pinned) throw new Error('Hôte non public');

  const timeoutMs = opts.timeoutMs || 10_000;
  const headers = {
    Host: url.host,
    'User-Agent': opts.headers?.['User-Agent'] || 'ForetMap/1.0 (media-relay)',
    Accept: opts.headers?.Accept || 'image/*',
    ...(opts.headers || {}),
  };

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: pinned.address,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        servername: url.hostname,
        headers,
        lookup: (_hostname, _options, cb) => {
          cb(null, pinned.address, pinned.family);
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        let total = 0;
        const maxBytes = opts.maxBytes || 8 * 1024 * 1024;
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy();
            reject(Object.assign(new Error('too large'), { code: 'TOO_LARGE' }));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const headerMap = new Map();
          for (const [k, v] of Object.entries(res.headers)) {
            headerMap.set(String(k).toLowerCase(), Array.isArray(v) ? v[0] : v);
          }
          resolve({
            status: res.statusCode || 0,
            headers: {
              get: (name) => headerMap.get(String(name).toLowerCase()) ?? null,
            },
            body: Buffer.concat(chunks),
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          });
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Octets magiques d'une image (JPEG, PNG, GIF, WebP, AVIF) ou SVG textuel.
 * @param {Buffer} buf
 * @param {string} contentType
 * @returns {boolean}
 */
function matchesImageMagic(buf, contentType) {
  if (!Buffer.isBuffer(buf) || buf.length < 3) return false;
  const ct = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  // WebP (RIFF....WEBP)
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }
  // AVIF / HEIF (ftyp....avif|avis|heic)
  if (
    buf.length >= 12 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (/^(avif|avis|heic|heif|mif1)$/i.test(brand)) return true;
  }
  // SVG : texte
  if (ct === 'image/svg+xml' || ct === 'image/svg') {
    const head = buf.slice(0, 256).toString('utf8').trimStart();
    return /^<\?xml/i.test(head) || /^<svg[\s>]/i.test(head);
  }
  return false;
}

module.exports = {
  isPublicIpAddress,
  looksLikeOpaqueIpv4Literal,
  resolvePublicAddress,
  httpsGetPinned,
  matchesImageMagic,
  PRIVATE_BLOCK_LIST,
};
