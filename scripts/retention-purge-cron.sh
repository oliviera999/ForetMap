#!/usr/bin/env bash
set -euo pipefail

# Purge planifiée des durées de conservation — tâche de la crontab (docs/CRONTAB.md, ligne 5 ;
# docs/EXPLOITATION.md, « Purge planifiée »).
#
# Lance scripts/retention-purge.js avec les arguments reçus. La crontab passe `--apply` ; tant
# que `RETENTION_PURGE_APPLY=1` n'est pas posé dans le `.env` du serveur, l'exécution reste une
# SIMULATION (comptages seulement, rien n'est supprimé ni modifié).
#
# Silencieux en cas de succès : la sortie va au journal (logs/retention-purge.log), aucun
# e-mail. En cas d'échec (code 1) ou de seuil dépassé (code 3), alerte par e-mail
# (scripts/ops-alert.js, destinataire OPS_ALERT_TO) avec la fin de la sortie — qui ne contient
# que des catégories et des comptages, jamais de nom ni d'identifiant —, puis rend le même code
# (le cron le voit aussi).
#
# Pas de verrou fichier : la purge prend un verrou EN BASE (GET_LOCK), libéré même si le
# processus est tué. Un verrou `mkdir` resté orphelin ferait taire la purge sans alerte.
#
# Usage (crontab) :
#   APP_DIR=/home/USER/foretmap bash /home/USER/foretmap/scripts/retention-purge-cron.sh --apply
#
# Variables optionnelles :
# - APP_DIR                 : racine du dépôt (défaut : parent du script)
# - RETENTION_CRON_NO_ALERT : 1 pour ne pas envoyer d'e-mail (journal seul)
# - DEPLOY_NODE_BIN_DIR     : dossier de `node` si la recherche automatique échoue

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] %s\n' "$(ts)" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"

cd "$APP_DIR"

# node hors du PATH du cron sur o2switch : celui de l'application (scripts/lib/app-node.sh).
if [[ -f scripts/lib/app-node.sh ]]; then
  # shellcheck source=lib/app-node.sh
  source scripts/lib/app-node.sh
  if ! use_app_node; then
    log "ÉCHEC : node et npm introuvables : purge non lancée, aucune alerte possible (DEPLOY_NODE_BIN_DIR, docs/CRONTAB.md)."
    exit 1
  fi
fi

alert() {
  local subject="$1"
  local body="$2"
  if [ "${RETENTION_CRON_NO_ALERT:-0}" = "1" ]; then
    log "Alerte (e-mail coupé) : $subject"
    return 0
  fi
  printf '%s\n' "$body" | node scripts/ops-alert.js "$subject" || true
}

log "Purge planifiée : début"
set +e
OUTPUT="$(node scripts/retention-purge.js "$@" 2>&1)"
CODE=$?
set -e
printf '%s\n' "$OUTPUT"

case "$CODE" in
  0)
    log "Purge planifiée : succès."
    ;;
  3)
    log "Purge planifiée : bloquée par un seuil (code 3) — rien n'a été supprimé dans la catégorie concernée."
    alert "[conservation] Purge planifiée bloquée par un seuil" "$(printf '%s\n' "$OUTPUT" | tail -n 60)"
    ;;
  *)
    log "Purge planifiée : ÉCHEC (code $CODE)."
    alert "[conservation] Purge planifiée en échec" "$(printf '%s\n' "$OUTPUT" | tail -n 60)"
    ;;
esac

log "Purge planifiée : fin (code $CODE)"
exit "$CODE"
