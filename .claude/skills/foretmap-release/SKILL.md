---
name: foretmap-release
description: Versionnage SemVer, CHANGELOG et workflow Git ForetMap (bump, commit, push, release/tag). À utiliser en fin de lot livrable, pour mettre à jour CHANGELOG.md / package.json, ou préparer une release vX.Y.Z.
---

# Versionnage & release ForetMap

## Fin de chaque lot livrable (obligatoire)

1. **CHANGELOG** : entrée sous `[Non publié]` décrivant le changement.
2. **Bump** selon le type :
   ```bash
   npm run bump:patch   # correctif / refactor (défaut)
   npm run bump:minor   # nouvelle fonctionnalité rétrocompatible
   npm run bump:major   # changement cassant (rare)
   ```
3. **Commit** : `git add -A` (exclure `tmp/`, dumps SQL, secrets, `.bak`) puis commit.
4. **Push** immédiat. → Chaque lot livré sur `main` = commit poussé avec version incrémentée.

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
