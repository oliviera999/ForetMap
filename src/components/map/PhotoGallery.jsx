import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api';
import { compressImage } from '../../utils/image';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../../utils/overlayHistory';
import { ImageLightbox } from '../../shared/components/ImageLightbox.jsx';

const FORETMAP_PHOTO_DRAG_MIME = 'application/x-foretmap-zone-marker-photo-id';

export function reorderZoneMarkerPhotosByDrop(list, draggedId, dropTargetId) {
  const ids = list.map((p) => p.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(dropTargetId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export function PhotoGallery({ zoneId, markerId, isTeacher }) {
  const [photos, setPhotos] = useState([]);
  const [big, setBig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reorderingPhotos, setReorderingPhotos] = useState(false);
  const [caption, setCaption] = useState('');
  const galleryFileRef = useRef(null);
  const cameraFileRef = useRef(null);

  const listBase = zoneId ? `/api/zones/${zoneId}/photos` : `/api/map/markers/${markerId}/photos`;
  const emptyLabel = zoneId ? 'zone' : 'repère';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api(listBase);
      setPhotos(list);
    } catch (e) {
      console.error('[ForetMap] chargement photos lieu', e);
    } finally {
      setLoading(false);
    }
  }, [listBase]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (e) => {
    disarmNativeFilePickerGuard();
    const files = Array.from(e.target.files || []).filter((f) => f?.size);
    e.target.value = '';
    if (!files.length) return;
    const captionTrim = caption.trim();
    setUploading(true);
    try {
      for (const file of files) {
        const img = await compressImage(file);
        await api(listBase, 'POST', { image_data: img, caption: captionTrim });
      }
      setCaption('');
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const del = async (id) => {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await api(`${listBase}/${id}`, 'DELETE');
      await load();
    } catch (err) {
      alert(err.message || 'Suppression impossible');
    }
  };

  const persistPhotoReorder = async (nextOrdered) => {
    if (!isTeacher || nextOrdered.length < 2) return;
    setReorderingPhotos(true);
    try {
      await api(`${listBase}/reorder`, 'PUT', { photo_ids: nextOrdered.map((x) => x.id) });
      await load();
    } catch (err) {
      alert(err.message || 'Impossible de réordonner les photos');
      await load();
    } finally {
      setReorderingPhotos(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      {big && <ImageLightbox src={big.src} caption={big.caption} onClose={() => setBig(null)} />}

      {loading ? (
        <p style={{ color: '#aaa', fontSize: '.85rem', textAlign: 'center', padding: '16px 0' }}>
          Chargement...
        </p>
      ) : photos.length === 0 ? (
        <p
          style={{
            color: '#bbb',
            fontSize: '.85rem',
            fontStyle: 'italic',
            textAlign: 'center',
            padding: '12px 0',
          }}
        >
          {`Aucune photo pour ce ${emptyLabel}.`}
        </p>
      ) : (
        <>
          {isTeacher && photos.length > 1 && (
            <p
              style={{ color: '#64748b', fontSize: '.76rem', margin: '0 0 8px', lineHeight: 1.45 }}
            >
              Glisser-déposer une vignette pour changer l’ordre. La première sert de photo
              d’accroche sur la visite guidée.
            </p>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))',
              gap: 8,
              marginBottom: 12,
              opacity: reorderingPhotos ? 0.65 : 1,
              pointerEvents: reorderingPhotos ? 'none' : undefined,
            }}
          >
            {photos.map((p) => {
              const tileSrc = p.thumb_url || p.image_url;
              return (
                <div
                  key={p.id}
                  className={isTeacher && photos.length > 1 ? 'photo-reorder-tile' : undefined}
                  draggable={!!(isTeacher && photos.length > 1 && tileSrc)}
                  onDragStart={(e) => {
                    if (!isTeacher || photos.length < 2 || !tileSrc) return;
                    e.dataTransfer.setData(FORETMAP_PHOTO_DRAG_MIME, String(p.id));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!isTeacher || photos.length < 2) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (!isTeacher || photos.length < 2) return;
                    e.preventDefault();
                    const raw = e.dataTransfer.getData(FORETMAP_PHOTO_DRAG_MIME);
                    const dragId = Number(raw);
                    if (!Number.isFinite(dragId) || dragId === p.id) return;
                    const next = reorderZoneMarkerPhotosByDrop(photos, dragId, p.id);
                    void persistPhotoReorder(next);
                  }}
                  style={{
                    position: 'relative',
                    borderRadius: 8,
                    overflow: 'hidden',
                    aspectRatio: '1',
                    background: '#e8f5e9',
                  }}
                >
                  {tileSrc ? (
                    <img
                      src={tileSrc}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        cursor: 'pointer',
                      }}
                      loading="lazy"
                      decoding="async"
                      onClick={() => setBig({ src: p.image_url, caption: p.caption })}
                      alt={p.caption || ''}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        animation: 'sway 1.5s infinite',
                      }}
                    >
                      🌿
                    </div>
                  )}
                  {tileSrc && p.caption && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'rgba(0,0,0,.55)',
                        color: 'white',
                        fontSize: '.62rem',
                        padding: '3px 5px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.caption}
                    </div>
                  )}
                  {isTeacher && tileSrc && (
                    <button
                      type="button"
                      onMouseDown={(ev) => ev.stopPropagation()}
                      onClick={() => del(p.id)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        background: 'rgba(0,0,0,.55)',
                        border: 'none',
                        color: 'white',
                        borderRadius: '50%',
                        width: 22,
                        height: 22,
                        fontSize: '.7rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {isTeacher && (
        <div>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Légende (optionnel)"
            style={{
              fontSize: '16px',
              width: '100%',
              marginBottom: 6,
              padding: '8px 12px',
              border: '1.5px solid var(--mint)',
              borderRadius: 8,
              background: 'var(--cream)',
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: '1 1 140px' }}
              disabled={uploading}
              onClick={() => {
                if (galleryFileRef.current) galleryFileRef.current.value = '';
                armNativeFilePickerGuard();
                galleryFileRef.current?.click();
              }}
            >
              {uploading ? 'Envoi...' : '📁 Galerie'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: '1 1 140px' }}
              disabled={uploading}
              onClick={() => {
                if (cameraFileRef.current) cameraFileRef.current.value = '';
                armNativeFilePickerGuard();
                cameraFileRef.current?.click();
              }}
            >
              {uploading ? 'Envoi...' : '📸 Appareil photo'}
            </button>
          </div>
          <input
            ref={galleryFileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={upload}
          />
          <input
            ref={cameraFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={upload}
          />
        </div>
      )}
    </div>
  );
}
