import { Button } from '../../shared/ui/Button.jsx';
import { NOTION_NIVEAU_FILTER_OPTIONS } from '../../utils/curriculumNotions.js';

export const STEP_ACTION_LABELS = Object.freeze({
  message: 'Consigne (texte seul)',
  open_id_key: 'Clé d’identification',
  open_plant: 'Fiche espèce',
  open_foodweb: 'Réseau trophique',
  open_quiz: 'Mini-quiz',
  open_glossary: 'Terme du glossaire',
  open_individual: 'Arbre suivi',
  open_nested_groups: 'Boîtes emboîtées',
  open_map_route: 'Parcours sur la carte',
});

const MAX_STEPS = 40;
const MAX_NESTED_PLANTS = 6;

export function newStep(index = 0) {
  return {
    id: `s${Date.now().toString(36)}${index}`,
    title: '',
    body: '',
    action: { type: 'message', payload: {} },
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

function PayloadFields({ step, onPayload, plantOptions, idKeys, individuals, mapRoutes }) {
  const type = step.action?.type;
  const payload = step.action?.payload || {};
  if (type === 'open_id_key') {
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
  if (type === 'open_plant' || type === 'open_foodweb') {
    const key = type === 'open_plant' ? 'plantId' : 'highlightPlantId';
    return (
      <label className="form-field">
        <span>{type === 'open_plant' ? 'Espèce' : 'Espèce mise en avant (optionnel)'}</span>
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
  }
  if (type === 'open_quiz') {
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
  if (type === 'open_glossary') {
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
  if (type === 'open_individual') {
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
  if (type === 'open_nested_groups') {
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
  if (type === 'open_map_route') {
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
                value={step.action?.type || 'message'}
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
