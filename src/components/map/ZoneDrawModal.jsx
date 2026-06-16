import React, { useState } from 'react';
import { ZONE_COLORS } from '../../constants/garden';
import {
  MARKER_EMOJIS,
  ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
  stripLeadingMarkerEmoji,
  clampEmojiInput,
} from '../../constants/emojis';
import { nextLivingBeingsFromMultiSelect } from '../../utils/livingBeings';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { DialogShell } from '../DialogShell';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { ZoneOrMarkerEmojiField } from './ZoneOrMarkerEmojiField.jsx';

function ZoneDrawModal({
  points_pct,
  onClose,
  onSave,
  plants,
  markerEmojis = MARKER_EMOJIS,
  emojiParsingList = MARKER_EMOJIS,
}) {
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const [form, setForm] = useState({
    name: '',
    zone_emoji: markerEmojis[0] || '📍',
    living_beings: [],
    stage: 'empty',
    description: '',
    color: ZONE_COLORS[0],
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    const cleanName = stripLeadingMarkerEmoji(form.name, emojiParsingList);
    if (!cleanName) return;
    const prefixEmoji = clampEmojiInput(
      (form.zone_emoji || '').trim() || markerEmojis[0] || '📍',
      ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
    );
    setSaving(true);
    try {
      const { zone_emoji, living_beings, ...rest } = form;
      const living = living_beings || [];
      await onSave({
        ...rest,
        name: `${prefixEmoji} ${cleanName}`.trim(),
        points: points_pct,
        current_plant: '',
        living_beings: living,
      });
      onClose();
    } catch (e) {
      setSaving(false);
    }
  };
  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in"
      ariaLabel="Nouvelle zone"
      closeOnOverlay
      dialogRef={dialogRef}
    >
      <button className="modal-close" onClick={onClose}>
        ✕
      </button>
      <h3>🖊️ Nouvelle zone</h3>
      <p style={{ fontSize: '.83rem', color: '#888', marginBottom: 14 }}>
        {points_pct.length} points tracés
      </p>
      <div className="field">
        <label>Nom *</label>
        <input value={form.name} onChange={set('name')} placeholder="Ex: Potager Est" autoFocus />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label>Êtres vivants</label>
          <p style={{ fontSize: '.74rem', color: '#64748b', margin: '0 0 6px', lineHeight: 1.4 }}>
            Ctrl / Cmd + clic pour plusieurs ; l’ordre choisi est conservé.
          </p>
          <select
            multiple
            size={Math.min(8, Math.max(4, plants.length + 1))}
            value={form.living_beings}
            onChange={(e) => {
              const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
              setForm((f) => {
                const next = nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants);
                let stage = f.stage;
                if (next.length === 0) stage = 'empty';
                else if (f.stage === 'empty') stage = 'growing';
                return { ...f, living_beings: next, stage };
              });
            }}
          >
            {plants.map((p) => (
              <option key={p.id} value={p.name}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>État</label>
          <select value={form.stage} onChange={set('stage')}>
            <option value="empty">Vide</option>
            <option value="growing">En croissance</option>
            <option value="ready">Prêt à récolter</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Description</label>
        <MarkdownTextarea
          value={form.description}
          onChange={set('description')}
          rows={2}
          placeholder="Notes, observations sur cette zone..."
        />
      </div>
      <div className="field">
        <label>Couleur</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ZONE_COLORS.map((c) => (
            <div
              key={c}
              onClick={() => setForm((f) => ({ ...f, color: c }))}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: c,
                cursor: 'pointer',
                border: form.color === c ? '3px solid #1a4731' : '2px solid #ddd',
                transition: 'transform .1s',
                transform: form.color === c ? 'scale(1.15)' : 'none',
              }}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="zone-draw-emoji-custom">Emoji de zone</label>
        <ZoneOrMarkerEmojiField
          id="zone-draw-emoji-custom"
          value={form.zone_emoji}
          onChange={(v) => setForm((f) => ({ ...f, zone_emoji: v }))}
          maxLen={ZONE_NAME_PREFIX_EMOJI_MAX_CHARS}
        />
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            maxHeight: 180,
            overflowY: 'auto',
            paddingRight: 2,
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
          }}
        >
          {markerEmojis.map((emoji) => (
            <button
              type="button"
              key={emoji}
              className={`emoji-btn ${form.zone_emoji === emoji ? 'sel' : ''}`}
              onClick={() => setForm((f) => ({ ...f, zone_emoji: emoji }))}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <button
        className="btn btn-primary btn-full"
        onClick={save}
        disabled={saving}
        style={{ marginTop: 4 }}
      >
        {saving ? '...' : '✅ Créer la zone'}
      </button>
    </DialogShell>
  );
}

export { ZoneDrawModal };
