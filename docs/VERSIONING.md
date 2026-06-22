# Versionnage ForetMap

## Numéro de version

- **Source de vérité :** champ `"version"` dans [`package.json`](../package.json) (ex. `1.2.3`).
- **Convention :** [SemVer](https://semver.org/lang/fr/) — **MAJEUR** (cassant), **MINEUR** (fonctionnalités rétrocompatibles), **CORRECTIF** (corrections).

## Fichiers concernés

| Fichier          | Rôle                             |
| ---------------- | -------------------------------- |
| `package.json`   | Numéro officiel de l’application |
| `CHANGELOG.md`   | Historique lisible pour humains  |
| Tag Git `vX.Y.Z` | Repère de release (recommandé)   |

## Routine au quotidien

Pendant le développement, ajouter les changements notables sous **`[Non publié]`** dans `CHANGELOG.md`.

### Lots livrés sur `main` (incrément continu)

Sur ce dépôt, chaque **lot livré** (correctif ou fonctionnalité prête à être intégrée sur `main`) inclut en général :

1. une ou plusieurs entrées sous **`[Non publié]`** dans `CHANGELOG.md` lorsque c’est pertinent pour les humains ;
2. une incrémentation du numéro dans **`package.json`** via **`npm run bump:patch`** (défaut), **`bump:minor`** ou **`bump:major`** selon SemVer ;
3. un **commit** puis un **`git push`** de tous les fichiers concernés.

Cela garde **`GET /api/version`**, les tickets et le suivi alignés sur le dernier état publié de la branche. Ce flux est **complémentaire** d’une **release formelle** (tag **`vX.Y.Z`**) : la release « fige » une portion d’historique en renommant la section **`[Non publié]`** en **`[X.Y.Z] - AAAA-MM-JJ`** puis en créant le tag (voir ci-dessous), sans obliger à une coupe à chaque correctif.

## Shell PowerShell : éviter les échecs heredoc

Dans cet environnement, le shell par défaut est **PowerShell**.  
Les syntaxes Bash de type `<<'EOF'` (heredoc/heredity) peuvent échouer pendant les commits.

Utiliser l'une des méthodes suivantes pour les messages multi-lignes :

### Option A — Here-string PowerShell (recommandé)

```powershell
git add -A
$msg = @'
feat(scope): titre du commit

Corps du message sur plusieurs lignes.
'@
git commit -m $msg
```

### Option B — Fichier temporaire de message

```powershell
git add -A
$msgFile = Join-Path $env:TEMP "git-commit-msg.txt"
@'
feat(scope): titre du commit

Corps du message sur plusieurs lignes.
'@ | Set-Content -Path $msgFile -Encoding UTF8
git commit -F $msgFile
Remove-Item $msgFile -ErrorAction SilentlyContinue
```

## Publier une release (recommandé : un seul commit)

`npm version` seul ne commite **que** `package.json` ; pour garder **CHANGELOG + version dans le même commit** :

1. Dans `CHANGELOG.md` : renommer **`[Non publié]`** en **`[X.Y.Z] - AAAA-MM-JJ`** (numéro = prochaine version, date du jour), puis rouvrir une section **`[Non publié]`** vide en tête.
2. Depuis la racine **ForetMap** :

```bash
npm run bump:patch    # ou bump:minor / bump:major — met à jour package.json sans commit ni tag
git add CHANGELOG.md package.json
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
```

3. Pousser : `git push && git push origin vX.Y.Z` (adapter le remote si besoin).

## Alternative : commit automatique (sans CHANGELOG dans le même commit)

```bash
npm run release:patch   # ou release:minor / release:major
```

→ Incrémente `package.json`, **commit + tag** Git. Mettre à jour le **CHANGELOG** dans un commit **avant** ou **juste après** cette commande pour rester cohérent.

## Sans Git

Éditer manuellement `version` dans `package.json` et `CHANGELOG.md` ; pas de tag.

## Dépôt Git à la racine parente

Si le dépôt englobe plusieurs dossiers, travailler depuis **`ForetMap/`** ; les chemins dans le commit seront `ForetMap/package.json`, etc.

## Rappel pour l’IA / contributeurs

- Toujours refléter les changements utilisateur dans **`[Non publié]`** du CHANGELOG quand c’est pertinent.
- Après chaque **lot livré** sur `main` : voir la sous-section **Lots livrés sur `main`** ci-dessus (**CHANGELOG** + **`bump:*`** + commit + push).
- Pour une **release** nommée : **CHANGELOG d’abord** (renommer `[Non publié]` en section datée), puis **`bump:*` + commit groupé + tag**, sauf si on utilise volontairement **`release:*`** (deux commits possibles).
- Le fichier **`CHANGELOG.md`** peut conserver une longue section **`[Non publié]`** entre deux releases datées : ce n’est pas une incohérence avec **`package.json`** tant que la version du manifeste suit les **`bump:*`** successifs.

## Résolution automatique des conflits de merge (CI)

Les PR ouvertes en parallèle se télescopent presque toujours sur les mêmes
fichiers cumulatifs : **`CHANGELOG.md`** (section `[Non publié]`) et le **bump de
version** (`package.json` / `package-lock.json`). Un mécanisme automatique gère
ces conflits récurrents :

- **`.gitattributes`** déclare `CHANGELOG.md merge=union` → lors d’un merge, Git
  conserve les entrées des **deux** côtés au lieu de produire un conflit (vaut
  aussi pour les merges locaux).
- **Workflow** `.github/workflows/auto-resolve-conflicts.yml` (push sur `main`,
  cron horaire, déclenchement manuel) exécute `scripts/auto-resolve-conflicts.js`
  qui, pour chaque PR ouverte vers `main` :
  - tente le merge de `main` ; si propre, ne touche à rien ;
  - en cas de conflit, résout **automatiquement** `CHANGELOG.md` (union) et la
    **version** des manifestes (semver le plus haut), puis **pousse** la
    résolution ;
  - tout autre conflit (code métier) reste **non résolu** : la PR est étiquetée
    `merge-conflict` avec un commentaire listant les fichiers à traiter à la main.
- Déclenchement manuel possible en **simulation** (`dry_run`) et pour inclure les
  **brouillons** (`include_drafts`).
- Secret optionnel **`AUTO_MERGE_PAT`** : si présent, le push de la résolution
  **re-déclenche la CI** sur la branche de PR (le `GITHUB_TOKEN` par défaut ne le
  fait pas).
