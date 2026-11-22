import { Button } from '../../shared/ui/Button.jsx';
import { IconClose } from '../../shared/icons.jsx';
import { NOTION_NIVEAU_FILTER_OPTIONS } from '../../utils/curriculumNotions.js';
import {
  FOODWEB_STEP_MAX_PLANT_IDS,
  PEDAGO_STEP_ACTION as A,
  PEDAGO_STEP_ACTION_ENUM,
} from '../../shared/enums/pedagoStepActions.js';

/** Libellés du menu « Outil ouvert » : source unique des actions d'étape. */
export const STEP_ACTION_LABELS = PEDAGO_STEP_ACTION_ENUM.labels;

const MAX_STEPS = 40;
const MAX_NESTED_PLANTS = 6;

export function newStep(index = 0) {
  return {
    id: `s${Date.now().toString(36)}${index}`,
    title: '',
    body: '',
    action: { type: A.MESSAGE, payload: {} },
    completeWhen: 'manual',
  };
}

/** Déplace l'étape `index` de `delta` positions (bornes respectées). */
export function moveStep(steps, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/**
 * Espèces montrées par une étape « réseau trophique » (`plantIds`, chantier collège, flux
 * C3) : l'élève voit ces espèces et leurs liens mutuels. Liste de puces retirables et un menu
 * pour en ajouter une, jusqu'à `FOODWEB_STEP_MAX_PLANT_IDS`.
 */
function FoodWebStepPlantsField({ plantIds, plantOptions, onChange }) {
  const selected = (Array.isArray(plantIds) ? plantIds : []).map(Number);
  const labelOf = (id) => plantOptions.find((p) => Number(p.id) === id)?.label || `Espèce ${id}`;
  const full = selected.length >= FOODWEB_STEP_MAX_PLANT_IDS;
  return (
    <fieldset className="form-field">
      <legend>Espèces montrées ensemble (optionnel, {FOODWEB_STEP_MAX_PLANT_IDS} au plus)</legend>
      {selected.length > 0 ? (
        <ul className="pedago-chip-row" aria-label="Espèces montrées">
          {selected.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="pedago-chip-btn"
                aria-label={`Retirer ${labelOf(id)}`}
                onClick={() => onChange(selected.filter((x) => x !== id))}
              >
                {labelOf(id)} <IconClose size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <select
        aria-label="Ajouter une espèce montrée"
        value=""
        disabled={full}
        onChange={(e) => {
          const id = Number(e.target.value);
          if (Number.isInteger(id) && id > 0 && !selected.includes(id)) {
            onChange([...selected, id]);
          }
        }}
      >
        <option value="">{full ? '— liste complète —' : '— ajouter une espèce —'}</option>
        {plantOptions
          .filter((p) => !selected.includes(Number(p.id)))
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
      </select>
    </fieldset>
  );
}

function PayloadFields({
  step,
  onPayload,
  plantOptions,
  idKeys,
  individuals,
  mapRoutes,
  tutorials,
}) {
  const type = step.action?.type;
  const payload = step.action?.payload || {};
  if (type === A.OPEN_ID_KEY) {
    return (
      <label className="form-field">
        <span>Clé</span>
        <select
          value={payload.keyIdOrSlug || ''}
          onChange={(e) => onPayload({ keyIdOrSlug: e.target.value || null })}
        >
          <option value="">— à choisir en séance —</option>
          {idKeys.map((k) => (
            <option key={k.id} value={k.slug || String(k.id)}>
              {k.title}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (type === A.OPEN_PLANT || type === A.OPEN_FOODWEB) {
    const key = type === A.OPEN_PLANT ? 'plantId' : 'highlightPlantId';
    const highlightField = (
      <label className="form-field">
        <span>{type === A.OPEN_PLANT ? 'Espèce' : 'Espèce mise en avant (optionnel)'}</span>
        <select
          value={payload[key] != null ? String(payload[key]) : ''}
          onChange={(e) => onPayload({ [key]: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">— aucune —</option>
          {plantOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    );
    if (type === A.OPEN_PLANT) return highlightField;
    return (
      <>
        {highlightField}
        <FoodWebStepPlantsField
          plantIds={payload.plantIds}
          plantOptions={plantOptions}
          onChange={(ids) => onPayload({ plantIds: ids })}
        />
      </>
    );
  }
  if (type === A.OPEN_QUIZ) {
    return (
      <>
        <label className="form-field">
          <span>Niveau de notion</span>
          <select
            value={payload.notionNiveau || ''}
            onChange={(e) => onPayload({ notionNiveau: e.target.value || null })}
          >
            <option value="">— libre —</option>
            {NOTION_NIVEAU_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Code question fixe (optionnel)</span>
          <input
            value={payload.questionCode || ''}
            onChange={(e) => onPayload({ questionCode: e.target.value.trim() || null })}
            placeholder="QF0001"
          />
        </label>
      </>
    );
  }
  if (type === A.OPEN_GLOSSARY) {
    return (
      <label className="form-field">
        <span>Code du terme</span>
        <input
          value={payload.termCode || ''}
          onChange={(e) => onPayload({ termCode: e.target.value.trim() || null })}
        />
      </label>
    );
  }
  if (type === A.OPEN_INDIVIDUAL) {
    return (
      <label className="form-field">
        <span>Arbre suivi</span>
        <select
          value={payload.individualId != null ? String(payload.individualId) : ''}
          onChange={(e) =>
            onPayload({ individualId: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">— à choisir en séance —</option>
          {individuals.map((it) => (
            <option key={it.id} value={String(it.id)}>
              {it.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (type === A.OPEN_NESTED_GROUPS) {
    const selected = (Array.isArray(payload.plantIds) ? payload.plantIds : []).map(String);
    return (
      <fieldset className="form-field">
        <legend>Espèces à classer (2 à {MAX_NESTED_PLANTS})</legend>
        {Array.from({ length: MAX_NESTED_PLANTS }, (_, idx) => (
          <select
            key={idx}
            aria-label={`Espèce ${idx + 1}`}
            value={selected[idx] || ''}
            onChange={(e) => {
              const next = [...selected];
              next[idx] = e.target.value;
              onPayload({
                plantIds: next.map(Number).filter((n) => Number.isInteger(n) && n > 0),
              });
            }}
          >
            <option value="">— espèce {idx + 1} —</option>
            {plantOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        ))}
      </fieldset>
    );
  }
  if (type === A.OPEN_FRESQUE) {
    return (
      <label className="form-field">
        <span>Jeu de cartes (identifiant, vide = jeu unique)</span>
        <input
          value={payload.deckId || ''}
          onChange={(e) => onPayload({ deckId: e.target.value.trim() || null })}
          placeholder="climat-junior-fr-v7-5"
        />
      </label>
    );
  }
  if (type === A.OPEN_TUTORIAL) {
    const current = payload.tutorialId != null ? String(payload.tutorialId) : '';
    // Tutoriel désactivé depuis : il reste affiché, le serveur le refusera à l'enregistrement.
    const known = tutorials.some((t) => String(t.id) === current);
    return (
      <label className="form-field">
        <span>Tutoriel</span>
        <select
          value={current}
          onChange={(e) =>
            onPayload({ tutorialId: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">— choisir —</option>
          {current && !known ? (
            <option value={current}>Tutoriel n° {current} (indisponible)</option>
          ) : null}
          {tutorials.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (type === A.OPEN_MAP_ROUTE) {
    return (
      <label className="form-field">
        <span>Parcours</span>
        {mapRoutes.length ? (
          <select
            value={payload.routeSlug || ''}
            onChange={(e) => onPayload({ routeSlug: e.target.value || null })}
          >
            <option value="">— choisir —</option>
            {mapRoutes.map((r) => (
              <option key={r.id} value={r.slug}>
                {r.title || r.slug}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={payload.routeSlug || ''}
            onChange={(e) => onPayload({ routeSlug: e.target.value.trim() || null })}
            placeholder="identifiant du parcours (choisis d’abord une carte)"
          />
        )}
      </label>
    );
  }
  return null;
}

/** Éditeur d'étapes d'une séance libre : ajout, réordonnancement, suppression, cible. */
export function SessionStepEditor({
  steps,
  onChange,
  plantOptions = [],
  idKeys = [],
  individuals = [],
  mapRoutes = [],
  tutorials = [],
}) {
  const update = (index, patch) =>
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <fieldset className="form-field pedago-step-editor" data-testid="pedago-step-editor">
      <legend>Étapes</legend>
      <ol className="pedago-step-editor__list">
        {steps.map((step, index) => (
          <li key={step.id} className="pedago-step-editor__item card">
            <div className="pedago-step-editor__head">
              <strong>Étape {index + 1}</strong>
              <div className="pedago-step-editor__tools">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChange(moveStep(steps, index, -1))}
                  disabled={index === 0}
                  aria-label={`Monter l’étape ${index + 1}`}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChange(moveStep(steps, index, 1))}
                  disabled={index === steps.length - 1}
                  aria-label={`Descendre l’étape ${index + 1}`}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => onChange(steps.filter((_, i) => i !== index))}
                  disabled={steps.length <= 1}
                  aria-label={`Supprimer l’étape ${index + 1}`}
                >
                  ✕
                </Button>
              </div>
            </div>
            <label className="form-field">
              <span>Titre</span>
              <input
                value={step.title}
                maxLength={180}
                onChange={(e) => update(index, { title: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Consigne</span>
              <textarea
                rows={3}
                value={step.body}
                maxLength={4000}
                onChange={(e) => update(index, { body: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Outil ouvert</span>
              <select
                value={step.action?.type || A.MESSAGE}
                onChange={(e) => update(index, { action: { type: e.target.value, payload: {} } })}
              >
                {Object.entries(STEP_ACTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <PayloadFields
              step={step}
              plantOptions={plantOptions}
              idKeys={idKeys}
              individuals={individuals}
              mapRoutes={mapRoutes}
              tutorials={tutorials}
              onPayload={(patch) =>
                update(index, {
                  action: {
                    ...step.action,
                    payload: { ...(step.action?.payload || {}), ...patch },
                  },
                })
              }
            />
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...steps, newStep(steps.length)])}
        disabled={steps.length >= MAX_STEPS}
      >
        Ajouter une étape
      </Button>
    </fieldset>
  );
}
