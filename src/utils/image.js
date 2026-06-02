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

export function compressImage(file, maxPx = 1200, quality = 0.75) {
  return new Promise((res, rej) => {
    if (file.size > 15 * 1024 * 1024) return rej(new Error('Image trop lourde (max 15MB)'));
    const reader = new FileReader();
    reader.onerror = () => rej(new Error('Impossible de lire le fichier (accès refusé ou fichier invalide)'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => rej(new Error('Impossible de lire cette image (format non pris en charge par le navigateur)'));
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
