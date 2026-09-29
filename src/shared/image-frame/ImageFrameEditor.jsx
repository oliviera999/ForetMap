import { useEffect, useMemo, useState } from 'react';

import { DialogShell } from '../components/DialogShell.jsx';
import { Button } from '../ui/Button.jsx';
import { glImageFrameToStyle, normalizeGlImageFrame } from './glImageFrame.js';
import { ImageFrameHelp } from './ImageFrameHelp.jsx';

const RATIO_OPTIONS = ['auto', '1/1', '4/3', '16/9', '21/9'];
const FIT_OPTIONS = ['cover', 'contain'];

/** Valeur d'un curseur de point focal : 0 % est un bord valide, pas une absence de valeur. */
export function focalFromInput(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
}

/**
 * Éditeur de **cadre d'image** — ratio, ajustement, point focal, recadrage réel (lot 7 du
 * plan de convergence). Né côté Gnomes & Licornes, l'outil n'a jamais rien eu de propre au
 * jeu : il sert partout où une image doit être cadrée de la même façon d'un écran à l'autre —
 * les photos de lieux ForetMap et les visuels du Plan Lyautey compris. Il rejoint donc le
 * socle partagé, sans préfixe produit.
 *
 * Les classes CSS historiques (`gl-image-frame-*`) sont conservées telles quelles : les
 * renommer casserait le thème G&L sans rien apporter.
 */
export function ImageFrameEditor({
  open,
  title = 'Ajuster le cadre de l’image',
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
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      </div>

      <div className="gl-image-frame-editor">
        <div className="gl-image-frame-preview-shell">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Aperçu du recadrage"
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
              setDraft((prev) => ({ ...prev, focalX: focalFromInput(event.target.value) }))
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
              setDraft((prev) => ({ ...prev, focalY: focalFromInput(event.target.value) }))
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

        <ImageFrameHelp context={context} />

        <div className="gl-inline-actions">
          <Button type="button" onClick={() => onApply?.({ frame, croppedDataUrl: null })}>
            Appliquer cadrage CSS
          </Button>
          {allowCropExport ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onApply?.({ frame, croppedDataUrl: null })}
            >
              Appliquer pour export
            </Button>
          ) : null}
        </div>
      </div>
    </DialogShell>
  );
}
