import React from 'react';

/**
 * Surcharge d'affichage de la carte en partie (repères / zones feuillets),
 * optionnelle par rapport aux défauts plateforme.
 * Composant feuille prop-driven ; les valeurs et l'onChange restent dans le
 * parent (chapterForm / setChapterForm).
 *
 * @param {string} mapMarkersVisible valeur du select repères ('' | 'true' | 'false')
 * @param {string} mapZonesVisible valeur du select zones ('' | 'true' | 'false')
 * @param {(event)=>void} onMapMarkersVisibleChange
 * @param {(event)=>void} onMapZonesVisibleChange
 */
export function GLChapterMapDisplayFieldset({
  mapMarkersVisible,
  mapZonesVisible,
  onMapMarkersVisibleChange,
  onMapZonesVisibleChange,
}) {
  return (
    <fieldset className="gl-fieldset">
      <legend>Affichage carte en partie</legend>
      <p className="gl-hint">
        Surcharge optionnelle des défauts plateforme (Réglages → Affichage carte plateau). Laissez «
        Hériter » pour appliquer le défaut global.
      </p>
      <label>
        Repères sur la carte
        <select value={mapMarkersVisible} onChange={onMapMarkersVisibleChange}>
          <option value="">Hériter du défaut plateforme</option>
          <option value="true">Visibles</option>
          <option value="false">Masqués</option>
        </select>
      </label>
      <label>
        Zones feuillets sur la carte
        <select value={mapZonesVisible} onChange={onMapZonesVisibleChange}>
          <option value="">Hériter du défaut plateforme</option>
          <option value="true">Visibles</option>
          <option value="false">Masquées</option>
        </select>
      </label>
    </fieldset>
  );
}
