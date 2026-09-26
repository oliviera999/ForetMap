import { useMemo, useEffect, useId } from 'react';
import {
  ZONE_PRESENCE_FILTER,
  distinctPlantFieldValues,
  filterPlantsByTaxonomy,
} from '../../utils/plantFilters';
import { ORIGIN_STATUS_VALUES, ORIGIN_STATUS_LABELS } from '../../utils/plantOriginStatus.js';
import { IUCN_STATUS_VALUES, IUCN_STATUS_LABELS } from '../../utils/plantIucnStatus.js';
import { trophicRoleLabel } from '../../utils/plantTrophicRole.js';
import { BIODIV_MAP_FILTER_ALL, BIODIV_SORT } from '../../utils/biodivCatalogLoad.js';

/**
 * Panneau de filtres / tri / chips du catalogue biodiversité.
 * Surface : carte, présence, recherche, règne, chips, tri.
 * Avancés : taxonomie fine, habitat, rôles, statuts.
 */
export function PlantCatalogFilterPanel({
  plants,
  maps = [],
  activeMapId = null,
  onActiveMapChange = null,
  showZonePresence = false,
  searchPlaceholder = 'Rechercher dans la biodiversité…',
  search,
  setSearch,
  group1,
  setGroup1,
  group2,
  setGroup2,
  group3,
  setGroup3,
  habitat,
  setHabitat,
  agro,
  setAgro,
  trophicRole,
  setTrophicRole,
  habitatType,
  setHabitatType,
  originStatus,
  setOriginStatus,
  iucnStatus,
  setIucnStatus,
  zonePresence,
  setZonePresence,
  defaultZonePresence = ZONE_PRESENCE_FILTER.ALL,
  edibleOnly = false,
  setEdibleOnly = null,
  iucnThreatenedOnly = false,
  setIucnThreatenedOnly = null,
  observationChip = '',
  setObservationChip = null,
  sortKey = BIODIV_SORT.NAME_ASC,
  setSortKey = null,
  enableObservationChips = false,
  countsReady = false,
  /** État de la présence sur la carte (serveur) : `error` → le filtre est inopérant. */
  presenceStatus = 'ready',
}) {
  const subsetAfterG1 = useMemo(() => filterPlantsByTaxonomy(plants, { group1 }), [plants, group1]);
  const subsetAfterG2 = useMemo(
    () => filterPlantsByTaxonomy(plants, { group1, group2 }),
    [plants, group1, group2],
  );
  const subsetTaxonomy = useMemo(
    () =>
      filterPlantsByTaxonomy(plants, {
        group1,
        group2,
        group3,
        trophicRole: trophicRole || agro,
        habitatType,
      }),
    [plants, group1, group2, group3, trophicRole, agro, habitatType],
  );

  const group1Options = useMemo(() => distinctPlantFieldValues(plants, 'taxon_kingdom'), [plants]);
  const group2Options = useMemo(
    () => distinctPlantFieldValues(subsetAfterG1, 'taxon_group'),
    [subsetAfterG1],
  );
  const group3Options = useMemo(
    () => distinctPlantFieldValues(subsetAfterG2, 'taxon_family'),
    [subsetAfterG2],
  );
  const habitatOptions = useMemo(
    () => distinctPlantFieldValues(subsetTaxonomy, 'habitat'),
    [subsetTaxonomy],
  );
  const trophicOptions = useMemo(
    () => distinctPlantFieldValues(subsetTaxonomy, 'trophic_role'),
    [subsetTaxonomy],
  );
  const habitatTypeOptions = useMemo(
    () => distinctPlantFieldValues(subsetTaxonomy, 'habitat_type'),
    [subsetTaxonomy],
  );

  const effectiveTrophic = trophicRole ?? agro ?? '';
  const mapList = Array.isArray(maps) ? maps : [];
  const showMapSelect = typeof onActiveMapChange === 'function' && mapList.length > 0;
  const mapSelectValue =
    zonePresence === ZONE_PRESENCE_FILTER.ALL ? BIODIV_MAP_FILTER_ALL : activeMapId || '';

  const handleMapSelectChange = (e) => {
    const next = e.target.value;
    if (next === BIODIV_MAP_FILTER_ALL) {
      if (typeof setZonePresence === 'function') {
        setZonePresence(ZONE_PRESENCE_FILTER.ALL);
      }
      return;
    }
    onActiveMapChange(next);
    if (zonePresence === ZONE_PRESENCE_FILTER.ALL && typeof setZonePresence === 'function') {
      setZonePresence(ZONE_PRESENCE_FILTER.IN_MAP);
    }
  };

  useEffect(() => {
    if (habitat && !habitatOptions.includes(habitat)) setHabitat('');
  }, [habitat, habitatOptions, setHabitat]);

  useEffect(() => {
    if (effectiveTrophic && !trophicOptions.includes(effectiveTrophic)) {
      if (setTrophicRole) setTrophicRole('');
      else if (setAgro) setAgro('');
    }
  }, [effectiveTrophic, trophicOptions, setTrophicRole, setAgro]);

  useEffect(() => {
    if (habitatType && !habitatTypeOptions.includes(habitatType) && setHabitatType) {
      setHabitatType('');
    }
  }, [habitatType, habitatTypeOptions, setHabitatType]);

  const resetAllFilters = () => {
    setGroup1('');
    setGroup2('');
    setGroup3('');
    setHabitat('');
    if (setTrophicRole) setTrophicRole('');
    else if (setAgro) setAgro('');
    if (setHabitatType) setHabitatType('');
    if (setOriginStatus) setOriginStatus('');
    if (setIucnStatus) setIucnStatus('');
    setSearch('');
    if (showZonePresence && setZonePresence) setZonePresence(defaultZonePresence);
    if (setEdibleOnly) setEdibleOnly(false);
    if (setIucnThreatenedOnly) setIucnThreatenedOnly(false);
    if (setObservationChip) setObservationChip('');
    if (setSortKey) setSortKey(BIODIV_SORT.NAME_ASC);
  };

  const regneSelectId = useId();
  const mapSelectId = useId();
  const presenceSelectId = useId();
  const searchId = useId();
  const sortSelectId = useId();
  const originStatusSelectId = useId();
  const iucnStatusSelectId = useId();

  const toggleObservation = (value) => {
    if (!setObservationChip) return;
    setObservationChip((prev) => (prev === value ? '' : value));
  };

  return (
    <div className="biodiv-filters">
      <div className="biodiv-filters__surface">
        {showMapSelect ? (
          <div className="field biodiv-filters__field" style={{ marginBottom: 0 }}>
            <label htmlFor={mapSelectId}>Carte</label>
            <select
              id={mapSelectId}
              value={mapSelectValue}
              onChange={handleMapSelectChange}
              aria-label="Sélection de carte active"
              style={{ background: 'white' }}
            >
              <option value={BIODIV_MAP_FILTER_ALL}>Toute la biodiversité du site</option>
              {mapList.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.name || mp.id}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {showZonePresence && setZonePresence ? (
          <div className="field biodiv-filters__field" style={{ marginBottom: 0 }}>
            <label htmlFor={presenceSelectId}>Présence sur la carte</label>
            <select
              id={presenceSelectId}
              value={zonePresence}
              onChange={(e) => setZonePresence(e.target.value)}
              style={{ background: 'white' }}
            >
              <option value={ZONE_PRESENCE_FILTER.ALL}>Toutes les fiches</option>
              <option value={ZONE_PRESENCE_FILTER.IN_MAP}>Présente sur cette carte</option>
              <option value={ZONE_PRESENCE_FILTER.NOT_IN_MAP}>Absente de cette carte</option>
            </select>
            {presenceStatus === 'error' && zonePresence !== ZONE_PRESENCE_FILTER.ALL ? (
              <p className="biodiv-filters__note" role="status">
                Présence sur la carte indisponible pour le moment : toutes les fiches sont
                affichées.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="field biodiv-filters__field" style={{ marginBottom: 0 }}>
          <label htmlFor={searchId}>Recherche</label>
          <input
            id={searchId}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            style={{ background: 'white' }}
          />
        </div>

        <div className="field biodiv-filters__field" style={{ marginBottom: 0 }}>
          <label htmlFor={regneSelectId}>Règne</label>
          <select
            id={regneSelectId}
            value={group1}
            onChange={(e) => {
              setGroup1(e.target.value);
              setGroup2('');
              setGroup3('');
            }}
            style={{ background: 'white' }}
          >
            <option value="">Tous les groupes</option>
            {group1Options.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="biodiv-filters__chips" role="group" aria-label="Filtres rapides">
        {setEdibleOnly ? (
          <button
            type="button"
            className={`biodiv-chip${edibleOnly ? ' biodiv-chip--on' : ''}`}
            aria-pressed={edibleOnly}
            onClick={() => setEdibleOnly(!edibleOnly)}
          >
            Comestible
          </button>
        ) : null}
        {setIucnThreatenedOnly ? (
          <button
            type="button"
            className={`biodiv-chip${iucnThreatenedOnly ? ' biodiv-chip--on' : ''}`}
            aria-pressed={iucnThreatenedOnly}
            onClick={() => setIucnThreatenedOnly(!iucnThreatenedOnly)}
          >
            UICN menacé
          </button>
        ) : null}
        {enableObservationChips && setObservationChip ? (
          <>
            <button
              type="button"
              className={`biodiv-chip${observationChip === 'unseen' ? ' biodiv-chip--on' : ''}`}
              aria-pressed={observationChip === 'unseen'}
              disabled={!countsReady}
              onClick={() => toggleObservation('unseen')}
            >
              Pas encore observées
            </button>
            <button
              type="button"
              className={`biodiv-chip${observationChip === 'mine' ? ' biodiv-chip--on' : ''}`}
              aria-pressed={observationChip === 'mine'}
              disabled={!countsReady}
              onClick={() => toggleObservation('mine')}
            >
              Déjà observées
            </button>
          </>
        ) : null}
      </div>

      {setSortKey ? (
        <div className="field biodiv-filters__sort" style={{ marginBottom: 0 }}>
          <label htmlFor={sortSelectId}>Trier</label>
          <select
            id={sortSelectId}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            style={{ background: 'white' }}
          >
            <option value={BIODIV_SORT.NAME_ASC}>Nom A → Z</option>
            <option value={BIODIV_SORT.NAME_DESC}>Nom Z → A</option>
            {enableObservationChips ? (
              <option value={BIODIV_SORT.RECENT_OBSERVED} disabled={!countsReady}>
                Plus observées (moi)
              </option>
            ) : null}
          </select>
        </div>
      ) : null}

      <details className="plant-more biodiv-filters__advanced">
        <summary>Filtres avancés</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div className="plant-form-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Grand groupe</label>
              <select
                value={group2}
                onChange={(e) => {
                  setGroup2(e.target.value);
                  setGroup3('');
                }}
                style={{ background: 'white' }}
              >
                <option value="">Tous</option>
                {group2Options.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Famille</label>
              <select
                value={group3}
                onChange={(e) => setGroup3(e.target.value)}
                style={{ background: 'white' }}
              >
                <option value="">Tous</option>
                {group3Options.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Habitat</label>
              <select
                value={habitat}
                onChange={(e) => setHabitat(e.target.value)}
                style={{ background: 'white' }}
              >
                <option value="">Tous</option>
                {habitatOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Rôle trophique</label>
              <select
                value={effectiveTrophic}
                onChange={(e) => {
                  const v = e.target.value;
                  if (setTrophicRole) setTrophicRole(v);
                  else if (setAgro) setAgro(v);
                }}
                style={{ background: 'white' }}
              >
                <option value="">Tous</option>
                {trophicOptions.map((a) => (
                  <option key={a} value={a}>
                    {trophicRoleLabel(a) || a}
                  </option>
                ))}
              </select>
            </div>
            {setHabitatType ? (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Milieu</label>
                <select
                  value={habitatType || ''}
                  onChange={(e) => setHabitatType(e.target.value)}
                  style={{ background: 'white' }}
                >
                  <option value="">Tous</option>
                  {habitatTypeOptions.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {setOriginStatus ? (
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={originStatusSelectId}>Statut biogéographique</label>
                <select
                  id={originStatusSelectId}
                  value={originStatus || ''}
                  onChange={(e) => setOriginStatus(e.target.value)}
                  style={{ background: 'white' }}
                >
                  <option value="">Tous</option>
                  {ORIGIN_STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {ORIGIN_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {setIucnStatus ? (
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={iucnStatusSelectId}>Statut UICN</label>
                <select
                  id={iucnStatusSelectId}
                  value={iucnStatus || ''}
                  onChange={(e) => setIucnStatus(e.target.value)}
                  style={{ background: 'white' }}
                >
                  <option value="">Tous</option>
                  {IUCN_STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {IUCN_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetAllFilters}>
            Réinitialiser les filtres
          </button>
        </div>
      </details>
    </div>
  );
}
