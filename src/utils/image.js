export function compressImage(file, maxPx = 1200, quality = 0.75) {
  return new Promise((res, rej) => {
    if (file.size > 15 * 1024 * 1024) return rej(new Error('Image trop lourde (max 15MB)'));
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
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
