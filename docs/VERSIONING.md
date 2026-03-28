# Versionnage ForetMap

## Numéro de version

- **Source de vérité :** champ `"version"` dans [`package.json`](../package.json) (ex. `1.2.3`).
- **Convention :** [SemVer](https://semver.org/lang/fr/) — **MAJEUR** (cassant), **MINEUR** (fonctionnalités rétrocompatibles), **CORRECTIF** (corrections).

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `package.json` | Numéro officiel de l’application |
| `CHANGELOG.md` | Historique lisible pour humains |
| Tag Git `vX.Y.Z` | Repère de release (recommandé) |

## Routine au quotidien

Pendant le développement, ajouter les changements notables sous **`[Non publié]`** dans `CHANGELOG.md`.

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
- Pour une release : **CHANGELOG d’abord** (section datée), puis **`bump:*` + commit groupé + tag**, sauf si on utilise volontairement `release:*` (deux commits possibles).
