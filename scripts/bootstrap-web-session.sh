#!/bin/bash
# Amorçage d'un conteneur éphémère (Claude Code sur le web, GitHub Codespaces, runner jetable)
# pour qu'il puisse exécuter *réellement* lint, tests backend (MariaDB), tests UI et e2e.
#
# Idempotent (relançable sans effet de bord), non interactif, sans accès à la prod.
#
# Ce qu'il met en place :
#   1. dépendances npm ;
#   2. serveur MariaDB local + bases `foretmap_test` / `foretmap_local` + compte applicatif ;
#   3. schéma + seed (`npm run db:init`) sur la base de test ;
#   4. navigateurs Playwright alignés sur la version épinglée de `@playwright/test` ;
#   5. `.env` de session + export des variables via `$CLAUDE_ENV_FILE` quand il est fourni.
#
# Usage :
#   bash scripts/bootstrap-web-session.sh
#   FORETMAP_SESSION_DB=docker bash scripts/bootstrap-web-session.sh   # parité CI exacte
#   FORETMAP_SESSION_SKIP_BROWSERS=1 bash scripts/bootstrap-web-session.sh
#
# Écart assumé par défaut : MariaDB **10.11** (paquet Ubuntu, ~20 s) au lieu de **11.4.10**
# (image Docker utilisée par `.github/workflows/ci.yml`). `FORETMAP_SESSION_DB=docker` rétablit
# la parité exacte au prix du démarrage de `dockerd` et du pull de l'image.
#
# Branchement en hook Claude Code (voir docs/LOCAL_DEV.md § « Sessions Claude Code sur le web ») :
#   .claude/settings.json → hooks.SessionStart → "$CLAUDE_PROJECT_DIR/scripts/bootstrap-web-session.sh"
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$PROJECT_DIR"

log() { printf '[bootstrap] %s\n' "$*"; }

SUDO=''
if [ "$(id -u)" -ne 0 ]; then SUDO='sudo'; fi

DB_NAME_TEST='foretmap_test'
DB_NAME_APP='foretmap_local'
DB_USER_APP='foretmap'
DB_PASS_APP='foretmap_local'

# --- 1. Dépendances npm -------------------------------------------------------------
# Conteneur froid → `npm ci` (versions exactes du lock, ~1 min). Conteneur déjà amorcé →
# `npm install --no-save`, quasi instantané.
# `--no-save` est indispensable : l'image embarque npm 10.9.7 alors que `package-lock.json`
# a été produit par un npm plus récent, et un `npm install` sans garde-fou réécrit le lock
# (suppression des champs `libc`) — un diff parasite dans chaque lot.
if [ -d node_modules ]; then
  log 'npm install (dépendances déjà présentes)'
  npm install --no-save --no-audit --no-fund
else
  log 'npm ci'
  npm ci --no-audit --no-fund
fi

# --- 2. MariaDB ---------------------------------------------------------------------
start_mariadb_apt() {
  if ! command -v mariadbd-safe >/dev/null 2>&1; then
    log 'installation de mariadb-server (dépôts Ubuntu)'
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get update -qq
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server
  fi

  if ! mariadb-admin ping --silent >/dev/null 2>&1; then
    log 'démarrage de MariaDB'
    $SUDO mkdir -p /var/run/mysqld
    $SUDO chown mysql:mysql /var/run/mysqld
    $SUDO nohup mariadbd-safe --user=mysql >/tmp/foretmap-mariadb.log 2>&1 &
    for _ in $(seq 1 45); do
      if mariadb-admin ping --silent >/dev/null 2>&1; then break; fi
      sleep 2
    done
  fi

  if ! mariadb-admin ping --silent >/dev/null 2>&1; then
    log "ERREUR : MariaDB n'a pas démarré (voir /tmp/foretmap-mariadb.log)"
    return 1
  fi

  # Compte applicatif dédié : `root@localhost` est en auth `unix_socket`, donc inutilisable
  # via TCP par `mysql2` (erreur ER_ACCESS_DENIED_NO_PASSWORD_ERROR).
  mariadb -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME_TEST}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS \`${DB_NAME_APP}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER_APP}'@'localhost' IDENTIFIED BY '${DB_PASS_APP}';
CREATE USER IF NOT EXISTS '${DB_USER_APP}'@'%' IDENTIFIED BY '${DB_PASS_APP}';
GRANT ALL PRIVILEGES ON *.* TO '${DB_USER_APP}'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON *.* TO '${DB_USER_APP}'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL
}

start_mariadb_docker() {
  log 'démarrage de MariaDB via Docker (parité CI : mariadb:11.4.10)'
  if ! docker info >/dev/null 2>&1; then
    $SUDO nohup dockerd >/tmp/foretmap-dockerd.log 2>&1 &
    for _ in $(seq 1 30); do
      if docker info >/dev/null 2>&1; then break; fi
      sleep 2
    done
  fi
  docker compose up -d
  DB_USER_APP='root'
  DB_PASS_APP='foretmap_local_root'
  for _ in $(seq 1 45); do
    if docker compose exec -T mariadb mariadb-admin ping --silent >/dev/null 2>&1; then break; fi
    sleep 2
  done
  docker compose exec -T mariadb mariadb -uroot -p"${DB_PASS_APP}" \
    -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME_TEST}\`; CREATE DATABASE IF NOT EXISTS \`${DB_NAME_APP}\`;"
}

if [ "${FORETMAP_SESSION_DB:-apt}" = 'docker' ]; then
  start_mariadb_docker
else
  start_mariadb_apt
fi

# --- 3. Variables d'environnement de session ----------------------------------------
export NODE_ENV=test
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME="$DB_NAME_TEST"
export DB_USER="$DB_USER_APP"
export DB_PASS="$DB_PASS_APP"
export JWT_SECRET='session-test-secret-not-for-production'
export VISIT_COOKIE_SECRET='foretmap-e2e-visit-cookie-secret'
export E2E_DISABLE_RATE_LIMIT=1
export TEACHER_ADMIN_EMAIL='admin.test@foretmap.local'
export TEACHER_ADMIN_PASSWORD='admin1234'

# Hook Claude Code : persiste les variables pour tous les shells de la session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export NODE_ENV=test'
    echo 'export DB_HOST=127.0.0.1'
    echo 'export DB_PORT=3306'
    echo "export DB_NAME=${DB_NAME_TEST}"
    echo "export DB_USER=${DB_USER_APP}"
    echo "export DB_PASS=${DB_PASS_APP}"
    echo 'export JWT_SECRET=session-test-secret-not-for-production'
    echo 'export VISIT_COOKIE_SECRET=foretmap-e2e-visit-cookie-secret'
    echo 'export E2E_DISABLE_RATE_LIMIT=1'
    echo 'export TEACHER_ADMIN_EMAIL=admin.test@foretmap.local'
    echo 'export TEACHER_ADMIN_PASSWORD=admin1234'
  } >>"$CLAUDE_ENV_FILE"
fi

# `dotenv` est chargé par `database.js` et `playwright.config.js` : sans `.env`, une commande
# lancée hors de ce shell repartirait sur les valeurs par défaut (localhost / root).
if [ ! -f .env ]; then
  log 'écriture du .env de session (non versionné)'
  cat >.env <<ENVFILE
NODE_ENV=test
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=${DB_NAME_TEST}
DB_USER=${DB_USER_APP}
DB_PASS=${DB_PASS_APP}
PORT=3000
JWT_SECRET=session-test-secret-not-for-production
VISIT_COOKIE_SECRET=foretmap-e2e-visit-cookie-secret
E2E_DISABLE_RATE_LIMIT=1
TEACHER_ADMIN_EMAIL=admin.test@foretmap.local
TEACHER_ADMIN_PASSWORD=admin1234
ENVFILE
fi

# --- 4. Schéma + seed ---------------------------------------------------------------
log "npm run db:init (schéma + migrations + seed sur ${DB_NAME_TEST})"
if ! npm run db:init >/tmp/foretmap-db-init.log 2>&1; then
  log 'ERREUR : db:init a échoué (voir /tmp/foretmap-db-init.log)'
  tail -20 /tmp/foretmap-db-init.log || true
  exit 1
fi

# --- 5. Navigateurs Playwright ------------------------------------------------------
# L'image fournit souvent un chromium préinstallé, mais rarement la révision attendue par la
# version épinglée de `@playwright/test` → installation explicite (~25 s, idempotente).
# `--with-deps` (comme la CI) : sans les paquets système, WebKit refuse de démarrer
# (`libgtk-4.so.1`, `libgraphene-1.0.so.0`, … manquants) et tout le projet `mobile-webkit` échoue.
if [ "${FORETMAP_SESSION_SKIP_BROWSERS:-0}" != '1' ]; then
  log 'navigateurs Playwright (chromium + webkit, avec dépendances système)'
  if ! PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 DEBIAN_FRONTEND=noninteractive \
    npx playwright install --with-deps chromium webkit >/tmp/foretmap-playwright.log 2>&1; then
    log 'AVERTISSEMENT : navigateurs incomplets (voir /tmp/foretmap-playwright.log) — e2e indisponible'
  fi
fi

log 'prêt : npm test | npm run test:content | npm run test:ui | npm run lint | npm run test:e2e'
