#!/usr/bin/env bash
# Supprime les branches distantes déjà **contenues** dans `main`.
#
# Pourquoi un script plutôt qu'une commande à la volée : la sûreté tient à une vérification
# qu'on oublie vite. `git branch -r --merged` répond juste — mais seulement si le clone a
# l'historique complet. Sur un **clone superficiel** (`--depth`), les branches anciennes
# apparaissent « non fusionnées » faute d'ancêtre commun visible, et un tri manuel conclut à
# l'inverse de la réalité. C'est arrivé le 27/08/2026 : un clone à 284 commits annonçait
# 32 fusionnées et 46 non fusionnées ; l'historique complet (2263 commits) en donnait 53 et 26.
#
# Le script refuse donc de tourner sur un clone superficiel, puis revérifie chaque branche
# une par une avec `git merge-base --is-ancestor` avant de la supprimer : une branche n'est
# supprimée que si son sommet est **littéralement un ancêtre de `main`**, donc si son contenu
# est intégralement dans `main`.
#
#   ./scripts/prune-merged-branches.sh            # liste seulement (aucune suppression)
#   ./scripts/prune-merged-branches.sh --delete   # supprime pour de bon
#
# Les branches encore ouvertes en PR ne sont pas concernées : une PR ouverte n'est pas fusionnée,
# donc son sommet n'est pas ancêtre de `main`.
set -euo pipefail

REMOTE="${REMOTE:-origin}"
BASE="${BASE:-main}"
DELETE=0
[ "${1:-}" = "--delete" ] && DELETE=1

if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  echo "✖ Clone superficiel : le calcul « fusionnée » serait faux." >&2
  echo "  Corrige d'abord :  git fetch --unshallow" >&2
  exit 1
fi

git fetch "$REMOTE" --prune >/dev/null 2>&1

# Branche courante et `main` sont exclues : on ne supprime pas le sol sur lequel on marche.
CURRENT="$(git rev-parse --abbrev-ref HEAD)"

candidates="$(git branch -r --merged "$REMOTE/$BASE" \
  | grep -v HEAD \
  | sed "s#^ *$REMOTE/##" \
  | grep -vx "$BASE" \
  | grep -vx "$CURRENT" || true)"

if [ -z "$candidates" ]; then
  echo "Rien à supprimer : aucune branche distante n'est contenue dans $BASE."
  exit 0
fi

total=0
while IFS= read -r b; do
  [ -z "$b" ] && continue
  # Deuxième garde, indépendante de --merged : le sommet doit être un ancêtre de main.
  if ! git merge-base --is-ancestor "$REMOTE/$b" "$REMOTE/$BASE"; then
    echo "⚠ ignorée (pas un ancêtre de $BASE) : $b"
    continue
  fi
  total=$((total + 1))
  if [ "$DELETE" -eq 1 ]; then
    if git push "$REMOTE" --delete "$b" >/dev/null 2>&1; then
      echo "supprimée : $b"
    else
      echo "✖ échec (droits ?) : $b" >&2
    fi
  else
    echo "$b"
  fi
done <<< "$candidates"

echo
if [ "$DELETE" -eq 1 ]; then
  echo "$total branche(s) traitée(s)."
else
  echo "$total branche(s) supprimables. Relance avec --delete pour appliquer."
fi
