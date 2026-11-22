import {
  EVIDENCE_LEVELS,
  POLLINATION_EFFICACIES,
  POLLINATION_TYPE,
  evidenceLevelLabel,
  interactionTypeLabel as interactionLabel,
  pollinationEfficacyLabel,
} from '../../shared/foodWebTypes.js';
import { IconAdd } from '../../shared/icons.jsx';

/** Liste déroulante d'espèces (formulaires de gestion). */
export function SpeciesSelectOptions({ species }) {
  return species.map((s) => (
    <option key={s.id} value={s.id}>
      {s.emoji ? `${s.emoji} ` : ''}
      {s.name}
    </option>
  ));
}

/**
 * Formulaire d'ajout d'une interaction (professeur), sorti de `FoodWebView.jsx` (flux C3).
 * Les types proposés sont ceux du profil (`allowedTypes`), avec leur libellé savant : c'est
 * un écran de gestion.
 */
export function FoodWebAdminForm({
  showTitle = true,
  form,
  setForm,
  speciesOptions,
  allowedTypes,
  showAdvanced,
  showPollinationEfficacy,
  adminError,
  saving,
  onSubmit,
}) {
  return (
    <form
      className={showTitle ? 'card pedago-foodweb__admin' : 'pedago-foodweb__admin'}
      onSubmit={onSubmit}
    >
      {showTitle ? (
        <h3 className="pedago-panel-title">
          <IconAdd size={16} /> Ajouter une interaction
        </h3>
      ) : null}
      <div className="pedago-foodweb__admin-fields">
        <label className="pedago-filter-field">
          <span>Espèce source</span>
          <select
            className="form-select"
            value={form.fromId}
            onChange={(e) => setForm((p) => ({ ...p, fromId: e.target.value }))}
            required
          >
            <option value="">— choisir —</option>
            <SpeciesSelectOptions species={speciesOptions} />
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Type d&apos;interaction</span>
          <select
            className="form-select"
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
          >
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {interactionLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Espèce cible (optionnel)</span>
          <select
            className="form-select"
            value={form.toId}
            onChange={(e) => setForm((p) => ({ ...p, toId: e.target.value }))}
          >
            <option value="">— environnement / aucune —</option>
            <SpeciesSelectOptions species={speciesOptions} />
          </select>
        </label>
        {showAdvanced ? (
          <label className="pedago-filter-field">
            <span>Niveau de preuve</span>
            <select
              className="form-select"
              value={form.evidenceLevel}
              onChange={(e) => setForm((p) => ({ ...p, evidenceLevel: e.target.value }))}
            >
              {EVIDENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {evidenceLevelLabel(level)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showPollinationEfficacy && form.type === POLLINATION_TYPE ? (
          <label className="pedago-filter-field">
            <span>Efficacité du pollinisateur (optionnel)</span>
            <select
              className="form-select"
              value={form.pollinationEfficacy}
              onChange={(e) => setForm((p) => ({ ...p, pollinationEfficacy: e.target.value }))}
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
          <span>Description (optionnel)</span>
          <input
            type="text"
            className="form-input"
            maxLength={255}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Ex. Transport du pollen entre fleurs"
          />
        </label>
        <label className="pedago-filter-field pedago-foodweb__admin-desc">
          <span>Source (optionnel)</span>
          <input
            type="text"
            className="form-input"
            maxLength={255}
            value={form.sourceRef}
            onChange={(e) => setForm((p) => ({ ...p, sourceRef: e.target.value }))}
            placeholder="Ouvrage, article ou lien à l’appui"
          />
        </label>
      </div>
      <p className="section-sub pedago-foodweb__admin-hint">
        Saisis la <strong>source</strong> = l&apos;espèce qui agit (pour la prédation/herbivorie, le{' '}
        <em>consommateur</em>) et la <strong>cible</strong> = l&apos;espèce subissant l&apos;action
        (la proie / ressource). L&apos;affichage inverse automatiquement la flèche dans le sens
        écologique «&nbsp;est mangée par&nbsp;».
      </p>
      <p className="section-sub pedago-foodweb__admin-hint">
        Le <strong>niveau de preuve</strong> dit d&apos;où vient l&apos;information : une hypothèse
        est tracée en pointillé, une relation <em>observée sur le site</em> en trait renforcé. Une
        relation documentée gagne à porter sa <strong>source</strong>.
      </p>
      {adminError ? <p className="pedago-error">{adminError}</p> : null}
      <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
        {saving ? 'Enregistrement…' : 'Ajouter'}
      </button>
    </form>
  );
}
