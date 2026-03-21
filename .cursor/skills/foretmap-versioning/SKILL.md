---
name: foretmap-versioning
description: Guide le versionnage SemVer, la mise à jour du CHANGELOG et les releases ForetMap. À utiliser quand on prépare une release, modifie la version dans package.json, met à jour CHANGELOG.md, ou crée un tag Git vX.Y.Z.
---

# Versionnage ForetMap

## Quand utiliser ce skill

- Préparation d'une release (bump de version, tag Git).
- Mise à jour du `CHANGELOG.md` (ajout d'entrées, passage de `[Non publié]` à une version datée).
- Vérification de la cohérence version / changelog / tag.

## Quand ne pas l'utiliser

- Développement de fonctionnalités ou correction de bugs : préférer **foretmap-project**.
- Les entrées `[Non publié]` dans le CHANGELOG sont ajoutées au fil du dev par convention (pas besoin de ce skill pour ça).

## Référence complète

Voir [docs/VERSIONING.md](docs/VERSIONING.md) pour le flux détaillé.

## Convention

- **SemVer** : MAJEUR (cassant), MINEUR (fonctionnalités rétrocompatibles), CORRECTIF (corrections).
- **Source de vérité** : `"version"` dans `package.json`.

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `package.json` | Version officielle |
| `CHANGELOG.md` | Historique lisible (`[Non publié]` puis `[X.Y.Z] - AAAA-MM-JJ`) |
| Tag Git `vX.Y.Z` | Repère de release |

## Flux recommandé (un seul commit)

1. Dans `CHANGELOG.md` : renommer `[Non publié]` en `[X.Y.Z] - AAAA-MM-JJ`, rouvrir `[Non publié]` vide en tête.
2. Bump de version :
   ```bash
   npm run bump:patch    # ou bump:minor / bump:major
   ```
3. Commit groupé :
   ```bash
   git add CHANGELOG.md package.json
   git commit -m "chore(release): vX.Y.Z"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   ```
4. Pousser : `git push && git push origin vX.Y.Z`.

## Flux alternatif (commit automatique sans CHANGELOG)

```bash
npm run release:patch   # ou release:minor / release:major
```

Met à jour `package.json`, commit + tag Git. Le CHANGELOG doit être mis à jour dans un commit séparé (avant ou juste après).

## Flux obligatoire après chaque modification

Après toute tâche terminée et vérifiée, **toujours** exécuter ces étapes dans l'ordre :

1. **CHANGELOG** : ajouter une entrée sous `[Non publié]` décrivant le changement.
2. **Bump** : incrémenter la version selon le type de changement :
   ```bash
   npm run bump:patch    # correction, refactoring, mise à jour mineure (défaut)
   npm run bump:minor    # nouvelle fonctionnalité rétrocompatible
   npm run bump:major    # changement cassant (rare)
   ```
3. **Commit** : stager et committer tous les fichiers modifiés :
   ```bash
   git add -A
   git commit -m "type(scope): description — vX.Y.Z"
   ```
4. **Push** : pousser immédiatement vers GitHub :
   ```bash
   git push
   ```

Ne pas attendre : **chaque modification livrée = un commit poussé**.

## Rappel pour l'IA

- Toujours refléter les changements utilisateur dans `[Non publié]` du CHANGELOG quand c'est pertinent.
- Ne jamais utiliser `release:*` si le CHANGELOG n'est pas déjà à jour.
- Vérifier que la version dans `package.json` correspond au tag Git le plus récent.
- **Ne jamais terminer une tâche sans avoir bumped, commité et poussé.**

## Voir aussi

- Règle conventions : `.cursor/rules/foretmap-conventions.mdc`
- Documentation : [docs/VERSIONING.md](docs/VERSIONING.md)
