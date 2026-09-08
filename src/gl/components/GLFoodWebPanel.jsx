import { useCallback, useEffect, useMemo, useState } from 'react';
import { FoodWebGraph } from '../../components/pedago/FoodWebGraph.jsx';
import { INTERACTION_TYPES, interactionTypeLabel } from '../../shared/foodWebTypes.js';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLSelect } from './ui/GLSelect.jsx';
import { GLInput } from './ui/GLInput.jsx';

function speciesLabel(row) {
  const name = String(row?.nom_commun || '').trim() || `Espèce ${row?.id}`;
  const scientific = String(row?.nom_scientifique || '').trim();
  return scientific ? `${name} (${scientific})` : name;
}

export function GLFoodWebPanel({ biomes = [], canManage = false, onOpenSpecies }) {
  const [biomeSlug, setBiomeSlug] = useState(biomes[0]?.slug || '');
  const [items, setItems] = useState([]);
  const [species, setSpecies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [form, setForm] = useState({
    from_id: '',
    to_id: '',
    interaction_type: 'predation',
    description: '',
  });

  useEffect(() => {
    if (!biomeSlug && biomes[0]?.slug) setBiomeSlug(biomes[0].slug);
  }, [biomeSlug, biomes]);

  const loadWeb = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = biomeSlug ? `?biomeSlug=${encodeURIComponent(biomeSlug)}` : '';
      const res = await apiGL(`/api/gl/food-web${params}`);
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      setError(err?.message || 'Réseau introuvable');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [biomeSlug]);

  const loadSpecies = useCallback(async () => {
    if (!biomeSlug) {
      setSpecies([]);
      return;
    }
    try {
      const res = await apiGL(`/api/gl/species?biomeSlug=${encodeURIComponent(biomeSlug)}`);
      setSpecies(Array.isArray(res?.items) ? res.items : []);
    } catch {
      setSpecies([]);
    }
  }, [biomeSlug]);

  useEffect(() => {
    loadWeb();
  }, [loadWeb]);

  useEffect(() => {
    loadSpecies();
  }, [loadSpecies]);

  const selected = useMemo(
    () => items.find((row) => Number(row.id) === Number(selectedEdgeId)) || null,
    [items, selectedEdgeId],
  );

  useEffect(() => {
    if (!selected) return;
    setForm({
      from_id: selected.from_id != null ? String(selected.from_id) : '',
      to_id: selected.to_id != null ? String(selected.to_id) : '',
      interaction_type: selected.interaction_type || 'predation',
      description: selected.description || '',
    });
  }, [selected]);

  const saveInteraction = async (event) => {
    event.preventDefault();
    const payload = {
      from_id: Number(form.from_id),
      to_id: form.to_id ? Number(form.to_id) : null,
      interaction_type: form.interaction_type,
      description: form.description,
    };
    try {
      if (selectedEdgeId) {
        await apiGL(`/api/gl/food-web/interactions/${selectedEdgeId}`, 'PUT', payload);
      } else {
        await apiGL('/api/gl/food-web/interactions', 'POST', payload);
      }
      setForm({ from_id: '', to_id: '', interaction_type: 'predation', description: '' });
      setSelectedEdgeId(null);
      await loadWeb();
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible');
    }
  };

  const removeInteraction = async () => {
    if (!selectedEdgeId) return;
    try {
      await apiGL(`/api/gl/food-web/interactions/${selectedEdgeId}`, 'DELETE');
      setSelectedEdgeId(null);
      await loadWeb();
    } catch (err) {
      setError(err?.message || 'Suppression impossible');
    }
  };

  return (
    <div className="gl-food-web-panel">
      <div className="gl-inline-actions">
        <GLField label="Biome">
          <GLSelect value={biomeSlug} onChange={(e) => setBiomeSlug(e.target.value)}>
            <option value="">Tous les biomes</option>
            {biomes.map((biome) => (
              <option key={biome.slug} value={biome.slug}>
                {biome.nom || biome.slug}
              </option>
            ))}
          </GLSelect>
        </GLField>
      </div>
      {error ? <p className="gl-hint">{error}</p> : null}
      {loading ? <p className="gl-hint">Chargement du réseau…</p> : null}
      <FoodWebGraph
        items={items}
        variant="gl"
        selectedEdgeId={selectedEdgeId}
        onSelectEdge={setSelectedEdgeId}
        onOpenPlant={(speciesId) => {
          const row = species.find((item) => Number(item.id) === Number(speciesId));
          if (row) onOpenSpecies?.(row);
        }}
        legendCompact
      />
      {selected ? (
        <p className="gl-hint">
          {interactionTypeLabel(selected.interaction_type)} : {selected.from_name}
          {selected.to_name ? ` → ${selected.to_name}` : ' → milieu'}
          {selected.description ? ` — ${selected.description}` : ''}
        </p>
      ) : null}
      {canManage ? (
        <form className="gl-form" onSubmit={saveInteraction}>
          <h3>{selectedEdgeId ? 'Modifier la relation' : 'Ajouter une relation'}</h3>
          <GLField label="Espèce source">
            <GLSelect
              value={form.from_id}
              onChange={(e) => setForm((prev) => ({ ...prev, from_id: e.target.value }))}
              required
            >
              <option value="">— choisir —</option>
              {species.map((row) => (
                <option key={row.id} value={row.id}>
                  {speciesLabel(row)}
                </option>
              ))}
            </GLSelect>
          </GLField>
          <GLField label="Espèce cible (vide = milieu)">
            <GLSelect
              value={form.to_id}
              onChange={(e) => setForm((prev) => ({ ...prev, to_id: e.target.value }))}
            >
              <option value="">Milieu / pas de cible</option>
              {species.map((row) => (
                <option key={row.id} value={row.id}>
                  {speciesLabel(row)}
                </option>
              ))}
            </GLSelect>
          </GLField>
          <GLField label="Type de relation">
            <GLSelect
              value={form.interaction_type}
              onChange={(e) => setForm((prev) => ({ ...prev, interaction_type: e.target.value }))}
            >
              {INTERACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {interactionTypeLabel(type)}
                </option>
              ))}
            </GLSelect>
          </GLField>
          <GLField label="Description">
            <GLInput
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </GLField>
          <div className="gl-inline-actions">
            <GLButton type="submit">{selectedEdgeId ? 'Enregistrer' : 'Ajouter'}</GLButton>
            {selectedEdgeId ? (
              <GLButton type="button" variant="secondary" onClick={removeInteraction}>
                Supprimer
              </GLButton>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
