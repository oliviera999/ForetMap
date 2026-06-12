import React from 'react';

/** Diagramme circulaire de progression visite (viewBox carré, cercle centré). */
const VISIT_PROGRESS_DONUT_VB = 40;
const VISIT_PROGRESS_DONUT_R = 14;
const VISIT_PROGRESS_DONUT_STROKE = 3;
const VISIT_PROGRESS_DONUT_C = 2 * Math.PI * VISIT_PROGRESS_DONUT_R;

/**
 * Bandeau « chrome » de la carte de visite : titre + bouton présentation, statut réseau/sync,
 * bascules plein plan / aperçu élève, sélecteur de mascotte, donut de progression,
 * panneau d'aide (slot), retour connexion, sélecteur de carte et astuces sous le bandeau.
 * Présentation pure : tout l'état reste dans `VisitView`.
 *
 * @param {string|null} networkStatusLabel libellé statut réseau (null = masqué, ex. hors mode vue).
 * @param {{ total: number, seenCount: number, pct: number }} cartographyProgress progression carte courante.
 * @param {React.ReactNode} helpPanelSlot `HelpPanel` déjà configuré par le parent (null = aide désactivée).
 * @param {Function|null} onBackToAuth retour à la connexion (null = bouton masqué).
 * @param {string|null} quickTipText astuce contextuelle (null = masquée).
 */
export function VisitMapChrome({
  title,
  showPresentationButton = false,
  presentationInvitePulse = false,
  onOpenPresentation,
  networkStatusLabel = null,
  isOnline = true,
  syncStatus = 'idle',
  pendingSyncCount = 0,
  visitImmersion = false,
  onToggleImmersion,
  isTeacher = false,
  teacherPreviewAsStudent = false,
  onToggleTeacherPreview,
  visitMascotId,
  visitMascotOptions = [],
  onChangeVisitMascotId,
  cartographyProgress = { total: 0, seenCount: 0, pct: 0 },
  helpPanelSlot = null,
  onBackToAuth = null,
  maps = [],
  mapId,
  onSelectMapId,
  quickTipPrefix = '',
  quickTipText = null,
}) {
  return (
    <div className="visit-map-card__chrome">
      <div className="visit-map-card__chrome-top">
        <div className="visit-map-card__chrome-title-line">
          <h2 className="section-title visit-map-card__title">{title}</h2>
          {showPresentationButton ? (
            <button
              type="button"
              className={`btn btn-sm btn-primary visit-map-card__presentation-btn${presentationInvitePulse ? ' visit-map-card__presentation-btn--invite' : ''}`}
              data-testid="visit-presentation-link"
              data-invite-pulse={presentationInvitePulse ? '1' : '0'}
              onClick={onOpenPresentation}
            >
              Présentation du lieu
            </button>
          ) : null}
        </div>
        <div className="visit-map-card__chrome-actions">
          {networkStatusLabel ? (
            <span
              className={`visit-network-status${!isOnline ? ' visit-network-status--offline' : ''}${pendingSyncCount > 0 || syncStatus === 'error' ? ' visit-network-status--pending' : ''}${syncStatus === 'syncing' ? ' visit-network-status--syncing' : ''}`}
              data-testid="visit-network-status"
              data-online={isOnline ? '1' : '0'}
              data-sync={syncStatus}
              data-pending={String(pendingSyncCount)}
              role="status"
              aria-live="polite"
            >
              {networkStatusLabel}
            </span>
          ) : null}
          <button
            type="button"
            className={`btn btn-sm ${visitImmersion ? 'btn-primary' : 'btn-ghost'}`}
            onClick={onToggleImmersion}
            aria-pressed={visitImmersion}
          >
            {visitImmersion ? 'Quitter le plein plan' : 'Plein plan'}
          </button>
          {isTeacher ? (
            <button
              type="button"
              data-testid="visit-teacher-preview-toggle"
              className={`btn btn-sm ${teacherPreviewAsStudent ? 'btn-primary' : 'btn-ghost'}`}
              onClick={onToggleTeacherPreview}
              aria-pressed={teacherPreviewAsStudent}
            >
              {teacherPreviewAsStudent ? 'Retour édition prof' : 'Aperçu comme élève'}
            </button>
          ) : null}
          {visitMascotOptions.length > 0 ? (
            <label
              className="visit-mascot-picker visit-mascot-picker--visit-chrome"
              data-testid="visit-mascot-picker"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.85rem',
                marginLeft: 4,
              }}
            >
              <span className="section-sub" style={{ whiteSpace: 'nowrap' }}>Mascotte</span>
              <select
                className="form-select"
                style={{ minWidth: 140, maxWidth: 220 }}
                value={visitMascotId}
                onChange={(e) => onChangeVisitMascotId(e.target.value)}
                aria-label="Choisir la mascotte affichée sur le plan"
              >
                {visitMascotOptions.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          {cartographyProgress.total > 0 ? (
            <div className="visit-progress visit-progress--donut visit-progress--chrome-inline">
              <div
                className="visit-progress-donut"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={cartographyProgress.pct}
                aria-label={`Parcours sur la carte : ${cartographyProgress.pct} % des zones et repères marqués comme vus (${cartographyProgress.seenCount} sur ${cartographyProgress.total}).`}
                title={`${cartographyProgress.pct} % — ${cartographyProgress.seenCount} / ${cartographyProgress.total} vus`}
                data-testid="visit-progress-donut"
              >
                <svg
                  className="visit-progress-donut__svg"
                  viewBox={`0 0 ${VISIT_PROGRESS_DONUT_VB} ${VISIT_PROGRESS_DONUT_VB}`}
                  aria-hidden="true"
                >
                  <circle
                    className="visit-progress-donut__track"
                    fill="none"
                    strokeWidth={VISIT_PROGRESS_DONUT_STROKE}
                    cx={VISIT_PROGRESS_DONUT_VB / 2}
                    cy={VISIT_PROGRESS_DONUT_VB / 2}
                    r={VISIT_PROGRESS_DONUT_R}
                  />
                  <circle
                    className="visit-progress-donut__arc"
                    fill="none"
                    strokeWidth={VISIT_PROGRESS_DONUT_STROKE}
                    strokeLinecap="round"
                    cx={VISIT_PROGRESS_DONUT_VB / 2}
                    cy={VISIT_PROGRESS_DONUT_VB / 2}
                    r={VISIT_PROGRESS_DONUT_R}
                    transform={`rotate(-90 ${VISIT_PROGRESS_DONUT_VB / 2} ${VISIT_PROGRESS_DONUT_VB / 2})`}
                    strokeDasharray={VISIT_PROGRESS_DONUT_C}
                    strokeDashoffset={VISIT_PROGRESS_DONUT_C * (1 - cartographyProgress.pct / 100)}
                  />
                </svg>
                <span className="visit-progress-donut__label" aria-hidden="true">
                  <span className="visit-progress-donut__value">{cartographyProgress.pct}</span>
                  <span className="visit-progress-donut__pct-sign">%</span>
                </span>
              </div>
            </div>
          ) : null}
          {helpPanelSlot}
          {onBackToAuth ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBackToAuth}>↩ Retour connexion</button>
          ) : null}
        </div>
      </div>
      {maps.length > 1 && (
        <div className="visit-map-card__chrome-maps">
          <div className="visit-map-switch visit-map-switch--embedded">
            {maps.length > 4 ? (
              <select
                className="visit-map-switch-select"
                value={mapId}
                onChange={(event) => onSelectMapId(event.target.value)}
                aria-label="Sélection de carte visite"
              >
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              maps.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`btn btn-sm ${mapId === m.id ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => onSelectMapId(m.id)}
                >
                  {m.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {cartographyProgress.total === 0 ? (
        <p className="visit-progress-empty visit-progress-empty--below-chrome section-sub">
          {maps.length > 1
            ? 'Aucune zone ni repère sur cette carte. Choisis une autre carte ci-dessus si besoin.'
            : 'Aucune zone ni repère sur cette carte pour l’instant.'}
        </p>
      ) : null}
      {quickTipText ? (
        <p className="visit-progress-empty visit-progress-empty--below-chrome section-sub">
          <strong>{quickTipPrefix}</strong> {quickTipText}
        </p>
      ) : null}
    </div>
  );
}
