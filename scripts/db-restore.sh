#!/usr/bin/env bash
set -euo pipefail

# Restauration d'une sauvegarde ForetMap produite par scripts/db-backup.sh.
# Accepte les sauvegardes chiffrées (.sql.gz.enc, clé BACKUP_ENCRYPT_KEY_FILE) et, pour
# l'historique, les anciennes sauvegardes en clair (.sql.gz).
#
# Usage :
#   scripts/db-restore.sh <fichier> --check            vérifie seulement (déchiffre + marque de fin)
#   scripts/db-restore.sh <fichier> --to-file <x.sql>  écrit le SQL clair dans un fichier (droits 600)
#   scripts/db-restore.sh <fichier> [--yes]            restaure dans la base DB_NAME (ÉCRASE ses tables)
#
# Variables (chargées depuis $DEPLOY_ENV_FILE / .env ou l'environnement) :
#   DB_HOST (def 127.0.0.1), DB_PORT (def 3306), DB_NAME, DB_USER, DB_PASS
#   BACKUP_ENCRYPT_KEY_FILE   phrase secrète (requise pour un .sql.gz.enc)
#   APP_DIR, DEPLOY_ENV_FILE  comme db-backup.sh
#
# Sans --yes, la restauration demande de retaper le nom de la base (terminal requis).

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] [db-restore] %s\n' "$(ts)" "$*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env}"

# shellcheck source=lib/backup-crypto.sh
. "$SCRIPT_DIR/lib/backup-crypto.sh"

FILE=""
MODE="restore"
TO_FILE=""
ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check)
      MODE="check"
      shift
      ;;
    --to-file)
      MODE="to-file"
      TO_FILE="${2:-}"
      shift
      [ $# -gt 0 ] && shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -*)
      log "option inconnue: $1"
      exit 2
      ;;
    *)
      FILE="$1"
      shift
      ;;
  esac
done

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  log "fichier de sauvegarde absent : '${FILE}'. Usage : $0 <fichier> [--check | --to-file <x.sql> | --yes]"
  exit 2
fi

if [ -f "$DEPLOY_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DEPLOY_ENV_FILE"
  set +a
fi

KEY_FILE="${BACKUP_ENCRYPT_KEY_FILE:-}"
FORMAT="$(backup_format_of "$FILE")"
if [ -z "$FORMAT" ]; then
  log "extension inattendue : $FILE (.sql.gz ou .sql.gz.enc)"
  exit 2
fi
if [ "$FORMAT" = "enc" ] && ! key_error="$(backup_key_usable "$KEY_FILE" 2>&1)"; then
  log "sauvegarde chiffrée mais $key_error."
  exit 1
fi

# Contrôle complet avant toute écriture : une restauration à moitié faite est pire qu'aucune.
if ! backup_verify "$KEY_FILE" "$FILE" "$FORMAT" 2>/dev/null; then
  log "ÉCHEC : sauvegarde illisible, tronquée ou clé incorrecte — $FILE"
  exit 1
fi
log "sauvegarde vérifiée (déchiffrable, complète) : $FILE"

case "$MODE" in
  check)
    exit 0
    ;;
  to-file)
    if [ -z "$TO_FILE" ]; then
      log "--to-file attend un chemin de sortie."
      exit 2
    fi
    umask 077
    backup_read_sql "$KEY_FILE" "$FILE" "$FORMAT" >"$TO_FILE"
    log "SQL clair écrit dans $TO_FILE — à supprimer dès que possible (données personnelles)."
    exit 0
    ;;
esac

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
if [ -z "${DB_NAME:-}" ] || [ -z "${DB_USER:-}" ]; then
  log "DB_NAME/DB_USER manquants — restauration impossible."
  exit 1
fi

CLIENT_BIN=""
for candidate in mariadb mysql; do
  if command -v "$candidate" >/dev/null 2>&1; then
    CLIENT_BIN="$candidate"
    break
  fi
done
if [ -z "$CLIENT_BIN" ]; then
  log "ni mariadb ni mysql — restauration impossible."
  exit 1
fi

if [ "$ASSUME_YES" != "1" ]; then
  if [ ! -t 0 ]; then
    log "restauration non interactive : ajouter --yes pour confirmer l'écrasement de '$DB_NAME'."
    exit 2
  fi
  printf 'Les tables de la base « %s » (%s:%s) vont être REMPLACÉES par %s.\n' \
    "$DB_NAME" "$DB_HOST" "$DB_PORT" "$FILE" >&2
  printf 'Retaper le nom de la base pour confirmer : ' >&2
  read -r answer
  if [ "$answer" != "$DB_NAME" ]; then
    log "confirmation incorrecte — rien n'a été modifié."
    exit 1
  fi
fi

log "restauration de $FILE dans '$DB_NAME' avec $CLIENT_BIN…"
if backup_read_sql "$KEY_FILE" "$FILE" "$FORMAT" |
  MYSQL_PWD="${DB_PASS:-}" "$CLIENT_BIN" \
    --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
    --default-character-set=utf8mb4 "$DB_NAME"; then
  log "OK : '$DB_NAME' restaurée. Lancer ensuite : npm run db:status (migrations postérieures ?)."
else
  log "ÉCHEC de la restauration dans '$DB_NAME' (voir le message du client SQL ci-dessus)."
  exit 1
fi
