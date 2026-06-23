#!/usr/bin/env bash
set -uo pipefail

# Sonde de disponibilité ForetMap — indépendante du déploiement.
# Interroge /api/ready ; n'alerte (email) qu'au CHANGEMENT d'état (up→down, down→up),
# via un fichier d'état, pour éviter le spam à chaque passage du cron.
#
# Usage cron (ex. toutes les 5 min) :
#   */5 * * * * APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://foretmap.olution.info \
#     /home/USER/foretmap/scripts/uptime-check.sh >> /home/USER/foretmap/logs/uptime.log 2>&1
#
# Variables :
#   DEPLOY_BASE_URL  base publique (def https://foretmap.olution.info)
#   UPTIME_PATH      chemin sondé (def /api/ready)
#   APP_DIR          racine repo (pour ops-alert.js + fichier d'état)
#   UPTIME_STATE_FILE fichier d'état (def $APP_DIR/logs/.uptime-state)
#   DEPLOY_ENV_FILE  env à sourcer pour le SMTP (def $APP_DIR/.env)

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] [uptime] %s\n' "$(ts)" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_BASE_URL="${DEPLOY_BASE_URL:-https://foretmap.olution.info}"
UPTIME_PATH="${UPTIME_PATH:-/api/ready}"
UPTIME_STATE_FILE="${UPTIME_STATE_FILE:-$APP_DIR/logs/.uptime-state}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env}"

mkdir -p "$(dirname "$UPTIME_STATE_FILE")" 2>/dev/null || true
prev="unknown"
[ -f "$UPTIME_STATE_FILE" ] && prev="$(cat "$UPTIME_STATE_FILE" 2>/dev/null || echo unknown)"

url="$DEPLOY_BASE_URL$UPTIME_PATH"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url" 2>/dev/null || echo 000)"

if [ "$code" = "200" ]; then
  cur="up"
else
  cur="down"
fi

alert() {
  # Charge le SMTP puis délègue à ops-alert.js (qui n'échoue jamais).
  if [ -f "$DEPLOY_ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$DEPLOY_ENV_FILE"
    set +a
  fi
  node "$APP_DIR/scripts/ops-alert.js" "$1" "$2" || true
}

if [ "$cur" != "$prev" ]; then
  if [ "$cur" = "down" ]; then
    log "ÉTAT down (HTTP $code sur $url) — alerte."
    alert "Service INDISPONIBLE" "Sonde $url : HTTP $code à $(ts).
État précédent : $prev."
  else
    log "ÉTAT up (HTTP 200) — rétabli."
    [ "$prev" = "down" ] && alert "Service rétabli" "Sonde $url : HTTP 200 à $(ts)."
  fi
else
  log "État inchangé ($cur, HTTP $code)."
fi

printf '%s' "$cur" >"$UPTIME_STATE_FILE" 2>/dev/null || true
exit 0
