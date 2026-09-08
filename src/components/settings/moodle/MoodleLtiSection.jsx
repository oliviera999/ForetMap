import { useEffect, useState } from 'react';
import { moodleAdminApi } from '../../../services/moodleAdminApi.js';

export const LTI_SETTING_KEYS = Object.freeze({
  enabled: 'integration.lti.enabled',
  unknownUser: 'integration.lti.unknown_user',
  publicOrigin: 'integration.lti.public_origin',
  instructorTargets: 'integration.lti.instructor_targets',
  launchBindings: 'integration.lti.launch_bindings',
  landingOptions: 'integration.lti.landing_options',
});

const PRODUCTS = [
  { id: 'fm', label: 'ForetMap' },
  { id: 'gl', label: 'Gnomes & Licornes' },
  { id: 'both', label: 'Les deux' },
];

const LANDINGS = [
  { id: 'aiguillage', label: 'Aiguillage' },
  { id: 'fm_map', label: 'Carte ForetMap' },
  { id: 'fm_tasks', label: 'Tâches ForetMap' },
  { id: 'gl_game', label: 'Partie G&L' },
  { id: 'gl_home', label: 'Accueil G&L' },
];

function emptyBinding() {
  return {
    moodle_course_id: '',
    product: 'gl',
    gl_chapter_id: '',
    landing: 'aiguillage',
    label: '',
  };
}

const EMPTY_BINDINGS = [];

/**
 * Sous-section « Entrée depuis le cours » (LTI) de l'onglet Moodle.
 */
export function MoodleLtiSection({
  get,
  saveSetting,
  savingKey,
  courses = [],
  onMessage,
  onError,
}) {
  const [suggesting, setSuggesting] = useState(null);
  const stored = get(LTI_SETTING_KEYS.launchBindings, EMPTY_BINDINGS);
  const storedBindings = Array.isArray(stored) ? stored : EMPTY_BINDINGS;
  const [bindings, setBindings] = useState(storedBindings);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setBindings(storedBindings);
  }, [storedBindings, dirty]);

  const enabled = Boolean(get(LTI_SETTING_KEYS.enabled, false));
  const unknownUser = get(LTI_SETTING_KEYS.unknownUser, 'refuse') || 'refuse';
  const publicOrigin = get(LTI_SETTING_KEYS.publicOrigin, '') || '';
  const targets = Array.isArray(get(LTI_SETTING_KEYS.instructorTargets, ['fm', 'gl']))
    ? get(LTI_SETTING_KEYS.instructorTargets, ['fm', 'gl'])
    : ['fm', 'gl'];

  const courseName = (id) => {
    const row = (courses || []).find((c) => Number(c.courseId) === Number(id));
    return row?.courseName || '';
  };

  const update = (index, patch) => {
    setDirty(true);
    setBindings((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const suggest = async (index, courseId) => {
    if (!courseId) return;
    setSuggesting(index);
    try {
      const result = await moodleAdminApi.ltiSuggest(courseId);
      if (result.product) {
        update(index, {
          product: result.product,
          landing: result.product === 'both' ? 'aiguillage' : bindings[index]?.landing,
        });
        onMessage?.(result.reason || 'Suggestion appliquée');
      } else {
        onMessage?.(result.reason || 'Aucune suggestion');
      }
    } catch (error) {
      onError?.(error?.message || 'Suggestion impossible');
    } finally {
      setSuggesting(null);
    }
  };

  return (
    <div className="moodle-lti" data-testid="moodle-lti">
      <p className="section-sub" style={{ marginTop: 0 }}>
        Un élève <strong>déjà connu</strong> clique une activité du cours Moodle et arrive connecté
        dans ForetMap ou Gnomes &amp; Licornes (nouvel onglet). Personne inconnue : refus, jamais de
        création de compte. Les notes ne sont pas renvoyées.
      </p>
      <label className="moodle-check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={savingKey === LTI_SETTING_KEYS.enabled}
          onChange={(e) =>
            saveSetting(
              LTI_SETTING_KEYS.enabled,
              e.target.checked,
              e.target.checked
                ? 'Entrée depuis le cours activée'
                : 'Entrée depuis le cours désactivée',
            )
          }
        />
        Activer l’entrée depuis le cours
      </label>
      <fieldset className="moodle-lti-unknown">
        <legend>Personne absente de l’annuaire</legend>
        <label>
          <input
            type="radio"
            name="lti-unknown"
            checked={unknownUser === 'refuse'}
            onChange={() =>
              saveSetting(LTI_SETTING_KEYS.unknownUser, 'refuse', 'Refus des inconnus')
            }
          />
          Refuser (recommandé)
        </label>
        <label>
          <input
            type="radio"
            name="lti-unknown"
            checked={unknownUser === 'queue'}
            onChange={() =>
              saveSetting(LTI_SETTING_KEYS.unknownUser, 'queue', 'File d’attente (réservé)')
            }
          />
          Mettre en file (réservé, même refus pour l’instant)
        </label>
      </fieldset>
      <div className="field" style={{ maxWidth: 480 }}>
        <label htmlFor="lti-public-origin">
          Adresse publique de ForetMap (vide = celle de la requête)
        </label>
        <input
          id="lti-public-origin"
          type="url"
          defaultValue={publicOrigin}
          key={`po-${publicOrigin}`}
          disabled={savingKey === LTI_SETTING_KEYS.publicOrigin}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== publicOrigin) {
              saveSetting(LTI_SETTING_KEYS.publicOrigin, next, 'Adresse publique enregistrée');
            }
          }}
        />
      </div>
      <fieldset className="moodle-lti-targets">
        <legend>Boutons proposés à un enseignant à chaque lancement</legend>
        {['fm', 'gl'].map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={targets.includes(t)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...new Set([...targets, t])]
                  : targets.filter((x) => x !== t);
                if (!next.length) return;
                saveSetting(
                  LTI_SETTING_KEYS.instructorTargets,
                  next,
                  'Cibles enseignant enregistrées',
                );
              }}
            />
            {t === 'fm' ? 'ForetMap (prof)' : 'Gnomes & Licornes (MJ)'}
          </label>
        ))}
      </fieldset>
      <h3 className="moodle-lti-h">Liaisons cours → application</h3>
      <div className="moodle-table-wrap">
        <table className="moodle-table">
          <thead>
            <tr>
              <th>Cours Moodle</th>
              <th>Nom</th>
              <th>Produit</th>
              <th>Chapitre G&amp;L</th>
              <th>Arrivée</th>
              <th>Libellé</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bindings.map((b, i) => (
              <tr key={`${b.moodle_course_id}-${i}`}>
                <td>
                  <input
                    aria-label={`Identifiant du cours, ligne ${i + 1}`}
                    type="number"
                    min={1}
                    value={b.moodle_course_id || ''}
                    onChange={(e) => update(i, { moodle_course_id: Number(e.target.value) || '' })}
                  />
                </td>
                <td>{courseName(b.moodle_course_id) || '—'}</td>
                <td>
                  <select
                    aria-label={`Produit, ligne ${i + 1}`}
                    value={b.product || 'gl'}
                    onChange={(e) => {
                      const product = e.target.value;
                      update(i, {
                        product,
                        landing: product === 'both' ? 'aiguillage' : bindings[i].landing,
                      });
                    }}
                  >
                    {PRODUCTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Chapitre G&L, ligne ${i + 1}`}
                    type="number"
                    min={1}
                    disabled={b.product === 'fm'}
                    value={b.gl_chapter_id || ''}
                    onChange={(e) =>
                      update(i, { gl_chapter_id: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </td>
                <td>
                  <select
                    aria-label={`Arrivée, ligne ${i + 1}`}
                    value={b.landing || 'aiguillage'}
                    disabled={b.product === 'both'}
                    onChange={(e) => update(i, { landing: e.target.value })}
                  >
                    {LANDINGS.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Libellé, ligne ${i + 1}`}
                    type="text"
                    maxLength={120}
                    value={b.label || ''}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={suggesting === i || !b.moodle_course_id}
                    onClick={() => suggest(i, b.moodle_course_id)}
                  >
                    Suggérer
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setDirty(true);
                      setBindings((prev) => prev.filter((_, j) => j !== i));
                    }}
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="moodle-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            setDirty(true);
            setBindings((prev) => [...prev, emptyBinding()]);
          }}
        >
          Ajouter une liaison
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!dirty || savingKey === LTI_SETTING_KEYS.launchBindings}
          onClick={async () => {
            await saveSetting(
              LTI_SETTING_KEYS.launchBindings,
              bindings,
              'Liaisons d’entrée enregistrées',
            );
            setDirty(false);
          }}
        >
          Enregistrer les liaisons
        </button>
      </div>
    </div>
  );
}
