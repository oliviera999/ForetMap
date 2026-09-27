# shellcheck shell=bash
#
# Met le `node` et le `npm` de l'APPLICATION dans le PATH des scripts lancés par la crontab.
#
# Sur o2switch (CloudLinux, « Setup Node.js App »), `node` et `npm` ne sont dans aucun PATH
# système : ils vivent dans le virtualenv de l'application (~/nodevenv/<dossier>/<version>/bin),
# que seul un terminal « activé » ajoute au PATH (docs/EXPLOITATION.md, § 1 bis). Le PATH d'une
# tâche cron est plus court encore. Sans cette recherche, chaque `node …` ou `npm …` d'un script
# de la crontab échoue en « command not found » : contrôle de l'artefact, migrations, alertes —
# le déploiement automatique ne peut rien faire.
#
# Ordre de recherche (le premier dossier qui contient `node` ET `npm` exécutables l'emporte) :
#  1. DEPLOY_NODE_BIN_DIR, si l'exploitant l'a posé (crontab ou `.env`) ;
#  2. la ligne `PassengerNodejs` du `.htaccess` que cPanel génère à la racine de l'application :
#     c'est le Node qui sert réellement le site, donc celui avec lequel `npm ci` doit compiler
#     les modules natifs (sharp) ;
#  3. un `node` déjà dans le PATH (poste de développement, CI, hébergeur classique) ;
#  4. ~/nodevenv/<dossier de l'application>/<version>/bin, ordre alphabétique inverse des
#     versions (22 avant 20 : la plus haute, tant qu'elles ont le même nombre de chiffres).
#
# Usage (APP_DIR doit être posé) :
#   source "$SCRIPT_DIR/lib/app-node.sh"
#   use_app_node || { echo "node introuvable" >&2; exit 1; }
# En sortie : PATH exporté, APP_NODE_BIN_DIR = dossier retenu (vide si node venait du PATH).

# Dossiers désignés explicitement : DEPLOY_NODE_BIN_DIR, puis PassengerNodejs du `.htaccess`.
app_node_declared_dirs() {
  if [[ -n "${DEPLOY_NODE_BIN_DIR:-}" ]]; then
    printf '%s\n' "$DEPLOY_NODE_BIN_DIR"
  fi
  if [[ -f "$APP_DIR/.htaccess" ]]; then
    local node_path
    # PassengerNodejs "/home/USER/nodevenv/<dossier>/22/bin/node" (guillemets facultatifs).
    # `sed -n '1p'` lit tout son entrée : pas de SIGPIPE sous `pipefail`.
    node_path="$(sed -n 's/^[[:space:]]*PassengerNodejs[[:space:]]\{1,\}"\{0,1\}\([^"[:space:]]*\).*/\1/p' \
      "$APP_DIR/.htaccess" | sed -n '1p')"
    if [[ -n "$node_path" ]]; then
      printf '%s\n' "${node_path%/*}"
    fi
  fi
}

# Virtualenvs CloudLinux de l'application, glob inversé (22 avant 20). Le dossier du
# virtualenv reprend le chemin de l'application relatif au HOME (ou, à défaut, son nom).
app_node_venv_dirs() {
  [[ -n "${HOME:-}" ]] || return 0
  local rel i
  local -a dirs
  for rel in "${APP_DIR#"$HOME"/}" "$(basename "$APP_DIR")"; do
    dirs=("$HOME/nodevenv/$rel"/*/bin)
    for ((i = ${#dirs[@]} - 1; i >= 0; i--)); do
      printf '%s\n' "${dirs[i]}"
    done
  done
}

# Prend le premier dossier de la liste lue sur l'entrée standard qui contient node et npm. Lit
# la liste JUSQU'AU BOUT : sortir dès le premier trouvé tuerait l'écrivain d'un SIGPIPE, et le
# tube entier échouerait sous `pipefail`.
app_node_pick_dir() {
  local dir found=""
  while IFS= read -r dir; do
    if [[ -z "$found" ]] && [[ -n "$dir" ]] && [[ -x "$dir/node" ]] && [[ -x "$dir/npm" ]]; then
      found="$dir"
    fi
  done
  [[ -n "$found" ]] || return 1
  printf '%s\n' "$found"
}

use_app_node() {
  local dir
  if [[ -n "${DEPLOY_NODE_BIN_DIR:-}" ]] &&
    ! printf '%s\n' "$DEPLOY_NODE_BIN_DIR" | app_node_pick_dir >/dev/null; then
    printf 'DEPLOY_NODE_BIN_DIR=%s ne contient pas node et npm exécutables : ignoré.\n' \
      "$DEPLOY_NODE_BIN_DIR" >&2
  fi
  if dir="$(app_node_declared_dirs | app_node_pick_dir)"; then
    :
  elif command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    APP_NODE_BIN_DIR=""
    return 0
  elif ! dir="$(app_node_venv_dirs | app_node_pick_dir)"; then
    return 1
  fi
  APP_NODE_BIN_DIR="$dir"
  PATH="$dir:$PATH"
  export PATH
  return 0
}
