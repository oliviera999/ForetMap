#!/usr/bin/env bash
set -euo pipefail

# Chiffre les sauvegardes en clair déjà présentes (foretmap-*.sql.gz) produites avant
# l'activation du chiffrement (audit RGPD du 28/09/2026, constat S-7), puis supprime l'original.
#
# Pour chaque fichier : chiffrement vers <nom>.sql.gz.enc, contrôle que le déchiffrement
# redonne exactement l'original (octet pour octet), date de modification conservée (la
# rotation de db-backup.sh continue de purger au bon moment), puis suppression du clair.
# Un fichier dont le contrôle échoue est laissé tel quel.
#
# Usage : scripts/encrypt-existing-backups.sh [--dry-run]
# Variables : BACKUP_DIR (def $APP_DIR/backups), BACKUP_ENCRYPT_KEY_FILE (requis),
#             APP_DIR, DEPLOY_ENV_FILE — comme db-backup.sh.

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] [encrypt-backups] %s\n' "$(ts)" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env}"

# shellcheck source=lib/backup-crypto.sh
. "$SCRIPT_DIR/lib/backup-crypto.sh"

DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      log "option inconnue: $1"
      exit 2
      ;;
  esac
done

if [ -f "$DEPLOY_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DEPLOY_ENV_FILE"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEY_FILE="${BACKUP_ENCRYPT_KEY_FILE:-}"
if ! key_error="$(backup_key_usable "$KEY_FILE" 2>&1)"; then
  log "ÉCHEC : $key_error."
  exit 1
fi
if [ ! -d "$BACKUP_DIR" ]; then
  log "dossier absent : $BACKUP_DIR — rien à chiffrer."
  exit 0
fi

umask 077
done_count=0
failed_count=0
shopt -s nullglob
for plain in "$BACKUP_DIR"/foretmap-*.sql.gz; do
  enc="$plain.enc"
  if [ -e "$enc" ]; then
    log "déjà chiffré, ignoré : $plain (supprimer le clair à la main après vérification)"
    continue
  fi
  if [ "$DRY_RUN" = "1" ]; then
    log "[à blanc] chiffrerait : $plain"
    continue
  fi
  tmp="$enc.partial"
  if backup_encrypt_stream "$KEY_FILE" <"$plain" >"$tmp" &&
    backup_decrypt_file "$KEY_FILE" "$tmp" | cmp -s - "$plain"; then
    touch -r "$plain" "$tmp"
    mv "$tmp" "$enc"
    rm -f "$plain"
    log "chiffré : $enc"
    done_count=$((done_count + 1))
  else
    rm -f "$tmp"
    log "ÉCHEC, original conservé : $plain"
    failed_count=$((failed_count + 1))
  fi
done

log "terminé : $done_count chiffré(s), $failed_count échec(s)."
[ "$failed_count" -eq 0 ]
