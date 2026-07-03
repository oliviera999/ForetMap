/**
 * Certains navigateurs / appareils (capture caméra) laissent `type` vide ou envoient
 * `application/octet-stream` alors que le fichier est bien une image JPEG/PNG.
 */
export function isLikelyImageFile(file) {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  if (!mime || mime.startsWith('image/')) return true;
  if (mime === 'application/octet-stream' || mime === 'binary/octet-stream') return true;
  return /\.(jpe?g|pjpeg|png|gif|webp|bmp|heic|heif|avif)$/i.test(String(file.name || ''));
}

/** Presets partagés ForetMap / GL (évite les constantes magiques dupliquées). */
export const IMAGE_COMPRESSION_PRESETS = {
  default: { maxPx: 1200, quality: 0.75 },
  taskLog: { maxPx: 1600, quality: 0.82 },
  taskForm: { maxPx: 1200, quality: 0.72 },
  plant: { maxPx: 1600, quality: 0.82 },
  visit: { maxPx: 1600, quality: 0.82 },
  map: { maxPx: 1200, quality: 0.75 },
  adminProfile: { maxPx: 2200, quality: 0.85 },
  glChapter: { maxPx: 2400, quality: 0.9 },
  glInline: { maxPx: 2000, quality: 0.85 },
};

/**
 * @param {File} file
 * @param {keyof typeof IMAGE_COMPRESSION_PRESETS} presetKey
 */
export function compressImageWithPreset(file, presetKey = 'default') {
  const preset = IMAGE_COMPRESSION_PRESETS[presetKey] || IMAGE_COMPRESSION_PRESETS.default;
  return compressImage(file, preset.maxPx, preset.quality);
}

/**
 * Lit un fichier image et le convertit en data URL **PNG** (transparence conservée),
 * en réduisant si besoin le plus grand côté à `maxPx` (ratio conservé).
 * Extrait de `VisitMascotPackManager` (audit §6.1) : fonction pure DOM (FileReader + canvas),
 * utilisée pour les sprites mascotte (bibliothèque carte, médiathèque pack, remplacement en lot).
 * @param {File|Blob} file
 * @param {number} maxPx plafond du plus grand côté (défaut 2048)
 * @returns {Promise<string>} data URL `image/png`
 */
export function fileToPngDataUrl(file, maxPx = 2048) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture fichier impossible'));
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const max = maxPx;
        if (w > max || h > max) {
          if (w >= h) {
            h = Math.round((h * max) / w);
            w = max;
          } else {
            w = Math.round((w * max) / h);
            h = max;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponible'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function compressImage(file, maxPx = 1200, quality = 0.75) {
  return new Promise((res, rej) => {
    if (file.size > 15 * 1024 * 1024) return rej(new Error('Image trop lourde (max 15MB)'));
    const reader = new FileReader();
    reader.onerror = () =>
      rej(new Error('Impossible de lire le fichier (accès refusé ou fichier invalide)'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () =>
        rej(
          new Error('Impossible de lire cette image (format non pris en charge par le navigateur)'),
        );
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxPx) {
          h = Math.round((h * maxPx) / w);
          w = maxPx;
        } else if (h > maxPx) {
          w = Math.round((w * maxPx) / h);
          h = maxPx;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
