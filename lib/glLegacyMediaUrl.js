'use strict';

const { normalizeGlMediaStableKey } = require('../src/gl/utils/glMediaStableKey.js');
const {
  LEGACY_BASENAME_ALIASES,
  LEGACY_GL_MEDIA_PATH_RE,
  isLegacyGlMediaUrl,
  legacyMediaBasename,
  normalizeLegacyMediaBasename,
  resolveLegacyGlStableKey,
  resolveLegacyGlMediaUrl,
  applyGlLegacyMediaRefs,
  migrateStoryHeroToSceneRef,
  resolveGlBoardImageUrl,
} = require('../src/gl/utils/glLegacyMediaUrl.js');

module.exports = {
  LEGACY_BASENAME_ALIASES,
  LEGACY_GL_MEDIA_PATH_RE,
  normalizeGlMediaStableKey,
  normalizeLegacyMediaBasename,
  isLegacyGlMediaUrl,
  legacyMediaBasename,
  resolveLegacyGlStableKey,
  resolveLegacyGlMediaUrl,
  applyGlLegacyMediaRefs,
  migrateStoryHeroToSceneRef,
  resolveGlBoardImageUrl,
};
