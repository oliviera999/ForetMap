/**
 * Réécrit les URL YouTube vers `youtube-nocookie.com/embed/…` (lot C — traceurs RGPD).
 * Conserve `start` / `t` (secondes). Toute autre URL est renvoyée telle quelle.
 */

const YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

/**
 * @param {string} raw
 * @returns {number|null} secondes
 */
function parseStartSeconds(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(\d+)h(?:(\d+)m)?(?:(\d+)s)?$/i.exec(s) || /^(?:(\d+)m)?(?:(\d+)s)?$/i.exec(s);
  if (!m) return null;
  if (s.includes('h')) {
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    const sec = Number(m[3] || 0);
    return h * 3600 + min * 60 + sec;
  }
  return Number(m[1] || 0) * 60 + Number(m[2] || 0);
}

/**
 * @param {string} url
 * @returns {string}
 */
export function toYoutubeNocookieEmbed(url) {
  const text = String(url || '').trim();
  if (!text) return text;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return text;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !YT_HOSTS.has(host) &&
    host !== 'www.youtube-nocookie.com' &&
    host !== 'youtube-nocookie.com'
  ) {
    return text;
  }

  let videoId = '';
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
  } else if (/\/shorts\//i.test(parsed.pathname)) {
    videoId = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
  } else if (/\/embed\//i.test(parsed.pathname)) {
    videoId = parsed.pathname.split('/embed/')[1]?.split('/')[0] || '';
  } else {
    videoId = parsed.searchParams.get('v') || '';
  }
  videoId = String(videoId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (!videoId) return text;

  const start =
    parseStartSeconds(parsed.searchParams.get('start')) ??
    parseStartSeconds(parsed.searchParams.get('t'));
  const out = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  if (start != null && start > 0) out.searchParams.set('start', String(start));
  return out.toString();
}
