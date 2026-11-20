import { useEffect, useId, useRef, useState } from 'react';

import { IconFullscreen } from '../../shared/icons.jsx';
import { MapCategoryChips } from '../../shared/map-discover/MapCategoryChips.jsx';

/** Diagramme circulaire de progression visite (viewBox carré, cercle centré). */
const VISIT_PROGRESS_DONUT_VB = 40;
const VISIT_PROGRESS_DONUT_R = 14;
const VISIT_PROGRESS_DONUT_STROKE = 3;
const VISIT_PROGRESS_DONUT_C = 2 * Math.PI * VISIT_PROGRESS_DONUT_R;

/**
 * Progression **par carte** (U6) : « 6 lieux sur 45 » de la carte affichée, au lieu d'un
 * pourcentage rapporté à tous les lieux de toutes les cartes.
 */
export function formatVisitMapProgress(progress, mapLabel = '') {
  const seen = Number(progress?.seenCount || 0);
  const total = Number(progress?.total || 0);
  const lieux = total > 1 ? 'lieux' : 'lieu';
  const base = `${seen.toLocaleString('fr-FR')}\u00a0${seen > 1 ? 'lieux' : 'lieu'} sur ${total.toLocaleString('fr-FR')}`;
  const label = String(mapLabel || '').trim();
  return {
    short: `${seen.toLocaleString('fr-FR')}\u00a0/\u00a0${total.toLocaleString('fr-FR')}\u00a0${lieux}`,
    long: label ? `${base} de la carte « ${label} »` : base,
  };
}

/** Donut de progression de la carte (zones + repères vus) et décompte « x / y lieux ». */
function VisitProgressDonut({ progress, mapLabel = '' }) {
  const text = formatVisitMapProgress(progress, mapLabel);
  return (
    <div className="visit-progress visit-progress--donut visit-progress--chrome-inline">
      <div
        className="visit-progress-donut"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.pct}
        aria-label={`Parcours : ${text.long} vus.`}
        title={`${text.long} vus`}
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
      <span className="visit-progress__count" aria-hidden="true" data-testid="visit-progress-count">
        {text.short}
      </span>
    </div>
  );
}

/**
 * Regroupe les guides par personnage : une variante féminine (`variantOfById`, migration 374)
 * n'a pas sa propre ligne, elle devient l'option « version féminine » de son pack de base.
 * @param {Array<{ id: string, label: string }>} options
 * @param {Map<string, string>|null|undefined} variantOfById variante → base
 * @returns {{ bases: Array<{ id: string, label: string }>, variantByBase: Map<string, string> }}
 */
export function groupVisitMascotVariants(options, variantOfById) {
  const list = Array.isArray(options) ? options : [];
  const ids = new Set(list.map((m) => m.id));
  const variantByBase = new Map();
  const isVariant = new Set();
  if (variantOfById && typeof variantOfById.forEach === 'function') {
    variantOfById.forEach((baseId, variantId) => {
      if (!ids.has(baseId) || !ids.has(variantId) || variantByBase.has(baseId)) return;
      variantByBase.set(baseId, variantId);
      isVariant.add(variantId);
    });
  }
  return { bases: list.filter((m) => !isVariant.has(m.id)), variantByBase };
}

/**
 * Sélecteur de guide discret : bouton + menu compact (remplace le grand `<select>`).
 * `data-testid="visit-mascot-picker"` reste sur le contrôle pour les e2e. Un personnage
 * décliné en deux packs (« Gnome néon » / « Gnome néon (femme) ») n'occupe qu'une ligne,
 * avec une case « Version féminine » (audit UI/UX du 19/11/2026, U4).
 */
function VisitMascotPickerPopover({
  visitMascotId,
  visitMascotOptions,
  visitMascotVariantOfById = null,
  onChangeVisitMascotId,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = visitMascotOptions.find((m) => m.id === visitMascotId);
  const triggerLabel = current?.label || 'Guide';
  const { bases, variantByBase } = groupVisitMascotVariants(
    visitMascotOptions,
    visitMascotVariantOfById,
  );
  const isFeminine = !!(visitMascotVariantOfById && visitMascotVariantOfById.has(visitMascotId));
  const currentBaseId = isFeminine ? visitMascotVariantOfById.get(visitMascotId) : visitMascotId;
  const currentVariantId = variantByBase.get(currentBaseId) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="visit-mascot-picker visit-mascot-picker--popover" ref={rootRef}>
      <button
        type="button"
        className="visit-mascot-picker__trigger"
        data-testid="visit-mascot-picker"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Choisir la mascotte affichée sur le plan (${triggerLabel})`}
        title="Mascotte affichée sur le plan"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>🐾</span>
        <span className="visit-display-group__label" aria-hidden="true">
          Guide
        </span>
      </button>
      {/* `div` plutôt que `ul` : un menu ARIA n'est pas une liste de contenu, et
          `role="menu"` sur une liste est refusé par jsx-a11y (le lecteur d'écran annonce
          « liste » là où il faut « menu »). */}
      {open ? (
        <div className="visit-mascot-picker__menu" role="menu" aria-label="Mascottes disponibles">
          {bases.map((m) => {
            const selected = m.id === currentBaseId;
            return (
              <div key={m.id} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`visit-mascot-picker__option${selected ? ' is-selected' : ''}`}
                  onClick={() => {
                    // La préférence « version féminine » suit d'un personnage à l'autre.
                    const variant = variantByBase.get(m.id);
                    onChangeVisitMascotId(isFeminine && variant ? variant : m.id);
                    setOpen(false);
                  }}
                >
                  {m.label}
                </button>
              </div>
            );
          })}
          {currentVariantId ? (
            <div role="none" className="visit-mascot-picker__variant">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={isFeminine}
                data-testid="visit-mascot-variant-toggle"
                className={`visit-mascot-picker__option visit-mascot-picker__option--variant${isFeminine ? ' is-selected' : ''}`}
                onClick={() => {
                  onChangeVisitMascotId(isFeminine ? currentBaseId : currentVariantId);
                }}
              >
                <span aria-hidden="true">{isFeminine ? '☑' : '☐'}</span> Version féminine
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bandeau « chrome » de la carte de visite. Présentation pure : tout l'état reste dans
 * `VisitView`.
 *
 * Organisé en **trois zones** au lieu d'une file unique de commandes hétérogènes
 * (cf. `docs/AUDIT_VISITE_UI_UX_2026-09.md` §5) :
 *  1. *identité et progression* — titre, donut, « Présentation du lieu », sélecteur de carte ;
 *  2. *affichage du plan* — plein écran, taille du texte, mascotte, réunis dans un groupe
 *     visuel unique (`.visit-display-group`) qui rime avec les commandes de zoom du plan ;
 *  3. *contexte et rôle* — état réseau, aperçu élève, aide, « Quitter la visite ».
 *
 * Sous le bandeau : **recherche de lieux** + **puces de catégorie** (convergence Plan).
 *
 * @param {boolean} refreshing rechargement en cours (la carte reste affichée : pastille discrète).
 * @param {string|null} networkStatusLabel libellé statut réseau (null = masqué, ex. hors mode vue).
 * @param {{ total: number, seenCount: number, pct: number }} cartographyProgress progression carte courante.
 * @param {boolean} [showSeenProgress=true] afficher le donut de progression.
 * @param {React.ReactNode} helpPanelSlot `HelpPanel` déjà configuré par le parent (null = aide désactivée).
 * @param {Function|null} onBackToAuth « Quitter la visite » (visiteur sans compte ; null = bouton masqué).
 * @param {string|null} quickTipText astuce contextuelle (null = masquée).
 * @param {string} [searchQuery] saisie de recherche de lieux.
 * @param {(next: string) => void} [onSearchQueryChange]
 * @param {Array<{ place: object, score?: number }>} [searchResults]
 * @param {(place: object) => void} [onSelectSearchResult]
 * @param {Array<object>} [categoryCatalog]
 * @param {Set<string>} [selectedCategoryIds]
 * @param {(id: string) => void} [onToggleCategory]
 * @param {() => void} [onResetCategories]
 * @param {Map<string, number>|null} [categoryCounts]
 */
export function VisitMapChrome({
  title,
  showPresentationButton = false,
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
  visitMascotVariantOfById = null,
  onChangeVisitMascotId,
  cartographyProgress = { total: 0, seenCount: 0, pct: 0 },
  showSeenProgress = true,
  /** Nom de la carte affichée (progression « x lieux sur y de la carte … »). */
  mapLabel = '',
  /** Tous les lieux de la carte vus : message de fin, et séance de la carte s'il en existe. */
  completionLink = null,
  helpPanelSlot = null,
  onBackToAuth = null,
  maps = [],
  mapId,
  onSelectMapId,
  quickTipPrefix = '',
  quickTipText = null,
  routesSlot = null,
  searchQuery = '',
  onSearchQueryChange = null,
  searchResults = [],
  onSelectSearchResult = null,
  categoryCatalog = [],
  selectedCategoryIds = null,
  onToggleCategory = null,
  onResetCategories = null,
  categoryCounts = null,
}) {
  const searchInputId = useId();
  const hasCategories =
    Array.isArray(categoryCatalog) &&
    categoryCatalog.length > 0 &&
    selectedCategoryIds &&
    typeof onToggleCategory === 'function' &&
    typeof onResetCategories === 'function';
  const showDiscover = typeof onSearchQueryChange === 'function' || hasCategories || !!routesSlot;
  const showSearchDropdown =
    typeof onSelectSearchResult === 'function' &&
    String(searchQuery || '').trim() &&
    Array.isArray(searchResults);

  return (
    <div className="visit-map-card__chrome">
      <div className="visit-map-card__chrome-top">
        {/* Zone 1 — identité et progression. Le donut est une **donnée**, pas une commande :
            sa place est auprès du titre, pas coincée entre un menu de préférence et l'aide. */}
        <div className="visit-map-card__chrome-title-line">
          <h2 className="section-title visit-map-card__title">{title}</h2>
          {showSeenProgress && cartographyProgress.total > 0 ? (
            <VisitProgressDonut progress={cartographyProgress} mapLabel={mapLabel} />
          ) : null}
          {showPresentationButton ? (
            <button
              type="button"
              className="btn btn-sm btn-primary visit-map-card__presentation-btn"
              data-testid="visit-presentation-link"
              onClick={onOpenPresentation}
            >
              Présentation du lieu
            </button>
          ) : null}
          {/* Le sélecteur de carte dit **quelle** carte on regarde : c'est du contexte,
              pas une commande. Il rejoint donc la zone 1 au lieu d'occuper une rangée
              entière sous le bandeau — 44px rendus à la carte dès qu'il reste de la
              place sur la ligne de titre (cf. audit §5.6). */}
          {maps.length > 1 ? (
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
                <span className="visit-display-group__label" aria-hidden="true">
                  Texte
                </span>
              </button>
            ) : null}
            {visitMascotOptions.length > 0 ? (
              <VisitMascotPickerPopover
                visitMascotId={visitMascotId}
                visitMascotOptions={visitMascotOptions}
                visitMascotVariantOfById={visitMascotVariantOfById}
                onChangeVisitMascotId={onChangeVisitMascotId}
              />
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
          {/* Visiteur sans compte : il n'est jamais « retourné » à une connexion qu'il n'a pas
              faite — il quitte la visite (audit UI/UX du 19/11/2026, U11). */}
          {onBackToAuth ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBackToAuth}>
              ↩ Quitter la visite
            </button>
          ) : null}
        </div>
      </div>

      {showDiscover ? (
        <div className="visit-map-card__chrome-discover" data-testid="visit-map-discover">
          {typeof onSearchQueryChange === 'function' ? (
            <div className="visit-search">
              <label className="fm-visually-hidden" htmlFor={searchInputId}>
                Rechercher un lieu
              </label>
              <span className="visit-search__icon" aria-hidden>
                🔍
              </span>
              <input
                id={searchInputId}
                type="search"
                className="visit-search__input"
                placeholder="Rechercher un lieu…"
                value={searchQuery}
                autoComplete="off"
                data-testid="visit-place-search"
                onChange={(event) => onSearchQueryChange(event.target.value)}
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="visit-search__clear"
                  aria-label="Effacer la recherche"
                  onClick={() => onSearchQueryChange('')}
                >
                  ✕
                </button>
              ) : null}
              {showSearchDropdown ? (
                <ul className="visit-search__results" aria-label="Résultats">
                  {searchResults.length === 0 ? (
                    <li className="visit-search__empty">Aucun lieu trouvé</li>
                  ) : (
                    searchResults.map(({ place }) => {
                      const name = String(place?.name || place?.label || 'Lieu').trim();
                      return (
                        <li key={`${place.kind}:${place.id}`}>
                          <button
                            type="button"
                            className="visit-search__result"
                            onClick={() => onSelectSearchResult(place)}
                          >
                            {name}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
          ) : null}
          {/*
            Parcours hors du bandeau scrollable des puces : comme `.plan-filters`, pour que
            la liste déroulante ne soit pas coupée (`overflow-x: auto` + `overflow-y: hidden`).
          */}
          {routesSlot || hasCategories ? (
            <div className="visit-map-card__chrome-filters">
              {routesSlot ? (
                <div className="visit-map-card__chrome-routes">{routesSlot}</div>
              ) : null}
              {hasCategories ? (
                <div className="visit-map-card__chrome-chips">
                  <MapCategoryChips
                    categories={categoryCatalog}
                    selectedIds={selectedCategoryIds}
                    onToggle={onToggleCategory}
                    onReset={onResetCategories}
                    counts={categoryCounts}
                    className="visit-chips"
                    chipClassName="visit-chip"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showSeenProgress &&
      cartographyProgress.total > 0 &&
      cartographyProgress.seenCount >= cartographyProgress.total ? (
        <p className="visit-complete" role="status" data-testid="visit-complete">
          <span aria-hidden="true">🎉</span>{' '}
          {mapLabel ? `Tu as fait le tour de « ${mapLabel} ».` : 'Tu as fait le tour de la carte.'}
          {completionLink ? (
            <>
              {' '}
              <a className="visit-complete__link" href={completionLink.href}>
                {completionLink.label}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
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
