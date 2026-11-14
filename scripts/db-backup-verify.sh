#!/usr/bin/env bash
set -uo pipefail

# Vérification d'une sauvegarde BDD ForetMap — SANS restauration, SANS fichier clair sur disque.
#
# Usage : bash scripts/db-backup-verify.sh [fichier]
#   sans argument : dernière sauvegarde de BACKUP_DIR (hors fichiers `.partial`).
#
# Le fichier est déchiffré (BACKUP_ENCRYPT_KEY_FILE) et décompressé **en flux** ; un seul `awk`
# lit le SQL et n'en retient que des faits (en-tête, noms de tables, dernière ligne) : aucune
# ligne de données n'est écrite ni affichée. Contrôles :
#   1. en-tête `-- MariaDB dump` / `-- MySQL dump` dans les premières lignes ;
#   2. dernière ligne non vide « -- Dump completed » (dump terminé) ;
#   3. présence des tables clés (BACKUP_VERIFY_TABLES) ;
#   4. taille par rapport à la sauvegarde précédente : échec si elle chute de plus de
#      BACKUP_VERIFY_MAX_DROP_PCT % (défaut 30).
#
# Sortie : une ligne `OK : …` (code 0) ou `ÉCHEC : raison` (code 1). En cas d'échec, alerte
# e-mail par scripts/ops-alert.js (si node est trouvé ; BACKUP_VERIFY_ALERT=0 pour couper).
#
# Variables (chargées depuis $DEPLOY_ENV_FILE / .env ou l'environnement) :
#   APP_DIR, DEPLOY_ENV_FILE, BACKUP_DIR (def $APP_DIR/backups), BACKUP_ENCRYPT_KEY_FILE
#   BACKUP_VERIFY_TABLES       (def « users plants tasks quiz_questions schema_version »)
#   BACKUP_VERIFY_MAX_DROP_PCT (def 30 ; 0 = pas de contrôle de taille)
#   BACKUP_VERIFY_ALERT        (def 1)

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] [db-backup-verify] %s\n' "$(ts)" "$*"; }

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
TABLES="${BACKUP_VERIFY_TABLES:-users plants tasks quiz_questions schema_version}"
MAX_DROP="${BACKUP_VERIFY_MAX_DROP_PCT:-30}"
KEY_FILE="${BACKUP_ENCRYPT_KEY_FILE:-}"

# shellcheck source=lib/backup-crypto.sh
. "$SCRIPT_DIR/lib/backup-crypto.sh"

alert() {
  [ "${BACKUP_VERIFY_ALERT:-1}" = "1" ] || return 0
  [ -f "$APP_DIR/scripts/ops-alert.js" ] || return 0
  if [ -f "$SCRIPT_DIR/lib/app-node.sh" ]; then
    # shellcheck source=lib/app-node.sh
    . "$SCRIPT_DIR/lib/app-node.sh"
    use_app_node >/dev/null 2>&1 || return 0
  fi
  command -v node >/dev/null 2>&1 || return 0
  node "$APP_DIR/scripts/ops-alert.js" "[ForetMap] Sauvegarde BDD invalide" "$*" >/dev/null 2>&1 || true
}

fail() {
  log "ÉCHEC : $*"
  alert "db-backup-verify : $* (serveur $(hostname 2>/dev/null || echo '?'), $(ts))"
  exit 1
}

# Sauvegardes du dossier, de la plus récente à la plus ancienne.
list_backups() {
  ls -1t "$BACKUP_DIR"/foretmap-*.sql.gz "$BACKUP_DIR"/foretmap-*.sql.gz.enc 2>/dev/null | grep -Ev '\.partial$' || true
}

FILE="${1:-}"
if [ -z "$FILE" ]; then
  FILE="$(list_backups | sed -n '1p')"
  [ -n "$FILE" ] || fail "aucune sauvegarde dans $BACKUP_DIR"
fi
[ -f "$FILE" ] || fail "fichier introuvable : $FILE"
[ -s "$FILE" ] || fail "fichier vide : $FILE"

FORMAT="$(backup_format_of "$FILE")"
[ -n "$FORMAT" ] || fail "extension inattendue : $(basename "$FILE") (.sql.gz ou .sql.gz.enc)"
if [ "$FORMAT" = "enc" ]; then
  key_error="$(backup_key_usable "$KEY_FILE" 2>&1)" || fail "déchiffrement impossible : $key_error"
fi

# Lecture en flux : seuls des faits sortent de awk (jamais une ligne de données).
facts="$(
  set -o pipefail
  backup_read_sql "$KEY_FILE" "$FILE" "$FORMAT" 2>/dev/null | awk '
    NR <= 5 && /^-- (MariaDB|MySQL) dump/ { header = 1 }
    /^CREATE TABLE `/ {
      name = $0
      sub(/^CREATE TABLE `/, "", name)
      sub(/`.*/, "", name)
      tables[name] = 1
    }
    NF { last = $0 }
    END {
      printf "HEADER=%d\n", header
      printf "COMPLETED=%d\n", (last ~ /^-- Dump completed/) ? 1 : 0
      printf "TABLES="
      for (t in tables) printf " %s", t
      printf "\n"
      printf "LINES=%d\n", NR
    }'
)"
status=$?
[ "$status" -eq 0 ] || fail "lecture impossible de $(basename "$FILE") (déchiffrement ou archive gzip invalide)"

header="$(printf '%s\n' "$facts" | sed -n 's/^HEADER=//p')"
completed="$(printf '%s\n' "$facts" | sed -n 's/^COMPLETED=//p')"
found_tables=" $(printf '%s\n' "$facts" | sed -n 's/^TABLES= *//p') "
lines="$(printf '%s\n' "$facts" | sed -n 's/^LINES=//p')"

[ "$header" = "1" ] || fail "$(basename "$FILE") : en-tête MariaDB/MySQL absent"
[ "$completed" = "1" ] || fail "$(basename "$FILE") : dump tronqué (pas de « -- Dump completed » final)"

missing=""
for t in $TABLES; do
  case "$found_tables" in *" $t "*) ;; *) missing="$missing $t" ;; esac
done
[ -z "$missing" ] || fail "$(basename "$FILE") : table(s) absente(s) :$missing"

size="$(stat -c '%s' "$FILE" 2>/dev/null || wc -c <"$FILE")"
size_note=""
if [ "${MAX_DROP:-0}" -gt 0 ] 2>/dev/null; then
  prev=""
  while read -r f; do
    [ "$f" = "$FILE" ] && continue
    # La précédente = la plus récente qui soit plus ancienne que le fichier vérifié.
    if [ "$f" -ot "$FILE" ]; then
      prev="$f"
      break
    fi
  done < <(list_backups)
  if [ -n "$prev" ]; then
    prev_size="$(stat -c '%s' "$prev" 2>/dev/null || wc -c <"$prev")"
    if [ "${prev_size:-0}" -gt 0 ]; then
      floor=$((prev_size * (100 - MAX_DROP) / 100))
      if [ "$size" -lt "$floor" ]; then
        pct=$(((prev_size - size) * 100 / prev_size))
        fail "$(basename "$FILE") : taille $size octets, en baisse de $pct % sur la précédente ($(basename "$prev"), $prev_size octets ; seuil $MAX_DROP %)"
      fi
      size_note=", précédente $prev_size octets"
    fi
  fi
fi

table_count="$(printf '%s' "$found_tables" | wc -w | tr -d ' ')"
log "OK : $(basename "$FILE") — $size octets$size_note, $table_count tables, $lines lignes, dump complet."
exit 0
