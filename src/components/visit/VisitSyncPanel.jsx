import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, AccountDeletedError } from '../../services/api';
import { toggleIdInList } from '../../utils/visitSyncSelection.js';

/**
 * Panneau d'import sélectif carte ↔ visite (réservé enseignant), extrait de `VisitView` (O6).
 * Charge les options de synchronisation pour `mapId`, laisse cocher zones/repères du sens
 * choisi, puis lance l'import (`/api/visit/sync`) ou un réalignement complet
 * (`/api/visit/rebuild-from-map`). Comportement inchangé (déplacement pur).
 */
export function VisitSyncPanel({ isTeacher, mapId, onSynced, onForceLogout }) {
  const [direction, setDirection] = useState('map_to_visit');
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedZones, setSelectedZones] = useState([]);
  const [selectedMarkers, setSelectedMarkers] = useState([]);

  const sourceKey = direction === 'map_to_visit' ? 'map' : 'visit';
  // Réf. stables : sans `useMemo`, ces `|| []` recréaient un tableau à chaque rendu et,
  // comme dépendances de l'effet de présélection ci-dessous, provoquaient une boucle de rendu
  // (avertissement react-hooks pré-existant). La valeur calculée est identique.
  const sourceZones = useMemo(() => options?.source?.[sourceKey]?.zones || [], [options, sourceKey]);
  const sourceMarkers = useMemo(() => options?.source?.[sourceKey]?.markers || [], [options, sourceKey]);

  const loadOptions = useCallback(async () => {
    if (!isTeacher) return;
    setLoading(true);
    try {
      const res = await api(`/api/visit/sync/options?map_id=${encodeURIComponent(mapId)}`);
      setOptions(res || null);
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur chargement synchronisation');
      setOptions(null);
    } finally {
      setLoading(false);
    }
  }, [isTeacher, mapId, onForceLogout]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    setSelectedZones(sourceZones.map((z) => z.id));
    setSelectedMarkers(sourceMarkers.map((m) => m.id));
  }, [direction, options, sourceZones, sourceMarkers]);

  const toggleSelection = (id, isZone) => {
    const setter = isZone ? setSelectedZones : setSelectedMarkers;
    setter((prev) => toggleIdInList(prev, id));
  };

  const selectAll = () => {
    setSelectedZones(sourceZones.map((z) => z.id));
    setSelectedMarkers(sourceMarkers.map((m) => m.id));
  };

  const clearAll = () => {
    setSelectedZones([]);
    setSelectedMarkers([]);
  };

  const runSync = async () => {
    if (!selectedZones.length && !selectedMarkers.length) {
      alert('Sélectionne au moins une zone ou un repère.');
      return;
    }
    setSyncing(true);
    try {
      const res = await api('/api/visit/sync', 'POST', {
        map_id: mapId,
        direction,
        zone_ids: selectedZones,
        marker_ids: selectedMarkers,
      });
      alert(`Synchronisation terminée : ${res?.imported?.zones || 0} zone(s), ${res?.imported?.markers || 0} repère(s).`);
      await onSynced?.();
      await loadOptions();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur synchronisation');
    } finally {
      setSyncing(false);
    }
  };

  const rebuildVisitFromMap = async () => {
    if (
      !window.confirm(
        'Réaligner toute la visite sur cette carte ? Toutes les zones et repères visite du plan seront recréés à partir de la carte. Pour chaque élément encore présent sur la carte (même id), les textes, médias et ordre sont conservés ; les éléments visite sans équivalent carte sont supprimés.'
      )
    ) {
      return;
    }
    setSyncing(true);
    try {
      const res = await api('/api/visit/rebuild-from-map', 'POST', { map_id: mapId });
      alert(
        `Réalignement terminé : ${res?.imported?.zones ?? 0} zone(s), ${res?.imported?.markers ?? 0} repère(s) recréé(s). Retirés (hors carte) : ${res?.removed?.zones ?? 0} zone(s), ${res?.removed?.markers ?? 0} repère(s).`
      );
      await onSynced?.();
      await loadOptions();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur réalignement visite');
    } finally {
      setSyncing(false);
    }
  };

  if (!isTeacher) return null;

  return (
    <section className="visit-sync-card">
      <h3>🔁 Import sélectif carte / visite</h3>
      <p className="section-sub">Choisis le sens puis les éléments à importer (zones et/ou repères).</p>
      <div className="visit-map-switch">
        <button
          className={`btn btn-sm ${direction === 'map_to_visit' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setDirection('map_to_visit')}
        >
          Carte → Visite
        </button>
        <button
          className={`btn btn-sm ${direction === 'visit_to_map' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setDirection('visit_to_map')}
        >
          Visite → Carte
        </button>
        <button className="btn btn-ghost btn-sm" onClick={selectAll} disabled={loading || syncing}>
          Tout cocher
        </button>
        <button className="btn btn-ghost btn-sm" onClick={clearAll} disabled={loading || syncing}>
          Tout décocher
        </button>
      </div>
      {loading ? (
        <p className="section-sub">Chargement des éléments disponibles...</p>
      ) : (
        <div className="visit-sync-grid">
          <div className="visit-sync-list">
            <h4>Zones ({sourceZones.length})</h4>
            {sourceZones.length === 0 ? (
              <p className="section-sub">Aucune zone disponible.</p>
            ) : (
              sourceZones.map((z) => (
                <label key={z.id} className="visit-sync-item">
                  <input
                    type="checkbox"
                    checked={selectedZones.includes(z.id)}
                    onChange={() => toggleSelection(z.id, true)}
                    disabled={syncing}
                  />
                  {' '}{z.name || z.id}
                </label>
              ))
            )}
          </div>
          <div className="visit-sync-list">
            <h4>Repères ({sourceMarkers.length})</h4>
            {sourceMarkers.length === 0 ? (
              <p className="section-sub">Aucun repère disponible.</p>
            ) : (
              sourceMarkers.map((m) => (
                <label key={m.id} className="visit-sync-item">
                  <input
                    type="checkbox"
                    checked={selectedMarkers.includes(m.id)}
                    onChange={() => toggleSelection(m.id, false)}
                    disabled={syncing}
                  />
                  {' '}{m.label || m.id}
                </label>
              ))
            )}
          </div>
        </div>
      )}
      <div className="visit-sync-actions">
        <button className="btn btn-secondary btn-sm" disabled={loading || syncing} onClick={runSync}>
          {syncing ? 'Synchronisation...' : 'Lancer l’import sélectionné'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading || syncing}
          onClick={rebuildVisitFromMap}
        >
          Tout réaligner sur la carte (sans perte pour les ids conservés)
        </button>
      </div>
    </section>
  );
}
