# Migration 240 — Audience visite (`visit_zones` / `visit_markers`)

Date de lot : 2026-09-13. MariaDB 11.4 / cPanel mutualisé.

## Schéma

| Table           | Colonnes ajoutées            | Type      | Défaut | Commentaire                              |
| --------------- | ---------------------------- | --------- | ------ | ---------------------------------------- |
| `visit_zones`   | `visible_role_slugs`         | TEXT NULL | NULL   | JSON array de slugs ; vide/NULL = public |
| `visit_zones`   | `restricted_note`            | TEXT NULL | NULL   | Complément réservé                       |
| `visit_zones`   | `restricted_note_role_slugs` | TEXT NULL | NULL   | JSON array ; vide = gestionnaires seuls  |
| `visit_markers` | (idem 3 colonnes)            | idem      | idem   | idem                                     |

Fichier : `migrations/240_visit_location_audience_roles.sql`  
Miroir schéma neuf : `sql/schema_foretmap.sql`  
Backfill : `COALESCE` depuis `zones` / `map_markers` (même `id` + `map_id`) si la colonne visite est encore NULL.  
`schema_version` → **240** (runner `database.js`).

Pas de vue touchée. Pas d’index dédié (comme la 236).

## Routes / contrat API

| Avant                                                                | Après                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/visit/content` : audience via JOIN carte uniquement        | Audience `visit_*` en priorité, repli carte si NULL                                |
| CRUD `/api/visit/zones` \| `/markers` : pas de champs audience       | Acceptent / exposent les 3 champs (gestionnaires)                                  |
| Sync / rebuild : name, géométrie, emoji ; éditorial vide ou conservé | + `description`/`note` → `short_description` + 3 colonnes audience (liste blanche) |

Hors audience du complément : `restricted_note` et `restricted_note_role_slugs` **absents** de la charge utile (comme carte / plan).  
`body_json` reste public (pas de blocs restreints dans ce lot).

## Bascule anti-fuite

Helper `lib/visitMapToVisitFields.js` : liste blanche explicite.  
`restricted_note` → uniquement la colonne homonyme, jamais `subtitle` / `short_description` / `details_*` / `body_json`.

## Tests

- `tests/visit-map-to-visit-fields.test.js`
- `tests/location-audience-api.test.js` (anonyme, personnel, sync)
