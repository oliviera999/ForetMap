import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext.jsx';
import { FoodWebGraph } from './FoodWebGraph.jsx';
import { itemsForPreset } from './foodWebGraphModel.js';
import { useGlossaryLinkIndex } from '../../hooks/useGlossaryLinkIndex.js';
import { IconAdd, IconFoodweb } from '../../shared/icons.jsx';
import { useBiodivPedago } from '../../contexts/BiodivPedagoContext.jsx';
import { usePedagoSessionContext } from '../../contexts/PedagoSessionContext.jsx';
import { useFoodWebProfile } from '../../hooks/useFoodWebProfile.js';
import { useFoodWebData } from '../../hooks/useFoodWebData.js';
import { useFoodWebAdmin } from '../../hooks/useFoodWebAdmin.js';
import { useFoodWebEdgeSelection } from '../../hooks/useFoodWebEdgeSelection.js';
import { useFoodWebStartSpecies } from '../../hooks/useFoodWebStartSpecies.js';
import {
  filterItemsForProfile,
  initialFocusDepth,
  itemsAroundSeeds,
  normalizeSeedIds,
  seedLinkStatus,
} from './foodWebProfileModel.js';
import { groupRowsByType, speciesOptionsFromPlants } from './foodWebRows.js';
import { FoodWebAdminForm } from './FoodWebAdminForm.jsx';
import { FoodWebEdgeDetail } from './FoodWebEdgeDetail.jsx';
import { FoodWebListGroups } from './FoodWebListGroups.jsx';
import { FoodWebFilters } from './FoodWebFilters.jsx';
import { FoodWebStartBar, FoodWebStartPicker } from './FoodWebStartPicker.jsx';
import './foodWebView.css';

/** Nom d'une espèce lu dans les lignes du réseau, à défaut dans le catalogue. */
function speciesNameFrom(items, plants, id) {
  for (const row of items || []) {
    if (Number(row.from_id) === id && row.from_name) return row.from_name;
    if (Number(row.to_id) === id && row.to_name) return row.to_name;
  }
  const plant = (plants || []).find((p) => Number(p.id) === id);
  return plant?.name || '';
}

/**
 * Message pour les espèces demandées (fiche, séance) sans lien montré. Point 5 du flux C3 :
 * une espèce dont les relations existent mais ne sont pas montrées à ce profil (types hors
 * palier, espèces hors carte, cadrage) est **annoncée**, jamais présentée en graphe vide.
 */
function SeedNotice({ statuses }) {
  if (statuses.length === 0) return null;
  const hidden = statuses.filter((s) => s.status === 'hidden');
  const absent = statuses.filter((s) => s.status === 'absent');
  const names = (list) => list.map((s) => (s.name ? `« ${s.name} »` : 'cette espèce')).join(', ');
  return (
    <p className="pedago-foodweb__highlight-notice" role="status">
      {absent.length > 0 && hidden.length === 0 && statuses.length === 1 ? (
        <>
          L&apos;espèce d&apos;où tu viens n&apos;a encore aucune interaction enregistrée dans cette
          sélection — élargis la carte ou la zone, ou demande à un professeur d&apos;ajouter ses
          relations.
        </>
      ) : (
        <>
          {hidden.length > 0 ? (
            <>
              {names(hidden)} : des relations existent, mais aucune n&apos;est montrée ici (à ton
              niveau, sur cette carte ou dans ce cadrage).{' '}
            </>
          ) : null}
          {absent.length > 0 ? (
            <>{names(absent)} : aucune relation enregistrée dans cette sélection. </>
          ) : null}
          Choisis une autre espèce ou un autre cadrage.
        </>
      )}
    </p>
  );
}

export function FoodWebView({
  maps = [],
  /** Carte active de l'app : le graphe s'ouvre sur son réseau (pas « toutes les cartes »). */
  initialMapId = null,
  onOpenPlant,
  onOpenGlossaryTerm,
  highlightPlantId = null,
  canManage = false,
}) {
  const { canShow } = useBiodivPedago();
  const showAdvancedFoodWeb = canShow('foodweb_advanced');
  const showPollinationEfficacy = canShow('pollination_efficacy');
  const profile = useFoodWebProfile();
  const { collegeMode, typeLabel } = profile;
  const allowedInteractionTypes = profile.allowedTypes || [];

  // Séance : étape `open_foodweb` avec `plantIds` (les espèces montrées, liens mutuels).
  const sessionCtx = usePedagoSessionContext();
  const focusRequest = sessionCtx?.foodWebRequest || null;

  const { items, loading, error, mapId, setMapId, zoneId, setZoneId, filterZones, reload } =
    useFoodWebData({
      initialMapId: focusRequest?.mapId || initialMapId,
      requestKey: `${highlightPlantId ?? ''}|${focusRequest?.nonce ?? ''}`,
    });

  const [interactionFilter, setInteractionFilter] = useState('');
  const [graphPreset, setGraphPreset] = useState('alimentaire');
  const [viewMode, setViewMode] = useState('graph');
  const { plants = [] } = useData();
  const glossaryIndex = useGlossaryLinkIndex();

  // 1. Profil (types du palier, espèces hors carte), 2. cadrage, 3. type choisi.
  const shownItems = useMemo(() => filterItemsForProfile(items, profile), [items, profile]);
  const presetItems = useMemo(
    () => itemsForPreset(shownItems, graphPreset),
    [shownItems, graphPreset],
  );
  const interactionTypes = useMemo(() => {
    const set = new Set(presetItems.map((row) => String(row.interaction_type || 'autre')));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [presetItems]);
  const filteredItems = useMemo(() => {
    if (!interactionFilter || graphPreset !== 'all') return presetItems;
    return presetItems.filter((row) => String(row.interaction_type || '') === interactionFilter);
  }, [presetItems, interactionFilter, graphPreset]);

  // Changement de carte/zone/preset : un type d'interaction absent du nouveau jeu
  // laissait le menu vide et la vue annonçait « aucune interaction » à tort.
  useEffect(() => {
    if (loading || !interactionFilter) return;
    if (graphPreset !== 'all' || !interactionTypes.includes(interactionFilter)) {
      setInteractionFilter('');
    }
  }, [loading, interactionFilter, interactionTypes, graphPreset]);

  const changeGraphPreset = useCallback((key) => {
    setGraphPreset(key);
    if (key !== 'all') setInteractionFilter('');
  }, []);

  // --- Espèces demandées (fiche « Voir le réseau », séance) et espèces de départ (collège).
  const requestedSeeds = useMemo(() => {
    const fromSession = normalizeSeedIds(focusRequest?.plantIds);
    return fromSession.length ? fromSession : normalizeSeedIds(highlightPlantId);
  }, [focusRequest, highlightPlantId]);

  const [seeds, setSeeds] = useState(requestedSeeds);
  const [depth, setDepth] = useState(() => initialFocusDepth(requestedSeeds.length));
  useEffect(() => {
    setSeeds(requestedSeeds);
    setDepth(initialFocusDepth(requestedSeeds.length));
  }, [requestedSeeds, focusRequest?.nonce]);

  /** Espèces de départ effectivement montrées : celles qui ont un lien dans la vue. */
  const activeSeeds = useMemo(
    () => seeds.filter((id) => seedLinkStatus(items, filteredItems, id) === 'visible'),
    [seeds, items, filteredItems],
  );

  const seedStatuses = useMemo(() => {
    if (loading || error) return [];
    return requestedSeeds
      .filter((id) => seeds.includes(id))
      .map((id) => ({
        id,
        status: seedLinkStatus(items, filteredItems, id),
        name: speciesNameFrom(items, plants, id),
      }))
      .filter((s) => s.status !== 'visible');
  }, [loading, error, requestedSeeds, seeds, items, filteredItems, plants]);

  const pickSeed = useCallback((id) => {
    setSeeds([id]);
    setDepth(initialFocusDepth(1));
  }, []);
  const resetSeeds = useCallback(() => setSeeds([]), []);
  const changeMap = useCallback(
    (next) => {
      setMapId(next);
      if (collegeMode) setSeeds([]);
    },
    [setMapId, collegeMode],
  );

  const start = useFoodWebStartSpecies({
    enabled: collegeMode,
    mapId,
    shownItems: filteredItems,
  });

  /** Lignes montrées par la liste et le graphe : bornées autour du départ au collège. */
  const viewItems = useMemo(() => {
    if (!collegeMode) return filteredItems;
    return activeSeeds.length ? itemsAroundSeeds(filteredItems, activeSeeds, depth) : [];
  }, [collegeMode, filteredItems, activeSeeds, depth]);

  /** Hors collège, une séance qui montre plusieurs espèces isole leur sous-réseau. */
  const graphFocusRequest = useMemo(() => {
    if (collegeMode || requestedSeeds.length === 0 || !focusRequest) return null;
    return {
      ids: requestedSeeds,
      depth: initialFocusDepth(requestedSeeds.length),
      nonce: focusRequest.nonce,
    };
  }, [collegeMode, requestedSeeds, focusRequest]);

  const selection = useFoodWebEdgeSelection({ shownItems: viewItems, loading });
  const { selectedEdgeId, selectedRow, selectEdge, forgetEdge } = selection;
  const admin = useFoodWebAdmin({ reload, onDeleted: forgetEdge });

  // Liste déroulante des espèces : lue dans `DataContext`, qui porte déjà `plants` —
  // la même liste, chargée une fois par le cycle de synchronisation et tenue à jour par lui
  // (cf. docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, T2).
  const speciesOptions = useMemo(
    () => (canManage ? speciesOptionsFromPlants(plants) : []),
    [canManage, plants],
  );

  const grouped = useMemo(() => groupRowsByType(viewItems), [viewItems]);
  const highlightIds = collegeMode ? activeSeeds : normalizeSeedIds(highlightPlantId);

  const ready = !loading && !error;
  const pickerLayout = ready && collegeMode && activeSeeds.length === 0;
  const graphLayout = ready && !pickerLayout && viewMode === 'graph' && viewItems.length > 0;
  const listLayout = ready && (pickerLayout || (viewMode === 'list' && viewItems.length > 0));
  const compactControls = graphLayout || listLayout;

  const adminFormProps = {
    form: admin.form,
    setForm: admin.setForm,
    speciesOptions,
    allowedTypes: allowedInteractionTypes,
    showAdvanced: showAdvancedFoodWeb,
    showPollinationEfficacy,
    adminError: admin.adminError,
    saving: admin.saving,
    onSubmit: admin.createInteraction,
  };

  const selectedEdgePanel = selectedEdgeId ? (
    <FoodWebEdgeDetail
      selectedRow={selectedRow}
      typeLabel={typeLabel}
      showAdvanced={showAdvancedFoodWeb}
      showPollinationEfficacy={showPollinationEfficacy}
      glossaryIndex={glossaryIndex}
      onOpenGlossaryTerm={onOpenGlossaryTerm}
      edgeGlossary={selection.edgeGlossary}
      edgeLoading={selection.edgeLoading}
      canManage={canManage}
      admin={admin}
      speciesOptions={speciesOptions}
    />
  ) : null;

  const seedNotice = <SeedNotice statuses={seedStatuses} />;
  const startBar =
    collegeMode && activeSeeds.length > 0 ? (
      <FoodWebStartBar
        seeds={activeSeeds}
        depth={depth}
        depths={profile.focusDepths}
        onDepthChange={setDepth}
        onReset={resetSeeds}
        nameOf={(id) => speciesNameFrom(items, plants, id)}
      />
    ) : null;

  return (
    <div
      className={`pedago-view pedago-foodweb${graphLayout ? ' pedago-foodweb--graph-layout' : ''}${listLayout ? ' pedago-foodweb--list-layout' : ''}`}
    >
      <header className="pedago-view__head pedago-foodweb__head">
        <h2 className="section-title">
          <IconFoodweb size={20} /> Réseau trophique
        </h2>
        {collegeMode ? (
          <p className="section-sub pedago-foodweb__intro">
            Qui mange qui, qui aide qui — pars d&apos;une espèce : tu vois ce qu&apos;elle mange,
            qui la mange et qui l&apos;aide. Clique une flèche pour le détail, puis élargis à la
            chaîne.
          </p>
        ) : (
          <p className="section-sub pedago-foodweb__intro">
            Qui mange qui, qui aide qui — choisis un cadrage (réseau alimentaire ou autres
            relations), clique une flèche pour le détail, une espèce pour isoler sa chaîne : la
            scène se recompose autour d&apos;elle. ⌘/Ctrl + clic (ou «&nbsp;Ajouter à la
            sélection&nbsp;») en retient plusieurs à la fois. En disposition «&nbsp;Niveaux&nbsp;»,
            les producteurs sont en bas et les consommateurs au-dessus, à leur niveau calculé dans
            ce réseau.
          </p>
        )}
      </header>

      {pickerLayout ? null : seedNotice}

      <div
        className={`pedago-foodweb__layout${graphLayout ? ' pedago-foodweb__layout--graph' : ''}${listLayout ? ' pedago-foodweb__layout--list' : ''}`}
      >
        <div
          className={`pedago-foodweb__aside${listLayout ? ' pedago-foodweb__aside--controls' : ''}`}
        >
          {canManage ? (
            compactControls ? (
              <details className="card pedago-foodweb__admin-details">
                <summary className="pedago-foodweb__admin-summary">
                  <IconAdd size={14} /> Ajouter une interaction
                </summary>
                <FoodWebAdminForm showTitle={false} {...adminFormProps} />
              </details>
            ) : (
              <FoodWebAdminForm showTitle {...adminFormProps} />
            )
          ) : null}

          <FoodWebFilters
            graphPreset={graphPreset}
            onPresetChange={changeGraphPreset}
            maps={maps}
            mapId={mapId}
            onMapChange={changeMap}
            zones={filterZones}
            zoneId={zoneId}
            onZoneChange={setZoneId}
            interactionFilter={interactionFilter}
            onInteractionFilterChange={setInteractionFilter}
            interactionTypes={interactionTypes}
            typeLabel={typeLabel}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />

          {loading ? <p className="section-sub card pedago-foodweb__empty">Chargement…</p> : null}
          {error ? <p className="pedago-error">{error}</p> : null}

          {ready && !pickerLayout && viewItems.length === 0 ? (
            <p className="section-sub card pedago-foodweb__empty">
              Aucune interaction enregistrée.
            </p>
          ) : null}

          {graphLayout ? null : selectedEdgePanel}
        </div>

        {listLayout ? (
          <div className="pedago-foodweb__list-stage">
            {pickerLayout ? (
              <FoodWebStartPicker start={start} onPick={pickSeed} notice={seedNotice} />
            ) : (
              <>
                {startBar}
                <FoodWebListGroups
                  grouped={grouped}
                  typeLabel={typeLabel}
                  selectedEdgeId={selectedEdgeId}
                  onSelectEdge={selectEdge}
                  highlightIds={highlightIds}
                  onOpenPlant={onOpenPlant}
                  canManage={canManage}
                  onDelete={admin.deleteInteraction}
                  glossaryIndex={glossaryIndex}
                  onOpenGlossaryTerm={onOpenGlossaryTerm}
                />
              </>
            )}
          </div>
        ) : null}

        {graphLayout ? (
          <div className="pedago-foodweb__graph-column">
            {startBar}
            <div className="card pedago-foodweb__stage pedago-foodweb__graph-wrap">
              <FoodWebGraph
                items={viewItems}
                selectedEdgeId={selectedEdgeId}
                highlightPlantId={collegeMode ? null : highlightPlantId}
                highlightPlantIds={collegeMode ? activeSeeds : null}
                focusRequest={graphFocusRequest}
                onSelectEdge={selectEdge}
                onOpenPlant={onOpenPlant}
                legendCompact
                preset={graphPreset}
                onPresetChange={changeGraphPreset}
                typeLabel={typeLabel}
              />
            </div>
            {selectedEdgePanel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
