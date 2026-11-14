# shellcheck shell=bash
# Politique « redémarrer ou non » du déploiement automatique (scripts/auto-deploy-cron.sh).
# À sourcer ; fonctions pures (git + grep), testées par tests/deploy-restart-policy.test.js.
#
# Un déploiement ne redémarre le processus Node que si au moins un fichier modifié a un effet
# au démarrage. N'en ont pas :
#   - les chemins de DEPLOY_SOFT_CHANGE_REGEX (documentation, tests, configuration d'outils) ;
#   - `package.json` / `package-lock.json` quand seul le champ `version` change : c'est le
#     commit de version que le workflow release.yml pousse après **chaque** fusion. Sans cette
#     règle, aucun déploiement n'était jamais « léger » (le commit de version l'accompagne
#     toujours) et une PR de documentation redémarrait le site comme une autre. Effet connu :
#     /api/version affiche l'ancien numéro jusqu'au prochain redémarrage.

# Fichiers sans effet au démarrage : documentation (tout *.md), tests, e2e, outillage.
DEPLOY_SOFT_CHANGE_REGEX_DEFAULT='^(LICENSE(\.txt)?|\.gitattributes|\.prettierignore|\.prettierrc[^/]*|docs/|\.github/|\.cursor/|\.claude/|\.githooks/|tests/|tests-ui/|e2e/)|\.md$'

# 0 si le diff de $3 entre $1 et $2 ne touche que le champ "version" de premier niveau
# (package.json : 1 ligne retirée + 1 ajoutée ; package-lock.json : la racine et packages[""],
# soit 2 + 2 au plus).
deploy_version_only_change() {
  local from="$1" to="$2" file="$3" lines max
  lines="$(git diff -U0 "$from" "$to" -- "$file" 2>/dev/null | grep -E '^[+-]' | grep -Ev '^(\+\+\+|---) ')" || true
  [ -n "$lines" ] || return 1
  if printf '%s\n' "$lines" | grep -Evq '^[+-][[:space:]]*"version":[[:space:]]*"[^"]*",?[[:space:]]*$'; then
    return 1
  fi
  case "$file" in
    package.json) max=2 ;;
    *) max=4 ;;
  esac
  [ "$(printf '%s\n' "$lines" | wc -l | tr -d ' ')" -le "$max" ]
}

# 0 si les dépendances ont réellement changé (npm ci nécessaire) : package.json ou
# package-lock.json modifié au-delà du seul champ "version".
deploy_dependencies_changed() {
  local from="$1" to="$2" changed="$3" f
  for f in package.json package-lock.json; do
    grep -qx "$f" <<<"$changed" || continue
    deploy_version_only_change "$from" "$to" "$f" || return 0
  done
  return 1
}

# Liste (stdout) des fichiers qui imposent un redémarrage ; vide = déploiement « léger ».
#   $1 from, $2 to, $3 fichiers modifiés (un par ligne), $4 expression des fichiers légers.
deploy_restart_files() {
  local from="$1" to="$2" changed="$3" regex="${4:-$DEPLOY_SOFT_CHANGE_REGEX_DEFAULT}" f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if grep -Eq -- "$regex" <<<"$f"; then
      continue
    fi
    if { [ "$f" = "package.json" ] || [ "$f" = "package-lock.json" ]; } &&
      deploy_version_only_change "$from" "$to" "$f"; then
      continue
    fi
    printf '%s\n' "$f"
  done <<<"$changed"
}
