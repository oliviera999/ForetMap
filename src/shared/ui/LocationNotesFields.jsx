/**
 * Compléments réservés **multiples** d'un lieu — édition (migration 263).
 * Miroir de `lib/locationNotes.js` (mêmes plafonds) et de `lib/locationAudience.js`
 * (mêmes slugs). Même forme que `LocationLinksFields`, dont c'est le pendant pour du texte.
 *
 * Une différence de sens, qui vaut d'être lue avant de toucher au repli par défaut : ici
 * **aucune case cochée = encadrement** (prof de classe, n3boss, administrateur), alors qu'un
 * lien sans audience suit le lieu. Un complément est confidentiel par nature ; l'ouvrir par
 * défaut serait exactement l'inverse de ce qu'on attend de lui.
 */
import {
  FORETMAP_AUDIENCE_ROLE_OPTIONS,
  LOCATION_NOTE_DEFAULT_ROLE_SLUGS,
  normalizeAudienceGroupList,
  normalizeAudienceRoleList,
} from './LocationAudienceFields.jsx';

/** Miroirs de `LOCATION_NOTES_MAX` / `NOTE_TITLE_MAX_LENGTH` (`lib/locationNotes.js`). */
export const LOCATION_NOTES_MAX = 6;
export const LOCATION_NOTE_TITLE_MAX = 160;

/**
 * Libellé de l'audience appliquée sans case cochée. Dérivé des slugs par défaut plutôt
 * qu'écrit à la main : renommer un rôle ne doit pas laisser ici une liste périmée.
 */
const DEFAULT_AUDIENCE_LABEL = FORETMAP_AUDIENCE_ROLE_OPTIONS.filter((r) =>
  LOCATION_NOTE_DEFAULT_ROLE_SLUGS.includes(r.slug),
)
  .map((r) => r.label)
  .join(', ');

function emptyNote() {
  return { title: '', body: '', audience_role_slugs: [], audience_group_ids: [] };
}

/** Résumé lisible de l'audience d'un complément, affiché sur le repli. */
export function noteAudienceSummary(roles, groups, groupOptions) {
  if (roles.length === 0 && groups.length === 0) return DEFAULT_AUDIENCE_LABEL;
  const roleLabels = FORETMAP_AUDIENCE_ROLE_OPTIONS.filter((r) => roles.includes(r.slug)).map(
    (r) => r.label,
  );
  const byId = new Map(
    (Array.isArray(groupOptions) ? groupOptions : []).map((g) => [String(g?.id ?? ''), g]),
  );
  const groupLabels = groups.map((id) => String(byId.get(id)?.name || byId.get(id)?.slug || id));
  return [...roleLabels, ...groupLabels].join(', ');
}

/** Valeur d'API → liste éditable, toujours un tableau. */
export function normalizeLocationNotesForForm(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, LOCATION_NOTES_MAX).map((note) => ({
    title: String(note?.title ?? ''),
    body: String(note?.body ?? ''),
    audience_role_slugs: normalizeAudienceRoleList(note?.audience_role_slugs),
    audience_group_ids: normalizeAudienceGroupList(note?.audience_group_ids),
  }));
}

/**
 * Liste éditable → charge d'API. Les lignes entièrement vides sont ignorées : ajouter un
 * complément puis changer d'avis ne doit pas faire échouer l'enregistrement du lieu.
 */
export function buildLocationNotesPayload(notes) {
  if (!Array.isArray(notes)) return [];
  return notes
    .map((note) => ({
      title: String(note?.title ?? '').trim(),
      body: String(note?.body ?? '').trim(),
      audience_role_slugs: normalizeAudienceRoleList(note?.audience_role_slugs),
      audience_group_ids: normalizeAudienceGroupList(note?.audience_group_ids),
    }))
    .filter((note) => note.body);
}

/** Message d'erreur d'une ligne, ou `''` si elle est bonne (ou entièrement vide). */
export function locationNoteRowError(note) {
  const title = String(note?.title ?? '').trim();
  const body = String(note?.body ?? '').trim();
  if (!title && !body) return '';
  if (!body) return 'Texte requis (un intitulé seul ne sera pas enregistré).';
  if (title.length > LOCATION_NOTE_TITLE_MAX) {
    return `Intitulé : ${LOCATION_NOTE_TITLE_MAX} caractères maximum.`;
  }
  return '';
}

export function LocationNotesFields({
  notes,
  onChange,
  idPrefix = 'notes',
  disabled = false,
  groupOptions = [],
  NoteEditor = null,
}) {
  // Éditeur injecté (ForetMap passe `MarkdownTextarea`) : `src/shared/**` ne peut pas importer
  // de code produit. Sans injection, textarea nu.
  const BodyEditor = NoteEditor || 'textarea';
  const list = Array.isArray(notes) ? notes : [];
  const atMax = list.length >= LOCATION_NOTES_MAX;

  const update = (index, patch) =>
    onChange?.(list.map((note, i) => (i === index ? { ...note, ...patch } : note)));
  const remove = (index) => onChange?.(list.filter((_, i) => i !== index));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = list.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange?.(next);
  };
  const toggleRole = (index, slug, checked) => {
    const current = normalizeAudienceRoleList(list[index]?.audience_role_slugs);
    const set = new Set(current);
    if (checked) set.add(slug);
    else set.delete(slug);
    update(index, {
      audience_role_slugs: FORETMAP_AUDIENCE_ROLE_OPTIONS.map((r) => r.slug).filter((s) =>
        set.has(s),
      ),
    });
  };
  const toggleGroup = (index, groupId, checked) => {
    const current = normalizeAudienceGroupList(list[index]?.audience_group_ids);
    const next = checked ? [...current, groupId] : current.filter((g) => g !== groupId);
    update(index, { audience_group_ids: normalizeAudienceGroupList(next) });
  };

  return (
    <fieldset className="fm-surface-field fm-location-notes" disabled={disabled}>
      <legend className="fm-surface-field__legend">Compléments réservés</legend>
      <p className="hint" style={{ marginTop: 0 }}>
        Textes lus seulement par certains publics — une consigne de classe, une note d’entretien.
        Chaque complément a sa propre audience : sans case cochée, il est réservé à l’encadrement (
        {DEFAULT_AUDIENCE_LABEL}).
      </p>

      {list.length === 0 ? (
        <p className="hint" style={{ margin: '0 0 8px' }}>
          Aucun complément pour l’instant.
        </p>
      ) : null}

      {list.map((note, index) => {
        const error = locationNoteRowError(note);
        const roles = normalizeAudienceRoleList(note?.audience_role_slugs);
        const groups = normalizeAudienceGroupList(note?.audience_group_ids);
        const titleId = `${idPrefix}-title-${index}`;
        const bodyId = `${idPrefix}-body-${index}`;
        return (
          <div className="fm-location-notes__row" key={`${idPrefix}-${index}`}>
            <div className="fm-location-links__head">
              <span className="fm-location-links__rank" aria-hidden>
                {index + 1}.
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => move(index, -1)}
                disabled={disabled || index === 0}
                title="Monter ce complément"
                aria-label={`Monter le complément ${index + 1}`}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => move(index, 1)}
                disabled={disabled || index === list.length - 1}
                title="Descendre ce complément"
                aria-label={`Descendre le complément ${index + 1}`}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => remove(index)}
                disabled={disabled}
                title="Retirer ce complément"
                aria-label={`Retirer le complément ${index + 1}`}
              >
                ✕
              </button>
              <span className="fm-location-links__badge" title="Complément réservé">
                🔒
              </span>
            </div>

            <div className="field">
              <label htmlFor={titleId}>Intitulé (facultatif)</label>
              <input
                id={titleId}
                value={note?.title ?? ''}
                maxLength={LOCATION_NOTE_TITLE_MAX}
                onChange={(e) => update(index, { title: e.target.value })}
                placeholder="Consigne 2nde B"
              />
            </div>
            <div className="field">
              <label htmlFor={bodyId}>Texte</label>
              <BodyEditor
                id={bodyId}
                aria-label={`Texte du complément ${index + 1}`}
                value={note?.body ?? ''}
                onChange={(e) => update(index, { body: e.target.value })}
                rows={3}
                disabled={disabled}
                placeholder="Consigne, note interne…"
              />
            </div>
            {error ? (
              <p className="fm-location-links__error" role="alert">
                {error}
              </p>
            ) : null}

            <details className="fm-location-links__audience">
              <summary>
                Qui lit ce complément :{' '}
                <strong>{noteAudienceSummary(roles, groups, groupOptions)}</strong>
              </summary>
              <div className="fm-surface-field__options">
                {FORETMAP_AUDIENCE_ROLE_OPTIONS.map((role) => {
                  const inputId = `${idPrefix}-${index}-role-${role.slug}`;
                  return (
                    <label key={role.slug} htmlFor={inputId} className="fm-surface-field__option">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={roles.includes(role.slug)}
                        onChange={(e) => toggleRole(index, role.slug, e.target.checked)}
                      />
                      <span>{role.label}</span>
                    </label>
                  );
                })}
              </div>
              {Array.isArray(groupOptions) && groupOptions.length > 0 ? (
                <>
                  <p className="fm-audience-groups__legend">…ou membres de ces groupes</p>
                  <div className="fm-surface-field__options">
                    {groupOptions.map((group) => {
                      const groupId = String(group?.id ?? '');
                      if (!groupId) return null;
                      const inputId = `${idPrefix}-${index}-group-${groupId}`;
                      return (
                        <label key={groupId} htmlFor={inputId} className="fm-surface-field__option">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={groups.includes(groupId)}
                            onChange={(e) => toggleGroup(index, groupId, e.target.checked)}
                          />
                          <span>{String(group?.name || group?.slug || groupId)}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </details>
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange?.([...list, emptyNote()])}
        disabled={disabled || atMax}
        title={atMax ? `${LOCATION_NOTES_MAX} compléments maximum` : 'Ajouter un complément'}
      >
        + Ajouter un complément
      </button>
      {atMax ? (
        <p className="hint" style={{ marginBottom: 0 }}>
          {LOCATION_NOTES_MAX} compléments maximum par lieu.
        </p>
      ) : null}
    </fieldset>
  );
}
