# Crontab serveur ForetMap (mémo à coller)

Mémo unique, autosuffisant, pour configurer l'exploitation côté serveur (o2switch).
Détail et comportement : [`docs/EXPLOITATION.md`](EXPLOITATION.md).

> Remplacer `USER` par le compte hébergeur et adapter `DEPLOY_BASE_URL` / chemins.
> Tout repose sur le `.env` serveur (non versionné) pour les secrets : `DEPLOY_SECRET`,
> `DB_*`, `SMTP_*`, `OPS_ALERT_TO`.

## Pré-requis (une fois)

```bash
cd /home/USER/foretmap
chmod +x scripts/auto-deploy-cron.sh scripts/db-backup.sh scripts/uptime-check.sh
mkdir -p logs backups
```

Vérifier que le `.env` serveur contient au minimum :

```ini
DEPLOY_SECRET=…            # = secret de POST /api/admin/restart
DB_HOST=… DB_PORT=3306 DB_NAME=… DB_USER=… DB_PASS=…
# Alertes (optionnel mais recommandé) :
SMTP_HOST=… SMTP_PORT=587 SMTP_USER=… SMTP_PASS=… SMTP_FROM="ForetMap <no-reply@…>"
OPS_ALERT_TO=admin@…
```

## Les 3 lignes de crontab (`crontab -e`)

```cron
# 1) Déploiement auto : pull + (migrate) + restart + post-deploy-check (+ rollback/alerte si échec) — toutes les 2 min
*/2 * * * * mkdir -p /home/USER/foretmap/logs && APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://foretmap.olution.info DEPLOY_AUTO_MIGRATE=1 /home/USER/foretmap/scripts/auto-deploy-cron.sh >> /home/USER/foretmap/logs/foretmap-auto-deploy.log 2>&1

# 2) Sauvegarde BDD quotidienne (mysqldump compressé + rotation) — 03:00
0 3 * * * APP_DIR=/home/USER/foretmap /home/USER/foretmap/scripts/db-backup.sh >> /home/USER/foretmap/logs/db-backup.log 2>&1

# 3) Sonde de disponibilité /api/ready (alerte email au changement d'état) — toutes les 5 min
*/5 * * * * APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://foretmap.olution.info /home/USER/foretmap/scripts/uptime-check.sh >> /home/USER/foretmap/logs/uptime.log 2>&1
```

## Variables utiles (valeurs par défaut)

| Variable                           | Défaut      | Rôle                                                             |
| ---------------------------------- | ----------- | ---------------------------------------------------------------- |
| `DEPLOY_AUTO_MIGRATE`              | `0`         | `1` pour `npm run db:migrate` quand `migrations/` change         |
| `DEPLOY_AUTO_ROLLBACK`             | `1`         | rollback code si `post-deploy-check` échoue après restart        |
| `DEPLOY_DB_PRE_MIGRATE_BACKUP`     | `1`         | snapshot BDD avant `db:migrate`                                  |
| `BACKUP_RETENTION_DAYS`            | `14`        | purge des dumps plus vieux que N jours                           |
| `BACKUP_DIR`                       | `./backups` | dossier des dumps (non versionné)                                |
| `DEPLOY_SKIP_RESTART_IF_SOFT_ONLY` | `0`         | ne pas redémarrer si le diff est « soft » (docs/CHANGELOG seuls) |

## Vérifications

```bash
# Le déploiement tourne ?
tail -n 30 /home/USER/foretmap/logs/foretmap-auto-deploy.log
# Un dump récent existe ?
ls -lh /home/USER/foretmap/backups | tail
# Restaurer un dump (exemple) :
gunzip -c /home/USER/foretmap/backups/foretmap-AAAAMMJJ-HHMMSS.sql.gz | mysql -u "$DB_USER" -p "$DB_NAME"
```
