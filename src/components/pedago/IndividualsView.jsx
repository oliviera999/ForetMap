import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext.jsx';
import { IconAdd, IconBiodiv, IconDelete } from '../../shared/icons.jsx';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';

function GrowthChart({ measurements }) {
  const points = (measurements || []).filter(
    (m) => m.circumference_cm != null || m.height_m != null,
  );
  if (points.length === 0) {
    return <p className="muted">Pas encore de mesures pour tracer une courbe.</p>;
  }
  const maxC = Math.max(...points.map((p) => p.circumference_cm || 0), 1);
  const maxH = Math.max(...points.map((p) => p.height_m || 0), 1);
  const w = 320;
  const h = 120;
  const pad = 16;

  const pathFor = (key, max) =>
    points
      .map((p, i) => {
        const x = pad + (i * (w - 2 * pad)) / Math.max(points.length - 1, 1);
        const val = p[key] || 0;
        const y = h - pad - (val / max) * (h - 2 * pad);
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');

  return (
    <svg
      className="individuals-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Courbe de croissance"
    >
      <path d={pathFor('circumference_cm', maxC)} className="individuals-chart__c" fill="none" />
      <path d={pathFor('height_m', maxH)} className="individuals-chart__h" fill="none" />
    </svg>
  );
}

/**
 * Suivi d'individus arbres : liste, création, mesures, estimations biomasse/CO₂.
 */
export function IndividualsView({
  maps = [],
  initialMapId = null,
  canManage = false,
  canMeasure = false,
  onOpenPlant = null,
}) {
  const { plants = [] } = useData() || {};
  const { confirm } = useAppDialogs();
  const [mapId, setMapId] = useState(initialMapId || '');
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [form, setForm] = useState({
    plant_id: '',
    label: '',
    zone_id: '',
    marker_id: '',
    planted_at: '',
    wood_density: '',
  });
  const [measure, setMeasure] = useState({
    measured_at: new Date().toISOString().slice(0, 10),
    circumference_cm: '',
    height_m: '',
    crown_diameter_m: '',
    notes: '',
  });

  const loadList = useCallback(async () => {
    const q = mapId ? `?mapId=${encodeURIComponent(mapId)}` : '';
    const data = await api(`/api/individuals${q}`);
    setItems(Array.isArray(data?.items) ? data.items : []);
    if (data?.disclaimer) setDisclaimer(data.disclaimer);
  }, [mapId]);

  useEffect(() => {
    loadList().catch(() => setItems([]));
  }, [loadList]);

  const openDetail = async (id) => {
    setError('');
    setSelectedId(id);
    try {
      const data = await api(`/api/individuals/${id}`);
      setDetail(data);
      if (data?.disclaimer) setDisclaimer(data.disclaimer);
    } catch (err) {
      setError(err?.message || 'Chargement impossible');
      setDetail(null);
    }
  };

  const createIndividual = async () => {
    setError('');
    try {
      const created = await api('/api/individuals', 'POST', {
        plant_id: Number(form.plant_id),
        map_id: mapId,
        label: form.label,
        zone_id: form.zone_id || null,
        marker_id: form.marker_id || null,
        planted_at: form.planted_at || null,
        wood_density: form.wood_density === '' ? null : Number(form.wood_density),
      });
      setForm({
        plant_id: '',
        label: '',
        zone_id: '',
        marker_id: '',
        planted_at: '',
        wood_density: '',
      });
      await loadList();
      await openDetail(created.id);
    } catch (err) {
      setError(err?.message || 'Création impossible');
    }
  };

  const addMeasurement = async () => {
    if (!selectedId) return;
    setError('');
    try {
      await api(`/api/individuals/${selectedId}/measurements`, 'POST', {
        measured_at: measure.measured_at,
        circumference_cm: measure.circumference_cm === '' ? null : Number(measure.circumference_cm),
        height_m: measure.height_m === '' ? null : Number(measure.height_m),
        crown_diameter_m: measure.crown_diameter_m === '' ? null : Number(measure.crown_diameter_m),
        notes: measure.notes || null,
      });
      setMeasure((m) => ({
        ...m,
        circumference_cm: '',
        height_m: '',
        crown_diameter_m: '',
        notes: '',
      }));
      await openDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err?.message || 'Mesure impossible');
    }
  };

  const removeIndividual = async (id) => {
    if (!(await confirm({ message: 'Supprimer cet individu et ses mesures ?', danger: true })))
      return;
    try {
      await api(`/api/individuals/${id}`, 'DELETE');
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
      await loadList();
    } catch (err) {
      setError(err?.message || 'Suppression impossible');
    }
  };

  const latestEstimate = useMemo(() => {
    const ms = detail?.measurements || [];
    for (let i = ms.length - 1; i >= 0; i -= 1) {
      if (ms[i]?.estimate?.computable) return ms[i].estimate;
    }
    return null;
  }, [detail]);

  return (
    <div className="individuals-view fade-in">
      <header className="individuals-view__header">
        <h2>
          <IconBiodiv size={22} /> Suivi d’individus
        </h2>
        <p>Arbres identifiés sur une carte : mesures, courbe de croissance, estimations.</p>
      </header>

      <div className="individuals-view__toolbar">
        <label>
          Carte
          <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
            <option value="">Toutes</option>
            {(maps || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.label || m.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <ul className="individuals-list">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className="btn" onClick={() => openDetail(item.id)}>
              {item.plant_emoji ? `${item.plant_emoji} ` : ''}
              {item.label}
              <span className="muted"> — {item.plant_name}</span>
            </button>
            {canManage ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => removeIndividual(item.id)}
              >
                <IconDelete size={14} />
              </button>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? <li className="muted">Aucun individu suivi.</li> : null}
      </ul>

      {canManage && mapId ? (
        <section className="individuals-create">
          <h3>Nouvel individu</h3>
          <div className="individuals-create__form">
            <label>
              Espèce
              <select
                value={form.plant_id}
                onChange={(e) => setForm((f) => ({ ...f, plant_id: e.target.value }))}
              >
                <option value="">Choisir…</option>
                {(plants || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Libellé
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Grenadier n°2"
              />
            </label>
            <label>
              Id zone (optionnel)
              <input
                value={form.zone_id}
                onChange={(e) => setForm((f) => ({ ...f, zone_id: e.target.value }))}
              />
            </label>
            <label>
              Id repère (optionnel)
              <input
                value={form.marker_id}
                onChange={(e) => setForm((f) => ({ ...f, marker_id: e.target.value }))}
              />
            </label>
            <label>
              Planté le
              <input
                type="date"
                value={form.planted_at}
                onChange={(e) => setForm((f) => ({ ...f, planted_at: e.target.value }))}
              />
            </label>
            <label>
              Densité du bois (g/cm³)
              <input
                value={form.wood_density}
                onChange={(e) => setForm((f) => ({ ...f, wood_density: e.target.value }))}
                placeholder="0,6 par défaut"
              />
            </label>
            <button type="button" className="btn btn-primary" onClick={createIndividual}>
              <IconAdd size={14} /> Créer
            </button>
          </div>
        </section>
      ) : null}

      {detail ? (
        <section className="individuals-detail">
          <h3>
            {detail.label}
            {detail.plant_id ? (
              <>
                {' '}
                —{' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => onOpenPlant?.(detail.plant_id)}
                >
                  {detail.plant_name}
                </button>
              </>
            ) : null}
          </h3>
          <GrowthChart measurements={detail.measurements} />
          {latestEstimate ? (
            <div className="individuals-estimate" role="note">
              <p>
                D ≈ {latestEstimate.diameter_cm?.toFixed?.(1)} cm · biomasse ≈{' '}
                {latestEstimate.biomass_kg} kg · C ≈ {latestEstimate.carbon_kg} kg · CO₂ ≈{' '}
                {latestEstimate.co2_kg} kg
              </p>
              <p className="individuals-estimate__disclaimer">
                {disclaimer || latestEstimate.disclaimer}
              </p>
            </div>
          ) : (
            <p className="muted">{disclaimer}</p>
          )}
          <ul className="individuals-measurements">
            {(detail.measurements || []).map((m) => (
              <li key={m.id}>
                <strong>{m.measured_at}</strong>
                {m.circumference_cm != null ? ` · C=${m.circumference_cm} cm` : ''}
                {m.height_m != null ? ` · H=${m.height_m} m` : ''}
                {m.crown_diameter_m != null ? ` · couronne=${m.crown_diameter_m} m` : ''}
              </li>
            ))}
          </ul>
          {canMeasure ? (
            <div className="individuals-measure-form">
              <h4>Nouvelle mesure</h4>
              <label>
                Date
                <input
                  type="date"
                  value={measure.measured_at}
                  onChange={(e) => setMeasure((m) => ({ ...m, measured_at: e.target.value }))}
                />
              </label>
              <label>
                Circonférence à 1,30 m (cm)
                <input
                  value={measure.circumference_cm}
                  onChange={(e) => setMeasure((m) => ({ ...m, circumference_cm: e.target.value }))}
                />
              </label>
              <label>
                Hauteur (m)
                <input
                  value={measure.height_m}
                  onChange={(e) => setMeasure((m) => ({ ...m, height_m: e.target.value }))}
                />
              </label>
              <label>
                Diamètre de couronne (m)
                <input
                  value={measure.crown_diameter_m}
                  onChange={(e) => setMeasure((m) => ({ ...m, crown_diameter_m: e.target.value }))}
                />
              </label>
              <button type="button" className="btn btn-primary" onClick={addMeasurement}>
                Enregistrer la mesure
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
