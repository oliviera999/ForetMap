# Crontab serveur ForetMap (mémo à coller)

Mémo unique, autosuffisant, pour configurer l'exploitation côté serveur (o2switch).
Détail et comportement : [`docs/EXPLOITATION.md`](EXPLOITATION.md).

> Remplacer `USER` par le compte hébergeur et adapter `DEPLOY_BASE_URL` / chemins.
> Tout repose sur le `.env` serveur (non versionné) pour les secrets : `DEPLOY_SECRET`,
> `DB_*`, `SMTP_*`, `OPS_ALERT_TO`.

## Pré-requis (une fois)

```bash
cd /home/USER/foretmap
mkdir -p logs backups
# Clé de chiffrement des sauvegardes (hors du dossier de l'application) :
openssl rand -base64 48 > /home/USER/.foretmap-backup.key
chmod 600 /home/USER/.foretmap-backup.key
```

> ⚠️ **Copier aussitôt cette clé hors du serveur** (gestionnaire de mots de passe de
> l'établissement) : sans elle, aucune sauvegarde ne peut être restaurée. Les anciens dumps en
> clair se chiffrent avec `bash scripts/encrypt-existing-backups.sh`
> ([`docs/EXPLOITATION.md`](EXPLOITATION.md), « Chiffrement des sauvegardes »).

Les lignes ci-dessous appellent chaque script **par `bash`** : aucun `chmod +x` n'est
nécessaire, et il ne faut pas en faire sur un fichier suivi par git (git peut le compter comme
une modification locale, et le cron refuse alors de déployer). Appeler le chemin seul dépend du
droit d'exécution du fichier, qu'un `git pull` peut faire sauter en le réécrivant : c'est ce qui
a arrêté le déploiement le 27/09/2026 (« Permission denied » à chaque passage).

`node` et `npm` : sur o2switch, ils ne sont dans **aucun** `PATH` du serveur, ni dans celui du
cron — seul le terminal « activé » les connaît ([`docs/EXPLOITATION.md`](EXPLOITATION.md), § 1
bis). Les scripts ci-dessous prennent **seuls** ceux de l'application
([`scripts/lib/app-node.sh`](../scripts/lib/app-node.sh)) : la ligne `PassengerNodejs` du
`.htaccess` que cPanel génère, sinon le `PATH`, sinon `~/nodevenv/<dossier>/<version>/bin`.
Les lignes qui lancent `npm run …` directement passent par `scripts/with-app-node.sh` (ligne 5).
Si le journal annonce « node et npm introuvables », ajouter à la ligne de crontab
`DEPLOY_NODE_BIN_DIR=/home/USER/nodevenv/<dossier>/<version>/bin` (le chemin qu'affiche
**Setup Node.js App** dans « Enter to the virtual environment », sans le `activate` final).

Vérifier que le `.env` serveur contient au minimum :

```ini
DEPLOY_SECRET=…            # = même valeur que l'application (POST /api/admin/restart)
DEPLOY_AUTO_MIGRATE=1      # migrations passées par le cron (sauvegarde vérifiée avant)
DB_HOST=… DB_PORT=3306 DB_NAME=… DB_USER=… DB_PASS=…
BACKUP_ENCRYPT_KEY_FILE=/home/USER/.foretmap-backup.key   # sauvegardes chiffrées (.sql.gz.enc)
BACKUP_ENCRYPT_REQUIRED=1  # jamais de sauvegarde en clair si la clé manque
# Alertes (optionnel mais recommandé) :
SMTP_HOST=… SMTP_PORT=587 SMTP_USER=… SMTP_PASS=… SMTP_FROM="ForetMap <no-reply@…>"
OPS_ALERT_TO=admin@…
```

## Les lignes de crontab (`crontab -e`) — 4 de base ci-dessous, puis purge (5), Moodle optionnel (6), fichiers orphelins (7) et rotation des journaux (8)

```cron
# 1) Déploiement auto : pull + (migrate) + restart + post-deploy-check (+ rollback/alerte si échec) — toutes les 2 min
*/2 * * * * mkdir -p /home/USER/foretmap/logs && APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://foretmap.olution.info DEPLOY_AUTO_MIGRATE=1 bash /home/USER/foretmap/scripts/auto-deploy-cron.sh >> /home/USER/foretmap/logs/foretmap-auto-deploy.log 2>&1

# 2) Sauvegarde BDD quotidienne (dump compressé, chiffré si BACKUP_ENCRYPT_KEY_FILE est dans .env, + rotation) — 03:00
0 3 * * * APP_DIR=/home/USER/foretmap bash /home/USER/foretmap/scripts/db-backup.sh >> /home/USER/foretmap/logs/db-backup.log 2>&1

# 3) Sonde de disponibilité /api/ready (alerte email au changement d'état) — toutes les 5 min
*/5 * * * * APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://foretmap.olution.info bash /home/USER/foretmap/scripts/uptime-check.sh >> /home/USER/foretmap/logs/uptime.log 2>&1

# 4) Keepalive : empêche l'arrêt d'inactivité Passenger aux heures d'usage — toutes les 3 min, 7h-22h
*/3 7-22 * * * curl -fsS --max-time 20 https://foretmap.olution.info/api/health >/dev/null 2>&1
```

**Pourquoi la ligne 4 alors que la ligne 3 interroge déjà le site ?** Elles ne font pas le
même travail. La ligne 3 **constate** (et alerte par email au changement d'état) ; la ligne 4
**empêche** l'arrêt. Et sa cadence compte : le seuil d'inactivité par défaut de Passenger est
de **300 s**, donc une sonde toutes les 5 minutes tombe pile dessus et laisse passer un arrêt
sur deux. `/api/health` ne touche pas la base et est exclu des logs et métriques : ~300
requêtes par jour, coût négligeable face aux démarrages à froid qu'il supprime.

Si le site est aussi utilisé le soir ou le week-end, élargir la plage (`*/3 * * * *` pour
24 h/24).

## Ligne 5 — purge des journaux (rétention RGPD) : **à installer, pas optionnelle**

> **Cette ligne n'est pas optionnelle.** Tant qu'elle n'est pas installée,
> `security_events` conserve **indéfiniment** l'adresse IP et le user-agent de chaque
> connexion — des **données personnelles d'élèves mineurs**, dans un établissement
> scolaire. La rétention RGPD n'existe que si cette purge tourne. Audits :
> `docs/AUDIT_BDD_2026-08.md` §5.2 et `docs/AUDIT_STABILITE_PERF_2026-09.md` §C3.

Le script couvre les journaux, les historiques et les traces transitoires, avec des
**rétentions distinctes et configurables** (option, sinon variable d'environnement du `.env`) :

| Tables                                                                                 | Contenu                                          | Option (variable `FORETMAP_RETENTION_…`) | Défaut          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- | --------------- |
| `audit_log`, `security_events`, `elevation_audit`                                      | journaux de sécurité (IP, user-agent…)           | `--days` (`SECURITY_DAYS`)               | 365 j           |
| `gl_game_events`, `zone_history`, verrous de ressources                                | historiques de jeu G&L et de récoltes            | `--history-days` (`HISTORY_DAYS`)        | 365 j           |
| `user_activity_events`                                                                 | journal d'activité légère                        | `--activity-days` (`ACTIVITY_DAYS`)      | 90 j            |
| `sync_runs` (+ `sync_actions`), `sync_pending_matches` et `sync_conflicts` **résolus** | synchronisation Moodle (fiches Moodle complètes) | `--sync-days` (`SYNC_DAYS`)              | 365 j (12 mois) |
| `user_product_visits`                                                                  | ouvertures des applications                      | `--visits-days` (`VISITS_DAYS`)          | 395 j (13 mois) |
| `gl_qcm_attempts` des **invités** G&L                                                  | réponses QCM sans compte                         | `--guest-days` (`GUEST_DAYS`)            | 30 j            |
| `password_reset_tokens` utilisés ou expirés, `gl_qcm_presentation_uses`                | jetons consommés                                 | — (fixe)                                 | 1 j             |
| `security_events` : **IP tronquée** (IPv4 → /24, IPv6 → /48) et **user-agent effacé**  | anonymisation des connexions anciennes           | `--ip-days` (`IP_DAYS`)                  | 183 j (6 mois)  |

`audit_log` ne stocke ni IP ni user-agent. Une table absente (`elevation_audit`, supprimée au
démarrage) est signalée et ignorée.

Sans purge, les deux tables d'historique croissent elles aussi sans borne (une ligne par
action de jeu, une par récolte) et finissent par peser sur les sauvegardes
(`db-backup.sh`), la durée des `mysqldump` et l'espace disque du compte.

Le script est **à blanc par défaut** : le lancer une première fois à la main pour valider
le volume et les durées retenues, puis l'ajouter au crontab.

```bash
cd /home/USER/foretmap
bash scripts/with-app-node.sh npm run logs:purge -- --days=365 --history-days=365          # à blanc : compte, ne supprime rien
bash scripts/with-app-node.sh npm run logs:purge -- --days=365 --history-days=365 --apply  # applique
```

```cron
# 5) Purge des journaux (sécurité 365 j, historiques 365 j, synchro 12 mois, visites 13 mois, invités 30 j, IP tronquées à 6 mois) — le 1er de chaque mois à 04:00
0 4 1 * * bash /home/USER/foretmap/scripts/with-app-node.sh npm run logs:purge -- --days=365 --history-days=365 --apply >> /home/USER/foretmap/logs/purge-logs.log 2>&1
```

Les nouvelles rétentions (synchro, visites, invités, IP) s'appliquent avec leurs défauts sans
changer la ligne ; les ajuster par option ou par `FORETMAP_RETENTION_…` dans le `.env`.

Avant le 27/09/2026, cette ligne s'écrivait `cd … && npm run logs:purge …` : sur o2switch, `npm`
n'étant pas dans le `PATH` du cron, elle échouait chaque mois en « command not found », sans
alerte. La remplacer par celle ci-dessus, puis vérifier `logs/purge-logs.log` après son passage.

Le minimum accepté est 30 jours (pour chaque rétention réglable) : en deçà, le script
refuse — une purge trop agressive effacerait des traces encore utiles à une investigation.

## Ligne 6 (optionnelle) — simulation quotidienne du lien Moodle

Une fois le lien Moodle configuré (`MOODLE_BASE_URL` / `MOODLE_WS_TOKEN` dans `.env`, voir
`docs/EXPLOITATION.md`), une **simulation** chaque matin de classe prépare le travail de
l'administrateur : elle ne modifie rien et envoie un email (`ops-alert`) quand elle annonce des
désactivations, des conflits ou des rapprochements en attente — ou quand un seuil l'arrête.
L'**application** reste un geste humain depuis _Paramètres administrateur → Moodle_, après
lecture du rapport (spécification : `docs/AUDIT_MOODLE_IDENTITES_2026-09.md`, section 17).

```cron
# 6) Simulation Moodle (jamais --apply) — du lundi au vendredi à 06:30
30 6 * * 1-5 APP_DIR=/home/USER/foretmap bash /home/USER/foretmap/scripts/moodle-sync-cron.sh >> /home/USER/foretmap/logs/moodle-sync.log 2>&1
```

Le script pose un verrou `mkdir` (`MOODLE_CRON_LOCK_DIR`, défaut `/tmp/foretmap-moodle-sync.lock`),
accepte des arguments supplémentaires via `MOODLE_CRON_ARGS` (ex. `--cohort 26#603`) et se tait
(`exit 0`) si l'intégration n'est pas configurée. `MOODLE_CRON_NO_ALERT=1` coupe l'email.

## Ligne 7 — fichiers orphelins de `uploads/`

Une photo dont la ligne en base a disparu (suppression interrompue, ancien code) reste servie
sous `/uploads` tant qu'on ne la supprime pas. `scripts/reconcile-orphan-uploads.js` compare
le disque aux tables : **à blanc par défaut**, `--apply` supprime. Son périmètre (`managed`)
se limite aux dossiers gérés par l'application (`zones/`, `markers/`, `tasks/`, `task-logs/`,
`observations/`, `students/`, `forum-posts/`, `context-comments/`, `plants/`) ; la
médiathèque en est exclue (ses fichiers sont le catalogue).

```bash
cd /home/USER/foretmap
bash scripts/with-app-node.sh npm run db:uploads:reconcile:dry   # à blanc : liste les orphelins
bash scripts/with-app-node.sh npm run db:uploads:reconcile       # supprime (--apply)
```

Lancer d'abord la version à blanc et relire la liste, puis installer la ligne :

```cron
# 7) Fichiers orphelins (--apply, périmètre managed) — le 1er de chaque mois à 04:30, après la purge
30 4 1 * * bash /home/USER/foretmap/scripts/with-app-node.sh npm run db:uploads:reconcile >> /home/USER/foretmap/logs/reconcile-uploads.log 2>&1
```

L'heure creuse compte : un fichier écrit une fraction de seconde avant sa ligne en base
pourrait être vu orphelin pendant un téléversement. Les carnets (`user-journal/`,
`gl-player-journal/`) et le forum G&L ne sont pas dans le périmètre : leurs fichiers sont
supprimés avec le compte (effacement d'un élève ou d'un joueur).

## Ligne 8 — rotation des journaux cron

Les lignes ci-dessus **ajoutent** à `logs/*.log` sans jamais tronquer : sans rotation, ces
fichiers grossissent indéfiniment (et gardent des traces datées sans limite). Deux façons :

**a) `logrotate` en utilisateur** (recommandé — présent sur o2switch). Créer
`/home/USER/.foretmap-logrotate.conf` :

```conf
/home/USER/foretmap/logs/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
```

```cron
# 8) Rotation des journaux cron (8 semaines conservées) — chaque lundi à 05:10
10 5 * * 1 /usr/sbin/logrotate -s /home/USER/foretmap/logs/.logrotate.state /home/USER/.foretmap-logrotate.conf >> /home/USER/foretmap/logs/logrotate.log 2>&1
```

`copytruncate` évite de couper l'écriture en cours d'un script. Tester une fois à la main avec
`/usr/sbin/logrotate -d -s /home/USER/foretmap/logs/.logrotate.state /home/USER/.foretmap-logrotate.conf`
(`-d` : simulation).

**b) Sans `logrotate`** : tronquer chaque mois les journaux devenus gros et effacer les archives
anciennes.

```cron
# 8 bis) Journaux cron : garder les 5000 dernières lignes des fichiers de plus de 5 Mo ; effacer les archives de plus de 90 jours — le 1er du mois à 05:10
10 5 1 * * find /home/USER/foretmap/logs -name '*.log' -size +5M -exec sh -c 'tail -n 5000 "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \; ; find /home/USER/foretmap/logs -name '*.gz' -mtime +90 -delete
```

## Fin d'année scolaire — comptes élèves inactifs (**pas de cron**)

`scripts/purge-inactive-accounts.js` liste puis supprime les comptes **élèves** sans activité
depuis N mois (défaut **13**, minimum 6) — dernière connexion, création ou dernière visite du
joueur G&L lié. La suppression passe par le **même chemin** que l'effacement d'un élève depuis
l'application (forum, commentaires, tâches, carnet et fichiers, joueur G&L lié, traces de
journaux) ; chaque suppression est inscrite au journal d'audit (`purge_inactive_account`). Un
compte retenu par une partie G&L en cours est signalé et conservé.

**Volontairement sans ligne de crontab** : c'est un geste d'administration de fin d'année
(juillet), après relecture de la liste.

```bash
cd /home/USER/foretmap
bash scripts/with-app-node.sh node scripts/purge-inactive-accounts.js                     # à blanc : liste
bash scripts/with-app-node.sh node scripts/purge-inactive-accounts.js --months=13 --apply # supprime
```

## Variables utiles (valeurs par défaut)

| Variable                           | Défaut                           | Rôle                                                                                                                                   |
| ---------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_AUTO_MIGRATE`              | `0`                              | `1` pour `npm run db:migrate` quand `migrations/` change                                                                               |
| `DEPLOY_AUTO_ROLLBACK`             | `1`                              | rollback code si `post-deploy-check` échoue après restart                                                                              |
| `DEPLOY_DB_PRE_MIGRATE_BACKUP`     | `1`                              | snapshot BDD avant `db:migrate`                                                                                                        |
| `BACKUP_RETENTION_DAYS`            | `14`                             | purge des dumps plus vieux que N jours                                                                                                 |
| `BACKUP_DIR`                       | `./backups`                      | dossier des dumps (non versionné)                                                                                                      |
| `DEPLOY_SKIP_RESTART_IF_SOFT_ONLY` | `1`                              | ne pas redémarrer si le diff est « soft » (docs/CHANGELOG seuls)                                                                       |
| `DEPLOY_QUIET_SECONDS`             | `180`                            | n'applique un commit qu'après N s d'accalmie : une rafale de merges devient **un** redémarrage au lieu d'un par commit (`0` désactive) |
| `FORETMAP_BOOT_JOURNAL`            | _(activé)_                       | `0` pour couper le journal de cycle de vie (`logs/boot-journal.ndjson`)                                                                |
| `APP_DIR`                          | _(requis)_                       | Racine de l'application pour les scripts cron (`/home/USER/foretmap`)                                                                  |
| `DEPLOY_NODE_BIN_DIR`              | _(trouvé seul)_                  | dossier `bin/` qui contient le `node` et le `npm` de l'application, si la recherche automatique échoue (`scripts/lib/app-node.sh`)     |
| `MOODLE_CRON_LOCK_DIR`             | `/tmp/foretmap-moodle-sync.lock` | Verrou `mkdir` de la simulation Moodle (ligne 6)                                                                                       |
| `MOODLE_CRON_ARGS`                 | _(vide)_                         | Arguments supplémentaires passés à `moodle:sync` (ex. `--cohort 26#603`) — jamais `--apply`                                            |
| `MOODLE_CRON_NO_ALERT`             | _(vide)_                         | `1` pour couper l'e-mail `ops-alert` après une simulation Moodle                                                                       |
| `FORETMAP_RETENTION_SYNC_DAYS`     | `365`                            | Purge (ligne 5) : synchronisations Moodle terminées ou résolues                                                                        |
| `FORETMAP_RETENTION_VISITS_DAYS`   | `395`                            | Purge (ligne 5) : ouvertures des applications (`user_product_visits`)                                                                  |
| `FORETMAP_RETENTION_GUEST_DAYS`    | `30`                             | Purge (ligne 5) : réponses QCM des invités G&L                                                                                         |
| `FORETMAP_RETENTION_IP_DAYS`       | `183`                            | Purge (ligne 5) : au-delà, IP tronquée et user-agent effacé dans `security_events`                                                     |

## Vérifications

```bash
# Pourquoi le service a-t-il été indisponible ? (depuis le poste de travail, secret dans .env)
npm run prod:uptime-report
# Le déploiement tourne ?
tail -n 30 /home/USER/foretmap/logs/foretmap-auto-deploy.log
# Historique brut des redémarrages (sur le serveur)
tail -n 20 /home/USER/foretmap/logs/boot-journal.ndjson
# Un dump récent existe ?
ls -lh /home/USER/foretmap/backups | tail
# Restaurer un dump (exemple) :
gunzip -c /home/USER/foretmap/backups/foretmap-AAAAMMJJ-HHMMSS.sql.gz | mysql -u "$DB_USER" -p "$DB_NAME"
```
