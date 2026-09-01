#!/usr/bin/env bash
# ForetMap — script d'installation pour Cloud Agent (Cursor).
# Idempotent : peut être relancé sans effet de bord. Prépare MariaDB, les
# dépendances npm, le fichier .env de dev, la base de données et un compte prof.
#
# Docker n'étant pas disponible dans l'image de base du Cloud Agent, on installe
# MariaDB directement via apt (équivalent fonctionnel du service `mariadb` de
# docker-compose.yml, aligné sur docs/LOCAL_DEV.md).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# Identifiants de dev local uniquement (jamais pour la production).
DB_ROOT_PASS="foretmap_local_root"
DB_NAME_APP="foretmap_local"
DB_NAME_TEST="foretmap_test"

echo "[install] 1/6 — Installation de MariaDB (si nécessaire)"
if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server mariadb-client
fi

# 127.0.0.1 se résout en « localhost » (auth socket) : skip-name-resolve permet à
# root@127.0.0.1 (auth mot de passe, utilisé par l'app en TCP) d'être reconnu.
echo "[install] 2/6 — Configuration MariaDB (skip-name-resolve)"
echo -e "[mariadbd]\nskip-name-resolve" | sudo tee /etc/mysql/mariadb.conf.d/99-foretmap.cnf >/dev/null

echo "[install] 3/6 — Démarrage temporaire de MariaDB pour l'initialisation"
sudo service mariadb start || sudo service mariadb restart
# Attente d'un serveur prêt (socket root local).
for i in $(seq 1 30); do
  if sudo mariadb -e "SELECT 1" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "[install] 4/6 — Création des bases et de l'utilisateur root TCP"
sudo mariadb <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME_APP}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS \`${DB_NAME_TEST}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '${DB_ROOT_PASS}';
ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY '${DB_ROOT_PASS}';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL

# Fichier .env de dev (non versionné) : créé seulement s'il n'existe pas, pour ne
# pas écraser d'éventuelles personnalisations.
if [ ! -f .env ]; then
  echo "[install] Création de .env (dev local)"
  cat > .env <<'ENVEOF'
# ForetMap — configuration dev local (Cloud Agent) — voir docs/LOCAL_DEV.md
# Base : MariaDB installée via apt (pas Docker). Ne pas utiliser en production.
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=foretmap_local
DB_USER=root
DB_PASS=foretmap_local_root

PORT=3000
NODE_ENV=development

JWT_SECRET=dev_jwt_secret_local_only_change_me
VISIT_COOKIE_SECRET=dev_visit_cookie_secret_local_only
ENVEOF
fi

echo "[install] 5/6 — Installation des dépendances npm"
npm install

echo "[install] 6/6 — Initialisation du schéma + seed, puis compte prof de dev"
node scripts/wait-mysql-ready.js
npm run db:init
# Le script de seed ne se termine pas seul (pool MySQL ouvert) : timeout après
# l'insertion, qui est quasi instantanée. Échec non bloquant.
TEACHER_ADMIN_EMAIL="prof@local.dev" \
  TEACHER_ADMIN_PASSWORD="foretmap123" \
  TEACHER_ADMIN_DISPLAY_NAME="n3boss" \
  timeout 30s node scripts/seed-teacher-admin.js || true

echo "[install] Terminé. Compte prof de dev : prof@local.dev / foretmap123"
