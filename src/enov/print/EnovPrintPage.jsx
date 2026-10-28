import { useCallback, useEffect, useMemo, useState } from 'react';

import { AccessCodeGate } from '../../shared/components/AccessCodeGate.jsx';
import { getBrandOrgName } from '../../shared/brand/brandNames.js';
import { withAppBase } from '../../shared/appBase.js';
import { parsePctPolygonPoints } from '../../shared/pct-map/pctPolygon.js';
import { fetchPlanContent, reportPlanUsage, submitPlanAccessCode } from '../../plan/planApi.js';
import { placeDisplayParts, planPlacesFromContent } from '../../plan/utils/planPlaces.js';
import { PLAN_SCHOOL_LOGO_URL } from '../../plan/utils/planBrand.js';
import { ENOV_PLAN_VARIANT } from '../../plan/utils/planVariants.js';
import {
  buildAnnotatedPlan,
  formatPrintDate,
  placeAnchorPct,
  readPrintMapIds,
  UNTYPED_SPACE_ID,
} from './enovPrintModel.js';

/** Titre imprimé en tête de chaque feuille. */
const SHEET_TITLE = 'Plan annoté des espaces innovants';

/** Longueur du texte court selon le niveau de détail choisi. */
const SUMMARY_LENGTHS = Object.freeze({ short: 120, full: 260 });

/**
 * Polygone SVG (`viewBox` 0–100) d'une zone, ou `''` si elle n'a pas de sommets exploitables.
 * @param {object} place
 */
function zonePolygonPoints(place) {
  if (place?.kind !== 'zone') return '';
  const points = parsePctPolygonPoints(place.points);
  if (points.length < 3) return '';
  return points.map((p) => `${p.xp},${p.yp}`).join(' ');
}

/** QR code SVG (chargé à la demande : la bibliothèque n'a rien à faire dans le plan lui-même). */
function usePlanQrSvg(url, enabled) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!enabled || !url) {
      setSvg('');
      return undefined;
    }
    let cancelled = false;
    // `qrcode` (MIT, https://github.com/soldair/node-qrcode) : déjà utilisé côté serveur pour
    // les affiches de parcours.
    import('qrcode')
      .then((mod) => (mod.default || mod).toString(url, { type: 'svg', margin: 0, width: 96 }))
      .then((markup) => {
        if (!cancelled) setSvg(String(markup || ''));
      })
      .catch(() => {
        if (!cancelled) setSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);
  return svg;
}

/**
 * Une feuille A4 : en-tête, carte annotée, légende par type d'espace, pied de page.
 */
function AnnotatedSheet({ content, options, orgName, dateLabel, planUrl }) {
  const map = content?.map || {};
  const highlightColor = String(content?.settings?.enov?.highlight_color || '');
  const places = useMemo(() => planPlacesFromContent(content), [content]);
  const plan = useMemo(
    () =>
      buildAnnotatedPlan(places, {
        summaryLength: SUMMARY_LENGTHS[options.detail] || SUMMARY_LENGTHS.short,
      }),
    [places, options.detail],
  );
  const mapUrl = `${planUrl}?map_id=${encodeURIComponent(String(map.id || ''))}`;
  const qrSvg = usePlanQrSvg(mapUrl, options.qr && Boolean(planUrl));
  const attribution = String(content?.settings?.attribution || '').trim();
  const sheetStyle = highlightColor ? { '--pct-highlight-color': highlightColor } : undefined;
  const withText = options.detail !== 'names';

  return (
    <section
      className="enov-print-sheet"
      style={sheetStyle}
      data-testid="enov-print-sheet"
      aria-label={`${SHEET_TITLE} — ${map.label || ''}`}
    >
      <header className="enov-print-sheet__header">
        <img
          className="enov-print-sheet__label-logo"
          src={withAppBase(ENOV_PLAN_VARIANT.labelLogo.url)}
          alt={ENOV_PLAN_VARIANT.labelLogo.alt}
        />
        <div className="enov-print-sheet__titles">
          <p className="enov-print-sheet__kicker">{orgName || 'Établissement'}</p>
          <h2 className="enov-print-sheet__title">
            {SHEET_TITLE} — {map.label || 'Plan'}
          </h2>
          <p className="enov-print-sheet__subtitle">
            {plan.entries.length} espace{plan.entries.length > 1 ? 's' : ''} innovant
            {plan.entries.length > 1 ? 's' : ''}
            {plan.typeCount > 0
              ? `, ${plan.typeCount} type${plan.typeCount > 1 ? 's' : ''} d’espace`
              : ''}
          </p>
        </div>
        <img className="enov-print-sheet__school-logo" src={PLAN_SCHOOL_LOGO_URL} alt="" />
      </header>

      <div className="enov-print-sheet__body">
        <figure className="enov-print-map">
          {map.map_image_url ? (
            <div className="enov-print-map__frame">
              <img
                className="enov-print-map__image"
                src={map.map_image_url}
                alt={`Fond de plan — ${map.label || ''}`}
              />
              <svg
                className="enov-print-map__overlay"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {options.others
                  ? plan.others.map((place) => {
                      const points = zonePolygonPoints(place);
                      return points ? (
                        <polygon
                          key={`o-${place.kind}-${place.id}`}
                          className="enov-print-map__zone"
                          points={points}
                        />
                      ) : null;
                    })
                  : null}
                {plan.entries.map((entry) => {
                  const points = zonePolygonPoints(entry.place);
                  return points ? (
                    <polygon
                      key={`h-${entry.place.kind}-${entry.place.id}`}
                      className="enov-print-map__zone enov-print-map__zone--innovation"
                      points={points}
                    />
                  ) : null;
                })}
              </svg>
              {options.others
                ? plan.others
                    .filter((place) => place.kind === 'zone')
                    .map((place) => {
                      const anchor = placeAnchorPct(place);
                      const { name } = placeDisplayParts(place);
                      return anchor && name ? (
                        <span
                          key={`ol-${place.id}`}
                          className="enov-print-map__other-label"
                          style={{ left: `${anchor.xp}%`, top: `${anchor.yp}%` }}
                        >
                          {name}
                        </span>
                      ) : null;
                    })
                : null}
              {plan.entries.map((entry) =>
                entry.anchor ? (
                  <span
                    key={`n-${entry.place.kind}-${entry.place.id}`}
                    className="enov-print-map__pin"
                    style={{ left: `${entry.anchor.xp}%`, top: `${entry.anchor.yp}%` }}
                  >
                    {entry.number}
                  </span>
                ) : null,
              )}
            </div>
          ) : (
            <p className="enov-print-map__missing">Aucun fond de plan publié pour cette carte.</p>
          )}
        </figure>

        <aside className="enov-print-legend" aria-label="Légende du plan">
          {plan.groups.length === 0 ? (
            <p className="enov-print-legend__empty">
              Aucun lieu mis en avant sur cette carte. Cochez la catégorie « e-nov » sur les lieux
              concernés dans ForetMap.
            </p>
          ) : null}
          {plan.groups.map((group) => (
            <div
              key={group.typeId || 'untyped'}
              className={`enov-print-legend__group${
                group.typeId === UNTYPED_SPACE_ID ? ' is-untyped' : ''
              }`}
            >
              <h3 className="enov-print-legend__type">{group.label}</h3>
              <ol className="enov-print-legend__list">
                {group.entries.map((entry) => (
                  <li key={`${entry.place.kind}-${entry.place.id}`} className="enov-print-entry">
                    <span className="enov-print-entry__number" aria-hidden>
                      {entry.number}
                    </span>
                    <div className="enov-print-entry__body">
                      <p className="enov-print-entry__name">
                        <span className="fm-visually-hidden">{entry.number}. </span>
                        {entry.name}
                        {!entry.anchor ? (
                          <span className="enov-print-entry__off"> (hors carte)</span>
                        ) : null}
                      </p>
                      {withText && entry.summary ? (
                        <p className="enov-print-entry__text">{entry.summary}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </aside>
      </div>

      <footer className="enov-print-sheet__footer">
        <p className="enov-print-sheet__footnote">
          Label e-nov (AEFE) — domaine 1, organisation des espaces d’apprentissage. Lieux numérotés
          dans l’ordre de la légende ; contour coloré : espace aménagé. État au {dateLabel}.
          {attribution ? ` ${attribution}` : ''}
        </p>
        {qrSvg ? (
          <div className="enov-print-sheet__qr">
            {/* SVG produit localement par `qrcode` à partir d'une adresse du plan : aucun
                contenu tiers. */}
            <span
              className="enov-print-sheet__qr-code"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <span className="enov-print-sheet__qr-caption">
              Plan interactif
              <br />
              {mapUrl.replace(/^https?:\/\//, '')}
            </span>
          </div>
        ) : null}
      </footer>
    </section>
  );
}

/**
 * Page d'impression du plan e-nov (`/impression`) : une feuille A4 par carte publiée — par
 * exemple le lycée et le complexe sportif —, à joindre au dossier de labellisation.
 *
 * Elle lit la même charge que le plan (`/api/enov/content`), derrière la même porte : un plan
 * fermé par un code demande le code ici aussi. Rien n'est enregistré ; les options d'affichage
 * vivent dans la page le temps de l'impression.
 */
export function EnovPrintPage() {
  const variant = ENOV_PLAN_VARIANT;
  const requestedIds = useMemo(
    () => (typeof window === 'undefined' ? [] : readPrintMapIds(window.location.search)),
    [],
  );
  const [state, setState] = useState({ status: 'loading', sheets: [], maps: [], error: '' });
  const [selectedIds, setSelectedIds] = useState(null);
  const [options, setOptions] = useState({
    orientation: 'landscape',
    detail: 'short',
    others: true,
    qr: true,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((prev) => ({ ...prev, status: 'loading', error: '' }));
      try {
        const first = await fetchPlanContent(requestedIds[0] || '', variant);
        const maps = (first?.maps || []).length
          ? first.maps
          : [{ id: String(first?.map?.id || ''), label: String(first?.map?.label || '') }];
        const wanted = requestedIds.length ? requestedIds : maps.map((m) => String(m.id));
        const firstId = String(first?.map?.id || '');
        const sheets = [];
        for (const id of wanted) {
          if (id === firstId) {
            sheets.push(first);
            continue;
          }
          try {
            sheets.push(await fetchPlanContent(id, variant));
          } catch (err) {
            if (err?.status === 401) throw err;
            // Carte non publiée sur ce plan : on l'écarte sans bloquer les autres.
          }
        }
        if (!cancelled) setState({ status: 'ready', sheets, maps, error: '' });
        reportPlanUsage('print_open', wanted.join(','), variant);
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          setState({ status: 'access', sheets: [], maps: [], error: '' });
        } else {
          setState({
            status: 'error',
            sheets: [],
            maps: [],
            error: err?.message || 'Le plan n’a pas pu être chargé.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedIds, variant, reloadKey]);

  /** Orientation de la page imprimée : `@page` ne se règle pas par classe, on l'injecte. */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const style = document.createElement('style');
    style.setAttribute('data-enov-print-page', '');
    style.textContent = `@page { size: A4 ${options.orientation}; margin: 9mm; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [options.orientation]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.title;
    document.title = `${SHEET_TITLE} — e-nov`;
    return () => {
      document.title = previous;
    };
  }, []);

  const submitAccessCode = useCallback(
    async (code) => {
      await submitPlanAccessCode(code, variant);
      setReloadKey((key) => key + 1);
    },
    [variant],
  );

  const orgName = getBrandOrgName();
  const dateLabel = useMemo(() => formatPrintDate(new Date()), []);
  const planUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}${withAppBase('/')}`;
  const visibleSheets = state.sheets.filter(
    (sheet) => !selectedIds || selectedIds.has(String(sheet?.map?.id || '')),
  );
  const setOption = (key, value) => setOptions((prev) => ({ ...prev, [key]: value }));
  const toggleMap = (id) =>
    setSelectedIds((prev) => {
      const base = prev || new Set(state.sheets.map((sheet) => String(sheet?.map?.id || '')));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (state.status === 'access') {
    return (
      <div className="plan-shell plan-shell--state">
        <AccessCodeGate
          className="plan-access-gate"
          title={SHEET_TITLE}
          intro={variant.accessIntro}
          onSubmit={submitAccessCode}
        />
      </div>
    );
  }

  return (
    <div className={`enov-print is-${options.orientation}`} data-testid="enov-print-page">
      <div className="enov-print-toolbar" role="region" aria-label="Options d’impression">
        <div className="enov-print-toolbar__head">
          <h1 className="enov-print-toolbar__title">{SHEET_TITLE}</h1>
          <a className="enov-print-toolbar__back" href={withAppBase('/')}>
            Retour au plan
          </a>
        </div>
        {state.status === 'loading' ? <p role="status">Chargement des plans…</p> : null}
        {state.status === 'error' ? (
          <p role="alert">
            {state.error}{' '}
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              Réessayer
            </button>
          </p>
        ) : null}
        {state.status === 'ready' ? (
          <>
            <fieldset className="enov-print-toolbar__group">
              <legend>Plans à imprimer</legend>
              {state.sheets.map((sheet) => {
                const id = String(sheet?.map?.id || '');
                return (
                  <label key={id} className="enov-print-toolbar__check">
                    <input
                      type="checkbox"
                      checked={!selectedIds || selectedIds.has(id)}
                      onChange={() => toggleMap(id)}
                    />
                    {sheet?.map?.label || id}
                  </label>
                );
              })}
            </fieldset>
            <fieldset className="enov-print-toolbar__group">
              <legend>Mise en page</legend>
              <label className="enov-print-toolbar__field">
                Orientation
                <select
                  value={options.orientation}
                  onChange={(e) => setOption('orientation', e.target.value)}
                >
                  <option value="landscape">A4 paysage</option>
                  <option value="portrait">A4 portrait</option>
                </select>
              </label>
              <label className="enov-print-toolbar__field">
                Légende
                <select
                  value={options.detail}
                  onChange={(e) => setOption('detail', e.target.value)}
                >
                  <option value="short">Noms et texte court</option>
                  <option value="full">Noms et texte développé</option>
                  <option value="names">Noms seuls</option>
                </select>
              </label>
              <label className="enov-print-toolbar__check">
                <input
                  type="checkbox"
                  checked={options.others}
                  onChange={(e) => setOption('others', e.target.checked)}
                />
                Contours et noms des autres lieux (repérage)
              </label>
              <label className="enov-print-toolbar__check">
                <input
                  type="checkbox"
                  checked={options.qr}
                  onChange={(e) => setOption('qr', e.target.checked)}
                />
                QR code vers le plan interactif
              </label>
            </fieldset>
            <p className="enov-print-toolbar__hint">
              Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF », sans en-têtes
              ni pieds de page du navigateur, arrière-plans graphiques activés.
            </p>
            <button
              type="button"
              className="shared-btn shared-btn--primary enov-print-toolbar__print"
              disabled={visibleSheets.length === 0}
              data-testid="enov-print-button"
              onClick={() => {
                reportPlanUsage('print', String(visibleSheets.length), variant);
                window.print();
              }}
            >
              Imprimer / PDF ({visibleSheets.length} plan{visibleSheets.length > 1 ? 's' : ''})
            </button>
          </>
        ) : null}
      </div>

      <div className="enov-print-sheets">
        {visibleSheets.map((sheet) => (
          <AnnotatedSheet
            key={String(sheet?.map?.id || '')}
            content={sheet}
            options={options}
            orgName={orgName}
            dateLabel={dateLabel}
            planUrl={planUrl}
          />
        ))}
      </div>
    </div>
  );
}
