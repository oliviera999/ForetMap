import { IconFullscreen } from '../../shared/icons.jsx';
/** Diagramme circulaire de progression visite (viewBox carré, cercle centré). */
const VISIT_PROGRESS_DONUT_VB = 40;
const VISIT_PROGRESS_DONUT_R = 14;
const VISIT_PROGRESS_DONUT_STROKE = 3;
const VISIT_PROGRESS_DONUT_C = 2 * Math.PI * VISIT_PROGRESS_DONUT_R;

/** Donut de progression du parcours (zones + repères marqués comme vus). */
function VisitProgressDonut({ progress }) {
  return (
    <div className="visit-progress visit-progress--donut visit-progress--chrome-inline">
      <div
        className="visit-progress-donut"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.pct}
        aria-label={`Parcours sur la carte : ${progress.pct} % des zones et repères marqués comme vus (${progress.seenCount} sur ${progress.total}).`}
        title={`${progress.pct} % — ${progress.seenCount} / ${progress.total} vus`}
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
            strokeDashoffset={VISIT_PROGRESS_DONUT_C * (1 - progress.pct / 100)}
          />
        </svg>
        <span className="visit-progress-donut__label" aria-hidden="true">
          <span className="visit-progress-donut__value">{progress.pct}</span>
          <span className="visit-progress-donut__pct-sign">%</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Bandeau « chrome » de la carte de visite. Présentation pure : tout l'état reste dans
 * `VisitView`.
 *
 * Organisé en **trois zones** au lieu d'une file unique de commandes hétérogènes
 * (cf. `docs/AUDIT_VISITE_UI_UX_2026-09.md` §5) :
 *  1. *identité et progression* — titre, donut, bouton « Présentation du lieu » ;
 *  2. *affichage du plan* — plein écran, taille du texte, mascotte, réunis dans un groupe
 *     visuel unique (`.visit-display-group`) qui rime avec les commandes de zoom du plan ;
 *  3. *contexte et rôle* — état réseau, aperçu élève, aide, retour connexion.
 *
 * Les commandes de la zone 2 sont **en icône seule** (cible de 44px) : mesuré dans Chromium,
 * le bandeau montait à 274px de haut sur un écran de 390px, dont un tiers pour les libellés
 * et le sélecteur de mascotte.
 *
 * @param {boolean} refreshing rechargement en cours (la carte reste affichée : pastille discrète).
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
  refreshing = false,
  networkStatusLabel = null,
  isOnline = true,
  syncStatus = 'idle',
  pendingSyncCount = 0,
  visitImmersion = false,
  onToggleImmersion,
  mapTextSizeLabel = 'Aa',
  onCycleMapTextSize = null,
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
        {/* Zone 1 — identité et progression. Le donut est une **donnée**, pas une commande :
            sa place est auprès du titre, pas coincée entre un menu de préférence et l'aide. */}
        <div className="visit-map-card__chrome-title-line">
          <h2 className="section-title visit-map-card__title">{title}</h2>
          {cartographyProgress.total > 0 ? (
            <VisitProgressDonut progress={cartographyProgress} />
          ) : null}
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
          {/* Zone 2 — affichage du plan : trois commandes de même nature, même forme,
              un seul bloc. Sans ce regroupement, elles étaient éparpillées entre un état
              réseau, une bascule de rôle et un bouton d'aide. */}
          <div className="visit-display-group" role="group" aria-label="Affichage du plan">
            <button
              type="button"
              className="fm-map-fullscreen-open fm-map-fullscreen-open--compact"
              data-testid="visit-map-fullscreen-open"
              onClick={onToggleImmersion}
              aria-pressed={visitImmersion}
              title={visitImmersion ? 'Quitter le plein écran' : 'Plein écran'}
              aria-label={
                visitImmersion ? 'Quitter le plein écran' : 'Afficher la carte en plein écran'
              }
            >
              <IconFullscreen size={16} />
              <span className="fm-map-fullscreen-open__label">Plein écran</span>
            </button>
            {onCycleMapTextSize ? (
              <button
                type="button"
                className="map-toolbar-text-size-btn"
                data-testid="visit-map-text-size"
                title="Taille du texte sur la carte (Normal / Grand / Très grand)"
                aria-label={`Taille du texte sur la carte (${mapTextSizeLabel})`}
                onClick={onCycleMapTextSize}
              >
                {mapTextSizeLabel}
              </button>
            ) : null}
            {visitMascotOptions.length > 0 ? (
              /* Sélecteur natif conservé — accessible sans piège de focus maison — mais
                 compacté : le libellé visible « Mascotte » doublait la valeur affichée pour
                 60px de large, et `flex-direction: column`, hérité de `.visit-mascot-picker`
                 sans jamais être réinitialisé, le posait sur une seconde ligne. Le nom
                 accessible reste porté par `aria-label`, l'infobulle par `title`. */
              <label
                className="visit-mascot-picker visit-mascot-picker--visit-chrome"
                data-testid="visit-mascot-picker"
              >
                <select
                  className="form-select visit-mascot-picker__select"
                  value={visitMascotId}
                  onChange={(e) => onChangeVisitMascotId(e.target.value)}
                  title="Mascotte affichée sur le plan"
                  aria-label="Choisir la mascotte affichée sur le plan"
                >
                  {visitMascotOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {/* Zone 3 — contexte et rôle. */}
          {refreshing ? (
            <span
              className="visit-refresh-pill"
              data-testid="visit-refresh-pill"
              role="status"
              aria-live="polite"
            >
              Actualisation…
            </span>
          ) : null}
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
          {helpPanelSlot}
          {onBackToAuth ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBackToAuth}>
              ↩ Retour connexion
            </button>
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
