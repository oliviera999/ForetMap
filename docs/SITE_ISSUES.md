# Problemes potentiels du site ForetMap

Date de reference: 2026-03-26

Ce document liste les principaux problemes potentiels identifies a ce jour.
Il consolide les constats des audits internes, notamment:

- `docs/AUDIT_BUGS_INCOHERENCES.md`
- `docs/AUDIT_PHOTOS_BIODIVERSITE.md`

## Critiques / Haute priorite

- `B1` - Suppression d'observation insuffisamment protegee (`DELETE /api/observations/:id`).
- `B2` - Risque d'IDOR sur la lecture d'observations par `studentId`.
- `B3` - Actions eleves basees sur un `studentId` client (risque d'usurpation selon contexte reseau).
- `R1` - Suppressions SQL sans purge systematique des fichiers medias associes.
- `R2` - Validation des uploads image a durcir (MIME, magic bytes, taille decodee).
- `R3` - Exposition potentielle de medias via routes ouvertes sans politique d'acces unifiee.

## Moyenne priorite

- `B5` - Temps reel incomplet sur les observations (creation/suppression non diffusees).
- `R4` - Pipeline base64 JSON couteux en CPU/memoire pour les uploads.
- `R5` - Logique de compression image dupliquee cote frontend.
- `R6` - Gouvernance des URLs externes plantes a renforcer (allowlist / verifications periodiques).
- `R7` - Moderation explicite des photos eleves a clarifier selon besoin pedagogique.

## Basse priorite

- `R8` - Strategie de distribution medias a harmoniser (`/uploads` + endpoints `sendFile`).
- `B7` - Evenements de presence eleve non diffuses en temps reel.

## Deja traite

- `B4` - Incoherence `unassign` eleve/prof corrigee et alignee avec la documentation.
- `B6` - Regle interne frontend mise a jour sur la stack Vite.

## Endpoint d'acces

- API: `GET /api/site-issues`
- Type de contenu: `text/markdown; charset=utf-8`

## Notes

- Cette liste est un inventaire technique des risques et incoherences possibles.
- Pour le detail complet des causes, impacts et actions, consulter les rapports d'audit sources.
