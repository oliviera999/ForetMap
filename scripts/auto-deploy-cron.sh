#!/usr/bin/env bash
set -euo pipefail

# Déploiement automatique ForetMap via cron.
# Usage recommandé:
#   APP_DIR=/home/USER/foretmap \
#   DEPLOY_BASE_URL=https://foretmap.olution.info \
#   /home/USER/foretmap/scripts/auto-deploy-cron.sh
#
# Variables optionnelles:
# - APP_DIR             : chemin absolu du repo sur le serveur (défaut: racine du script)
# - DEPLOY_BRANCH       : branche suivie (défaut: main)
# - DEPLOY_BASE_URL     : base URL publique (défaut: https://foretmap.olution.info)
# - DEPLOY_LOCK_DIR     : dossier lock anti-concurrence
# - DEPLOY_ENV_FILE     : fichier env à charger (défaut: $APP_DIR/.env)
# - DEPLOY_AUTO_MIGRATE : 1 pour lancer npm run db:migrate après pull
# - DEPLOY_SKIP_RESTART_IF_SOFT_ONLY : 1 pour ne pas appeler /api/admin/restart
#   lorsque tous les fichiers du déploiement matchent DEPLOY_SOFT_CHANGE_REGEX
#   (ex. docs seulement) — opt-in, défaut 0 = toujours redémarrer après pull
# - DEPLOY_SOFT_CHANGE_REGEX : ERE grep (défaut: CHANGELOG, README, LICENSE, docs/, .github/, .cursor/)
# - DEPLOY_SKIP_SYNC_VISIT_PACK_LIB : 1 pour ne pas exécuter scripts/sync-visit-pack-server-lib.js après pull
# - DEPLOY_AUTO_ROLLBACK : 1 (défaut) pour revenir au commit précédent si post-deploy-check
#   échoue après redémarrage (reset --hard + re-sync + npm ci + restart + re-check) ;
#   0 pour désactiver. NB : le rollback annule le CODE, pas une migration BDD déjà
#   appliquée (schéma forward-only) — d'où le snapshot pré-migration (scripts/db-backup.sh).
# - DEPLOY_DB_PRE_MIGRATE_BACKUP : 1 (défaut) pour un dump BDD juste avant db:migrate.
# - OPS_ALERT_TO / SMTP_* : alerte email sur échec/rollback (voir scripts/ops-alert.js).
#
# Prérequis:
# - DEPLOY_SECRET requis uniquement si un redémarrage est prévu (défaut ou après
#   analyse du diff avec DEPLOY_SKIP_RESTART_IF_SOFT_ONLY=1) — charger via DEPLOY_ENV_FILE
# - curl, git, node disponibles sur le serveur

ts() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  printf '[%s] %s\n' "$(ts)" "$*"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_BASE_URL="${DEPLOY_BASE_URL:-https://foretmap.olution.info}"
DEPLOY_LOCK_DIR="${DEPLOY_LOCK_DIR:-/tmp/foretmap-auto-deploy.lock}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env}"
DEPLOY_AUTO_MIGRATE="${DEPLOY_AUTO_MIGRATE:-0}"
DEPLOY_SKIP_RESTART_IF_SOFT_ONLY="${DEPLOY_SKIP_RESTART_IF_SOFT_ONLY:-0}"
DEPLOY_SOFT_CHANGE_REGEX="${DEPLOY_SOFT_CHANGE_REGEX:-^(CHANGELOG\.md|README\.md|LICENSE(\.txt)?|\.gitattributes|docs/|\.github/|\.cursor/)}"
DEPLOY_SKIP_SYNC_VISIT_PACK_LIB="${DEPLOY_SKIP_SYNC_VISIT_PACK_LIB:-0}"
DEPLOY_AUTO_ROLLBACK="${DEPLOY_AUTO_ROLLBACK:-1}"
DEPLOY_DB_PRE_MIGRATE_BACKUP="${DEPLOY_DB_PRE_MIGRATE_BACKUP:-1}"

# Alerte d'exploitation par email (best-effort, ne casse jamais le flux).
alert() {
  local subject="$1"
  shift
  node "$APP_DIR/scripts/ops-alert.js" "$subject" "$*" >/dev/null 2>&1 || true
}

# Retour au commit précédent puis re-vérification. Utilise les globales
# PREV_SHA / CHANGED_FILES / DEPLOY_* au moment de l'appel. Termine le script.
rollback_to() {
  log "ROLLBACK vers $PREV_SHA"
  git reset --hard "$PREV_SHA"

  if [[ "$DEPLOY_SKIP_SYNC_VISIT_PACK_LIB" != "1" ]] && [[ -f "$APP_DIR/scripts/sync-visit-pack-server-lib.js" ]]; then
    node scripts/sync-visit-pack-server-lib.js || true
  fi
  if grep -Eq '(^|/)(package\.json|package-lock\.json)$' <<<"$CHANGED_FILES"; then
    npm ci --omit=dev --no-audit --no-fund || true
  fi
  if [[ -n "${DEPLOY_SECRET:-}" ]]; then
    curl -fsS -X POST "$DEPLOY_BASE_URL/api/admin/restart" \
      -H "X-Deploy-Secret: $DEPLOY_SECRET" -H "Content-Type: application/json" >/dev/null 2>&1 || true
  fi

  log "Re-vérification après rollback"
  if node scripts/post-deploy-check.js --base-url "$DEPLOY_BASE_URL"; then
    log "Rollback OK : service rétabli sur $PREV_SHA."
    alert "Rollback réussi" "Déploiement vers $REMOTE_SHA en échec : retour sur $PREV_SHA, service vérifié OK."
  else
    log "ÉCHEC : service toujours KO après rollback."
    alert "Rollback EN ÉCHEC" "Service toujours KO après retour sur $PREV_SHA — intervention manuelle requise."
  fi
  exit 1
}

# Lock simple anti-cron concurrent
if ! mkdir "$DEPLOY_LOCK_DIR" 2>/dev/null; then
  log "Un déploiement est déjà en cours, sortie."
  exit 0
fi
trap 'rmdir "$DEPLOY_LOCK_DIR" 2>/dev/null || true' EXIT

if [[ ! -d "$APP_DIR/.git" ]]; then
  log "APP_DIR invalide (repo git introuvable): $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

# Charge les variables d'environnement (DEPLOY_SECRET, DB_*, etc.)
if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV_FILE"
  set +a
fi

if [[ -n "$(git status --porcelain)" ]]; then
  log "Arbre de travail non propre sur serveur, déploiement auto ignoré."
  exit 1
fi

log "Fetch de origin/$DEPLOY_BRANCH..."
git fetch origin "$DEPLOY_BRANCH" --quiet

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$DEPLOY_BRANCH")"

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  log "Aucune mise à jour (HEAD=$LOCAL_SHA)."
  exit 0
fi

log "Mise à jour détectée: $LOCAL_SHA -> $REMOTE_SHA"
PREV_SHA="$LOCAL_SHA" # cible de rollback si le déploiement échoue

# Détermine les fichiers changés pour déclencher les étapes utiles.
CHANGED_FILES="$(git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA" || true)"

# Redémarrage Node : par défaut systématique après pull (nouveau code / assets).
# Opt-in : éviter /api/admin/restart si le diff ne touche qu'à des chemins « non runtime ».
DO_DEPLOY_RESTART=1
if [[ "$DEPLOY_SKIP_RESTART_IF_SOFT_ONLY" == "1" ]]; then
  if [[ -z "$(printf '%s' "$CHANGED_FILES" | tr -d '[:space:]')" ]]; then
    log "Diff de fichiers vide ou inattendu: redémarrage conservé."
  elif grep -Ev "$DEPLOY_SOFT_CHANGE_REGEX" <<<"$CHANGED_FILES" | grep -q .; then
    log "Fichiers runtime ou non triviaux modifiés: redémarrage requis."
  else
    DO_DEPLOY_RESTART=0
    log "Redémarrage différé (changements limités au périmètre doc/méta, DEPLOY_SKIP_RESTART_IF_SOFT_ONLY=1)."
  fi
fi

if [[ "$DO_DEPLOY_RESTART" == "1" ]] && [[ -z "${DEPLOY_SECRET:-}" ]]; then
  log "DEPLOY_SECRET manquant: impossible d'appeler /api/admin/restart"
  exit 1
fi

# Garde-fou: en mode "build local", toute modif frontend doit inclure une mise à jour de dist/.
FRONTEND_PATTERNS='^(src/|index\.vite\.html$|vite\.config\.js$|public/)'
if grep -Eq "$FRONTEND_PATTERNS" <<<"$CHANGED_FILES"; then
  if ! grep -Eq '^dist/' <<<"$CHANGED_FILES"; then
    log "Déploiement bloqué: modifications frontend détectées sans mise à jour de dist/."
    log "Action requise: exécuter npm run build en local puis pousser les fichiers dist/."
    exit 1
  fi
fi

# Garde-fou: toute évolution des modules pack mascotte côté src doit être reflétée dans lib/visit-pack/
# (API sans dossier src/ en prod — voir scripts/sync-visit-pack-server-lib.js).
if grep -Eq '(^|/)src/utils/mascotPack\.js$' <<<"$CHANGED_FILES"; then
  if ! grep -Eq '^lib/visit-pack/mascotPack\.js$' <<<"$CHANGED_FILES"; then
    log "Déploiement bloqué: src/utils/mascotPack.js modifié sans lib/visit-pack/mascotPack.js dans le même lot."
    log "Action requise: npm run sync:visit-pack-lib (ou build-safe) puis commit des fichiers lib/visit-pack/."
    exit 1
  fi
fi
if grep -Eq '(^|/)src/utils/visitMascotState\.js$' <<<"$CHANGED_FILES"; then
  if ! grep -Eq '^lib/visit-pack/visitMascotState\.js$' <<<"$CHANGED_FILES"; then
    log "Déploiement bloqué: src/utils/visitMascotState.js modifié sans lib/visit-pack/visitMascotState.js dans le même lot."
    log "Action requise: npm run sync:visit-pack-lib (ou build-safe) puis commit des fichiers lib/visit-pack/."
    exit 1
  fi
fi

log "git pull --ff-only origin $DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"

if [[ "$DEPLOY_SKIP_SYNC_VISIT_PACK_LIB" != "1" ]] && [[ -f "$APP_DIR/scripts/sync-visit-pack-server-lib.js" ]]; then
  log "Synchronisation lib/visit-pack/ (sources présentes ou contrôle d'intégrité)"
  node scripts/sync-visit-pack-server-lib.js
fi

if grep -Eq '(^|/)(package\.json|package-lock\.json)$' <<<"$CHANGED_FILES"; then
  log "Dépendances modifiées: npm ci --omit=dev"
  npm ci --omit=dev --no-audit --no-fund
fi

if [[ "$DEPLOY_AUTO_MIGRATE" == "1" ]] && grep -Eq '^migrations/' <<<"$CHANGED_FILES"; then
  if [[ "$DEPLOY_DB_PRE_MIGRATE_BACKUP" == "1" ]] && [[ -f "$APP_DIR/scripts/db-backup.sh" ]]; then
    log "Snapshot BDD pré-migration"
    APP_DIR="$APP_DIR" DEPLOY_ENV_FILE="$DEPLOY_ENV_FILE" bash "$APP_DIR/scripts/db-backup.sh" --label pre-migrate ||
      log "Snapshot pré-migration en échec (non bloquant)."
  fi
  log "Migrations détectées: npm run db:migrate"
  if ! npm run db:migrate; then
    log "ÉCHEC de db:migrate."
    alert "Migration BDD ÉCHEC" "npm run db:migrate a échoué ($PREV_SHA -> $REMOTE_SHA). Snapshot pré-migration disponible dans backups/."
    if [[ "$DEPLOY_AUTO_ROLLBACK" == "1" ]]; then
      rollback_to
    fi
    exit 1
  fi
fi

if [[ "$DO_DEPLOY_RESTART" == "1" ]]; then
  log "Redémarrage applicatif via /api/admin/restart"
  # Tolérant : une réponse passerelle pendant l'arrêt gracieux n'est pas fatale ;
  # post-deploy-check ci-dessous est l'arbitre. On alerte seulement.
  if ! curl -fsS -X POST "$DEPLOY_BASE_URL/api/admin/restart" \
    -H "X-Deploy-Secret: $DEPLOY_SECRET" \
    -H "Content-Type: application/json" >/dev/null 2>&1; then
    log "Appel /api/admin/restart non confirmé (le check post-déploiement tranchera)."
    alert "Restart non confirmé" "POST /api/admin/restart sans réponse 2xx ($PREV_SHA -> $REMOTE_SHA)."
  fi
else
  log "Aucun redémarrage applicatif (déploiement sans impact processus Node)."
fi

log "Vérification post-déploiement"
if node scripts/post-deploy-check.js --base-url "$DEPLOY_BASE_URL"; then
  NEW_SHA="$(git rev-parse HEAD)"
  log "Déploiement terminé avec succès sur $NEW_SHA"
else
  log "post-deploy-check en échec après déploiement."
  alert "Post-deploy-check ÉCHEC" "Déploiement $PREV_SHA -> $REMOTE_SHA : la vérification a échoué."
  if [[ "$DEPLOY_AUTO_ROLLBACK" == "1" ]]; then
    rollback_to
  else
    log "Rollback auto désactivé (DEPLOY_AUTO_ROLLBACK=0) : service potentiellement dégradé."
    exit 1
  fi
fi
