/**
 * Audience d'un lieu (zone / repère) : qui le voit.
 * Aligné sur `lib/locationAudience.js` (mêmes slugs).
 * Profil `personnel` inclus (calqué sur visiteur).
 * Build dist requis avant push (garde-fou pre-push).
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

/**
 * Audience par défaut d'un complément réservé (aucune case cochée) — miroir de
 * `LOCATION_NOTE_DEFAULT_ROLE_SLUGS` (`lib/locationAudience.js`), qui fait foi côté API.
 * Consommée par `LocationNotesFields`, qui en dérive le libellé affiché.
 */
export const LOCATION_NOTE_DEFAULT_ROLE_SLUGS = Object.freeze(['prof_classe', 'prof', 'admin']);

const KNOWN = new Set(FORETMAP_AUDIENCE_ROLE_OPTIONS.map((r) => r.slug));

/** Longueur max d'un identifiant de groupe — miroir de `GROUP_ID_MAX_LENGTH` côté serveur. */
const GROUP_ID_MAX_LENGTH = 64;

/**
 * Normalise une liste d'identifiants de **groupes** (migration 262).
 *
 * Pas de catalogue figé à confronter, contrairement aux rôles : un groupe est une ligne de
 * `groups`, créée et supprimée en cours d'année. On ne filtre donc que la forme, et le
 * serveur vérifie l'existence à l'écriture.
 */
export function normalizeAudienceGroupList(value) {
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
  const out = [];
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (!id || id.length > GROUP_ID_MAX_LENGTH || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Cases « groupes » d'une audience (classe, club, équipe). Rendues sous les rôles, avec
 * lesquels elles se combinent en **union** : le lecteur passe s'il a le bon rôle **ou** s'il
 * est dans l'un des groupes.
 *
 * `groupOptions` vient de `GET /api/groups/options`, déjà borné au périmètre de celui qui
 * édite : un prof de classe ne peut restreindre qu'aux groupes qu'il voit. Sans options
 * chargées, le bloc ne s'affiche pas — inutile de montrer une liste vide.
 */
function AudienceGroupOptions({ groupOptions, selected, onToggle, idPrefix, legend }) {
  const options = Array.isArray(groupOptions) ? groupOptions : [];
  if (options.length === 0) return null;
  return (
    <div className="fm-audience-groups">
      <p className="fm-audience-groups__legend">{legend}</p>
      <div className="fm-surface-field__options">
        {options.map((group) => {
          const id = String(group?.id ?? '');
          if (!id) return null;
          const inputId = `${idPrefix}-${id}`;
          return (
            <label key={id} htmlFor={inputId} className="fm-surface-field__option">
              <input
                id={inputId}
                type="checkbox"
                checked={selected.includes(id)}
                onChange={(e) => onToggle(id, e.target.checked)}
              />
              <span>{String(group?.name || group?.slug || id)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

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
 * Cases « Qui peut voir ce lieu » (rôles et groupes, en union).
 * Listes vides = public (tout le monde).
 *
 * Les compléments réservés ont quitté ce composant avec la migration 263 : ils sont
 * désormais multiples et vivent dans `LocationNotesFields`.
 */
export function LocationAudienceFields({
  visibleRoleSlugs,
  onVisibleRoleSlugsChange,
  idPrefix = 'audience',
  disabled = false,
  groupOptions = [],
  visibleGroupIds = [],
  onVisibleGroupIdsChange = null,
}) {
  const visible = normalizeAudienceRoleList(visibleRoleSlugs);
  const visibleGroups = normalizeAudienceGroupList(visibleGroupIds);
  const toggleGroup = (list, id, checked, onChange) => {
    const next = checked ? [...list, id] : list.filter((g) => g !== id);
    onChange?.(normalizeAudienceGroupList(next));
  };
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
          de la visite et du plan. Rôles et groupes se combinent : il suffit d’avoir le bon rôle
          <em> ou</em> d’être dans l’un des groupes. Sans aucune case ici, le lieu prend l’audience
          de ses catégories, si elles en déclarent une.
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
        <AudienceGroupOptions
          groupOptions={groupOptions}
          selected={visibleGroups}
          idPrefix={`${idPrefix}-visible-group`}
          legend="…ou membres de ces groupes"
          onToggle={(id, checked) =>
            toggleGroup(visibleGroups, id, checked, onVisibleGroupIdsChange)
          }
        />
      </fieldset>
    </div>
  );
}
