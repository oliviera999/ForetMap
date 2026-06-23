#!/usr/bin/env bash
set -euo pipefail

# Sauvegarde BDD ForetMap — dump mysqldump compressé + rotation.
# Autonome (n'a besoin que de mysqldump + des variables DB_*), utilisable :
#   - en cron quotidien (ex. 0 3 * * * .../scripts/db-backup.sh) ;
#   - en snapshot pré-migration depuis scripts/auto-deploy-cron.sh (--label pre-migrate).
#
# Variables (chargées depuis $DEPLOY_ENV_FILE / .env ou l'environnement) :
#   DB_HOST (def 127.0.0.1), DB_PORT (def 3306), DB_NAME, DB_USER, DB_PASS  [requis : DB_NAME/DB_USER]
#   BACKUP_DIR             dossier des dumps (def $APP_DIR/backups)
#   BACKUP_RETENTION_DAYS  purge des dumps plus vieux que N jours (def 14)
#   APP_DIR                racine du repo (def : racine déduite du script)
#   DEPLOY_ENV_FILE        fichier d'env à sourcer (def $APP_DIR/.env)
#
# Usage : scripts/db-backup.sh [--label <texte>]
# Sortie : $BACKUP_DIR/foretmap-AAAAmmjj-HHMMSS[.label].sql.gz

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] [db-backup] %s\n' "$(ts)" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env}"

LABEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label)
      LABEL="$2"
      shift 2
      ;;
    *)
      log "option inconnue: $1"
      exit 2
      ;;
  esac
done

# Charge les variables d'environnement (DB_*, BACKUP_*) si présentes.
if [ -f "$DEPLOY_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DEPLOY_ENV_FILE"
  set +a
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -z "${DB_NAME:-}" ] || [ -z "${DB_USER:-}" ]; then
  log "DB_NAME/DB_USER manquants — sauvegarde impossible."
  exit 1
fi

if ! command -v mysqldump >/dev/null 2>&1; then
  log "mysqldump introuvable — sauvegarde ignorée (non bloquant)."
  exit 0
fi

mkdir -p "$BACKUP_DIR"

suffix=""
[ -n "$LABEL" ] && suffix=".$(printf '%s' "$LABEL" | tr -cs 'A-Za-z0-9_-' '-')"
out="$BACKUP_DIR/foretmap-$(date '+%Y%m%d-%H%M%S')${suffix}.sql.gz"
tmp="$out.partial"

log "Dump de '$DB_NAME' ($DB_HOST:$DB_PORT) → $out"

# Mot de passe via variable d'env MYSQL_PWD (évite de l'exposer dans argv/ps).
# --single-transaction : dump cohérent sans verrou long (InnoDB).
if MYSQL_PWD="${DB_PASS:-}" mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --single-transaction --quick --routines --triggers --events \
  --no-tablespaces "$DB_NAME" | gzip -c >"$tmp"; then
  mv "$tmp" "$out"
  log "OK : $(du -h "$out" | cut -f1) — $out"
else
  rm -f "$tmp"
  log "ÉCHEC du dump '$DB_NAME'."
  exit 1
fi

# Rotation : supprime les dumps plus vieux que la rétention.
if [ "$BACKUP_RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'foretmap-*.sql.gz' \
    -mtime "+$BACKUP_RETENTION_DAYS" -print -delete 2>/dev/null |
    while read -r purged; do log "purge: $purged"; done || true
fi

exit 0
