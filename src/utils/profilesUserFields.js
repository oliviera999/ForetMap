// Helpers purs pour la lecture/normalisation des champs utilisateur côté admin (Profils & utilisateurs).
// Extraits de profiles-views.jsx (O6) — comportement strictement identique.

const EDIT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lit un champ utilisateur quelle que soit la casse des clés (snake_case / camelCase) ou Buffer éventuel. */
export function pickUserField(obj, ...logicalNames) {
  if (!obj || typeof obj !== 'object') return undefined;
  const wanted = new Set(
    logicalNames.flatMap((n) => {
      const s = String(n);
      return [s.toLowerCase(), s.toLowerCase().replace(/_/g, '')];
    })
  );
  for (const k of Object.keys(obj)) {
    const keyNorm = k.toLowerCase().replace(/_/g, '');
    if (wanted.has(keyNorm)) return obj[k];
  }
  return undefined;
}

export function toUiString(v) {
  if (v == null) return '';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return v.toString('utf8');
  return String(v);
}

/** Fusionne la ligne liste et la fiche détail en objet stable pour le formulaire. */
export function mergeRbacUserRowsForEdit(listRow, detailRow) {
  const pick = (o, ...names) => {
    if (!o) return undefined;
    for (const n of names) {
      const v = pickUserField(o, n);
      if (v !== undefined && v !== null && toUiString(v).trim() !== '') return v;
    }
    return undefined;
  };
  const pickLoose = (o, ...names) => {
    if (!o) return undefined;
    for (const n of names) {
      const v = pickUserField(o, n);
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };
  const a = listRow && typeof listRow === 'object' ? listRow : {};
  const b = detailRow && typeof detailRow === 'object' && !detailRow.raw ? detailRow : {};
  const idRaw = pickUserField(b, 'id') ?? pickUserField(a, 'id');
  const id = idRaw != null ? toUiString(idRaw).trim() : '';
  const user_type = String(
    pick(b, 'user_type', 'userType') ?? pick(a, 'user_type', 'userType') ?? ''
  ).toLowerCase();
  const displayRaw = pickLoose(b, 'display_name', 'displayName') ?? pickLoose(a, 'display_name', 'displayName');
  return {
    id,
    user_type,
    display_name: displayRaw != null ? toUiString(displayRaw).trim() : '',
    first_name: pick(b, 'first_name', 'firstName') ?? pick(a, 'first_name', 'firstName'),
    last_name: pick(b, 'last_name', 'lastName') ?? pick(a, 'last_name', 'lastName'),
    pseudo: pick(b, 'pseudo') ?? pick(a, 'pseudo'),
    email: pick(b, 'email') ?? pick(a, 'email'),
    description: pickLoose(b, 'description') ?? pickLoose(a, 'description'),
    affiliation: pick(b, 'affiliation') ?? pick(a, 'affiliation'),
    role_id: pickUserField(b, 'role_id', 'roleId') ?? pickUserField(a, 'role_id', 'roleId'),
    role_slug: pickUserField(b, 'role_slug', 'roleSlug') ?? pickUserField(a, 'role_slug', 'roleSlug'),
    role_display_name:
      pickUserField(b, 'role_display_name', 'roleDisplayName')
      ?? pickUserField(a, 'role_display_name', 'roleDisplayName'),
    forum_participate: pickUserField(b, 'forum_participate', 'forumParticipate')
      ?? pickUserField(a, 'forum_participate', 'forumParticipate'),
    context_comment_participate:
      pickUserField(b, 'context_comment_participate', 'contextCommentParticipate')
      ?? pickUserField(a, 'context_comment_participate', 'contextCommentParticipate'),
  };
}

export function isLikelyApiUserPayload(x) {
  return x && typeof x === 'object' && !Array.isArray(x) && x.raw == null && x.id != null;
}

/** Préremplit le formulaire d’édition à partir de la fiche API (prénom/nom manquants → display_name ou identifiant email). */
export function buildUserEditInitialFields(u) {
  let firstName = toUiString(pickUserField(u, 'first_name', 'firstName')).trim();
  let lastName = toUiString(pickUserField(u, 'last_name', 'lastName')).trim();
  const pseudo = toUiString(pickUserField(u, 'pseudo')).trim();
  const email = toUiString(pickUserField(u, 'email')).trim();
  const descRaw = pickUserField(u, 'description');
  const description = descRaw != null ? toUiString(descRaw) : '';
  let affiliation = toUiString(pickUserField(u, 'affiliation') ?? 'both').toLowerCase();
  if (!affiliation) affiliation = 'both';

  if (!firstName && !lastName) {
    const dn = toUiString(pickUserField(u, 'display_name', 'displayName')).trim();
    if (dn && !EDIT_EMAIL_RE.test(dn)) {
      const parts = dn.split(/\s+/).filter(Boolean);
      if (parts.length >= 1) firstName = parts[0];
      if (parts.length >= 2) lastName = parts.slice(1).join(' ');
    } else if (dn && EDIT_EMAIL_RE.test(dn)) {
      const at = dn.indexOf('@');
      const local = at > 0 ? dn.slice(0, at) : dn;
      const rawTokens = local.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean);
      const tokens = rawTokens.map((t) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '')).filter(Boolean);
      if (tokens.length >= 1) firstName = tokens[0];
      if (tokens.length >= 2) lastName = tokens.slice(1).join(' ');
    }
  }

  return { firstName, lastName, pseudo, email, description, affiliation };
}
