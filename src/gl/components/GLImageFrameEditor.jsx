import React, { useEffect, useMemo, useState } from 'react';
import { DialogShell } from '../../components/DialogShell.jsx';
import { glImageFrameToStyle, normalizeGlImageFrame } from '../../utils/glImageFrame.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLImageFrameHelp } from './GLImageFrameHelp.jsx';

const RATIO_OPTIONS = ['auto', '1/1', '4/3', '16/9', '21/9'];
const FIT_OPTIONS = ['cover', 'contain'];

export function GLImageFrameEditor({
  open,
  title = 'Ajuster le cadre d image',
  context = 'default',
  imageUrl = '',
  initialFrame = null,
  allowCropExport = false,
  onApply,
  onClose,
}) {
  const [draft, setDraft] = useState(() => normalizeGlImageFrame(initialFrame, context));
  useEffect(() => {
    if (!open) return;
    setDraft(normalizeGlImageFrame(initialFrame, context));
  }, [open, initialFrame, context]);

  const frame = useMemo(() => normalizeGlImageFrame(draft, context), [draft, context]);
  const previewStyle = useMemo(() => glImageFrameToStyle(frame), [frame]);

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName="fm-modal-overlay"
      dialogClassName="fm-modal-panel gl-image-frame-modal-body animate-pop"
      ariaLabel={title}
    >
      <div className="gl-profile-modal-head">
        <h3>{title}</h3>
        <GLButton type="button" variant="secondary" onClick={onClose}>
          Fermer
        </GLButton>
      </div>

      <div className="gl-image-frame-editor">
        <div className="gl-image-frame-preview-shell">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Apercu recadrage"
              className="gl-image-frame-preview"
              style={previewStyle}
            />
          ) : (
            <div className="gl-image-frame-empty">Aucune image</div>
          )}
        </div>

        <label>
          Ratio du cadre
          <select
            value={frame.aspectRatio}
            onChange={(event) => setDraft((prev) => ({ ...prev, aspectRatio: event.target.value }))}
          >
            {RATIO_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          Remplissage
          <select
            value={frame.objectFit}
            onChange={(event) => setDraft((prev) => ({ ...prev, objectFit: event.target.value }))}
          >
            {FIT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          Focus horizontal ({Math.round(frame.focalX)}%)
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={frame.focalX}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, focalX: Number(event.target.value) || 50 }))
            }
          />
        </label>

        <label>
          Focus vertical ({Math.round(frame.focalY)}%)
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={frame.focalY}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, focalY: Number(event.target.value) || 50 }))
            }
          />
        </label>

        <div className="gl-image-frame-grid">
          <label>
            Largeur max (px)
            <input
              type="number"
              min={0}
              max={4096}
              value={frame.maxWidthPx ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, maxWidthPx: event.target.value }))
              }
            />
          </label>
          <label>
            Hauteur max (px)
            <input
              type="number"
              min={0}
              max={4096}
              value={frame.maxHeightPx ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, maxHeightPx: event.target.value }))
              }
            />
          </label>
        </div>

        <GLImageFrameHelp context={context} />

        <div className="gl-inline-actions">
          <GLButton type="button" onClick={() => onApply?.({ frame, croppedDataUrl: null })}>
            Appliquer cadrage CSS
          </GLButton>
          {allowCropExport ? (
            <GLButton
              type="button"
              variant="secondary"
              onClick={() => onApply?.({ frame, croppedDataUrl: null })}
            >
              Appliquer pour export
            </GLButton>
          ) : null}
        </div>
      </div>
    </DialogShell>
  );
}
