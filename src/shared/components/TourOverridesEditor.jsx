import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconWarning } from '../icons.jsx';

import { AutoSaveStatus } from './AutoSaveStatus.jsx';
import { useAppDialogs } from './AppDialogsProvider.jsx';
import { useDebouncedAutoSave } from '../hooks/useDebouncedAutoSave.js';
import { TOUR_EDITABLE_FIELDS } from '../tour/tourRegistryCore.js';

/**
 * Édition des **textes** de visites guidées — écran partagé ForetMap / G&L.
 *
 * Ne présente que du texte. La structure d'un parcours — cible, placement, rôle,
 * expression du narrateur — reste en code : elle n'est pas de l'éditorial, et une cible
 * saisie à la main est le moyen le plus simple de faire disparaître une étape sans aucun
 * message d'erreur.
 *
 * Le champ vide est le geste de retour au défaut : le texte versionné s'affiche en
 * filigrane, et rien n'est stocké tant que personne n'a réécrit.
 *
 * Le produit fournit ses **sections** (parcours et étapes), sa fonction de clé, ses
 * libellés de champ et sa plomberie réseau — le reste, état, autosave et rendu, est
 * commun.
 *
 * @param {object} props
 * @param {Array} props.sections            `[{ key, label, hint, steps }]`
 * @param {(tourKey, step, field) => string} props.overrideKey
 * @param {object} props.fieldLabels        libellé par champ éditable
 * @param {() => Promise<object>} props.loadRegistry
 * @param {(registry) => Promise<void>} props.saveRegistry
 * @param {(() => Promise<object>)|null} [props.resetRegistry] bouton « tout réinitialiser »
 * @param {number} [props.maxTextLength]
 * @param {string} [props.intro]            phrase d'introduction propre au produit
 */
export function TourOverridesEditor({
  sections,
  overrideKey,
  fieldLabels,
  loadRegistry,
  saveRegistry,
  resetRegistry = null,
  maxTextLength = 500,
  intro = '',
}) {
  const { confirm } = useAppDialogs();
  const [registry, setRegistry] = useState(null);
  const [section, setSection] = useState(sections[0]?.key || '');
  const [loadRevision, setLoadRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    setError('');
    const data = await loadRegistry();
    setRegistry(data && typeof data === 'object' ? data : {});
    setLoadRevision((value) => value + 1);
  }, [loadRegistry]);

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [load]);

  const persist = useCallback(async () => {
    if (!registry) return registry;
    await saveRegistry(registry);
    setInfo('Textes des visites guidées enregistrés.');
    return registry;
  }, [registry, saveRegistry]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: registry,
    resetKey: loadRevision,
    enabled: registry != null,
    onSave: persist,
  });

  /** Une valeur vide retire la clé : le parcours revient au texte versionné. */
  const setField = useCallback((key, value) => {
    setRegistry((prev) => {
      const next = { ...(prev || {}) };
      if (!value.trim()) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const rewrittenCount = useMemo(() => Object.keys(registry || {}).length, [registry]);

  async function resetDefaults() {
    if (
      !(await confirm({
        message: 'Effacer toutes les réécritures et revenir aux textes livrés avec l’application ?',
        confirmLabel: 'Effacer',
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await resetRegistry();
      setRegistry(data && typeof data === 'object' ? data : {});
      setLoadRevision((value) => value + 1);
      setInfo('Textes revenus aux valeurs livrées.');
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  if (error && !registry)
    return (
      <div className="auth-error">
        <IconWarning size={14} /> {error}
      </div>
    );
  if (!registry) {
    return (
      <div className="empty">
        <p>Chargement des visites guidées…</p>
      </div>
    );
  }

  const current = sections.find((entry) => entry.key === section) || sections[0];

  return (
    <div className="fade-in" data-tour-overrides-editor="">
      {intro ? <p className="section-sub">{intro}</p> : null}
      {error && (
        <div className="auth-error">
          <IconWarning size={14} /> {error}
        </div>
      )}
      {saveError && (
        <div className="auth-error">
          <IconWarning size={14} /> {saveError}
        </div>
      )}
      {info && <div className="auth-success">{info}</div>}

      <div className="fm-tour-editor__toolbar">
        <AutoSaveStatus status={saveStatus} />
        <div className="fm-tour-editor__toolbar-right">
          <span className="muted">
            {rewrittenCount === 0
              ? 'Aucun texte réécrit'
              : `${rewrittenCount} texte${rewrittenCount > 1 ? 's' : ''} réécrit${rewrittenCount > 1 ? 's' : ''}`}
          </span>
          {resetRegistry ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={resetDefaults}
              disabled={busy || rewrittenCount === 0}
            >
              Tout réinitialiser
            </button>
          ) : null}
        </div>
      </div>

      <nav className="gl-subtabs fm-tour-editor__sections">
        {sections.map((entry) => {
          const count = entry.steps.reduce(
            (total, step) =>
              total +
              TOUR_EDITABLE_FIELDS.filter((field) => registry[overrideKey(entry.key, step, field)])
                .length,
            0,
          );
          return (
            <button
              key={entry.key}
              type="button"
              className={section === entry.key ? 'is-active' : ''}
              onClick={() => setSection(entry.key)}
            >
              {entry.label}
              {count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </nav>

      {current?.hint ? <p className="section-sub">{current.hint}</p> : null}

      {(current?.steps || []).map((step) => (
        <fieldset key={step.key} className="fm-tour-editor__step">
          <legend>{step.title}</legend>
          {TOUR_EDITABLE_FIELDS.map((field) => {
            // La variante de service n'est proposée que là où le parcours en prévoit
            // une : en créer une ailleurs ferait apparaître un texte que personne n'a
            // décidé d'écrire.
            if (step[field] === undefined) return null;
            const key = overrideKey(current.key, step, field);
            const value = registry[key] || '';
            return (
              <label key={field} className="fm-tour-editor__field">
                <span>
                  {fieldLabels[field]}
                  {value ? ' · réécrit' : ''}
                </span>
                <textarea
                  value={value}
                  placeholder={step[field]}
                  rows={field === 'title' ? 1 : 3}
                  maxLength={maxTextLength}
                  onChange={(event) => setField(key, event.target.value)}
                />
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

export default TourOverridesEditor;
