'use strict';

const MUSIC_URL_PREFIX = '/uploads/media-library/audio/';
const MAX_MUSIC_URL_LENGTH = 512;
const MAX_MUSIC_PLAYLIST_SIZE = 20;
const DEFAULT_MUSIC_VOLUME = 0.7;

function normalizeOptionalMusicUrl(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function isValidZoneMusicUrl(url) {
  if (url == null) return true;
  const raw = String(url);
  if (raw.length === 0 || raw.length > MAX_MUSIC_URL_LENGTH) return false;
  if (!raw.startsWith(MUSIC_URL_PREFIX)) return false;
  if (raw.includes('..')) return false;
  const segments = raw.split('/').filter(Boolean);
  if (segments.length < 4) return false;
  if (segments[0] !== 'uploads' || segments[1] !== 'media-library' || segments[2] !== 'audio') {
    return false;
  }
  return true;
}

function parseZoneMusicVolume(value, fallback = DEFAULT_MUSIC_VOLUME) {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 1) return null;
  return Math.round(n * 1000) / 1000;
}

function normalizeMusicUrlList(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const urls = [];
  for (const item of raw) {
    const url = normalizeOptionalMusicUrl(item);
    if (!url) continue;
    if (!isValidZoneMusicUrl(url)) return null;
    urls.push(url);
  }
  if (urls.length > MAX_MUSIC_PLAYLIST_SIZE) return null;
  return urls;
}

function parseMusicUrlsFromBody(body = {}) {
  const hasMusicUrls =
    Object.prototype.hasOwnProperty.call(body, 'musicUrls') ||
    Object.prototype.hasOwnProperty.call(body, 'music_urls');
  const hasMusicUrl =
    Object.prototype.hasOwnProperty.call(body, 'musicUrl') ||
    Object.prototype.hasOwnProperty.call(body, 'music_url');

  if (hasMusicUrls) {
    const urls = normalizeMusicUrlList(body.musicUrls ?? body.music_urls);
    if (urls == null) {
      return { error: 'Liste de musiques invalide (tableau d’URLs audio, max 20)' };
    }
    return { musicUrls: urls, hasMusicUrls: true };
  }

  if (hasMusicUrl) {
    const musicUrl = normalizeOptionalMusicUrl(body.musicUrl ?? body.music_url);
    if (!isValidZoneMusicUrl(musicUrl)) {
      return { error: 'URL musique invalide (attendu /uploads/media-library/audio/...)' };
    }
    return {
      musicUrls: musicUrl ? [musicUrl] : [],
      hasMusicUrls: true,
    };
  }

  return { hasMusicUrls: false };
}

function parseZoneMusicInput(body = {}) {
  const hasMusicVolume =
    Object.prototype.hasOwnProperty.call(body, 'musicVolume') ||
    Object.prototype.hasOwnProperty.call(body, 'music_volume');

  const urlsParsed = parseMusicUrlsFromBody(body);
  if (urlsParsed.error) return urlsParsed;

  let musicVolume;
  if (hasMusicVolume) {
    musicVolume = parseZoneMusicVolume(body.musicVolume ?? body.music_volume);
    if (musicVolume == null) {
      return { error: 'Volume musique invalide (attendu entre 0 et 1)' };
    }
  }

  const musicUrls = urlsParsed.hasMusicUrls ? urlsParsed.musicUrls : undefined;
  const musicUrl =
    urlsParsed.hasMusicUrls && musicUrls !== undefined ? (musicUrls[0] ?? null) : undefined;

  return {
    musicUrl,
    musicUrls,
    musicVolume,
    hasMusicUrl: urlsParsed.hasMusicUrls,
    hasMusicUrls: urlsParsed.hasMusicUrls,
    hasMusicVolume,
  };
}

function readMusicUrlsFromRow(row) {
  if (row?.music_urls_json) {
    try {
      const parsed = JSON.parse(String(row.music_urls_json));
      const urls = normalizeMusicUrlList(parsed);
      if (urls && urls.length > 0) return urls;
    } catch (_) {
      // fallback legacy
    }
  }
  const legacy = row?.music_url != null ? String(row.music_url).trim() : '';
  return legacy.length > 0 ? [legacy] : [];
}

function serializeZoneMusicRow(row) {
  const musicUrls = readMusicUrlsFromRow(row);
  const musicUrl = musicUrls[0] ?? null;
  const musicVolume = parseZoneMusicVolume(row.music_volume, DEFAULT_MUSIC_VOLUME);
  return {
    music_url: musicUrl,
    music_urls: musicUrls,
    music_volume: musicVolume,
    musicUrl,
    musicUrls,
    musicVolume,
  };
}

module.exports = {
  MUSIC_URL_PREFIX,
  MAX_MUSIC_PLAYLIST_SIZE,
  DEFAULT_MUSIC_VOLUME,
  normalizeOptionalMusicUrl,
  isValidZoneMusicUrl,
  parseZoneMusicVolume,
  normalizeMusicUrlList,
  parseZoneMusicInput,
  readMusicUrlsFromRow,
  serializeZoneMusicRow,
};
