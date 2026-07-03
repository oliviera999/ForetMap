import React, { useMemo } from 'react';
import VisitMapMascotRenderer from '../VisitMapMascotRenderer.jsx';
import {
  buildVisitMascotCatalogExtraFromValidated,
  buildVisitMascotCatalogExtrasFromContent,
} from '../../utils/visitMascotPackExtras.js';
import { buildVisitMascotSelectionOptions } from '../../utils/visitMascotCatalog.js';
import { VISIT_MASCOT_STATE, previewMotionClass } from '../../utils/visitMascotState.js';
import { STATE_LABELS } from '../../constants/mascotStateLabels.js';
import useVisitMascotStateMachine from '../../hooks/useVisitMascotStateMachine.js';
import { validateMascotPackV1 } from '../../utils/mascotPack.js';
import { sanitizeMascotPackDraft } from '../../utils/mascotPackValidationUi.js';
import { applyPackAssetPreviewUrlsToSpriteCut } from '../../utils/visitMascotPackManager.js';

/**
 * Aperçu global des mascottes serveur (onglet « Aperçu global ») : sélecteur de
 * mascotte (catalogue + extras dérivés des packs chargés), boutons d'états et
 * rendu animé. Présentation pure prop-driven.
 * @param {{
 *   packs: Array<{ id?: string, catalog_id: string, label: string, pack: object }>,
 *   mapId: string,
 *   selectedPackId?: string | null,
 *   selectedPackCatalogId?: string,
 *   selectedPackLabel?: string,
 *   editorPack?: Record<string, unknown>,
 * }} props
 */
export default function VisitMascotStudioPreviewSection({
  packs,
  mapId,
  selectedPackId = null,
  selectedPackCatalogId = '',
  selectedPackLabel = '',
  editorPack = {},
  assetPreviewByFilename = {},
}) {
  const extras = useMemo(() => {
    const base = buildVisitMascotCatalogExtrasFromContent(
      packs.map((p) => ({ catalog_id: p.catalog_id, label: p.label, pack: p.pack })),
    );
    const catalogId = String(selectedPackCatalogId || editorPack?.id || '').trim();
    const packId = String(selectedPackId || '').trim();
    if (!packId || !catalogId) return base;

    const draft = sanitizeMascotPackDraft(editorPack || {});
    const relaxed = validateMascotPackV1(draft, { relaxAssetPrefix: true });
    if (!relaxed.ok) return base;

    // Entrée catalogue construite par le helper commun (mêmes champs que le rendu final,
    // y compris `customStates`/`customTriggers` désormais présents pour le brouillon).
    const entry = buildVisitMascotCatalogExtraFromValidated(relaxed, catalogId, selectedPackLabel);
    if (!entry) return base;
    // Pack en cours d'édition : tokenise les srcs (preview_url signées) pour qu'un **brouillon**
    // s'affiche dans l'aperçu (les <img> ne portent pas le JWT → 403 sur assets non publiés).
    const previewSpriteCut = applyPackAssetPreviewUrlsToSpriteCut(
      entry.spriteCut,
      assetPreviewByFilename,
      relaxed.pack.framesBase,
    );
    const draftEntry = { ...entry, spriteCut: previewSpriteCut };
    const withoutCurrent = base.filter((e) => e.id !== catalogId);
    return [...withoutCurrent, draftEntry];
  }, [
    packs,
    selectedPackId,
    selectedPackCatalogId,
    selectedPackLabel,
    editorPack,
    assetPreviewByFilename,
  ]);

  const visitMascotOptions = useMemo(() => buildVisitMascotSelectionOptions(extras), [extras]);
  const {
    visitMascotId,
    visitMascotPreviewState,
    visitMascotPreviewStateOptions,
    onChangeVisitMascotId,
    setVisitMascotPreviewState,
  } = useVisitMascotStateMachine({
    walking: false,
    happy: false,
    extraCatalogEntries: extras,
  });
  const visitMascotPreviewBodyMotionClass = previewMotionClass(visitMascotPreviewState);

  return (
    <section className="visit-mascot-preview-card" aria-label="Aperçu de la mascotte">
      <p className="section-sub" style={{ fontSize: '0.82rem' }}>
        Carte <strong>{mapId}</strong> — packs chargés (y compris brouillons) pour prévisualiser les
        mascottes serveur.
      </p>
      <div
        className="visit-mascot-preview-actions"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}
      >
        <button
          type="button"
          className={`btn btn-sm ${visitMascotPreviewState === VISIT_MASCOT_STATE.IDLE ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setVisitMascotPreviewState(VISIT_MASCOT_STATE.IDLE)}
        >
          {STATE_LABELS[VISIT_MASCOT_STATE.IDLE]}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${visitMascotPreviewState === VISIT_MASCOT_STATE.WALKING ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setVisitMascotPreviewState(VISIT_MASCOT_STATE.WALKING)}
        >
          {STATE_LABELS[VISIT_MASCOT_STATE.WALKING]}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${visitMascotPreviewState === VISIT_MASCOT_STATE.HAPPY ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setVisitMascotPreviewState(VISIT_MASCOT_STATE.HAPPY)}
        >
          {STATE_LABELS[VISIT_MASCOT_STATE.HAPPY]}
        </button>
        {visitMascotPreviewStateOptions
          .filter(
            (entry) =>
              ![
                VISIT_MASCOT_STATE.IDLE,
                VISIT_MASCOT_STATE.WALKING,
                VISIT_MASCOT_STATE.HAPPY,
              ].includes(entry.state),
          )
          .map((entry) => (
            <button
              key={entry.state}
              type="button"
              className={`btn btn-sm ${visitMascotPreviewState === entry.state ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVisitMascotPreviewState(entry.state)}
            >
              {entry.icon} {entry.label}
            </button>
          ))}
      </div>
      <label className="visit-mascot-picker" style={{ display: 'block', marginBottom: 10 }}>
        <span>Mascotte</span>
        <select
          value={visitMascotId}
          onChange={(e) => onChangeVisitMascotId(e.target.value)}
          aria-label="Choisir la mascotte à prévisualiser"
        >
          {visitMascotOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div
        className={`visit-mascot-preview-body ${visitMascotPreviewBodyMotionClass}`}
        aria-hidden="true"
        style={{ minHeight: 200 }}
      >
        <VisitMapMascotRenderer
          key={visitMascotId}
          mascotState={visitMascotPreviewState}
          mascotId={visitMascotId}
          extraCatalogEntries={extras}
        />
      </div>
    </section>
  );
}
