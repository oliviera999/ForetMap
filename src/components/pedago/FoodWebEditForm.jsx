import {
  EVIDENCE_LEVELS,
  INTERACTION_TYPES,
  POLLINATION_EFFICACIES,
  POLLINATION_TYPE,
  evidenceLevelLabel,
  interactionTypeLabel as interactionLabel,
  pollinationEfficacyLabel,
} from '../../shared/foodWebTypes.js';
import { SpeciesSelectOptions } from './FoodWebAdminForm.jsx';

/**
 * Modification d'une relation existante (professeur), sortie de `FoodWebView.jsx` (flux C3).
 * La source ne change pas : changer de source revient à créer une autre relation.
 */
export function FoodWebEditForm({
  editForm,
  setEditForm,
  sourceName,
  speciesOptions,
  editError,
  saving,
  onSubmit,
  onCancel,
}) {
  return (
    <form className="pedago-foodweb__edit" onSubmit={onSubmit}>
      <div className="pedago-foodweb__admin-fields">
        <label className="pedago-filter-field">
          <span>Type d&apos;interaction</span>
          <select
            className="form-select"
            value={editForm.type}
            onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
          >
            {INTERACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {interactionLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Espèce cible</span>
          <select
            className="form-select"
            value={editForm.toId}
            onChange={(e) => setEditForm((p) => ({ ...p, toId: e.target.value }))}
          >
            <option value="">— environnement / aucune —</option>
            <SpeciesSelectOptions species={speciesOptions} />
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Niveau de preuve</span>
          <select
            className="form-select"
            value={editForm.evidenceLevel}
            onChange={(e) => setEditForm((p) => ({ ...p, evidenceLevel: e.target.value }))}
          >
            {EVIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {evidenceLevelLabel(level)}
              </option>
            ))}
          </select>
        </label>
        {editForm.type === POLLINATION_TYPE ? (
          <label className="pedago-filter-field">
            <span>Efficacité du pollinisateur</span>
            <select
              className="form-select"
              value={editForm.pollinationEfficacy}
              onChange={(e) => setEditForm((p) => ({ ...p, pollinationEfficacy: e.target.value }))}
            >
              <option value="">— non précisée —</option>
              {POLLINATION_EFFICACIES.map((value) => (
                <option key={value} value={value}>
                  {pollinationEfficacyLabel(value)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="pedago-filter-field pedago-foodweb__admin-desc">
          <span>Description</span>
          <input
            type="text"
            className="form-input"
            maxLength={255}
            value={editForm.description}
            onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
          />
        </label>
        <label className="pedago-filter-field pedago-foodweb__admin-desc">
          <span>Source</span>
          <input
            type="text"
            className="form-input"
            maxLength={255}
            value={editForm.sourceRef}
            onChange={(e) => setEditForm((p) => ({ ...p, sourceRef: e.target.value }))}
          />
        </label>
      </div>
      <p className="section-sub pedago-foodweb__admin-hint">
        L&apos;espèce source reste <strong>{sourceName}</strong> : changer de source revient à créer
        une autre relation.
      </p>
      {editError ? <p className="pedago-error">{editError}</p> : null}
      <div className="pedago-foodweb__edit-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
