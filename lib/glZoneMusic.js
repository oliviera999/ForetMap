'use strict';

const MUSIC_URL_PREFIX = '/uploads/media-library/audio/';
const MAX_MUSIC_URL_LENGTH = 512;
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

function parseZoneMusicInput(body = {}) {
  const hasMusicUrl = Object.prototype.hasOwnProperty.call(body, 'musicUrl')
    || Object.prototype.hasOwnProperty.call(body, 'music_url');
  const hasMusicVolume = Object.prototype.hasOwnProperty.call(body, 'musicVolume')
    || Object.prototype.hasOwnProperty.call(body, 'music_volume');

  let musicUrl;
  if (hasMusicUrl) {
    musicUrl = normalizeOptionalMusicUrl(body.musicUrl ?? body.music_url);
    if (!isValidZoneMusicUrl(musicUrl)) {
      return { error: 'URL musique invalide (attendu /uploads/media-library/audio/...)' };
    }
  }

  let musicVolume;
  if (hasMusicVolume) {
    musicVolume = parseZoneMusicVolume(body.musicVolume ?? body.music_volume);
    if (musicVolume == null) {
      return { error: 'Volume musique invalide (attendu entre 0 et 1)' };
    }
  }

  return { musicUrl, musicVolume, hasMusicUrl, hasMusicVolume };
}

function serializeZoneMusicRow(row) {
  const musicUrl = row.music_url != null ? String(row.music_url) : null;
  const musicVolume = parseZoneMusicVolume(row.music_volume, DEFAULT_MUSIC_VOLUME);
  return {
    music_url: musicUrl && musicUrl.length > 0 ? musicUrl : null,
    music_volume: musicVolume,
    musicUrl: musicUrl && musicUrl.length > 0 ? musicUrl : null,
    musicVolume,
  };
}

module.exports = {
  MUSIC_URL_PREFIX,
  DEFAULT_MUSIC_VOLUME,
  normalizeOptionalMusicUrl,
  isValidZoneMusicUrl,
  parseZoneMusicVolume,
  parseZoneMusicInput,
  serializeZoneMusicRow,
};
