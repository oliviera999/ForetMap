#!/usr/bin/env bash
# Diagnostic de la crontab ForetMap — LECTURE SEULE, n'écrit rien, ne modifie rien.
#
# À lancer dans le terminal cPanel (par `bash`, sans `chmod +x`) :
#   bash ~/<dossier-de-l-application>/scripts/ops-crontab-check.sh
#
# Affiche, sans jamais imprimer une valeur secrète :
#   1. le dossier réel de l'application (PassengerAppRoot du .htaccess) ;
#   2. les lignes de `crontab -l` (secrets masqués), rapprochées des lignes 1 à 9 de
#      docs/CRONTAB.md : présente / absente / différente, et l'APP_DIR de chaque ligne ;
#   3. les NOMS des clés attendues dans le .env (présente / absente), jamais leur valeur ;
#   4. l'existence et les droits du fichier de clé de sauvegarde, jamais son contenu ;
#   5. chaque journal attendu, dans tous les dossiers candidats : chemin, taille, date de la
#      dernière ligne horodatée (la ligne elle-même n'est pas affichée) ;
#   6. le dernier fichier de sauvegarde (nom, date, taille) ;
#   7. la dernière exécution tracée en base de la purge de conservation et du rapport de santé.
#
# Variables (toutes facultatives) :
#   APP_DIR            racine de l'application (défaut : parent de ce script)
#   DEPLOY_ENV_FILE    fichier d'environnement (défaut : $APP_DIR/.env)
#   OPS_CRONTAB_FILE   lire ce fichier au lieu de `crontab -l` (tests)
#   OPS_CHECK_SKIP_DB  1 = ne pas interroger la base
#
# Code de sortie : 0 (c'est un rapport, pas un test).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env}"
HOME_DIR="${HOME:-}"

# Noms de variables dont la valeur est un secret (même règle que lib/mcp/secretMask.js, mais
# PASSENGER_* n'en fait pas partie : « pass » doit être un segment du nom).
SENSITIVE_NAME_ERE='(^|_)(PASS|PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|KEY|APIKEY|CREDENTIALS?|AUTH|DSN|SALT|COOKIE)(_|$)'

title() { printf '\n== %s ==\n' "$*"; }
tilde() {
  local p="$1"
  if [ -n "$HOME_DIR" ] && [ "${p#"$HOME_DIR"}" != "$p" ]; then printf '~%s' "${p#"$HOME_DIR"}"; else printf '%s' "$p"; fi
}
file_mtime() { stat -c '%y' "$1" 2>/dev/null | cut -d. -f1; }
file_size() { stat -c '%s' "$1" 2>/dev/null; }
file_mode() { stat -c '%a' "$1" 2>/dev/null; }

# --- Chargement du .env (aucune valeur n'est jamais affichée) -------------------------------
ENV_KEYS=""
if [ -f "$DEPLOY_ENV_FILE" ]; then
  ENV_KEYS="$(sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)[[:space:]]*=.*/\2/p' "$DEPLOY_ENV_FILE" | sort -u)"
  set -a
  # shellcheck disable=SC1090
  . "$DEPLOY_ENV_FILE" >/dev/null 2>&1
  set +a
fi
env_has() { printf '%s\n' "$ENV_KEYS" | grep -qx "$1"; }

# Noms des clés sensibles réellement définies : leurs valeurs seront masquées partout.
SECRET_NAMES="$(printf '%s\n' "$ENV_KEYS" | grep -E "$SENSITIVE_NAME_ERE" || true)"
export OPS_SECRET_NAMES="$SECRET_NAMES"

# Masque : NOM=valeur sensibles, identifiants dans une URL, en-têtes Bearer, et toute valeur
# littérale d'une clé sensible du .env (au moins 6 caractères).
mask() {
  awk -v ere="$SENSITIVE_NAME_ERE" '
    BEGIN {
      n = split(ENVIRON["OPS_SECRET_NAMES"], names, "\n")
      k = 0
      for (i = 1; i <= n; i++) {
        v = ENVIRON[names[i]]
        if (length(v) >= 6) secrets[++k] = v
      }
    }
    {
      line = $0
      for (i = 1; i <= k; i++) {
        s = secrets[i]
        out = ""
        while ((p = index(line, s)) > 0) {
          out = out substr(line, 1, p - 1) "****"
          line = substr(line, p + length(s))
        }
        line = out line
      }
      # NOM=valeur dont le nom est sensible
      res = ""
      while (match(line, /[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|\047[^\047]*\047|[^[:space:]]+)/)) {
        tok = substr(line, RSTART, RLENGTH)
        eq = index(tok, "=")
        name = substr(tok, 1, eq - 1)
        if (toupper(name) ~ ere) tok = name "=****"
        res = res substr(line, 1, RSTART - 1) tok
        line = substr(line, RSTART + RLENGTH)
      }
      line = res line
      gsub(/:\/\/[^:\/@[:space:]]+:[^@[:space:]]+@/, "://****:****@", line)
      gsub(/Bearer[[:space:]]+[A-Za-z0-9._~+\/=-]+/, "Bearer ****", line)
      print line
    }'
}

# --- 1. Dossier réel de l'application --------------------------------------------------------
title "1. Dossier de l'application"
REAL_APP_DIR="$(cd "$APP_DIR" 2>/dev/null && pwd -P || printf '%s' "$APP_DIR")"
printf 'Dossier de ce script : %s\n' "$(tilde "$REAL_APP_DIR")"
PASSENGER_ROOT=""
if [ -r "$APP_DIR/.htaccess" ]; then
  PASSENGER_ROOT="$(sed -n 's/^[[:space:]]*PassengerAppRoot[[:space:]]\{1,\}"\{0,1\}\([^"[:space:]]*\).*/\1/p' "$APP_DIR/.htaccess" | sed -n '1p')"
fi
if [ -n "$PASSENGER_ROOT" ]; then
  printf 'PassengerAppRoot (.htaccess) : %s\n' "$(tilde "$PASSENGER_ROOT")"
  REF_DIR="$(cd "$PASSENGER_ROOT" 2>/dev/null && pwd -P || printf '%s' "$PASSENGER_ROOT")"
else
  printf 'PassengerAppRoot : non lisible (.htaccess absent ou sans cette ligne) — référence = dossier du script.\n'
  REF_DIR="$REAL_APP_DIR"
fi

# --- 2. Crontab ------------------------------------------------------------------------------
title "2. Crontab (valeurs sensibles masquées)"
CRON_TEXT=""
if [ -n "${OPS_CRONTAB_FILE:-}" ]; then
  CRON_TEXT="$(cat "$OPS_CRONTAB_FILE" 2>/dev/null || true)"
elif command -v crontab >/dev/null 2>&1; then
  CRON_TEXT="$(crontab -l 2>/dev/null || true)"
else
  printf 'commande crontab introuvable.\n'
fi
CRON_LINES="$(printf '%s\n' "$CRON_TEXT" | grep -Ev '^[[:space:]]*(#|$)' || true)"
if [ -z "$CRON_LINES" ]; then
  printf 'CRONTAB VIDE : aucune ligne active.\n'
else
  printf '%s\n' "$CRON_LINES" | mask | sed 's/^/  | /'
fi

# Lignes attendues : numéro;libellé;motif (ERE);journal;obligatoire (1/0)
EXPECTED="1;déploiement automatique;scripts/auto-deploy-cron\.sh;foretmap-auto-deploy.log;1
2;sauvegarde de la base;scripts/db-backup\.sh;db-backup.log;1
3;sonde de disponibilité;scripts/uptime-check\.sh;uptime.log;1
4;keepalive (/api/health);curl.*/api/health;;1
5;purge de conservation;scripts/retention-purge-cron\.sh;retention-purge.log;1
6;simulation Moodle (facultatif);scripts/moodle-sync-cron\.sh;moodle-sync.log;0
7;fichiers orphelins (facultatif);db:uploads:reconcile;reconcile-uploads.log;0
8;rotation des journaux (facultatif);logrotate|-size [+]5M;;0
9;rapport de santé;scripts/health-report\.js;health-report.log;1"

LOG_DIRS_FROM_CRON=""
printf '\nRapprochement avec docs/CRONTAB.md :\n'
while IFS=';' read -r num label pattern logname required; do
  line="$(printf '%s\n' "$CRON_LINES" | grep -E -- "$pattern" | sed -n '1p' || true)"
  if [ -z "$line" ]; then
    if [ "$required" = "1" ]; then
      printf '  [%s] %-34s ABSENTE\n' "$num" "$label"
    else
      printf '  [%s] %-34s absente (facultative)\n' "$num" "$label"
    fi
    continue
  fi
  issues=""
  app_dir="$(printf '%s' "$line" | sed -n 's/.*APP_DIR=\([^[:space:]]*\).*/\1/p')"
  if [ -z "$app_dir" ]; then
    # Sans APP_DIR, le script se repère sur son propre chemin.
    app_dir="$(printf '%s' "$line" | sed -n 's#.*[[:space:]]\([^[:space:]]*\)/scripts/[^[:space:]]*.*#\1#p')"
  fi
  if [ -n "$app_dir" ]; then
    real="$(cd "$app_dir" 2>/dev/null && pwd -P || true)"
    if [ -z "$real" ]; then
      issues="$issues APP_DIR inexistant ($(tilde "$app_dir"));"
    elif [ "$real" != "$REF_DIR" ]; then
      issues="$issues APP_DIR=$(tilde "$app_dir") ≠ dossier de l'application ($(tilde "$REF_DIR"));"
    fi
  fi
  if printf '%s' "$line" | grep -Eq 'scripts/[^[:space:]]+\.sh' && ! printf '%s' "$line" | grep -Eq 'bash[[:space:]]+[^[:space:]]*scripts/'; then
    issues="$issues script appelé sans « bash » (droit d'exécution requis);"
  fi
  if [ "$num" = "5" ] && ! printf '%s' "$line" | grep -q -- '--apply'; then
    issues="$issues sans --apply (simulation seule);"
  fi
  if [ "$num" = "4" ] && ! printf '%s' "$line" | grep -Eq '^\*/[1-4][[:space:]]'; then
    issues="$issues cadence > 4 min (seuil d'inactivité Passenger : 300 s);"
  fi
  target="$(printf '%s' "$line" | sed -n 's/.*>>[[:space:]]*\([^[:space:]]*\).*/\1/p')"
  if [ -n "$target" ]; then
    LOG_DIRS_FROM_CRON="$LOG_DIRS_FROM_CRON
$(dirname "$target")"
    if [ -n "$logname" ] && [ "$(basename "$target")" != "$logname" ]; then
      issues="$issues journal nommé $(basename "$target") au lieu de $logname;"
    fi
    printf '  [%s] %-34s présente → journal %s' "$num" "$label" "$(tilde "$target")"
  else
    printf '  [%s] %-34s présente' "$num" "$label"
  fi
  if [ -n "$issues" ]; then printf '\n      DIFFÉRENTE :%s\n' "$issues"; else printf '\n'; fi
done <<<"$EXPECTED"

# --- 3. Clés du .env -------------------------------------------------------------------------
title "3. Clés du .env ($(tilde "$DEPLOY_ENV_FILE")) — noms seulement"
if [ ! -f "$DEPLOY_ENV_FILE" ]; then
  printf '.env INTROUVABLE.\n'
else
  for key in DEPLOY_SECRET DB_HOST DB_PORT DB_NAME DB_USER DB_PASS BACKUP_DIR \
    BACKUP_ENCRYPT_KEY_FILE BACKUP_ENCRYPT_REQUIRED RETENTION_PURGE_APPLY SMTP_HOST SMTP_PORT \
    SMTP_USER SMTP_PASS SMTP_FROM OPS_ALERT_TO MCP_HEALTH_TOKEN MCP_CRON_LOG_DIR; do
    if env_has "$key"; then printf '  %-26s présente\n' "$key"; else printf '  %-26s absente\n' "$key"; fi
  done
fi

# --- 4. Fichier de clé de sauvegarde ---------------------------------------------------------
title "4. Clé de chiffrement des sauvegardes"
KEY_FILE="${BACKUP_ENCRYPT_KEY_FILE:-}"
if [ -z "$KEY_FILE" ]; then
  printf 'BACKUP_ENCRYPT_KEY_FILE non défini : sauvegardes en clair (ou refusées si BACKUP_ENCRYPT_REQUIRED=1).\n'
elif [ ! -f "$KEY_FILE" ]; then
  printf 'Fichier de clé ABSENT : %s\n' "$(tilde "$KEY_FILE")"
else
  mode="$(file_mode "$KEY_FILE")"
  printf 'Fichier de clé : %s — présent, droits %s, %s octets' "$(tilde "$KEY_FILE")" "$mode" "$(file_size "$KEY_FILE")"
  case "$mode" in 600 | 400) printf ' (OK)\n' ;; *) printf ' (TROP OUVERT : chmod 600 conseillé)\n' ;; esac
  case "$KEY_FILE" in "$REF_DIR"/*) printf '  ATTENTION : la clé est dans le dossier de l'"'"'application.\n' ;; esac
fi

# --- 5. Journaux -----------------------------------------------------------------------------
title "5. Journaux des tâches, dans tous les dossiers candidats"
CANDIDATES="$(
  {
    [ -n "${MCP_CRON_LOG_DIR:-}" ] && printf '%s\n' "$MCP_CRON_LOG_DIR" | tr ',' '\n'
    printf '%s\n' "$REF_DIR/logs" "$REAL_APP_DIR/logs"
    [ -n "$HOME_DIR" ] && printf '%s\n' "$HOME_DIR/foretmap-logs" "$HOME_DIR/foretmap/logs"
    printf '%s\n' "$LOG_DIRS_FROM_CRON"
  } | sed '/^[[:space:]]*$/d' | awk '!seen[$0]++'
)"
while read -r dir; do
  if [ -d "$dir" ]; then printf '  dossier %s : existe\n' "$(tilde "$dir")"; else printf '  dossier %s : absent\n' "$(tilde "$dir")"; fi
done <<<"$CANDIDATES"
for logname in foretmap-auto-deploy.log db-backup.log uptime.log \
  retention-purge.log health-report.log moodle-sync.log reconcile-uploads.log; do
  found=0
  while read -r dir; do
    f="$dir/$logname"
    [ -f "$f" ] || continue
    found=1
    stamp="$(grep -aoE '^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\]' "$f" 2>/dev/null | tail -n 1)"
    printf '  %-28s %s — %s octets — dernière ligne datée : %s (modifié %s)\n' "$logname" \
      "$(tilde "$f")" "$(file_size "$f")" "${stamp:-aucune}" "$(file_mtime "$f")"
  done <<<"$CANDIDATES"
  [ "$found" = "1" ] || printf '  %-28s introuvable dans les dossiers ci-dessus\n' "$logname"
done

# --- 6. Dernière sauvegarde ------------------------------------------------------------------
title "6. Dernière sauvegarde"
BACKUP_DIRS="$(
  {
    [ -n "${BACKUP_DIR:-}" ] && printf '%s\n' "$BACKUP_DIR"
    printf '%s\n' "$REF_DIR/backups" "$REAL_APP_DIR/backups"
    [ -n "$HOME_DIR" ] && printf '%s\n' "$HOME_DIR/foretmap/backups"
  } | awk '!seen[$0]++'
)"
latest=""
while read -r dir; do
  [ -d "$dir" ] || continue
  f="$(ls -1t "$dir"/foretmap-*.sql.gz* 2>/dev/null | grep -Ev '\.partial$' | sed -n '1p')"
  [ -n "$f" ] || continue
  if [ -z "$latest" ] || [ "$f" -nt "$latest" ]; then latest="$f"; fi
done <<<"$BACKUP_DIRS"
if [ -n "$latest" ]; then
  printf '%s — %s — %s octets\n' "$(tilde "$latest")" "$(file_mtime "$latest")" "$(file_size "$latest")"
  case "$latest" in *.enc) ;; *) printf '  ATTENTION : sauvegarde NON chiffrée.\n' ;; esac
else
  printf 'Aucune sauvegarde trouvée dans : %s\n' "$(printf '%s ' $BACKUP_DIRS)"
fi

# --- 7. Traces en base -----------------------------------------------------------------------
title "7. Traces en base"
CLIENT=""
for c in mariadb mysql; do command -v "$c" >/dev/null 2>&1 && CLIENT="$c" && break; done
if [ "${OPS_CHECK_SKIP_DB:-0}" = "1" ]; then
  printf 'ignorées (OPS_CHECK_SKIP_DB=1).\n'
elif [ -z "$CLIENT" ] || [ -z "${DB_NAME:-}" ] || [ -z "${DB_USER:-}" ]; then
  printf 'impossible (client MariaDB absent ou DB_NAME / DB_USER manquants dans le .env).\n'
else
  q() {
    MYSQL_PWD="${DB_PASS:-}" "$CLIENT" --host="${DB_HOST:-127.0.0.1}" --port="${DB_PORT:-3306}" \
      --user="$DB_USER" --batch --skip-column-names "$DB_NAME" -e "$1" 2>&1 | mask | sed -n '1,3p'
  }
  printf 'retention_purge_runs (dernière) : %s\n' \
    "$(q "SELECT CONCAT_WS(' | ', started_at, mode, outcome) FROM retention_purge_runs ORDER BY id DESC LIMIT 1")"
  printf 'scheduled_job_runs health_report (dernière) : %s\n' \
    "$(q "SELECT CONCAT_WS(' | ', started_at, outcome) FROM scheduled_job_runs WHERE job = 'health_report' ORDER BY id DESC LIMIT 1")"
fi

printf '\nFin du diagnostic (lecture seule, rien n'"'"'a été modifié).\n'
exit 0
