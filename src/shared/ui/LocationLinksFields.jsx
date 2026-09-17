/**
 * Liens documentaires d'un lieu (zone / repère) — édition. Miroir de `lib/locationLinks.js`
 * (mêmes plafonds, même politique d'URL) et de `lib/locationAudience.js` (mêmes slugs).
 *
 * Chaque ligne porte **son** audience : c'est ce qui distingue ce bloc d'un lien collé dans
 * la description. La confidentialité ne se joue plus au niveau du bloc de texte (description
 * publique d'un côté, complément réservé de l'autre) mais du lien lui-même — « cette fiche
 * pour les profs, celle-là pour tout le monde », sur un seul lieu.
 *
 * Aucune case cochée = lien visible par tous ceux qui voient déjà le lieu. Le serveur
 * refiltre de toute façon : rien ici n'est une garantie de confidentialité, seulement le
 * réglage qu'il applique.
 */
import {
  FORETMAP_AUDIENCE_ROLE_OPTIONS,
  normalizeAudienceGroupList,
  normalizeAudienceRoleList,
} from './LocationAudienceFields.jsx';

/** Miroir de `LOCATION_LINKS_MAX` / `LINK_LABEL_MAX_LENGTH` (`lib/locationLinks.js`). */
export const LOCATION_LINKS_MAX = 12;
export const LOCATION_LINK_LABEL_MAX = 160;

/** Miroir de `classifyLocationLinkUrl` (`lib/locationLinks.js`) — la validation fait foi côté API. */
export function classifyLocationLinkUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  if (/^https?:\/\/[^\s<>"'`]+$/i.test(raw)) return 'external';
  if (/^(?:mailto|tel):[^\s<>"'`]+$/i.test(raw)) return 'contact';
  if (/^\/(?![/\\])[^\s<>"'`]*$/.test(raw)) return 'internal';
  return null;
}

/** Ligne vide d'ajout. */
function emptyLink() {
  return { label: '', url: '', audience_role_slugs: [], audience_group_ids: [] };
}

/**
 * Résumé lisible de l'audience d'un lien, affiché sur le repli. Sans lui, refermer le bloc
 * ferait perdre de vue qu'un lien est réservé — exactement ce qu'on ne veut pas oublier.
 */
function audienceSummary(roles, groups, groupOptions) {
  if (roles.length === 0 && groups.length === 0) return 'visible par tous ceux qui voient le lieu';
  const roleLabels = FORETMAP_AUDIENCE_ROLE_OPTIONS.filter((r) => roles.includes(r.slug)).map(
    (r) => r.label,
  );
  const byId = new Map(
    (Array.isArray(groupOptions) ? groupOptions : []).map((g) => [String(g?.id ?? ''), g]),
  );
  const groupLabels = groups.map((id) => String(byId.get(id)?.name || byId.get(id)?.slug || id));
  return [...roleLabels, ...groupLabels].join(', ');
}

/** Valeur d'API (liste de liens) → liste éditable, toujours un tableau. */
export function normalizeLocationLinksForForm(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, LOCATION_LINKS_MAX).map((link) => ({
    label: String(link?.label ?? ''),
    url: String(link?.url ?? ''),
    audience_role_slugs: normalizeAudienceRoleList(link?.audience_role_slugs),
    audience_group_ids: normalizeAudienceGroupList(link?.audience_group_ids),
  }));
}

/**
 * Liste éditable → charge utile d'API. Les lignes entièrement vides sont ignorées : ajouter
 * une ligne puis changer d'avis ne doit pas faire échouer l'enregistrement du lieu entier.
 */
export function buildLocationLinksPayload(links) {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      label: String(link?.label ?? '').trim(),
      url: String(link?.url ?? '').trim(),
      audience_role_slugs: normalizeAudienceRoleList(link?.audience_role_slugs),
      audience_group_ids: normalizeAudienceGroupList(link?.audience_group_ids),
    }))
    .filter((link) => link.label || link.url);
}

/**
 * Message d'erreur d'une ligne, ou `''` si elle est bonne (ou entièrement vide).
 * Sert à l'affichage ; le refus fait foi côté serveur.
 */
export function locationLinkRowError(link) {
  const label = String(link?.label ?? '').trim();
  const url = String(link?.url ?? '').trim();
  if (!label && !url) return '';
  if (!label) return 'Libellé requis.';
  if (label.length > LOCATION_LINK_LABEL_MAX) {
    return `Libellé : ${LOCATION_LINK_LABEL_MAX} caractères maximum.`;
  }
  if (!url) return 'Adresse requise.';
  if (!classifyLocationLinkUrl(url)) {
    return 'Adresse non reconnue : https://…, /page-de-l-application, mailto: ou tel:.';
  }
  return '';
}

export function LocationLinksFields({
  links,
  onChange,
  idPrefix = 'links',
  disabled = false,
  groupOptions = [],
}) {
  const list = Array.isArray(links) ? links : [];
  const atMax = list.length >= LOCATION_LINKS_MAX;

  const update = (index, patch) => {
    onChange?.(list.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  };
  const remove = (index) => onChange?.(list.filter((_, i) => i !== index));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = list.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange?.(next);
  };
  const toggleGroup = (index, groupId, checked) => {
    const current = normalizeAudienceGroupList(list[index]?.audience_group_ids);
    const next = checked ? [...current, groupId] : current.filter((g) => g !== groupId);
    update(index, { audience_group_ids: normalizeAudienceGroupList(next) });
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

  return (
    <fieldset className="fm-surface-field fm-location-links" disabled={disabled}>
      <legend className="fm-surface-field__legend">Liens du lieu</legend>
      <p className="hint" style={{ marginTop: 0 }}>
        Boutons affichés sur la fiche du lieu (carte, Plan). Les adresses externes s’ouvrent dans un
        nouvel onglet. Sans case cochée, un lien est visible par tous ceux qui voient le lieu ;
        cocher des rôles en fait un lien réservé.
      </p>

      {list.length === 0 ? (
        <p className="hint" style={{ margin: '0 0 8px' }}>
          Aucun lien pour l’instant.
        </p>
      ) : null}

      {list.map((link, index) => {
        const error = locationLinkRowError(link);
        const roles = normalizeAudienceRoleList(link?.audience_role_slugs);
        const groups = normalizeAudienceGroupList(link?.audience_group_ids);
        const restricted = roles.length > 0 || groups.length > 0;
        const labelId = `${idPrefix}-label-${index}`;
        const urlId = `${idPrefix}-url-${index}`;
        return (
          <div className="fm-location-links__row" key={`${idPrefix}-${index}`}>
            <div className="fm-location-links__head">
              <span className="fm-location-links__rank" aria-hidden>
                {index + 1}.
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => move(index, -1)}
                disabled={disabled || index === 0}
                title="Monter ce lien"
                aria-label={`Monter le lien ${index + 1}`}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => move(index, 1)}
                disabled={disabled || index === list.length - 1}
                title="Descendre ce lien"
                aria-label={`Descendre le lien ${index + 1}`}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => remove(index)}
                disabled={disabled}
                title="Retirer ce lien"
                aria-label={`Retirer le lien ${index + 1}`}
              >
                ✕
              </button>
              {restricted ? (
                <span className="fm-location-links__badge" title="Lien réservé">
                  🔒 réservé
                </span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor={labelId}>Libellé</label>
              <input
                id={labelId}
                value={link?.label ?? ''}
                maxLength={LOCATION_LINK_LABEL_MAX}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Fiche d’entretien du verger"
              />
            </div>
            <div className="field">
              <label htmlFor={urlId}>Adresse</label>
              <input
                id={urlId}
                value={link?.url ?? ''}
                onChange={(e) => update(index, { url: e.target.value })}
                placeholder="https://… ou /tutoriels/3 ou mailto:…"
                inputMode="url"
              />
            </div>
            {error ? (
              <p className="fm-location-links__error" role="alert">
                {error}
              </p>
            ) : null}

            {/*
              Replié par défaut quand le lien est public : douze liens × (huit rôles + les
              groupes) déroulés d'un coup rendaient le formulaire du lieu illisible. Le résumé
              garde l'essentiel sous les yeux — on ne doit jamais perdre de vue qu'un lien est
              réservé, c'est tout l'objet du réglage.
            */}
            <details className="fm-location-links__audience" open={restricted}>
              <summary>
                Qui voit ce lien : <strong>{audienceSummary(roles, groups, groupOptions)}</strong>
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
        onClick={() => onChange?.([...list, emptyLink()])}
        disabled={disabled || atMax}
        title={atMax ? `${LOCATION_LINKS_MAX} liens maximum par lieu` : 'Ajouter un lien'}
      >
        + Ajouter un lien
      </button>
      {atMax ? (
        <p className="hint" style={{ marginBottom: 0 }}>
          {LOCATION_LINKS_MAX} liens maximum par lieu.
        </p>
      ) : null}
    </fieldset>
  );
}
