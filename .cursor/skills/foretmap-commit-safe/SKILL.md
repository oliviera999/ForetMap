---
name: foretmap-commit-safe
description: Sécurise les commandes de commit Git sous PowerShell (messages multi-lignes, chaînage, fallback). À utiliser quand il faut créer un commit, surtout avec message long ou quand un heredoc Bash a échoué.
---

# Commit Git sûr (PowerShell)

## Quand utiliser ce skill

- Création de commit avec message multi-lignes.
- Environnement shell PowerShell (Windows).
- Après un échec lié à `<<'EOF'` / heredoc Bash.

## Règles rapides

- Ne pas utiliser `<<'EOF'` en PowerShell.
- Préférer `;` pour chaîner les commandes dans PowerShell.
- Conserver le fond du message de commit ; ne changer que la syntaxe shell si erreur.

## Workflow recommandé

1. Stager les fichiers :
   ```powershell
   git add -A
   ```
2. Créer le message via here-string :
   ```powershell
   $msg = @'
   type(scope): titre

   Pourquoi ce changement.
   '@
   ```
3. Commit puis vérification :
   ```powershell
   git commit -m $msg
   git status --short
   ```
4. Push :
   ```powershell
   git push
   ```

## Fallback robuste (si needed)

```powershell
$msgFile = Join-Path $env:TEMP "git-commit-msg.txt"
@'
type(scope): titre

Pourquoi ce changement.
'@ | Set-Content -Path $msgFile -Encoding UTF8
git commit -F $msgFile
Remove-Item $msgFile -ErrorAction SilentlyContinue
```

## Check-list anti-échec

- [ ] Pas de heredoc Bash dans la commande finale.
- [ ] Message de commit non vide, lisible, en 1 titre + corps.
- [ ] `git status` propre après commit.
- [ ] `git push` exécuté (si demandé par la convention de travail).
