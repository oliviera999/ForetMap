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
