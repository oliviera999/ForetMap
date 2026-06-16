'use strict';

// Scènes de récit de chapitre côté serveur : liste résolue (pour l'admin)
// et édition des métas éditoriales (légende, ordre, couverture) stockées
// dans `_keys.json`. Convention partagée avec le client
// (src/gl/utils/glChapterRecitConvention.js).

const { loadMediaKeyIndex, updateMediaKeyMeta } = require('./glAssetManifest');
const {
  chapterRecitPrefix,
  parseChapterRecitKey,
} = require('../src/gl/utils/glChapterRecitConvention.js');

function sceneFromEntry(stableKey, entry) {
  const rel = String(entry?.relativePath || '').replace(/\\/g, '/');
  const orderRaw = entry?.recitOrder;
  return {
    stableKey,
    url: rel ? `/uploads/${rel}` : null,
    relativePath: rel || null,
    caption:
      typeof entry?.recitCaption === 'string' && entry.recitCaption.trim()
        ? entry.recitCaption.trim()
        : null,
    order:
      orderRaw === null || orderRaw === undefined || orderRaw === ''
        ? null
        : Number.isFinite(Number(orderRaw))
          ? Number(orderRaw)
          : null,
    cover: entry?.recitCover === true,
  };
}

/** Scènes conventionnelles d'un chapitre (0 = prologue), triées comme en jeu. */
function listChapterRecitScenes(chapterNumber, keyIndex = null) {
  const prefix = chapterRecitPrefix(chapterNumber);
  if (!prefix) return [];
  const index = keyIndex || loadMediaKeyIndex();
  return Object.keys(index)
    .filter((key) => key.startsWith(prefix))
    .map((key) => sceneFromEntry(key, index[key]))
    .filter((scene) => scene.url)
    .sort((a, b) => {
      const ao = a.order ?? Number.POSITIVE_INFINITY;
      const bo = b.order ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return a.stableKey.localeCompare(b.stableKey);
    });
}

function sceneMetaError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Met à jour les métas d'une scène de récit. `cover: true` retire le drapeau
 * des autres scènes du même chapitre (une seule couverture).
 */
function updateChapterSceneMeta(stableKey, patch = {}) {
  const key = String(stableKey || '')
    .trim()
    .toLowerCase();
  const chapterNumber = parseChapterRecitKey(key);
  if (chapterNumber === null) {
    throw sceneMetaError('Clé média hors convention scène de récit (recit_0N-chapN_*)');
  }
  const index = loadMediaKeyIndex();
  if (!index[key]) {
    throw sceneMetaError('Clé média inconnue', 404);
  }

  const metaPatch = {};
  if ('caption' in patch) {
    const caption = patch.caption === null ? null : String(patch.caption).trim();
    metaPatch.recitCaption = caption || null;
  }
  if ('order' in patch) {
    if (patch.order === null || patch.order === '') {
      metaPatch.recitOrder = null;
    } else {
      const order = Number(patch.order);
      if (!Number.isFinite(order)) throw sceneMetaError('Ordre invalide (nombre attendu)');
      metaPatch.recitOrder = order;
    }
  }
  if ('cover' in patch) {
    metaPatch.recitCover = patch.cover === true ? true : null;
    if (patch.cover === true) {
      for (const otherKey of Object.keys(index)) {
        if (
          otherKey !== key &&
          parseChapterRecitKey(otherKey) === chapterNumber &&
          index[otherKey]?.recitCover === true
        ) {
          updateMediaKeyMeta(otherKey, { recitCover: null });
        }
      }
    }
  }

  const entry = updateMediaKeyMeta(key, metaPatch);
  if (!entry) throw sceneMetaError('Clé média inconnue', 404);
  return sceneFromEntry(key, entry);
}

module.exports = {
  listChapterRecitScenes,
  updateChapterSceneMeta,
};
