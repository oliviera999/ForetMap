import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import { SurfaceVisibilityField } from '../../shared/ui/SurfaceVisibilityField.jsx';
import { buildPlaceIndex, searchPlaces } from '../../shared/search/placeSearch.js';
import { IconDelete } from '../../shared/icons.jsx';
import {
  EMPTY_ROUTE_DRAFT,
  ROUTE_STEPS_MAX,
  addStep,
  moveStep,
  patchStepAt,
  placesByKey,
  removeStepAt,
  routeDraftFrom,
  routePayloadFromDraft,
  routePlaceOptions,
  routeSummaryLine,
  stepDisplayLabel,
  stepKey,
  validateRouteDraft,
} from '../../utils/mapRoutesEditor.js';

const CARD_STYLE = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
  marginTop: 12,
};

const HINT_STYLE = {
  fontSize: 'var(--text-sm)',
  color: 'var(--ink-soft)',
  lineHeight: 'var(--lh-normal)',
};

/** Nombre de suggestions affichées sous le champ de recherche de lieux. */
const SUGGESTION_LIMIT = 8;

/**
 * Console de gestion des **parcours** de carte (lot 8 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6).
 *
 * Un parcours enchaîne des lieux **déjà saisis** : « les cinq endroits à voir », « le tour des
 * nouveaux professeurs ». Aucune validation, aucune progression enregistrée — c'est une liste
 * ordonnée, rien de plus. On la compose ici en cherchant les lieux avec le même moteur de
 * recherche que le plan (`shared/search/placeSearch.js`), on la réordonne au glisser-déposer
 * (ou aux boutons ↑/↓, la voie clavier), et on l'exporte en **PDF avec QR code** à afficher
 * à l'accueil.
 *
 * La logique vit dans `utils/mapRoutesEditor.js` ; ce composant ne fait que la câbler.
 */
export function MapRoutesPanel({ maps = [], onMessage, onError }) {
  const { confirm } = useAppDialogs();
  const activeMaps = useMemo(() => maps.filter((m) => m.is_active !== false), [maps]);
  const [mapId, setMapId] = useState('');
  const [routes, setRoutes] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState(EMPTY_ROUTE_DRAFT);
  const [query, setQuery] = useState('');
  const [dragIndex, setDragIndex] = useState(-1);

  // Première carte active par défaut : un parcours appartient toujours à une carte.
  useEffect(() => {
    if (!mapId && activeMaps.length > 0) setMapId(String(activeMaps[0].id));
  }, [mapId, activeMaps]);

  const loadRoutes = useCallback(async () => {
    if (!mapId) {
      setRoutes([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api(`/api/map-routes/manage?map_id=${encodeURIComponent(mapId)}`);
      setRoutes(Array.isArray(data) ? data : []);
    } catch (e) {
      onError?.(e?.message || 'Lecture des parcours impossible.');
    } finally {
      setLoading(false);
    }
  }, [mapId, onError]);

  const loadPlaces = useCallback(async () => {
    if (!mapId) {
      setPlaces([]);
      return;
    }
    try {
      const [zones, markers, categories] = await Promise.all([
        api('/api/zones'),
        api('/api/map/markers'),
        api('/api/map-categories'),
      ]);
      setPlaces(routePlaceOptions({ zones, markers, categories }, mapId));
    } catch (e) {
      onError?.(e?.message || 'Lecture des lieux impossible.');
    }
  }, [mapId, onError]);

  useEffect(() => {
    loadRoutes();
    loadPlaces();
  }, [loadRoutes, loadPlaces]);

  const byKey = useMemo(() => placesByKey(places), [places]);

  /** Index de recherche : les alias de recherche du lot 4 comptent aussi ici. */
  const searchIndex = useMemo(
    () => buildPlaceIndex(places, { getCategoryLabels: (p) => p.category_labels || [] }),
    [places],
  );

  const usedKeys = useMemo(
    () => new Set((draft.steps || []).map((step) => stepKey(step))),
    [draft.steps],
  );

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    return searchPlaces(searchIndex, query, { limit: SUGGESTION_LIMIT + usedKeys.size })
      .map((hit) => hit.place)
      .filter((place) => !usedKeys.has(place.key))
      .slice(0, SUGGESTION_LIMIT);
  }, [searchIndex, query, usedKeys]);

  const setField = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const setSteps = (next) => setDraft((prev) => ({ ...prev, steps: next }));

  const resetDraft = () => {
    setDraft(EMPTY_ROUTE_DRAFT);
    setEditingId('');
    setQuery('');
  };

  const submit = async () => {
    const check = validateRouteDraft(draft, { mapId });
    if (!check.ok) {
      onError?.(check.error);
      return;
    }
    setBusy(true);
    try {
      const payload = routePayloadFromDraft(draft, { mapId });
      if (editingId) {
        await api(`/api/map-routes/${editingId}`, 'PUT', payload);
        onMessage?.('Parcours mis à jour');
      } else {
        await api('/api/map-routes', 'POST', payload);
        onMessage?.('Parcours créé');
      }
      resetDraft();
      loadRoutes();
    } catch (e) {
      onError?.(e?.message || 'Échec de l’enregistrement');
    }
    setBusy(false);
  };

  const remove = async (route) => {
    const confirmed = await confirm({
      message: `Supprimer le parcours « ${route.title} » ? Les lieux qu’il enchaîne ne sont pas touchés.`,
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await api(`/api/map-routes/${route.id}`, 'DELETE');
      onMessage?.('Parcours supprimé');
      if (editingId === route.id) resetDraft();
      loadRoutes();
    } catch (e) {
      onError?.(e?.message || 'Échec de la suppression');
    }
    setBusy(false);
  };

  const exportPdf = async (route) => {
    setBusy(true);
    try {
      await downloadApiFile(
        `/api/map-routes/${route.id}/pdf`,
        `parcours-${route.slug || route.id}.pdf`,
      );
      onMessage?.('Affiche PDF téléchargée');
    } catch (e) {
      onError?.(e?.message || 'Export PDF impossible');
    }
    setBusy(false);
  };

  const dropOn = (index) => {
    if (dragIndex < 0 || dragIndex === index) return;
    setSteps(moveStep(draft.steps, dragIndex, index));
    setDragIndex(-1);
  };

  return (
    <div style={CARD_STYLE}>
      <h3 style={{ marginTop: 0 }}>Parcours</h3>
      <p style={{ ...HINT_STYLE, marginBottom: 10 }}>
        Un parcours est une <strong>liste ordonnée de lieux déjà saisis</strong> : « les cinq
        endroits à voir », « le tour des nouveaux professeurs ». Rien n’est dupliqué — renommer un
        lieu renomme l’étape. Aucun visiteur n’a de compte, rien n’est enregistré à son sujet : on
        avance, on saute une étape, on quitte. L’export PDF imprime la liste et un{' '}
        <strong>QR code</strong> vers le parcours, à afficher à l’accueil.
      </p>

      <div className="field">
        <label htmlFor="map-routes-map">Carte</label>
        <select
          id="map-routes-map"
          value={mapId}
          onChange={(e) => {
            setMapId(e.target.value);
            resetDraft();
          }}
        >
          {activeMaps.length === 0 && <option value="">Aucune carte active</option>}
          {activeMaps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="map-routes-title">Titre *</label>
        <input
          id="map-routes-title"
          value={draft.title}
          onChange={(e) => setField({ title: e.target.value })}
          placeholder="Ex : Portes ouvertes, Le tour en 10 minutes"
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="map-routes-audience">Public visé</label>
          <input
            id="map-routes-audience"
            value={draft.audience}
            onChange={(e) => setField({ audience: e.target.value })}
            placeholder="Ex : Nouveaux élèves"
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="map-routes-slug">Identifiant du lien</label>
          <input
            id="map-routes-slug"
            value={draft.slug}
            onChange={(e) => setField({ slug: e.target.value })}
            placeholder="laissé vide : dérivé du titre"
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="map-routes-sort">Ordre</label>
          <input
            id="map-routes-sort"
            type="number"
            value={draft.sort_order}
            onChange={(e) => setField({ sort_order: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="map-routes-description">Description</label>
        <textarea
          id="map-routes-description"
          rows={2}
          value={draft.description}
          onChange={(e) => setField({ description: e.target.value })}
          placeholder="Une phrase affichée en tête du parcours"
        />
      </div>

      <SurfaceVisibilityField
        mode="visible"
        idPrefix="map-route"
        legend="Proposé sur"
        value={draft.surfaces}
        onChange={(next) => setField({ surfaces: next })}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={draft.is_published}
          onChange={(e) => setField({ is_published: e.target.checked })}
          style={{ width: 18, height: 18 }}
        />
        Publié (un brouillon reste visible ici seulement)
      </label>

      <fieldset
        style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, marginTop: 12 }}
      >
        <legend style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
          Étapes ({(draft.steps || []).length} / {ROUTE_STEPS_MAX})
        </legend>

        <div className="field">
          <label htmlFor="map-routes-search">Ajouter un lieu</label>
          <input
            id="map-routes-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher une zone ou un repère…"
          />
        </div>
        {query.trim() && suggestions.length === 0 && (
          <p style={HINT_STYLE}>
            Aucun lieu ne correspond. Pensez aux <strong>alias de recherche</strong> sur la fiche du
            lieu.
          </p>
        )}
        {suggestions.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
            {suggestions.map((place) => (
              <li key={place.key} style={{ padding: '2px 0' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setSteps(addStep(draft.steps, place));
                    setQuery('');
                  }}
                >
                  + {place.name || '(sans nom)'}
                  <span style={{ color: 'var(--ink-soft)' }}>
                    {' '}
                    — {place.target_type === 'zone' ? 'zone' : 'repère'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {(draft.steps || []).length === 0 ? (
          <p style={HINT_STYLE}>Aucune étape : cherchez un lieu ci-dessus pour commencer.</p>
        ) : (
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {draft.steps.map((step, index) => (
              <li
                key={`${stepKey(step)}-${index}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(index)}
                onDragEnd={() => setDragIndex(-1)}
                style={{
                  padding: '6px 0',
                  borderTop: index === 0 ? 'none' : '1px solid #f1f5f9',
                  cursor: 'grab',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ flex: 1, minWidth: 0 }}>
                    {stepDisplayLabel(step, index, byKey)}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy || index === 0}
                    aria-label={`Monter l’étape ${index + 1}`}
                    onClick={() => setSteps(moveStep(draft.steps, index, index - 1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy || index === draft.steps.length - 1}
                    aria-label={`Descendre l’étape ${index + 1}`}
                    onClick={() => setSteps(moveStep(draft.steps, index, index + 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busy}
                    aria-label={`Retirer l’étape ${index + 1}`}
                    onClick={() => setSteps(removeStepAt(draft.steps, index))}
                  >
                    <IconDelete size={16} />
                  </button>
                </div>
                <div className="row" style={{ marginTop: 4 }}>
                  <input
                    style={{ flex: 1, minWidth: 0 }}
                    value={step.step_title}
                    aria-label={`Titre de l’étape ${index + 1}`}
                    placeholder="Titre propre (sinon le nom du lieu)"
                    onChange={(e) =>
                      setSteps(patchStepAt(draft.steps, index, { step_title: e.target.value }))
                    }
                  />
                  <input
                    style={{ flex: 2, minWidth: 0 }}
                    value={step.step_text}
                    aria-label={`Texte de l’étape ${index + 1}`}
                    placeholder="Une phrase lue sur place"
                    onChange={(e) =>
                      setSteps(patchStepAt(draft.steps, index, { step_text: e.target.value }))
                    }
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {editingId ? 'Enregistrer' : 'Créer le parcours'}
        </button>
        {editingId && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={resetDraft}>
            Annuler
          </button>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        {loading && <p style={HINT_STYLE}>Chargement…</p>}
        {!loading && routes.length === 0 && (
          <p style={HINT_STYLE}>Aucun parcours sur cette carte pour l’instant.</p>
        )}
        {routes.map((route) => (
          <div
            key={route.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{route.title}</strong>
              <div style={HINT_STYLE}>{routeSummaryLine(route)}</div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => {
                setEditingId(route.id);
                setDraft(routeDraftFrom(route));
                setQuery('');
              }}
            >
              Éditer
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => exportPdf(route)}
            >
              Affiche PDF
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              aria-label={`Supprimer le parcours ${route.title}`}
              title="Supprimer le parcours"
              onClick={() => remove(route)}
            >
              <IconDelete size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
