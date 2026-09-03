import { useState } from 'react';
import { ZONE_COLORS } from '../../constants/garden';
import { ColorPaletteField } from '../ColorPaletteField.jsx';
import {
  MARKER_EMOJIS,
  ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
  stripLeadingMarkerEmoji,
  clampEmojiInput,
} from '../../constants/emojis';
import { nextLivingBeingsFromMultiSelect } from '../../utils/livingBeings';
import { useDialogA11y } from '../../shared/platform/useDialogA11y';
import { useOverlayHistoryBack } from '../../shared/platform/useOverlayHistoryBack';
import { DialogShell } from '../DialogShell';
import { IconCheck, IconClose, IconDrawZone } from '../../shared/icons.jsx';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { ZoneOrMarkerEmojiField } from './ZoneOrMarkerEmojiField.jsx';
import { LocationCategoryPicker } from './LocationCategoryPicker.jsx';

function ZoneDrawModal({
  points_pct,
  onClose,
  onSave,
  plants,
  categoryCatalog = [],
  markerEmojis = MARKER_EMOJIS,
  emojiParsingList = MARKER_EMOJIS,
}) {
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const [form, setForm] = useState({
    name: '',
    zone_emoji: markerEmojis[0] || '📍',
    living_beings: [],
    category_ids: [],
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
        // Colonne dédiée `zones.emoji` (audit C4) — le nom garde son préfixe pour compat.
        emoji: prefixEmoji,
        points: points_pct,
        current_plant: '',
        living_beings: living,
      });
      onClose();
    } catch (_) {
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
      <button className="modal-close" aria-label="Fermer" onClick={onClose}>
        <IconClose size={16} />
      </button>
      <h3>
        <IconDrawZone size={18} /> Nouvelle zone
      </h3>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', marginBottom: 14 }}>
        {points_pct.length} points tracés
      </p>
      <div className="field">
        <label>Nom *</label>
        <input value={form.name} onChange={set('name')} placeholder="Ex: Potager Est" autoFocus />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label>Êtres vivants</label>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-soft)',
              margin: '0 0 6px',
              lineHeight: 'var(--lh-normal)',
            }}
          >
            Ctrl / Cmd + clic pour plusieurs ; l’ordre choisi est conservé.
          </p>
          <select
            multiple
            size={Math.min(8, Math.max(4, plants.length + 1))}
            value={form.living_beings}
            onChange={(e) => {
              const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
              setForm((f) => ({
                ...f,
                living_beings: nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants),
              }));
            }}
          >
            {plants.map((p) => (
              <option key={p.id} value={p.name}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <LocationCategoryPicker
        kind="zone"
        catalog={categoryCatalog}
        value={form.category_ids}
        onChange={(next) => setForm((f) => ({ ...f, category_ids: next }))}
      />
      <div className="field">
        <label>Description</label>
        <MarkdownTextarea
          value={form.description}
          onChange={set('description')}
          rows={2}
          placeholder="Notes, observations sur cette zone..."
        />
      </div>
      <ColorPaletteField
        id="zone-draw-color"
        value={form.color}
        onChange={(next) => setForm((f) => ({ ...f, color: next }))}
      />
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
        {saving ? (
          '...'
        ) : (
          <>
            <IconCheck size={15} /> Créer la zone
          </>
        )}
      </button>
    </DialogShell>
  );
}

export { ZoneDrawModal };
