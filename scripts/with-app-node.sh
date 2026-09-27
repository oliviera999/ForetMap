#!/usr/bin/env bash
set -euo pipefail

# Lance une commande avec le `node` et le `npm` de l'application, depuis la racine du dépôt.
#
# Pour les lignes de crontab qui appellent `npm run …` : sur o2switch (CloudLinux), ni `node` ni
# `npm` ne sont dans le PATH du cron, la commande échouerait en « command not found » sans que
# personne ne le voie. La recherche est celle de scripts/lib/app-node.sh.
#
# Usage :
#   bash /home/USER/foretmap/scripts/with-app-node.sh npm run logs:purge -- --days=365 --apply
#
# Variables optionnelles : APP_DIR (défaut : parent du script), DEPLOY_NODE_BIN_DIR.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if [[ $# -eq 0 ]]; then
  echo "Usage : bash scripts/with-app-node.sh <commande> [arguments…]" >&2
  exit 2
fi

# shellcheck source=lib/app-node.sh
source "$SCRIPT_DIR/lib/app-node.sh"
if ! use_app_node; then
  printf '[%s] node et npm introuvables (ni PassengerNodejs dans .htaccess, ni PATH, ni ~/nodevenv/) : « %s » non lancé. Poser DEPLOY_NODE_BIN_DIR (docs/CRONTAB.md).\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
  exit 127
fi

cd "$APP_DIR"
exec "$@"
