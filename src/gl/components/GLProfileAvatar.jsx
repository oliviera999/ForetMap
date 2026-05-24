import React, { useRef, useState } from 'react';
import { getGlAvatarUrl } from '../utils/glAvatar.js';
import { GLImageFrameEditor } from './GLImageFrameEditor.jsx';
import { cropImageDataUrl, normalizeGlImageFrame } from '../../utils/glImageFrame.js';

function estimateDataUrlBytes(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  if (!payload) return 0;
  const padding = payload.endsWith('==') ? 2 : (payload.endsWith('=') ? 1 : 0);
  return Math.floor((payload.length * 3) / 4) - padding;
}

export function GLProfileAvatar({ profile, auth, avatarData, onAvatarData, removeAvatar, onRemoveAvatar, onError, busy }) {
  const [processing, setProcessing] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const preview = avatarData || getGlAvatarUrl(profile, auth);

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Lecture image impossible'));
      reader.onload = (event) => resolve(String(event?.target?.result || ''));
      reader.readAsDataURL(file);
    });
  }

  async function getImageSize(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      img.src = dataUrl;
    });
  }

  function computeSquareCrop(frame, size) {
    const width = Number(size?.width || 0);
    const height = Number(size?.height || 0);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return { x: 0, y: 0, w: 1, h: 1 };
    }
    const cropSizePx = Math.min(width, height);
    const focusX = (Number(frame?.focalX) || 50) / 100;
    const focusY = (Number(frame?.focalY) || 50) / 100;
    const centerX = focusX * width;
    const centerY = focusY * height;
    const xPx = Math.min(Math.max(0, centerX - (cropSizePx / 2)), width - cropSizePx);
    const yPx = Math.min(Math.max(0, centerY - (cropSizePx / 2)), height - cropSizePx);
    return {
      x: xPx / width,
      y: yPx / height,
      w: cropSizePx / width,
      h: cropSizePx / height,
    };
  }

  async function onFile(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      onError?.('Format image invalide (image requise)');
      return;
    }
    setProcessing(true);
    onError?.('');
    try {
      const dataUrl = await fileToDataUrl(file);
      setPendingImage({
        dataUrl,
        frame: normalizeGlImageFrame(null, 'avatar'),
      });
    } catch (err) {
      onError?.(err?.message || 'Image invalide');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="gl-profile-avatar">
      <img src={preview} alt="Avatar profil" />
      <div className="gl-profile-avatar-actions">
        <button type="button" className="gl-btn-secondary" disabled={busy || processing} onClick={() => galleryRef.current?.click()}>
          Galerie
        </button>
        <button type="button" className="gl-btn-secondary" disabled={busy || processing} onClick={() => cameraRef.current?.click()}>
          Camera
        </button>
        <button
          type="button"
          className="gl-btn-secondary"
          disabled={busy || processing}
          onClick={() => {
            onAvatarData?.(null);
            onRemoveAvatar?.(!removeAvatar);
          }}
        >
          {removeAvatar ? 'Annuler retrait' : 'Retirer avatar'}
        </button>
      </div>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => onFile(event.target.files?.[0] || null)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(event) => onFile(event.target.files?.[0] || null)}
      />
      {processing ? <div className="gl-hint">Traitement image…</div> : null}
      <p className="gl-hint">Recadrage 1:1 avant envoi. Taille finale limitee a 2 Mo.</p>

      <GLImageFrameEditor
        open={Boolean(pendingImage?.dataUrl)}
        title="Recadrer l avatar (1:1)"
        context="avatar"
        imageUrl={String(pendingImage?.dataUrl || '')}
        initialFrame={pendingImage?.frame}
        allowCropExport
        onApply={async ({ frame }) => {
          try {
            setProcessing(true);
            const normalizedFrame = normalizeGlImageFrame(frame, 'avatar');
            const size = await getImageSize(String(pendingImage?.dataUrl || ''));
            const squareCrop = computeSquareCrop(normalizedFrame, size);
            const cropped = await cropImageDataUrl(String(pendingImage?.dataUrl || ''), squareCrop, 1200, 0.82);
            if (estimateDataUrlBytes(cropped) > 2 * 1024 * 1024) {
              onError?.('Image trop lourde après recadrage (max 2 Mo)');
              return;
            }
            onAvatarData?.(cropped);
            onRemoveAvatar?.(false);
            setPendingImage(null);
          } catch (err) {
            onError?.(err?.message || 'Recadrage impossible');
          } finally {
            setProcessing(false);
          }
        }}
        onClose={() => setPendingImage(null)}
      />
    </div>
  );
}
