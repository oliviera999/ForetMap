#!/usr/bin/env bash
set -euo pipefail

# Simulation quotidienne du lien Moodle (docs/AUDIT_MOODLE_IDENTITES_2026-09.md, section 17).
#
# Ce script ne fait QUE `--dry-run` : l'application réelle reste un geste humain depuis l'onglet
# Moodle de la console administrateur, après lecture du rapport. Il alerte par email (ops-alert)
# quand la simulation annonce des désactivations, des conflits ou des rapprochements en attente,
# ou quand elle échoue / est arrêtée par un seuil.
#
# Usage recommandé (crontab, voir docs/CRONTAB.md) :
#   APP_DIR=/home/USER/foretmap /home/USER/foretmap/scripts/moodle-sync-cron.sh
#
# Variables optionnelles :
# - APP_DIR              : racine du dépôt (défaut : parent du script)
# - MOODLE_CRON_LOCK_DIR : verrou anti-concurrence (défaut : /tmp/foretmap-moodle-sync.lock)
# - MOODLE_CRON_ARGS     : arguments supplémentaires passés à moodle-sync (ex. "--cohort 26#603")
# - MOODLE_CRON_NO_ALERT : 1 pour ne pas envoyer d'email (journal seul)
#
# Codes de sortie de scripts/moodle-sync.js :
#   0 rien à signaler · 2 non configuré · 3 à relire (désactivations, conflits, attentes)
#   4 seuil dépassé / verrou · 1 erreur

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] %s\n' "$(ts)" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOCK_DIR="${MOODLE_CRON_LOCK_DIR:-/tmp/foretmap-moodle-sync.lock}"
EXTRA_ARGS="${MOODLE_CRON_ARGS:-}"

# Verrou `mkdir` (atomique), comme auto-deploy-cron.sh : deux crons ne se chevauchent pas.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "Une simulation Moodle est déjà en cours (verrou $LOCK_DIR) : abandon."
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$APP_DIR"

alert() {
  local subject="$1"
  local body="$2"
  if [ "${MOODLE_CRON_NO_ALERT:-0}" = "1" ]; then
    log "Alerte (email coupé) : $subject"
    return 0
  fi
  printf '%s\n' "$body" | node scripts/ops-alert.js "$subject" || true
}

log "Simulation Moodle (dry-run) : début"
set +e
# shellcheck disable=SC2086
OUTPUT="$(node scripts/moodle-sync.js --dry-run --json $EXTRA_ARGS 2>&1)"
CODE=$?
set -e

case "$CODE" in
  0)
    log "Simulation terminée : rien à signaler."
    ;;
  2)
    log "Intégration Moodle non configurée : rien à faire."
    ;;
  3)
    SUMMARY="$(printf '%s' "$OUTPUT" | node -e '
      let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
        try {
          const start = s.indexOf("{"); const r = JSON.parse(s.slice(start));
          const t = (r.report && r.report.totals) || {};
          console.log(`Exécution #${r.runId} — ${r.status}\nPérimètre : ${(r.report.scope.cohortIdnumbers || []).join(", ")}\n` +
            `Désactivations : ${t.deactivations || 0}\nConflits : ${t.conflicts || 0}\nEn attente : ${t.pendingMatches || 0}\n` +
            `Conflits e-mail : ${t.emailConflicts || 0}\nCréations : ${t.creations || 0}\n\nRelire le rapport dans Paramètres administrateur → Moodle.`);
        } catch { console.log(s.slice(0, 4000)); }
      });' 2>/dev/null)"
    log "Simulation à relire :"
    printf '%s\n' "$SUMMARY"
    alert "[ForetMap] Simulation Moodle : décisions à prendre" "$SUMMARY"
    ;;
  4)
    log "Simulation arrêtée (seuil dépassé ou verrou) :"
    printf '%s\n' "$OUTPUT" | tail -n 40
    alert "[ForetMap] Simulation Moodle arrêtée par un seuil" "$(printf '%s' "$OUTPUT" | tail -n 60)"
    ;;
  *)
    log "Simulation en erreur (code $CODE) :"
    printf '%s\n' "$OUTPUT" | tail -n 40
    alert "[ForetMap] Simulation Moodle en erreur" "$(printf '%s' "$OUTPUT" | tail -n 60)"
    ;;
esac

log "Simulation Moodle : fin (code $CODE)"
exit 0
