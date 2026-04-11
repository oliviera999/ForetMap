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
#
# Prérequis:
# - DEPLOY_SECRET doit être défini (dans DEPLOY_ENV_FILE ou env shell)
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

if [[ -z "${DEPLOY_SECRET:-}" ]]; then
  log "DEPLOY_SECRET manquant: impossible d'appeler /api/admin/restart"
  exit 1
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

# Garde-fou: en mode "build local", toute modif frontend doit inclure une mise à jour de dist/.
FRONTEND_PATTERNS='^(src/|index\.vite\.html$|vite\.config\.js$|public/)'
if grep -Eq "$FRONTEND_PATTERNS" <<<"$CHANGED_FILES"; then
  if ! grep -Eq '^dist/' <<<"$CHANGED_FILES"; then
    log "Déploiement bloqué: modifications frontend détectées sans mise à jour de dist/."
    log "Action requise: exécuter npm run build en local puis pousser les fichiers dist/."
    exit 1
  fi
fi

log "git pull --ff-only origin $DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"

if grep -Eq '(^|/)(package\.json|package-lock\.json)$' <<<"$CHANGED_FILES"; then
  log "Dépendances modifiées: npm ci --omit=dev"
  npm ci --omit=dev --no-audit --no-fund
fi

if [[ "$DEPLOY_AUTO_MIGRATE" == "1" ]] && grep -Eq '^migrations/' <<<"$CHANGED_FILES"; then
  log "Migrations détectées: npm run db:migrate"
  npm run db:migrate
fi

if [[ "$DO_DEPLOY_RESTART" == "1" ]]; then
  log "Redémarrage applicatif via /api/admin/restart"
  curl -fsS -X POST "$DEPLOY_BASE_URL/api/admin/restart" \
    -H "X-Deploy-Secret: $DEPLOY_SECRET" \
    -H "Content-Type: application/json" \
    >/dev/null
else
  log "Aucun redémarrage applicatif (déploiement sans impact processus Node)."
fi

log "Vérification post-déploiement"
node scripts/post-deploy-check.js --base-url "$DEPLOY_BASE_URL"

NEW_SHA="$(git rev-parse HEAD)"
log "Déploiement terminé avec succès sur $NEW_SHA"
