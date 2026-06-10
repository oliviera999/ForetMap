import React, { useState, useRef, useMemo, useEffect } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { compressImage } from '../../utils/image';
import { MARKER_EMOJIS, detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../../constants/emojis';
import { Tooltip } from '../Tooltip';
import { HELP_TOOLTIPS, resolveRoleText } from '../../constants/help';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import {
  normalizeEditorialBlocks,
  resolveEditorialBlocksForEditor,
  buildNewEditorialBlock,
  updateEditorialBlockById,
  moveEditorialBlockById,
  removeEditorialBlockById,
} from '../../utils/visitEditorialBlocks.js';
import { visitMediaImgSrc, reorderVisitMediaRows } from '../../utils/visitMediaGallery.js';
import { VisitEditorialBuilder } from './VisitEditorialBuilder.jsx';
import { VisitEditorialMapPhotoImportList } from '../VisitEditorialPhotoUi.jsx';

/**
 * Panneau d'édition visite (zone / repère) réservé enseignant, extrait de `visit-views.jsx` (O6).
 * Édite titres/textes/blocs éditoriaux, gère les photos (upload, URL, association carte,
 * réordonnancement par glisser-déposer) et la suppression de l'élément. Déplacement pur.
 */
const FORETMAP_VISIT_MEDIA_DRAG_MIME = 'application/x-foretmap-visit-media-id';

export function VisitEditorPanel({ selected, selectedType, onSaved, onForceLogout, isTeacher, roleTerms, markerEmojis = MARKER_EMOJIS }) {
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    short_description: '',
    details_title: 'Détails',
    details_text: '',
    sort_order: 0,
    is_active: true,
    emoji: '📍',
  });
  const [saving, setSaving] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaSaving, setMediaSaving] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const mediaFileRef = useRef(null);
  const [mediaReorderBusy, setMediaReorderBusy] = useState(false);
  const [editorialBlocks, setEditorialBlocks] = useState([]);
  const tooltipText = (entry) => resolveRoleText(entry, true);

  const sortedVisitMedia = useMemo(() => {
    const arr = [...(selected?.visit_media || [])];
    arr.sort(
      (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id),
    );
    return arr;
  }, [selected]);
  const mapAssociatedPhotos = useMemo(() => {
    if (!selected) return [];
    const list = [];
    if (selected?.map_lead_photo?.image_url) {
      list.push({
        id: `map-lead-${selected.map_lead_photo.id || 'x'}`,
        image_url: selected.map_lead_photo.image_url,
        thumb_url: selected.map_lead_photo.thumb_url,
        caption: selected.map_lead_photo.caption || '',
      });
    }
    for (const ph of selected?.map_extra_photos || []) {
      if (!ph?.image_url) continue;
      list.push({
        id: `map-extra-${ph.id || Math.random()}`,
        image_url: ph.image_url,
        thumb_url: ph.thumb_url,
        caption: ph.caption || '',
      });
    }
    return list;
  }, [selected]);

  useEffect(() => {
    const nextTitle = selectedType === 'zone' ? (selected?.name || '') : (selected?.label || '');
    const trimmedTitle = String(nextTitle || '').trim();
    const detectedZoneEmoji = detectLeadingMarkerEmoji(trimmedTitle, markerEmojis);
    setForm({
      title: nextTitle,
      subtitle: selected?.visit_subtitle || '',
      short_description: selected?.visit_short_description || '',
      details_title: selected?.visit_details_title || 'Détails',
      details_text: selected?.visit_details_text || '',
      sort_order: Number(selected?.visit_sort_order || 0),
      is_active: Number(selected?.visit_is_active ?? 1) === 1,
      emoji: selectedType === 'zone'
        ? (detectedZoneEmoji || markerEmojis[0] || '📍')
        : String(selected?.emoji ?? '').trim(),
    });
    setEditorialBlocks(resolveEditorialBlocksForEditor(
      selected?.visit_editorial_blocks,
      selected,
      sortedVisitMedia,
    ));
    setMediaUrl('');
    setMediaCaption('');
  }, [markerEmojis, selected, selectedType, sortedVisitMedia]);

  if (!isTeacher || !selected || !selectedType) return null;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        subtitle: form.subtitle,
        short_description: form.short_description,
        details_title: form.details_title,
        details_text: form.details_text,
        visit_editorial_blocks: normalizeEditorialBlocks(editorialBlocks),
        sort_order: form.sort_order,
        is_active: form.is_active,
      };
      if (selectedType === 'zone') payload.name = form.title;
      else {
        payload.label = form.title;
        payload.emoji = form.emoji;
      }
      await api(`/api/visit/${selectedType === 'zone' ? 'zones' : 'markers'}/${selected.id}`, 'PUT', payload);
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const addMedia = async () => {
    if (!mediaUrl.trim()) return;
    setMediaSaving(true);
    try {
      await api('/api/visit/media', 'POST', {
        target_type: selectedType,
        target_id: selected.id,
        image_url: mediaUrl.trim(),
        caption: mediaCaption.trim(),
      });
      setMediaUrl('');
      setMediaCaption('');
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur ajout photo');
    } finally {
      setMediaSaving(false);
    }
  };

  const addMediaFromFile = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f?.size);
    if (e.target) e.target.value = '';
    if (!files.length) return;
    for (const file of files) {
      if (!String(file.type || '').startsWith('image/')) {
        alert('Format image invalide (image requise)');
        return;
      }
    }
    const cap = mediaCaption.trim();
    setMediaUploading(true);
    try {
      for (const file of files) {
        const image_data = await compressImage(file);
        await api('/api/visit/media', 'POST', {
          target_type: selectedType,
          target_id: selected.id,
          image_data,
          caption: cap,
        });
      }
      setMediaCaption('');
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur envoi photo');
    } finally {
      setMediaUploading(false);
    }
  };

  const deleteMedia = async (id) => {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await api(`/api/visit/media/${id}`, 'DELETE');
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur suppression photo');
    }
  };

  const editMediaCaption = async (media) => {
    const currentCaption = String(media?.caption || '');
    const nextCaption = window.prompt('Nouvelle légende de la photo', currentCaption);
    if (nextCaption == null) return;
    try {
      await api(`/api/visit/media/${media.id}`, 'PUT', { caption: String(nextCaption).trim() });
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur mise à jour légende');
    }
  };

  const attachMapPhotoToVisitMedia = async (photo) => {
    if (!photo?.image_url) return;
    try {
      await api('/api/visit/media', 'POST', {
        target_type: selectedType,
        target_id: selected.id,
        image_url: String(photo.image_url || '').trim(),
        caption: String(photo.caption || '').trim(),
      });
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur association photo');
    }
  };

  const persistVisitMediaReorder = async (nextOrdered) => {
    if (nextOrdered.length < 2) return;
    setMediaReorderBusy(true);
    try {
      await api('/api/visit/media/reorder', 'PUT', {
        target_type: selectedType === 'zone' ? 'zone' : 'marker',
        target_id: selected.id,
        ordered_ids: nextOrdered.map((m) => m.id),
      });
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Impossible de réordonner les photos');
    } finally {
      setMediaReorderBusy(false);
    }
  };

  const addEditorialBlock = (type) => {
    const blockId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setEditorialBlocks((prev) => [...prev, buildNewEditorialBlock(type, blockId)]);
  };

  const updateEditorialBlock = (id, patch) => {
    setEditorialBlocks((prev) => updateEditorialBlockById(prev, id, patch));
  };

  const moveEditorialBlock = (id, delta) => {
    setEditorialBlocks((prev) => moveEditorialBlockById(prev, id, delta));
  };

  const removeEditorialBlock = (id) => {
    setEditorialBlocks((prev) => removeEditorialBlockById(prev, id));
  };

  return (
    <div className="visit-editor" data-testid="visit-editor-panel">
      <h4>🎛️ Édition visite ({roleTerms.teacherShort})</h4>
      <div className="field">
        <label>{selectedType === 'zone' ? 'Titre de zone' : 'Titre du repère'}</label>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </div>
      <div className="field">
        <label>Sous-titre</label>
        <input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
      </div>
      <div className="field">
        <label>Description courte</label>
        <MarkdownTextarea rows={2} value={form.short_description} onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))} />
      </div>
      <div className="field">
        <label>Titre du bloc dépliable</label>
        <input value={form.details_title} onChange={(e) => setForm((f) => ({ ...f, details_title: e.target.value }))} />
      </div>
      <div className="field">
        <label>Détails dépliables</label>
        <MarkdownTextarea rows={4} value={form.details_text} onChange={(e) => setForm((f) => ({ ...f, details_text: e.target.value }))} />
      </div>
      <VisitEditorialBuilder
        blocks={editorialBlocks}
        mediaList={sortedVisitMedia}
        onAdd={addEditorialBlock}
        onMove={moveEditorialBlock}
        onUpdate={updateEditorialBlock}
        onRemove={removeEditorialBlock}
      />
      <div className="row">
        <div className="field">
          <label>Ordre</label>
          <input
            type="number"
            min="0"
            value={form.sort_order}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value || 0) }))}
          />
        </div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <label>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            {' '}Visible en visite
          </label>
        </div>
      </div>
      <div className="field">
        <label>{selectedType === 'zone' ? 'Liste d’emojis (insérer dans le titre de zone)' : 'Emoji du repère (optionnel)'}</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {selectedType === 'marker' ? (
            <button
              type="button"
              className={`emoji-btn ${!String(form.emoji || '').trim() ? 'sel' : ''}`}
              style={{ fontSize: '.78rem', padding: '6px 10px' }}
              onClick={() => setForm((f) => ({ ...f, emoji: '' }))}
            >
              Sans emoji
            </button>
          ) : null}
          {markerEmojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={`emoji-btn ${form.emoji === emoji ? 'sel' : ''}`}
              onClick={() => {
                if (selectedType === 'zone') {
                  setForm((f) => ({
                    ...f,
                    emoji,
                    title: `${emoji} ${stripLeadingMarkerEmoji(f.title, markerEmojis)}`.trim(),
                  }));
                  return;
                }
                setForm((f) => ({ ...f, emoji }));
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
        {saving ? 'Enregistrement...' : '💾 Sauver'}
      </button>
      <button
        className="btn btn-danger btn-sm"
        style={{ marginLeft: 8 }}
        onClick={async () => {
          if (!confirm(`Supprimer ce ${selectedType === 'zone' ? 'zone de visite' : 'repère de visite'} ?`)) return;
          try {
            await api(`/api/visit/${selectedType === 'zone' ? 'zones' : 'markers'}/${selected.id}`, 'DELETE');
            await onSaved?.();
          } catch (err) {
            if (err instanceof AccountDeletedError) onForceLogout?.();
            else alert(err.message || 'Erreur suppression');
          }
        }}
      >
        🗑️ Supprimer
      </button>

      <div className="visit-media-editor">
        <h5>🖼️ Photos</h5>
        <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
          Envoi d’image (comme sur la carte) ou lien URL (ex. Wikimedia, fichier déjà sur le serveur).
          {sortedVisitMedia.length > 1 ? ' Plusieurs photos : glisser-déposer une ligne pour réordonner.' : ''}
        </p>
        <VisitEditorialMapPhotoImportList
          photos={mapAssociatedPhotos}
          heading="Photos déjà associées à ce lieu (carte)"
          onAssociate={attachMapPhotoToVisitMedia}
        />
        <div className="field">
          <label>Légende (optionnel)</label>
          <input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} />
        </div>
        <input ref={mediaFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={addMediaFromFile} />
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-full"
          style={{ marginBottom: 10 }}
          disabled={mediaUploading}
          onClick={() => mediaFileRef.current?.click()}
        >
          {mediaUploading ? 'Envoi...' : '📷 Ajouter des photos (fichiers, sélection multiple)'}
        </button>
        <div className="field">
          <label>URL image</label>
          <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://… ou /uploads/…" />
        </div>
        <button className="btn btn-secondary btn-sm" disabled={mediaSaving || !mediaUrl.trim()} onClick={addMedia}>
          {mediaSaving ? 'Ajout...' : '+ Ajouter depuis URL'}
        </button>
        <div className="visit-media-list" style={{ opacity: mediaReorderBusy ? 0.65 : 1, pointerEvents: mediaReorderBusy ? 'none' : undefined }}>
          {sortedVisitMedia.map((m) => (
            <div
              key={m.id}
              className={`visit-media-row${sortedVisitMedia.length > 1 ? ' visit-media-row--reorder' : ''}`}
              draggable={sortedVisitMedia.length > 1}
              onDragStart={(e) => {
                if (sortedVisitMedia.length < 2) return;
                e.dataTransfer.setData(FORETMAP_VISIT_MEDIA_DRAG_MIME, String(m.id));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (sortedVisitMedia.length < 2) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                if (sortedVisitMedia.length < 2) return;
                e.preventDefault();
                const dragId = Number(e.dataTransfer.getData(FORETMAP_VISIT_MEDIA_DRAG_MIME));
                if (!Number.isFinite(dragId) || dragId === m.id) return;
                const next = reorderVisitMediaRows(sortedVisitMedia, dragId, m.id);
                void persistVisitMediaReorder(next);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {m.image_url ? (
                <img
                  src={visitMediaImgSrc(m)}
                  alt=""
                  style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                />
              ) : null}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.caption || m.image_url || `#${m.id}`}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="Modifier la légende"
                onMouseDown={(ev) => ev.stopPropagation()}
                onClick={() => editMediaCaption(m)}
              >
                ✏️
              </button>
              <Tooltip text={tooltipText(HELP_TOOLTIPS.visit.mediaDelete)}>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  aria-label="Supprimer la photo"
                  onMouseDown={(ev) => ev.stopPropagation()}
                  onClick={() => deleteMedia(m.id)}
                >
                  🗑️
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
