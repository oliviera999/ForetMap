/**
 * Audience d'un lieu (zone / repère) par rôles ForetMap — V1.
 * Aligné sur `lib/locationAudience.js` (mêmes slugs).
 */
export const FORETMAP_AUDIENCE_ROLE_OPTIONS = Object.freeze([
  { slug: 'visiteur', label: 'Visiteur' },
  { slug: 'personnel', label: 'Personnel' },
  { slug: 'eleve_novice', label: 'n3beur novice' },
  { slug: 'eleve_avance', label: 'n3beur avancé' },
  { slug: 'eleve_chevronne', label: 'n3beur chevronné' },
  { slug: 'prof_classe', label: 'Prof de classe' },
  { slug: 'prof', label: 'n3boss' },
  { slug: 'admin', label: 'Administrateur' },
]);

const KNOWN = new Set(FORETMAP_AUDIENCE_ROLE_OPTIONS.map((r) => r.slug));

/** Normalise une valeur API (tableau / JSON / CSV) en liste de slugs connus. */
export function normalizeAudienceRoleList(value) {
  if (value == null || value === '') return [];
  let raw = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = trimmed.split(/[,;]/);
      }
    } else {
      raw = trimmed.split(/[,;]/);
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const item of raw) {
    const slug = String(item || '')
      .trim()
      .toLowerCase();
    if (KNOWN.has(slug)) seen.add(slug);
  }
  return FORETMAP_AUDIENCE_ROLE_OPTIONS.map((r) => r.slug).filter((s) => seen.has(s));
}

/**
 * Cases « Qui peut voir ce lieu » + complément réservé.
 * Liste de rôles vide = public (tout le monde).
 */
export function LocationAudienceFields({
  visibleRoleSlugs,
  onVisibleRoleSlugsChange,
  restrictedNote,
  onRestrictedNoteChange,
  restrictedNoteRoleSlugs,
  onRestrictedNoteRoleSlugsChange,
  idPrefix = 'audience',
  disabled = false,
}) {
  const visible = normalizeAudienceRoleList(visibleRoleSlugs);
  const noteRoles = normalizeAudienceRoleList(restrictedNoteRoleSlugs);
  const toggle = (list, slug, checked, onChange) => {
    const next = new Set(list);
    if (checked) next.add(slug);
    else next.delete(slug);
    onChange?.(FORETMAP_AUDIENCE_ROLE_OPTIONS.map((r) => r.slug).filter((s) => next.has(s)));
  };

  return (
    <div className="fm-audience-fields">
      <fieldset className="fm-surface-field" disabled={disabled}>
        <legend className="fm-surface-field__legend">Qui peut voir ce lieu</legend>
        <p className="hint" style={{ marginTop: 0 }}>
          Aucune case = visible pour tout le monde. Hors audience, le lieu est absent de la carte,
          de la visite et du plan.
        </p>
        <div className="fm-surface-field__options">
          {FORETMAP_AUDIENCE_ROLE_OPTIONS.map((role) => {
            const inputId = `${idPrefix}-visible-${role.slug}`;
            return (
              <label key={role.slug} htmlFor={inputId} className="fm-surface-field__option">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={visible.includes(role.slug)}
                  onChange={(e) =>
                    toggle(visible, role.slug, e.target.checked, onVisibleRoleSlugsChange)
                  }
                />
                <span>{role.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={`${idPrefix}-restricted-note`}>Complément réservé</label>
        <textarea
          id={`${idPrefix}-restricted-note`}
          value={restrictedNote || ''}
          onChange={(e) => onRestrictedNoteChange?.(e.target.value)}
          rows={3}
          disabled={disabled}
          placeholder="Texte lu seulement par certains rôles (consigne, note interne…)"
        />
      </div>

      <fieldset className="fm-surface-field" disabled={disabled || !(restrictedNote || '').trim()}>
        <legend className="fm-surface-field__legend">Qui peut lire le complément</legend>
        <p className="hint" style={{ marginTop: 0 }}>
          Aucune case = réservé aux gestionnaires du jardin. Cocher « Visiteur » pour l’afficher
          aussi en visite anonyme ou sur le Plan.
        </p>
        <div className="fm-surface-field__options">
          {FORETMAP_AUDIENCE_ROLE_OPTIONS.map((role) => {
            const inputId = `${idPrefix}-note-${role.slug}`;
            return (
              <label key={role.slug} htmlFor={inputId} className="fm-surface-field__option">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={noteRoles.includes(role.slug)}
                  onChange={(e) =>
                    toggle(noteRoles, role.slug, e.target.checked, onRestrictedNoteRoleSlugsChange)
                  }
                />
                <span>{role.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
