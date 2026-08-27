---
name: foretmap-release
description: Versionnage SemVer, CHANGELOG et workflow Git ForetMap (bump, commit, push, release/tag). À utiliser en fin de lot livrable, pour mettre à jour CHANGELOG.md / package.json, ou préparer une release vX.Y.Z.
---

# Versionnage & release ForetMap

## Fin de chaque lot livrable (obligatoire)

1. **CHANGELOG** : entrée sous `[Non publié]` décrivant le changement.
2. **Commit** : `git add -A` (exclure `tmp/`, dumps SQL, secrets, `.bak`) puis commit, en
   **Conventional Commits** — le niveau SemVer en est déduit à la fusion (`feat` → mineur,
   `type!:` / `BREAKING CHANGE` → majeur, le reste → correctif).
3. **Push** immédiat.

> **Ne pas bumper dans la PR.** Depuis le 27/08/2026, `.github/workflows/version-bump.yml`
> incrémente `package.json` **après** la fusion sur `main`, puis `release-tag.yml` crée le tag
> et la release. Bumper dans la branche revendiquait un numéro avant de savoir quand elle
> fusionnerait : deux PR parallèles prenaient le même, et le conflit était garanti.
>
> **Forcer un niveau** (rare) : `npm run bump:minor` dans la PR. Le workflow détecte que la
> version a déjà changé et s'abstient — les scripts `bump:*` restent donc utiles.

## Convention

- **SemVer** ; source de vérité = `"version"` dans `package.json`.
- Commits : Conventional Commits (`feat`, `fix`, `chore`, `docs`, `style`…) ; scope `gl` si lot GL exclusif.
- Avant push : `npm run lint` et `npm run format:check` doivent passer (étapes CI). Tests : `npm test`.

## Release formelle

1. `CHANGELOG.md` : renommer `[Non publié]` en `[X.Y.Z] - AAAA-MM-JJ`, rouvrir `[Non publié]` vide.
2. `npm run bump:patch|minor|major`.
3. `git add CHANGELOG.md package.json && git commit -m "chore(release): vX.Y.Z" && git tag -a vX.Y.Z -m "vX.Y.Z"`.
4. `git push && git push origin vX.Y.Z`.
   (Alternative : `npm run release:patch|minor|major` — commit+tag auto, CHANGELOG dans un commit séparé.)

## Voir aussi

`docs/VERSIONING.md`, `.cursor/skills/foretmap-versioning/SKILL.md`,
`.cursor/skills/foretmap-commit-safe/SKILL.md` (commits multi-lignes PowerShell).
