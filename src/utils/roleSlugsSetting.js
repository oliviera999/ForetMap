/**
 * Sérialisation des listes de profils (slugs) dans les réglages
 * (`ui.staff_plan.allowed_role_slugs`) : `;` / `,` / JSON.
 * Aligné sur `lib/staffPlanAccess.js` (`parseAllowedRoleSlugs` / `formatAllowedRoleSlugs`).
 */

import {
  FORETMAP_AUDIENCE_ROLE_OPTIONS,
  normalizeAudienceRoleList,
} from '../shared/ui/LocationAudienceFields.jsx';

/** @param {unknown} raw */
export function parseRoleSlugsSetting(raw) {
  return normalizeAudienceRoleList(raw);
}

/** @param {Iterable<string>|null|undefined} slugs */
export function formatRoleSlugsSetting(slugs) {
  const known = new Set(parseRoleSlugsSetting([...(slugs || [])]));
  return FORETMAP_AUDIENCE_ROLE_OPTIONS.map((r) => r.slug)
    .filter((s) => known.has(s))
    .join(';');
}

export { createLatestWriteQueue } from './categoryIdsSetting.js';
