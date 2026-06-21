import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';

export function GLKingdomZoneFeuilletLinker({ zoneId, canManage = false }) {
  const [feuillets, setFeuillets] = useState([]);
  const [linked, setLinked] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    if (!zoneId) return;
    try {
      const allData = await apiGL('/api/gl/lore/admin/feuillets');
      const items = Array.isArray(allData?.items) ? allData.items : [];
      setFeuillets(items);
      setLinked(items.filter((row) => Number(row.kingdom_zone_id) === Number(zoneId)));
    } catch {
      setFeuillets([]);
      setLinked([]);
    }
  }, [zoneId]);

  useEffect(() => {
    load();
  }, [load]);

  async function linkFeuillet() {
    if (!selectedCode || !zoneId) return;
    setFeedback('');
    try {
      await apiGL(
        `/api/gl/lore/admin/feuillets/${encodeURIComponent(selectedCode)}/kingdom-zone`,
        'PUT',
        {
          kingdomZoneId: zoneId,
        },
      );
      setFeedback('Feuillet associé à la zone.');
      await load();
    } catch (err) {
      setFeedback(err.message || 'Association impossible');
    }
  }

  if (!canManage || !zoneId) return null;

  return (
    <fieldset className="gl-zone-content-fieldset">
      <legend>Feuillets Sélène (carnet)</legend>
      <p className="gl-hint">Associe un feuillet du corpus à cette zone polygonale.</p>
      {linked.length ? (
        <ul className="gl-zone-feui-linked">
          {linked.map((row) => (
            <li key={row.feuillet_code}>{row.titre || row.feuillet_code}</li>
          ))}
        </ul>
      ) : (
        <p className="gl-hint">Aucun feuillet lié explicitement.</p>
      )}
      <div className="gl-inline-actions">
        <select value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)}>
          <option value="">Choisir un feuillet…</option>
          {feuillets.map((row) => (
            <option key={row.feuillet_code} value={row.feuillet_code}>
              {row.titre || row.feuillet_code}
            </option>
          ))}
        </select>
        <GLButton type="button" size="sm" onClick={linkFeuillet} disabled={!selectedCode}>
          Associer
        </GLButton>
      </div>
      {feedback ? <p className="gl-hint">{feedback}</p> : null}
    </fieldset>
  );
}
