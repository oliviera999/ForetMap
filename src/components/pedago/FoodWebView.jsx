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
import { useFoodWebSelection } from '../../hooks/useFoodWebSelection.js';
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
import {
  FoodWebSelectionBar,
  FoodWebSelectionNotice,
  FoodWebSelectionPicker,
} from './FoodWebSelectionPicker.jsx';
import './foodWebView.css';

/** Nom et emoji d'une espèce lus dans les lignes du réseau, à défaut dans le catalogue. */
function speciesFrom(items, plants, id) {
  for (const row of items || []) {
    if (Number(row.from_id) === id && row.from_name) {
      return { name: row.from_name, emoji: row.from_emoji || '' };
    }
    if (Number(row.to_id) === id && row.to_name)
      return { name: row.to_name, emoji: row.to_emoji || '' };
  }
  const plant = (plants || []).find((p) => Number(p.id) === id);
  return { name: plant?.name || '', emoji: plant?.emoji || '' };
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
  const showUsageLabel = canShow('usage_label');
  const showAdvancedFoodWeb = canShow('foodweb_advanced');
  const showPollinationEfficacy = canShow('pollination_efficacy');
  const profile = useFoodWebProfile();
  const { collegeMode, typeLabel } = profile;
  const allowedInteractionTypes = profile.allowedTypes || [];

  // Séance : étape `open_foodweb` avec `plantIds` (les espèces montrées, liens mutuels).
  const sessionCtx = usePedagoSessionContext();
  const focusRequest = sessionCtx?.foodWebRequest || null;

  const requestKey = `${highlightPlantId ?? ''}|${focusRequest?.nonce ?? ''}`;
  const { items, loading, error, mapId, setMapId, zoneId, setZoneId, filterZones, reload } =
    useFoodWebData({ initialMapId: focusRequest?.mapId || initialMapId, requestKey });

  const [interactionFilter, setInteractionFilter] = useState('');
  const [graphPreset, setGraphPreset] = useState('alimentaire');
  const [viewMode, setViewMode] = useState('graph');
  const { plants = [] } = useData();
  const glossaryIndex = useGlossaryLinkIndex();

  // 1. Profil (types du palier ; hors carte gardé, grisé), 2. cadrage, 3. type choisi.
  const profileItems = useMemo(() => filterItemsForProfile(items, profile), [items, profile]);
  const presetItems = useMemo(
    () => itemsForPreset(profileItems, graphPreset),
    [profileItems, graphPreset],
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

  // --- Espèces demandées (fiche « Voir le réseau », séance) et sélection (collège).
  const requestedSeeds = useMemo(() => {
    const fromSession = normalizeSeedIds(focusRequest?.plantIds);
    return fromSession.length ? fromSession : normalizeSeedIds(highlightPlantId);
  }, [focusRequest, highlightPlantId]);

  const sel = useFoodWebSelection({
    enabled: collegeMode,
    mapId,
    requested: requestedSeeds,
    requestKey,
    profileItems,
    plants,
  });
  const { selection } = sel;

  /** Lignes montrées par la liste et le graphe : bornées autour de la sélection au collège. */
  const viewItems = useMemo(() => {
    if (!collegeMode) return filteredItems;
    return selection.length ? itemsAroundSeeds(filteredItems, selection, sel.depth) : [];
  }, [collegeMode, filteredItems, selection, sel.depth]);

  /** Espèces demandées (lycée) ou choisies (collège) sans lien montré : on le dit. */
  const seedStatuses = useMemo(() => {
    if (loading || error) return [];
    return (collegeMode ? selection : requestedSeeds)
      .map((id) => ({
        id,
        status: seedLinkStatus(items, filteredItems, id),
        name: speciesFrom(items, plants, id).name,
      }))
      .filter((s) => s.status !== 'visible');
  }, [loading, error, collegeMode, selection, requestedSeeds, items, filteredItems, plants]);

  const speciesOf = useCallback((id) => speciesFrom(items, plants, id), [items, plants]);
  const usageLabelOf = useCallback(
    (id) => {
      if (!showUsageLabel) return '';
      const plant = plants.find((p) => Number(p.id) === Number(id));
      return plant?.usage_label ? String(plant.usage_label) : '';
    },
    [plants, showUsageLabel],
  );

  /** Hors collège, une séance qui montre plusieurs espèces isole leur sous-réseau. */
  const graphFocusRequest = useMemo(() => {
    if (collegeMode || requestedSeeds.length === 0 || !focusRequest) return null;
    return {
      ids: requestedSeeds,
      depth: initialFocusDepth(requestedSeeds.length),
      nonce: focusRequest.nonce,
    };
  }, [collegeMode, requestedSeeds, focusRequest]);

  const edgeSelection = useFoodWebEdgeSelection({ shownItems: viewItems, loading });
  const { selectedEdgeId, selectedRow, selectEdge, forgetEdge } = edgeSelection;
  const admin = useFoodWebAdmin({ reload, onDeleted: forgetEdge });

  // Liste déroulante des espèces : lue dans `DataContext`, qui porte déjà `plants` —
  // la même liste, chargée une fois par le cycle de synchronisation et tenue à jour par lui
  // (cf. docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, T2).
  const speciesOptions = useMemo(
    () => (canManage ? speciesOptionsFromPlants(plants) : []),
    [canManage, plants],
  );

  const grouped = useMemo(() => groupRowsByType(viewItems), [viewItems]);
  const highlightIds = collegeMode ? selection : normalizeSeedIds(highlightPlantId);

  const ready = !loading && !error;
  const pickerLayout = ready && collegeMode && selection.length === 0;
  const graphLayout = ready && !pickerLayout && viewMode === 'graph' && viewItems.length > 0;
  // Collège avec une sélection sans lien montré : la barre reste, pour retirer ou ajouter.
  const emptySelection = ready && collegeMode && !pickerLayout && viewItems.length === 0;
  const listLayout =
    ready && (pickerLayout || emptySelection || (viewMode === 'list' && viewItems.length > 0));
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
      edgeGlossary={edgeSelection.edgeGlossary}
      edgeLoading={edgeSelection.edgeLoading}
      canManage={canManage}
      admin={admin}
      speciesOptions={speciesOptions}
    />
  ) : null;

  const seedNotice = <FoodWebSelectionNotice statuses={seedStatuses} />;
  const selectionBar =
    collegeMode && selection.length > 0 ? (
      <FoodWebSelectionBar sel={sel} speciesOf={speciesOf} />
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
            Qui mange qui, qui aide qui — choisis une ou plusieurs espèces : tu vois ce
            qu&apos;elles mangent, qui les mange et qui les aide. Touche une espèce du graphe pour
            l&apos;ajouter ou la retirer, une flèche pour le détail. Une espèce grisée vit sur une
            autre carte.
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
            onMapChange={setMapId}
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

          {ready && !pickerLayout && !collegeMode && viewItems.length === 0 ? (
            <p className="section-sub card pedago-foodweb__empty">
              Aucune interaction enregistrée.
            </p>
          ) : null}

          {graphLayout ? null : selectedEdgePanel}
        </div>

        {listLayout ? (
          <div className="pedago-foodweb__list-stage">
            {pickerLayout ? (
              <FoodWebSelectionPicker sel={sel} notice={seedNotice} />
            ) : (
              <>
                {selectionBar}
                {emptySelection ? (
                  <p className="section-sub card pedago-foodweb__empty">
                    Aucune relation à montrer pour ta sélection : ajoute une autre espèce.
                  </p>
                ) : null}
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
            {selectionBar}
            <div className="card pedago-foodweb__stage pedago-foodweb__graph-wrap">
              <FoodWebGraph
                items={viewItems}
                selectedEdgeId={selectedEdgeId}
                highlightPlantId={collegeMode ? null : highlightPlantId}
                highlightPlantIds={collegeMode ? selection : null}
                focusRequest={graphFocusRequest}
                onSelectEdge={selectEdge}
                onOpenPlant={onOpenPlant}
                legendCompact
                preset={graphPreset}
                onPresetChange={changeGraphPreset}
                typeLabel={typeLabel}
                nodeClickMode={collegeMode ? 'panel' : 'isolate'}
                selectedPlantIds={collegeMode ? selection : null}
                onToggleSelection={collegeMode ? sel.toggle : null}
                usageLabelOf={collegeMode ? usageLabelOf : null}
              />
            </div>
            {selectedEdgePanel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
