import React, { useMemo, useEffect } from 'react';
import {
  ZONE_PRESENCE_FILTER,
  distinctPlantFieldValues,
  filterPlantsByTaxonomy,
} from '../../utils/plantFilters';

/**
 * Panneau de filtres du catalogue biodiversité — extrait de `foretmap-views.jsx` (O6).
 * Recherche + filtres taxonomiques en cascade (groupes 1→3, dépendants), habitat, agrosystème
 * et présence en zone. État détenu par le parent (props `value`/`set*`), options dérivées des plantes.
 */

export function PlantCatalogFilterPanel({
  plants,
  showZonePresence = false,
  searchPlaceholder = '🔍 Rechercher dans la biodiversité...',
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
  zonePresence,
  setZonePresence,
}) {
  const subsetAfterG1 = useMemo(() => filterPlantsByTaxonomy(plants, { group1 }), [plants, group1]);
  const subsetAfterG2 = useMemo(
    () => filterPlantsByTaxonomy(plants, { group1, group2 }),
    [plants, group1, group2],
  );
  const subsetTaxonomy = useMemo(
    () => filterPlantsByTaxonomy(plants, { group1, group2, group3 }),
    [plants, group1, group2, group3],
  );

  const group1Options = useMemo(() => distinctPlantFieldValues(plants, 'group_1'), [plants]);
  const group2Options = useMemo(
    () => distinctPlantFieldValues(subsetAfterG1, 'group_2'),
    [subsetAfterG1],
  );
  const group3Options = useMemo(
    () => distinctPlantFieldValues(subsetAfterG2, 'group_3'),
    [subsetAfterG2],
  );
  const habitatOptions = useMemo(
    () => distinctPlantFieldValues(subsetTaxonomy, 'habitat'),
    [subsetTaxonomy],
  );
  const agroOptions = useMemo(
    () => distinctPlantFieldValues(subsetTaxonomy, 'agroecosystem_category'),
    [subsetTaxonomy],
  );

  useEffect(() => {
    if (habitat && !habitatOptions.includes(habitat)) setHabitat('');
  }, [habitat, habitatOptions, setHabitat]);

  useEffect(() => {
    if (agro && !agroOptions.includes(agro)) setAgro('');
  }, [agro, agroOptions, setAgro]);

  const resetAllFilters = () => {
    setGroup1('');
    setGroup2('');
    setGroup3('');
    setHabitat('');
    setAgro('');
    setSearch('');
    if (showZonePresence && setZonePresence) setZonePresence(ZONE_PRESENCE_FILTER.ALL);
  };

  const selectStyle = { background: 'white' };

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Groupe (taxon) 1</label>
        <select
          value={group1}
          onChange={(e) => {
            setGroup1(e.target.value);
            setGroup2('');
            setGroup3('');
          }}
          style={selectStyle}
        >
          <option value="">Tous les groupes</option>
          {group1Options.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          style={selectStyle}
        />
      </div>

      <details className="plant-more">
        <summary>Filtres avancés</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div className="plant-form-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Groupe (taxon) 2</label>
              <select
                value={group2}
                onChange={(e) => {
                  setGroup2(e.target.value);
                  setGroup3('');
                }}
                style={selectStyle}
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
              <label>Groupe (taxon) 3</label>
              <select
                value={group3}
                onChange={(e) => setGroup3(e.target.value)}
                style={selectStyle}
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
                style={selectStyle}
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
              <label>Catégorie d&apos;agrosystème</label>
              <select value={agro} onChange={(e) => setAgro(e.target.value)} style={selectStyle}>
                <option value="">Toutes</option>
                {agroOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            {showZonePresence && setZonePresence && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Présence sur la carte</label>
                <select
                  value={zonePresence}
                  onChange={(e) => setZonePresence(e.target.value)}
                  style={selectStyle}
                >
                  <option value={ZONE_PRESENCE_FILTER.ALL}>Toutes les fiches</option>
                  <option value={ZONE_PRESENCE_FILTER.IN_MAP}>
                    Lié à au moins une zone ou un repère
                  </option>
                  <option value={ZONE_PRESENCE_FILTER.NOT_IN_MAP}>Sans lieu sur la carte</option>
                </select>
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetAllFilters}>
            Réinitialiser les filtres
          </button>
        </div>
      </details>
    </div>
  );
}
