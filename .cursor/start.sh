#!/usr/bin/env bash
# ForetMap — démarrage par boot du Cloud Agent : (re)lance MariaDB et attend
# qu'il réponde. Idempotent : ne relance pas un serveur déjà actif. Les serveurs
# applicatifs (API + Vite) sont lancés par les `terminals` de environment.json.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "[start] Démarrage de MariaDB"
if ! sudo mariadb -e "SELECT 1" >/dev/null 2>&1; then
  sudo service mariadb start
fi

echo "[start] Attente de la disponibilité de MariaDB"
for i in $(seq 1 30); do
  if sudo mariadb -e "SELECT 1" >/dev/null 2>&1; then
    echo "[start] MariaDB prêt"
    exit 0
  fi
  sleep 1
done

echo "[start] MariaDB n'a pas démarré à temps" >&2
exit 1
