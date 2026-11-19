import { useEffect, useState } from 'react';
import { PERIOD_PRESETS, presetRange } from './auditFormat.js';

const RESULT_OPTIONS = Object.freeze([
  { id: '', label: 'Tous' },
  { id: 'success', label: 'Réussis' },
  { id: 'failure', label: 'Échecs' },
]);

/**
 * Bascule « Principaux / Vue étendue » : la vue principale masque la routine (connexions
 * réussies, inscriptions aux tâches, réactions…) mais garde TOUS les échecs.
 */
export function AuditModeToggle({ mode, onChange }) {
  return (
    <div className="fm-subtabs audit-mode-toggle" role="radiogroup" aria-label="Niveau de détail">
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'main'}
        className={mode === 'main' ? 'is-active' : undefined}
        onClick={() => onChange('main')}
        title="Événements importants : sécurité, droits, suppressions, validations, échecs…"
      >
        Principaux
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'all'}
        className={mode === 'all' ? 'is-active' : undefined}
        onClick={() => onChange('all')}
        title="Tous les événements, routine comprise, avec les détails techniques"
      >
        Vue étendue
      </button>
    </div>
  );
}

/**
 * Barre de filtres partagée. Les listes déroulantes, dates et raccourcis s'appliquent
 * immédiatement ; les champs texte au clic sur « Filtrer » (ou Entrée), pour ne pas lancer
 * une requête par frappe.
 *
 * @param {{ filters: object, onChange: (patch: object) => void, onReset: () => void,
 *   categories: {id: string, label: string}[], showIp?: boolean, hide?: string[],
 *   actorChipLabel?: string, extraSelects?: import('react').ReactNode,
 *   actions?: import('react').ReactNode }} props
 */
export function AuditFiltersBar({
  filters,
  onChange,
  onReset,
  categories = [],
  showIp = false,
  hide = [],
  actorChipLabel = '',
  extraSelects = null,
  actions = null,
}) {
  const [draft, setDraft] = useState({
    actorQuery: filters.actorQuery || '',
    q: filters.q || '',
    action: filters.action || '',
    ip: filters.ip || '',
  });

  // Une réinitialisation (ou une navigation) vide aussi les champs texte.
  useEffect(() => {
    setDraft({
      actorQuery: filters.actorQuery || '',
      q: filters.q || '',
      action: filters.action || '',
      ip: filters.ip || '',
    });
  }, [filters.actorQuery, filters.q, filters.action, filters.ip]);

  const hidden = (field) => hide.includes(field);
  const setDraftField = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const extended = filters.mode === 'all';
  // Sans champ texte visible, « Filtrer » n'a rien à appliquer : on ne l'affiche pas.
  const hasTextFields =
    !hidden('actor') ||
    !hidden('q') ||
    (extended && !hidden('action')) ||
    (showIp && !hidden('ip'));
  const activePreset = PERIOD_PRESETS.find((p) => {
    const r = presetRange(p.days);
    return r.from === filters.from && r.to === filters.to;
  });

  return (
    <form
      className="fm-panel audit-filters"
      onSubmit={(e) => {
        e.preventDefault();
        onChange({
          actorQuery: draft.actorQuery.trim(),
          q: draft.q.trim(),
          action: draft.action.trim(),
          ip: draft.ip.trim(),
        });
      }}
    >
      <div className="audit-filters-top">
        {hidden('mode') ? null : (
          <AuditModeToggle mode={filters.mode} onChange={(mode) => onChange({ mode })} />
        )}
        {hidden('period') ? null : (
          <div className="audit-presets" role="group" aria-label="Période rapide">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`audit-chip${activePreset?.id === p.id ? ' is-active' : ''}`}
                aria-pressed={activePreset?.id === p.id}
                onClick={() => onChange(presetRange(p.days))}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {actorChipLabel ? (
        <div className="audit-active-chips">
          <span className="audit-chip is-active">
            Compte : {actorChipLabel}
            <button
              type="button"
              className="audit-chip-close"
              aria-label="Retirer le filtre de compte"
              onClick={() => onChange({ actorUserId: '' })}
            >
              ×
            </button>
          </span>
        </div>
      ) : null}

      <div className="audit-filters-grid">
        {hidden('period') ? null : (
          <>
            <label className="audit-field">
              Du
              <input
                type="date"
                className="input"
                value={filters.from}
                onChange={(e) => onChange({ from: e.target.value })}
              />
            </label>
            <label className="audit-field">
              Au
              <input
                type="date"
                className="input"
                value={filters.to}
                onChange={(e) => onChange({ to: e.target.value })}
              />
            </label>
          </>
        )}
        {hidden('category') ? null : (
          <label className="audit-field">
            Catégorie
            <select
              className="input"
              value={filters.category || ''}
              onChange={(e) => onChange({ category: e.target.value })}
            >
              <option value="">Toutes</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {hidden('result') ? null : (
          <label className="audit-field">
            Résultat
            <select
              className="input"
              value={filters.result || ''}
              onChange={(e) => onChange({ result: e.target.value })}
            >
              {RESULT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {extraSelects}
        {hidden('actor') ? null : (
          <label className="audit-field">
            Utilisateur
            <input
              type="search"
              className="input"
              value={draft.actorQuery}
              onChange={setDraftField('actorQuery')}
              placeholder="nom, prénom ou pseudo"
              autoComplete="off"
            />
          </label>
        )}
        {hidden('q') ? null : (
          <label className="audit-field">
            Recherche
            <input
              type="search"
              className="input"
              value={draft.q}
              onChange={setDraftField('q')}
              placeholder="détail, motif, identifiant…"
              autoComplete="off"
            />
          </label>
        )}
        {extended && !hidden('action') ? (
          <label className="audit-field">
            Code d’action
            <input
              type="text"
              className="input"
              value={draft.action}
              onChange={setDraftField('action')}
              placeholder="préfixe, ex. auth.login"
              autoComplete="off"
            />
          </label>
        ) : null}
        {showIp && !hidden('ip') ? (
          <label className="audit-field">
            Adresse IP
            <input
              type="text"
              className="input"
              value={draft.ip}
              onChange={setDraftField('ip')}
              placeholder="préfixe IP"
              autoComplete="off"
            />
          </label>
        ) : null}
      </div>

      <div className="audit-filters-actions">
        {hasTextFields ? (
          <button type="submit" className="btn btn-sm">
            Filtrer
          </button>
        ) : null}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onReset}>
          Réinitialiser
        </button>
        {actions}
      </div>
    </form>
  );
}
