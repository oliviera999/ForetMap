#!/usr/bin/env bash
set -euo pipefail

# Déploiement automatique ForetMap via cron.
# Usage recommandé (toujours par `bash` : le droit d'exécution du fichier peut sauter quand un
# `git pull` le réécrit — incident du 27/09/2026, « Permission denied » à chaque passage) :
#   APP_DIR=/home/USER/foretmap \
#   DEPLOY_BASE_URL=https://foretmap.olution.info \
#   bash /home/USER/foretmap/scripts/auto-deploy-cron.sh
#
# Variables optionnelles:
# - APP_DIR             : chemin absolu du repo sur le serveur (défaut: racine du script)
# - DEPLOY_BRANCH       : branche suivie (défaut: main)
# - DEPLOY_BASE_URL     : base URL publique (défaut: https://foretmap.olution.info)
# - DEPLOY_LOCK_DIR     : dossier lock anti-concurrence
# - DEPLOY_ENV_FILE     : fichier env à charger (défaut: $APP_DIR/.env)
# - DEPLOY_AUTO_MIGRATE : 1 pour lancer npm run db:migrate après pull quand le lot apporte
#   une migration OU que la base est en retard sur les fichiers de migrations/ (rattrapage,
#   y compris sans nouveau commit ; scripts/db-migration-status.js)
# - DEPLOY_QUIET_SECONDS : n'applique un commit distant qu'après N secondes d'accalmie
#   (défaut 180). Une rafale de merges sur main (cas courant quand plusieurs PR sont
#   fusionnées d'affilée) est ainsi déployée en UN seul redémarrage au lieu d'un par
#   commit — chaque redémarrage étant une fenêtre d'indisponibilité. 0 pour désactiver.
# - DEPLOY_SKIP_RESTART_IF_SOFT_ONLY : ne pas appeler /api/admin/restart lorsque tous
#   les fichiers du déploiement matchent DEPLOY_SOFT_CHANGE_REGEX (ex. docs seulement).
#   Défaut 1 depuis l'audit charge serveur ; mettre 0 pour toujours redémarrer après pull
# - DEPLOY_SOFT_CHANGE_REGEX : ERE grep (défaut: CHANGELOG, README, LICENSE, docs/, .github/, .cursor/)
# - DEPLOY_SKIP_SYNC_VISIT_PACK_LIB : 1 pour ne pas exécuter scripts/sync-visit-pack-server-lib.js après pull
# - DEPLOY_AUTO_ROLLBACK : 1 (défaut) pour revenir au commit précédent si post-deploy-check
#   échoue après redémarrage (reset --hard + re-sync + npm ci + restart + re-check) ;
#   0 pour désactiver. NB : le rollback annule le CODE, pas une migration BDD déjà
#   appliquée (schéma forward-only) — d'où le snapshot pré-migration (scripts/db-backup.sh).
# - DEPLOY_DB_PRE_MIGRATE_BACKUP : 1 (défaut) pour un dump BDD juste avant db:migrate.
# - DEPLOY_STAMP_DIR : dossier des horodatages anti-répétition (alertes espacées, redémarrage
#   « front non servi » au plus une fois par 30 min) ; défaut /tmp.
# - OPS_ALERT_TO / SMTP_* : alerte email sur échec/rollback (voir scripts/ops-alert.js).
# - DEPLOY_NODE_BIN_DIR : dossier qui contient le `node` et le `npm` de l'application. Rarement
#   utile : le script les trouve seul (PassengerNodejs du `.htaccess` cPanel, PATH, puis
#   ~/nodevenv/…, voir scripts/lib/app-node.sh).
#
# Prérequis:
# - DEPLOY_SECRET recommandé (même valeur que celle de l'application) — chargé depuis
#   DEPLOY_ENV_FILE. Il sert au redémarrage piloté (`POST /api/admin/restart`). Sans lui, ou
#   s'il est refusé (401/403), le cron redémarre par `tmp/restart.txt` (mécanisme Passenger,
#   roue de secours) au lieu d'abandonner le déploiement.
# - curl et git dans le PATH ; node et npm de l'application trouvés par scripts/lib/app-node.sh
#   (sur o2switch / CloudLinux, ils ne sont dans aucun PATH système, ni dans celui du cron).

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
# Horodatages des alertes et redémarrages espacés (alert_throttled, restart_for_frontend).
DEPLOY_STAMP_DIR="${DEPLOY_STAMP_DIR:-/tmp}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env}"
DEPLOY_AUTO_MIGRATE="${DEPLOY_AUTO_MIGRATE:-0}"
DEPLOY_QUIET_SECONDS="${DEPLOY_QUIET_SECONDS:-180}"
# Défaut 1 depuis l'audit charge serveur (docs/AUDIT_CHARGE_SERVEUR_2026-08.md, piste 6) :
# un commit docs/méta seul ne redémarre plus l'app (moins de fenêtres 503). Remettre 0
# via .env ou l'environnement du cron pour retrouver le redémarrage systématique.
DEPLOY_SKIP_RESTART_IF_SOFT_ONLY="${DEPLOY_SKIP_RESTART_IF_SOFT_ONLY:-1}"
DEPLOY_SOFT_CHANGE_REGEX="${DEPLOY_SOFT_CHANGE_REGEX:-^(CHANGELOG\.md|README\.md|LICENSE(\.txt)?|\.gitattributes|docs/|\.github/|\.cursor/)}"
DEPLOY_SKIP_SYNC_VISIT_PACK_LIB="${DEPLOY_SKIP_SYNC_VISIT_PACK_LIB:-0}"
DEPLOY_AUTO_ROLLBACK="${DEPLOY_AUTO_ROLLBACK:-1}"
DEPLOY_DB_PRE_MIGRATE_BACKUP="${DEPLOY_DB_PRE_MIGRATE_BACKUP:-1}"
# Provenance du build frontend :
# - `branch` : `dist/` n'est plus dans le dépôt, il est récupéré sur la branche d'artefacts
#              publiée par la CI (scripts/fetch-dist-artifact.js). Défaut depuis le retrait
#              de `dist/` du dépôt (26/09/2026) ;
# - `repo`   : mode historique, `dist/` arrive avec le `git pull`. Il ne sert plus qu'au
#              retour arrière décrit dans docs/DEPLOY_DIST_ARTIFACT.md (il faut alors aussi
#              revenir sur le commit qui a retiré `dist/`).
DEPLOY_DIST_SOURCE="${DEPLOY_DIST_SOURCE:-branch}"
DEPLOY_DIST_BRANCH="${DEPLOY_DIST_BRANCH:-dist-artifact/main}"

# Alerte d'exploitation par email (best-effort, ne casse jamais le flux).
alert() {
  local subject="$1"
  shift
  node "$APP_DIR/scripts/ops-alert.js" "$subject" "$*" >/dev/null 2>&1 || true
}

# Redémarre l'application. Renvoie 0 si une demande est partie, 1 sinon.
#  - Voie normale : `POST /api/admin/restart` — arrêt piloté par l'application, journalisé
#    `restart` (lib/bootJournal.js). Exige `DEPLOY_SECRET`.
#  - Roue de secours : `touch tmp/restart.txt`, que Passenger surveille (`tmp/` est ignoré par
#    git : l'arbre reste propre). Utilisée sans secret, ou quand le secret est REFUSÉ (401/403 :
#    valeur différente de celle de l'application). Passenger applique le redémarrage à la
#    requête suivante : on la déclenche aussitôt. L'application journalise `restart-file`.
#  - Réponse passerelle ou coupure pendant l'arrêt (5xx, pas de réponse) : on ne double pas le
#    redémarrage — la vérification post-déploiement tranche, comme avant.
restart_app() {
  local reason="$1"
  if [[ -n "${DEPLOY_SECRET:-}" ]]; then
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$DEPLOY_BASE_URL/api/admin/restart" \
      -H "X-Deploy-Secret: $DEPLOY_SECRET" \
      -H "Content-Type: application/json" 2>/dev/null || true)"
    case "$code" in
      2??)
        log "Redémarrage demandé via /api/admin/restart ($reason)."
        return 0
        ;;
      401 | 403)
        log "DEPLOY_SECRET refusé par l'application (HTTP $code) : roue de secours tmp/restart.txt ($reason)."
        alert_throttled restart-secret-refused 360 "DEPLOY_SECRET refusé" \
          "POST /api/admin/restart répond $code : le secret du cron diffère de celui de l'application. Redémarrage fait par tmp/restart.txt."
        ;;
      *)
        log "Appel /api/admin/restart non confirmé (HTTP ${code:-aucune réponse}, $reason)."
        alert "Restart non confirmé" "$reason — POST /api/admin/restart sans réponse 2xx (HTTP ${code:-aucune réponse})."
        return 1
        ;;
    esac
  else
    log "DEPLOY_SECRET absent : redémarrage par tmp/restart.txt ($reason)."
  fi
  if mkdir -p "$APP_DIR/tmp" && touch "$APP_DIR/tmp/restart.txt"; then
    curl -fsS --max-time 60 "$DEPLOY_BASE_URL/api/health" >/dev/null 2>&1 || true
    return 0
  fi
  log "Impossible de toucher $APP_DIR/tmp/restart.txt ($reason) : redémarrer l'application à la main."
  alert "Restart impossible" "$reason — ni secret valide ni tmp/restart.txt : Setup Node.js App → Restart."
  return 1
}

# Retour au commit précédent puis re-vérification. Utilise les globales
# PREV_SHA / CHANGED_FILES / DEPLOY_* au moment de l'appel. Termine le script.
rollback_to() {
  log "ROLLBACK vers $PREV_SHA"
  git reset --hard "$PREV_SHA"

  # En mode `branch`, `git reset` ne ramène pas le build : `dist/` n'est plus versionné. On
  # remet le `dist.prev/` mis de côté par le fetch, qui est exactement celui de $PREV_SHA.
  if [[ "$DEPLOY_DIST_SOURCE" == "branch" ]]; then
    if node scripts/fetch-dist-artifact.js --mode restore-previous; then
      log "Build frontend restauré (dist.prev/)."
    else
      log "ATTENTION : restauration de dist.prev/ impossible — le front servi peut être désaccordé."
      alert "Rollback dist incomplet" "Sources revenues sur $PREV_SHA mais dist.prev/ non restauré : vérifier $APP_DIR/dist."
    fi
  fi

  if [[ "$DEPLOY_SKIP_SYNC_VISIT_PACK_LIB" != "1" ]] && [[ -f "$APP_DIR/scripts/sync-visit-pack-server-lib.js" ]]; then
    node scripts/sync-visit-pack-server-lib.js || true
  fi
  if grep -Eq '(^|/)(package\.json|package-lock\.json)$' <<<"$CHANGED_FILES"; then
    npm ci --omit=dev --no-audit --no-fund || true
  fi
  restart_app "rollback vers $PREV_SHA" || true

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

# Base en retard sur les fichiers de migrations/ ? (scripts/db-migration-status.js : 0 = à
# jour, 3 = en attente, 1 = base injoignable). Renvoie 0 seulement si des migrations
# attendent : une base injoignable n'est pas une raison de migrer à l'aveugle.
db_migrations_pending() {
  local rc=0
  node scripts/db-migration-status.js --quiet || rc=$?
  [[ "$rc" -eq 3 ]]
}

# Sauvegarde vérifiée (si activée) puis `npm run db:migrate`. Renvoie le code de db:migrate.
run_db_migrations() {
  local reason="$1"
  if [[ "$DEPLOY_DB_PRE_MIGRATE_BACKUP" == "1" ]] && [[ -f "$APP_DIR/scripts/db-backup.sh" ]]; then
    log "Snapshot BDD pré-migration"
    APP_DIR="$APP_DIR" DEPLOY_ENV_FILE="$DEPLOY_ENV_FILE" bash "$APP_DIR/scripts/db-backup.sh" --label pre-migrate ||
      log "Snapshot pré-migration en échec (non bloquant)."
  fi
  log "$reason : npm run db:migrate"
  npm run db:migrate
}

# Alerte au plus une fois par fenêtre de N minutes pour une même clé : le cron passe toutes les
# deux minutes, une panne qui dure ne doit pas produire un email à chaque passage.
alert_throttled() {
  local key="$1" minutes="$2" subject="$3"
  shift 3
  local stamp="${DEPLOY_STAMP_DIR}/foretmap-alert-${key}.stamp"
  if [[ -f "$stamp" ]] && [[ -n "$(find "$stamp" -mmin "-$minutes" 2>/dev/null)" ]]; then
    return 0
  fi
  touch "$stamp" 2>/dev/null || true
  alert "$subject" "$*"
}

# État du front annoncé par le serveur (`GET /api/health`, champ `frontend`) : `dist`, `missing`
# ou `dev` ; vide si le serveur ne répond pas ou si sa version ne publie pas encore ce champ.
frontend_mode() {
  curl -fsS --max-time 10 "$DEPLOY_BASE_URL/api/health" 2>/dev/null |
    sed -n 's/.*"frontend":"\([a-z]*\)".*/\1/p' || true
}

# Le serveur ne décide qu'au DÉMARRAGE s'il sert `dist/` (`serveDist`, server.js) : démarré
# pendant que `dist/` manquait (pull sans artefact, réveil de Passenger au mauvais moment), il
# sert la page d'aide au déploiement à la place du site, même une fois `dist/` revenu. Seul un
# redémarrage le rétablit (incident du 27/09/2026). Anti-boucle : un redémarrage de ce type par
# fenêtre de 30 minutes au plus.
restart_for_frontend() {
  local reason="$1"
  local stamp="${DEPLOY_STAMP_DIR}/foretmap-frontend-restart.stamp"
  if [[ -f "$stamp" ]] && [[ -n "$(find "$stamp" -mmin -30 2>/dev/null)" ]]; then
    log "Redémarrage pour le front déjà demandé il y a moins de 30 min ($reason) : attente."
    return 0
  fi
  touch "$stamp" 2>/dev/null || true
  log "Redémarrage applicatif : $reason"
  restart_app "$reason" || true
}

# Le front est-il posé ET servi ? Appelé à chaque passage sans déploiement (aucun commit, ou
# arbre de travail non propre) : ces chemins sortaient tôt sans jamais le vérifier.
#  1. mode `branch` : `dist/` n'est plus versionné ; un dossier effacé, un clone neuf ou un
#     `git pull` fait hors du cron (bouton « Update from Remote » de cPanel) le laisse absent.
#     `--mode repair` ne fait rien quand il est complet (aucun accès réseau), le repose sinon ;
#  2. un serveur démarré sans `dist/` reste sur la page d'aide : redémarrage (ci-dessus).
ensure_frontend_served() {
  local head_sha
  head_sha="$(git rev-parse HEAD)"
  if [[ "$DEPLOY_DIST_SOURCE" == "branch" ]]; then
    local rc=0
    DEPLOY_DIST_BRANCH="$DEPLOY_DIST_BRANCH" node scripts/fetch-dist-artifact.js \
      --mode repair --expect-source "$head_sha" || rc=$?
    if [[ "$rc" -eq 10 ]]; then
      restart_for_frontend "dist/ reposé depuis l'artefact (HEAD=$head_sha)"
      return 0
    elif [[ "$rc" -eq 75 ]]; then
      log "Build frontend à réparer mais artefact pas encore publié : nouvelle tentative au prochain passage."
      return 0
    elif [[ "$rc" -ne 0 ]]; then
      log "Réparation du build frontend en échec."
      alert_throttled dist-repair 60 "Réparation dist ÉCHEC" \
        "dist/ absent ou incomplet sur $APP_DIR et l'artefact n'a pas pu être posé (HEAD=$head_sha)."
      return 0
    fi
  fi
  if [[ -f "$APP_DIR/dist/index.vite.html" ]] && [[ "$(frontend_mode)" == "missing" ]]; then
    restart_for_frontend "serveur démarré sans dist/, resté sur la page d'aide au déploiement"
  fi
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
else
  # Un fichier absent était ignoré sans un mot : DEPLOY_SECRET, DEPLOY_AUTO_MIGRATE… restaient
  # vides, et plus rien n'était redémarré ni migré (crontab pointant un `.env.deploy` inexistant,
  # 27/09/2026).
  log "ATTENTION : fichier d'environnement absent ($DEPLOY_ENV_FILE) — DEPLOY_SECRET, DEPLOY_AUTO_MIGRATE… non chargés."
  alert_throttled env-file-missing 1440 "Fichier d'environnement du cron absent" \
    "$DEPLOY_ENV_FILE n'existe pas : le cron tourne sans DEPLOY_SECRET ni DEPLOY_AUTO_MIGRATE. Corriger DEPLOY_ENV_FILE dans la crontab (défaut : \$APP_DIR/.env)."
fi

# `node` et `npm` de l'application : sans eux, rien ne peut être contrôlé, posé ni migré, et
# aucune alerte ne peut partir (ops-alert.js). On s'arrête avant de toucher aux sources.
if [[ -f "$APP_DIR/scripts/lib/app-node.sh" ]]; then
  # shellcheck source=lib/app-node.sh
  source "$APP_DIR/scripts/lib/app-node.sh"
  if ! use_app_node; then
    log "ÉCHEC : node et npm introuvables (ni PassengerNodejs dans .htaccess, ni PATH, ni ~/nodevenv/) : rien n'est déployé."
    log "Poser DEPLOY_NODE_BIN_DIR dans la ligne de crontab : dossier bin/ du virtualenv affiché par Setup Node.js App (docs/CRONTAB.md)."
    exit 1
  fi
  if [[ -n "$APP_NODE_BIN_DIR" ]]; then
    log "Node de l'application : $APP_NODE_BIN_DIR"
  fi
fi

# Seuls les fichiers SUIVIS comptent (`--untracked-files=no`). Les fichiers non suivis que
# l'hébergement pose à la racine — `.htaccess` généré par cPanel, `node_modules` remplacé par un
# lien symbolique vers le virtualenv, sauvegardes `.env.bak-*` — bloquaient tout déploiement
# (27/09/2026). Un `git pull` ne les écrase jamais : si le commit apporte un fichier du même nom,
# git refuse la fusion entière et ne touche à rien (traité au moment du pull, plus bas).
DIRTY_TREE="$(git status --porcelain --untracked-files=no)"
if [[ -n "$DIRTY_TREE" ]]; then
  # Un `git pull` sur un arbre modifié écraserait ou mélangerait des changements locaux : on ne
  # déploie pas. Mais on dit lesquels (avant : une ligne muette, répétée toutes les deux minutes),
  # on alerte, et on garde le site servi — `dist/` est ignoré par git, le reposer ne touche à
  # aucun fichier suivi.
  log "Arbre de travail non propre sur serveur, déploiement auto ignoré. Premiers écarts :"
  # `sed -n` lit tout (pas de SIGPIPE sous pipefail, même avec des milliers de lignes).
  printf '%s\n' "$DIRTY_TREE" | sed -n '1,10s/^/    /p'
  log "Fichiers suivis supprimés ou modifiés par erreur : git checkout -- <chemin> (docs/DEPLOY_DIST_ARTIFACT.md, Dépannage)."
  alert_throttled dirty-tree 360 "Déploiement bloqué (arbre non propre)" \
    "des fichiers suivis sont modifiés ou supprimés sur $APP_DIR ($(printf '%s\n' "$DIRTY_TREE" | wc -l) ligne(s)) : aucun déploiement tant que ce n'est pas réglé. Premières lignes : $(printf '%s\n' "$DIRTY_TREE" | sed -n '1,5p' | tr '\n' ' ')"
  ensure_frontend_served
  exit 1
fi

log "Fetch de origin/$DEPLOY_BRANCH..."
# Un fetch refusé (dépôt passé en privé alors que `origin` est en HTTPS anonyme, clé de
# déploiement retirée, réseau) arrêtait le script en silence sous `set -e` : plus aucun
# déploiement, sans alerte. On alerte (au plus toutes les 6 h) et on garde le site servi.
# Identifiants éventuels de l'URL masqués avant journalisation (`https://jeton@github.com/…`).
if ! FETCH_ERR="$(git fetch origin "$DEPLOY_BRANCH" --quiet 2>&1)"; then
  FETCH_ERR="$(printf '%s\n' "$FETCH_ERR" | sed -E 's#://[^/@[:space:]]+@#://****@#g' | sed -n '1,3p' | tr '\n' ' ')"
  log "ÉCHEC du git fetch origin/$DEPLOY_BRANCH : $FETCH_ERR"
  alert_throttled fetch-failed 360 "Déploiement bloqué (git fetch refusé)" \
    "git fetch origin $DEPLOY_BRANCH en échec sur $APP_DIR : aucun nouveau commit ne sera déployé. Dépôt privé : vérifier la clé de déploiement en lecture seule (docs/EXPLOITATION.md § 11.1). Message de git : $FETCH_ERR"
  ensure_frontend_served
  exit 1
fi

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$DEPLOY_BRANCH")"

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  # Aucun commit : on vérifie tout de même que le front est posé et servi (dossier effacé,
  # clone neuf, pull fait hors du cron, serveur démarré sans dist/) — gratuit dans le cas
  # courant, où dist/ est complet et le serveur annonce `frontend: "dist"`.
  ensure_frontend_served
  # Rattrapage : une base restée en retard sur le code déjà déployé (migration oubliée,
  # `DEPLOY_AUTO_MIGRATE` activé après coup) est migrée sans attendre un nouveau commit.
  # Pas de redémarrage : le code tourne déjà, il attendait justement ce schéma.
  if [[ "$DEPLOY_AUTO_MIGRATE" == "1" ]] && db_migrations_pending; then
    if run_db_migrations "Base en retard sur le code déployé"; then
      log "Rattrapage des migrations terminé (HEAD=$LOCAL_SHA)."
    else
      log "ÉCHEC du rattrapage des migrations."
      alert "Migration BDD ÉCHEC" "Rattrapage npm run db:migrate en échec sur $LOCAL_SHA (aucun nouveau commit). Snapshot pré-migration dans backups/."
      exit 1
    fi
  fi
  log "Aucune mise à jour (HEAD=$LOCAL_SHA)."
  exit 0
fi

log "Mise à jour détectée: $LOCAL_SHA -> $REMOTE_SHA"

# Fusion des rafales de commits : tant que la tête distante est plus jeune que la
# période d'accalmie, on repasse au prochain tick du cron. Objectif = un redémarrage
# par rafale de merges, pas un par commit (audit charge serveur, piste 7).
if [[ "$DEPLOY_QUIET_SECONDS" -gt 0 ]]; then
  REMOTE_COMMIT_TS="$(git show -s --format=%ct "origin/$DEPLOY_BRANCH" 2>/dev/null || echo 0)"
  NOW_TS="$(date +%s)"
  COMMIT_AGE=$((NOW_TS - REMOTE_COMMIT_TS))
  # Un âge négatif = horloge serveur en retard sur celle du commit : on ne bloque pas.
  if [[ "$REMOTE_COMMIT_TS" -gt 0 ]] && [[ "$COMMIT_AGE" -ge 0 ]] && [[ "$COMMIT_AGE" -lt "$DEPLOY_QUIET_SECONDS" ]]; then
    log "Accalmie non atteinte (commit vieux de ${COMMIT_AGE}s < ${DEPLOY_QUIET_SECONDS}s) : déploiement reporté au prochain passage."
    exit 0
  fi
fi
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
  # Avant : le déploiement était abandonné ici, avant le pull — sans secret, plus aucune mise à
  # jour ne passait par le cron. La roue de secours (tmp/restart.txt, restart_app) le remplace.
  log "DEPLOY_SECRET absent : le redémarrage se fera par tmp/restart.txt."
fi

# Garde-fou: en mode "build local" (`dist/` versionné), toute modif frontend doit inclure une
# mise à jour de dist/. Sans objet en mode `branch` : le build ne vient plus du dépôt.
if [[ "$DEPLOY_DIST_SOURCE" == "repo" ]]; then
  FRONTEND_PATTERNS='^(src/|index\.vite\.html$|vite\.config\.js$|public/)'
  if grep -Eq "$FRONTEND_PATTERNS" <<<"$CHANGED_FILES"; then
    if ! grep -Eq '^dist/' <<<"$CHANGED_FILES"; then
      log "Déploiement bloqué: modifications frontend détectées sans mise à jour de dist/."
      log "Action requise: exécuter npm run build en local puis pousser les fichiers dist/."
      exit 1
    fi
  fi
fi

# Mode `branch` : l'artefact doit être publié AVANT de toucher aux sources. Sans ce contrôle
# préalable, un `git pull` réussi suivi d'un artefact indisponible laisserait le serveur avec
# des sources neuves et un build périmé — exactement la désynchronisation qu'on veut exclure.
if [[ "$DEPLOY_DIST_SOURCE" == "branch" ]]; then
  log "Contrôle de l'artefact frontend pour $REMOTE_SHA (branche $DEPLOY_DIST_BRANCH)"
  DIST_CHECK_RC=0
  DEPLOY_DIST_BRANCH="$DEPLOY_DIST_BRANCH" node scripts/fetch-dist-artifact.js \
    --mode check --expect-source "$REMOTE_SHA" || DIST_CHECK_RC=$?
  if [[ "$DIST_CHECK_RC" -eq 75 ]]; then
    log "Artefact pas encore publié pour ce commit : déploiement reporté au prochain passage."
    exit 0
  fi
  if [[ "$DIST_CHECK_RC" -ne 0 ]]; then
    log "Artefact frontend inutilisable: déploiement annulé, sources inchangées."
    alert "Artefact dist inutilisable" "Déploiement vers $REMOTE_SHA annulé avant pull : voir la sortie de fetch-dist-artifact.js."
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
if ! git pull --ff-only origin "$DEPLOY_BRANCH"; then
  # git refuse la fusion en entier, avant d'écrire quoi que ce soit : sources et build restent
  # ceux de $PREV_SHA, il n'y a rien à annuler. Cas attendu : un fichier non suivi du serveur
  # porte le nom d'un fichier qu'apporte le commit (« untracked working tree files would be
  # overwritten by merge ») — le message de git, juste au-dessus, le nomme.
  log "ÉCHEC du git pull : sources inchangées (HEAD=$(git rev-parse HEAD)). Voir le message de git ci-dessus."
  alert_throttled pull-refused 360 "Déploiement bloqué (git pull refusé)" \
    "git pull --ff-only vers $REMOTE_SHA refusé sur $APP_DIR, sources inchangées. Cause habituelle : un fichier non suivi du serveur porte le nom d'un fichier du commit — le déplacer ; le cron repasse seul."
  exit 1
fi

# Mode `branch` : poser le build juste après les sources, avant tout redémarrage. L'échec ici
# est traité comme un échec de déploiement (rollback), pas ignoré : servir un `dist/` périmé
# derrière des sources neuves, c'est des assets en 404 et une SPA qui ne démarre pas.
if [[ "$DEPLOY_DIST_SOURCE" == "branch" ]]; then
  log "Pose du build frontend depuis $DEPLOY_DIST_BRANCH"
  if ! DEPLOY_DIST_BRANCH="$DEPLOY_DIST_BRANCH" node scripts/fetch-dist-artifact.js \
    --mode apply --expect-source "$REMOTE_SHA"; then
    log "ÉCHEC de la pose du build frontend."
    alert "Pose dist ÉCHEC" "Sources déployées sur $REMOTE_SHA mais le build frontend n'a pas pu être posé."
    if [[ "$DEPLOY_AUTO_ROLLBACK" == "1" ]]; then
      rollback_to
    fi
    exit 1
  fi
fi

if [[ "$DEPLOY_SKIP_SYNC_VISIT_PACK_LIB" != "1" ]] && [[ -f "$APP_DIR/scripts/sync-visit-pack-server-lib.js" ]]; then
  log "Synchronisation lib/visit-pack/ (sources présentes ou contrôle d'intégrité)"
  node scripts/sync-visit-pack-server-lib.js
fi

if grep -Eq '(^|/)(package\.json|package-lock\.json)$' <<<"$CHANGED_FILES"; then
  log "Dépendances modifiées: npm ci --omit=dev"
  npm ci --omit=dev --no-audit --no-fund
fi

# Migrations : celles qu'apporte le lot, ou une base déjà en retard sur le code (le lot n'en
# apporte pas mais une migration précédente n'a jamais été passée).
MIGRATE_REASON=""
if [[ "$DEPLOY_AUTO_MIGRATE" == "1" ]]; then
  if grep -Eq '^migrations/' <<<"$CHANGED_FILES"; then
    MIGRATE_REASON="Migrations détectées"
  elif db_migrations_pending; then
    MIGRATE_REASON="Base en retard sur le code"
  fi
fi
if [[ -n "$MIGRATE_REASON" ]]; then
  if ! run_db_migrations "$MIGRATE_REASON"; then
    log "ÉCHEC de db:migrate."
    alert "Migration BDD ÉCHEC" "npm run db:migrate a échoué ($PREV_SHA -> $REMOTE_SHA). Snapshot pré-migration disponible dans backups/."
    if [[ "$DEPLOY_AUTO_ROLLBACK" == "1" ]]; then
      rollback_to
    fi
    exit 1
  fi
fi

if [[ "$DO_DEPLOY_RESTART" == "1" ]]; then
  log "Redémarrage applicatif"
  # Tolérant : une réponse passerelle pendant l'arrêt gracieux n'est pas fatale ;
  # post-deploy-check ci-dessous est l'arbitre (restart_app alerte seulement).
  restart_app "déploiement $PREV_SHA -> $REMOTE_SHA" || true
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
