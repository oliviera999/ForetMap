#!/usr/bin/env bash
set -uo pipefail

# Copie hors du serveur de la dernière sauvegarde BDD — FACULTATIVE, désactivée par défaut.
#
# Usage : bash scripts/db-backup-offsite.sh
#
# Ne fait rien (sortie 0, message) tant que BACKUP_OFFSITE_REMOTE n'est pas défini ou que
# `rclone` est introuvable. Sinon :
#   1. prend la dernière sauvegarde **chiffrée** (`.sql.gz.enc`) de BACKUP_DIR — un fichier en
#      clair n'est JAMAIS copié (refus explicite si la dernière sauvegarde n'est pas chiffrée) ;
#   2. la copie sur le dépôt distant (`rclone copyto`, nom inchangé) et vérifie la taille ;
#   3. rotation distante : garde les BACKUP_OFFSITE_KEEP fichiers `foretmap-*.sql.gz.enc` les
#      plus récents (défaut 14 ; 0 = pas de rotation).
#
# Variables (chargées depuis $DEPLOY_ENV_FILE / .env ou l'environnement) :
#   BACKUP_OFFSITE_REMOTE   dépôt rclone + dossier, ex. « gdrive-foretmap:sauvegardes »
#   BACKUP_OFFSITE_KEEP     nombre de fichiers gardés à distance (def 14)
#   RCLONE_BIN              chemin de rclone (def : PATH, puis ~/bin/rclone)
#   BACKUP_DIR, APP_DIR, DEPLOY_ENV_FILE
# Installation de rclone sans droits root et configuration : docs/EXPLOITATION.md,
# « Copie hors du serveur ».

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] [db-backup-offsite] %s\n' "$(ts)" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env}"

if [ -f "$DEPLOY_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DEPLOY_ENV_FILE"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
REMOTE="${BACKUP_OFFSITE_REMOTE:-}"
KEEP="${BACKUP_OFFSITE_KEEP:-14}"

if [ -z "$REMOTE" ]; then
  log "désactivée (BACKUP_OFFSITE_REMOTE non défini) — rien à faire."
  exit 0
fi

RCLONE="${RCLONE_BIN:-}"
if [ -z "$RCLONE" ]; then
  if command -v rclone >/dev/null 2>&1; then
    RCLONE="$(command -v rclone)"
  elif [ -x "${HOME:-}/bin/rclone" ]; then
    RCLONE="$HOME/bin/rclone"
  fi
fi
if [ -z "$RCLONE" ] || [ ! -x "$RCLONE" ]; then
  log "rclone introuvable (PATH, ~/bin/rclone ou RCLONE_BIN) — copie hors serveur non faite."
  exit 0
fi

latest="$(ls -1t "$BACKUP_DIR"/foretmap-*.sql.gz "$BACKUP_DIR"/foretmap-*.sql.gz.enc 2>/dev/null | grep -Ev '\.partial$' | sed -n '1p')"
if [ -z "$latest" ]; then
  log "ÉCHEC : aucune sauvegarde dans $BACKUP_DIR."
  exit 1
fi
case "$latest" in
  *.sql.gz.enc) ;;
  *)
    log "ÉCHEC : la dernière sauvegarde ($(basename "$latest")) n'est pas chiffrée — copie hors serveur refusée (BACKUP_ENCRYPT_KEY_FILE)."
    exit 1
    ;;
esac

name="$(basename "$latest")"
dest="${REMOTE%/}/$name"
if ! "$RCLONE" copyto "$latest" "$dest" >/dev/null 2>&1; then
  log "ÉCHEC : copie de $name vers le dépôt distant."
  exit 1
fi

local_size="$(stat -c '%s' "$latest" 2>/dev/null || wc -c <"$latest")"
remote_size="$("$RCLONE" size --json "$dest" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
if [ -n "$remote_size" ] && [ "$remote_size" != "$local_size" ]; then
  log "ÉCHEC : taille distante ($remote_size) ≠ taille locale ($local_size) pour $name."
  exit 1
fi
log "OK : $name copié ($local_size octets)."

if [ "${KEEP:-0}" -gt 0 ] 2>/dev/null; then
  # Les noms portent la date (foretmap-AAAAmmjj-HHMMSS…) : l'ordre alphabétique est chronologique.
  old="$("$RCLONE" lsf --files-only --include 'foretmap-*.sql.gz.enc' "${REMOTE%/}" 2>/dev/null | sort -r | tail -n "+$((KEEP + 1))")"
  if [ -n "$old" ]; then
    while read -r f; do
      [ -n "$f" ] || continue
      if "$RCLONE" deletefile "${REMOTE%/}/$f" >/dev/null 2>&1; then
        log "rotation distante : $f supprimé."
      else
        log "attention : rotation distante impossible pour $f."
      fi
    done <<<"$old"
  fi
fi
exit 0
