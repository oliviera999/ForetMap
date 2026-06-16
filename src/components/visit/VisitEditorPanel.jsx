import React, { useState, useRef, useMemo, useEffect } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { compressImage } from '../../utils/image';
import {
  MARKER_EMOJIS,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
} from '../../constants/emojis';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import {
  normalizeEditorialBlocks,
  resolveEditorialBlocksForEditor,
  buildNewEditorialBlock,
  updateEditorialBlockById,
  moveEditorialBlockById,
  removeEditorialBlockById,
} from '../../utils/visitEditorialBlocks.js';
import { VisitEditorialBuilder } from './VisitEditorialBuilder.jsx';
import { VisitMediaEditor } from './VisitMediaEditor.jsx';
import { VisitEditorEmojiPicker } from './VisitEditorEmojiPicker.jsx';

/**
 * Panneau d'édition visite (zone / repère) réservé enseignant, extrait de `visit-views.jsx` (O6).
 * Édite titres/textes/blocs éditoriaux, gère les photos (upload, URL, association carte,
 * réordonnancement par glisser-déposer) et la suppression de l'élément. Déplacement pur.
 */
export function VisitEditorPanel({
  selected,
  selectedType,
  onSaved,
  onForceLogout,
  isTeacher,
  roleTerms,
  markerEmojis = MARKER_EMOJIS,
}) {
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

  const sortedVisitMedia = useMemo(() => {
    const arr = [...(selected?.visit_media || [])];
    arr.sort(
      (a, b) =>
        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id),
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
    const nextTitle = selectedType === 'zone' ? selected?.name || '' : selected?.label || '';
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
      emoji:
        selectedType === 'zone'
          ? detectedZoneEmoji || markerEmojis[0] || '📍'
          : String(selected?.emoji ?? '').trim(),
    });
    setEditorialBlocks(
      resolveEditorialBlocksForEditor(selected?.visit_editorial_blocks, selected, sortedVisitMedia),
    );
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
      await api(
        `/api/visit/${selectedType === 'zone' ? 'zones' : 'markers'}/${selected.id}`,
        'PUT',
        payload,
      );
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
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </div>
      <div className="field">
        <label>Sous-titre</label>
        <input
          value={form.subtitle}
          onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
        />
      </div>
      <div className="field">
        <label>Description courte</label>
        <MarkdownTextarea
          rows={2}
          value={form.short_description}
          onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))}
        />
      </div>
      <div className="field">
        <label>Titre du bloc dépliable</label>
        <input
          value={form.details_title}
          onChange={(e) => setForm((f) => ({ ...f, details_title: e.target.value }))}
        />
      </div>
      <div className="field">
        <label>Détails dépliables</label>
        <MarkdownTextarea
          rows={4}
          value={form.details_text}
          onChange={(e) => setForm((f) => ({ ...f, details_text: e.target.value }))}
        />
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
            />{' '}
            Visible en visite
          </label>
        </div>
      </div>
      <VisitEditorEmojiPicker
        selectedType={selectedType}
        markerEmojis={markerEmojis}
        selectedEmoji={form.emoji}
        onClearEmoji={() => setForm((f) => ({ ...f, emoji: '' }))}
        onSelectEmoji={(emoji) => {
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
      />
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
        {saving ? 'Enregistrement...' : '💾 Sauver'}
      </button>
      <button
        className="btn btn-danger btn-sm"
        style={{ marginLeft: 8 }}
        onClick={async () => {
          if (
            !confirm(
              `Supprimer ce ${selectedType === 'zone' ? 'zone de visite' : 'repère de visite'} ?`,
            )
          )
            return;
          try {
            await api(
              `/api/visit/${selectedType === 'zone' ? 'zones' : 'markers'}/${selected.id}`,
              'DELETE',
            );
            await onSaved?.();
          } catch (err) {
            if (err instanceof AccountDeletedError) onForceLogout?.();
            else alert(err.message || 'Erreur suppression');
          }
        }}
      >
        🗑️ Supprimer
      </button>

      <VisitMediaEditor
        sortedVisitMedia={sortedVisitMedia}
        mapAssociatedPhotos={mapAssociatedPhotos}
        mediaUrl={mediaUrl}
        onMediaUrlChange={setMediaUrl}
        mediaCaption={mediaCaption}
        onMediaCaptionChange={setMediaCaption}
        mediaSaving={mediaSaving}
        mediaUploading={mediaUploading}
        mediaReorderBusy={mediaReorderBusy}
        mediaFileRef={mediaFileRef}
        onAddFromFile={addMediaFromFile}
        onAddFromUrl={addMedia}
        onAssociateMapPhoto={attachMapPhotoToVisitMedia}
        onEditCaption={editMediaCaption}
        onDeleteMedia={deleteMedia}
        onReorder={persistVisitMediaReorder}
      />
    </div>
  );
}
