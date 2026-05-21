import React, { useRef, useState } from 'react';
import { compressImage } from '../../utils/image.js';
import { getGlAvatarUrl } from '../utils/glAvatar.js';

function estimateDataUrlBytes(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  if (!payload) return 0;
  const padding = payload.endsWith('==') ? 2 : (payload.endsWith('=') ? 1 : 0);
  return Math.floor((payload.length * 3) / 4) - padding;
}

export function GLProfileAvatar({ profile, auth, avatarData, onAvatarData, removeAvatar, onRemoveAvatar, onError, busy }) {
  const [processing, setProcessing] = useState(false);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const preview = avatarData || getGlAvatarUrl(profile, auth);

  async function onFile(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      onError?.('Format image invalide (image requise)');
      return;
    }
    setProcessing(true);
    onError?.('');
    try {
      const compressed = await compressImage(file, 1200, 0.72);
      if (estimateDataUrlBytes(compressed) > 2 * 1024 * 1024) {
        onError?.('Image trop lourde après compression (max 2 Mo)');
        return;
      }
      onAvatarData?.(compressed);
      onRemoveAvatar?.(false);
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
    </div>
  );
}
