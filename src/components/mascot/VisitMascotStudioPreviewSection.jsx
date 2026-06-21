import React, { useMemo } from 'react';
import VisitMapMascotRenderer from '../VisitMapMascotRenderer.jsx';
import { buildVisitMascotCatalogExtrasFromContent } from '../../utils/visitMascotPackExtras.js';
import { getVisitMascotCatalog } from '../../utils/visitMascotCatalog.js';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { STATE_LABELS } from '../../constants/mascotStateLabels.js';
import useVisitMascotStateMachine from '../../hooks/useVisitMascotStateMachine.js';
import { validateMascotPackV1 } from '../../utils/mascotPack.js';
import { sanitizeMascotPackDraft } from '../../utils/mascotPackValidationUi.js';

/**
 * Aperçu global des mascottes serveur (onglet « Aperçu global ») : sélecteur de
 * mascotte (catalogue + extras dérivés des packs chargés), boutons d'états et
 * rendu animé. Présentation pure prop-driven.
 * @param {{
 *   packs: Array<{ id?: string, catalog_id: string, label: string, pack: object }>,
 *   mapId: string,
 *   onForceLogout?: () => void,
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

    const label = String(selectedPackLabel || relaxed.pack.label || catalogId).trim();
    const ver = Number(relaxed.pack.mascotPackVersion) === 2 ? 2 : 1;
    const draftEntry = {
      id: catalogId,
      label: label || catalogId,
      renderer: 'sprite_cut',
      fallbackSilhouette: relaxed.pack.fallbackSilhouette || 'gnome',
      spriteCut: relaxed.spriteCut,
      ...(ver === 2 && relaxed.pack.interactionProfile
        ? { interactionProfile: relaxed.pack.interactionProfile }
        : {}),
      ...(ver === 2 && relaxed.pack.dialogProfile
        ? { dialogProfile: relaxed.pack.dialogProfile }
        : {}),
      mascotPackVersion: ver,
    };
    const withoutCurrent = base.filter((entry) => entry.id !== catalogId);
    return [...withoutCurrent, draftEntry];
  }, [packs, selectedPackId, selectedPackCatalogId, selectedPackLabel, editorPack]);

  const visitMascotOptions = useMemo(() => [...getVisitMascotCatalog(), ...extras], [extras]);
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
  const visitMascotPreviewBodyMotionClass = useMemo(() => {
    const s = visitMascotPreviewState;
    if (s === VISIT_MASCOT_STATE.WALKING || s === VISIT_MASCOT_STATE.RUNNING) {
      return 'visit-mascot-preview-body--motion-walk';
    }
    if (
      s === VISIT_MASCOT_STATE.HAPPY ||
      s === VISIT_MASCOT_STATE.CELEBRATE ||
      s === VISIT_MASCOT_STATE.HAPPY_JUMP ||
      s === VISIT_MASCOT_STATE.SPIN
    ) {
      return 'visit-mascot-preview-body--motion-happy';
    }
    return 'visit-mascot-preview-body--motion-idle';
  }, [visitMascotPreviewState]);

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
          mascotState={visitMascotPreviewState}
          mascotId={visitMascotId}
          extraCatalogEntries={extras}
        />
      </div>
    </section>
  );
}
