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

## Les 4 lignes de crontab (`crontab -e`)

```cron
# 1) Déploiement auto : pull + (migrate) + restart + post-deploy-check (+ rollback/alerte si échec) — toutes les 2 min
*/2 * * * * mkdir -p /home/USER/foretmap/logs && APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://foretmap.olution.info DEPLOY_AUTO_MIGRATE=1 /home/USER/foretmap/scripts/auto-deploy-cron.sh >> /home/USER/foretmap/logs/foretmap-auto-deploy.log 2>&1

# 2) Sauvegarde BDD quotidienne (mysqldump compressé + rotation) — 03:00
0 3 * * * APP_DIR=/home/USER/foretmap /home/USER/foretmap/scripts/db-backup.sh >> /home/USER/foretmap/logs/db-backup.log 2>&1

# 3) Sonde de disponibilité /api/ready (alerte email au changement d'état) — toutes les 5 min
*/5 * * * * APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://foretmap.olution.info /home/USER/foretmap/scripts/uptime-check.sh >> /home/USER/foretmap/logs/uptime.log 2>&1

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

## Ligne optionnelle : purge des journaux (rétention RGPD)

`security_events` conserve l'adresse IP et le user-agent de chaque connexion, `audit_log`
l'historique des actions. Sans purge, ces données personnelles — sur des comptes d'élèves,
donc de mineurs — s'accumulent sans limite (audit `docs/AUDIT_BDD_2026-08.md` §5.2).

Le script est **à blanc par défaut** : le lancer une première fois à la main pour valider
le volume et la durée retenue, puis seulement l'ajouter au crontab.

```bash
cd /home/USER/foretmap
npm run logs:purge -- --days=365            # à blanc : compte, ne supprime rien
npm run logs:purge -- --days=365 --apply    # applique
```

```cron
# 5) Purge des journaux au-delà de 365 jours — le 1er de chaque mois à 04:00
0 4 1 * * cd /home/USER/foretmap && npm run logs:purge -- --days=365 --apply >> /home/USER/foretmap/logs/purge-logs.log 2>&1
```

Le minimum accepté est 30 jours : en deçà, le script refuse — une purge trop agressive
effacerait des traces encore utiles à une investigation.

## Variables utiles (valeurs par défaut)

| Variable                           | Défaut      | Rôle                                                                                                                                   |
| ---------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_AUTO_MIGRATE`              | `0`         | `1` pour `npm run db:migrate` quand `migrations/` change                                                                               |
| `DEPLOY_AUTO_ROLLBACK`             | `1`         | rollback code si `post-deploy-check` échoue après restart                                                                              |
| `DEPLOY_DB_PRE_MIGRATE_BACKUP`     | `1`         | snapshot BDD avant `db:migrate`                                                                                                        |
| `BACKUP_RETENTION_DAYS`            | `14`        | purge des dumps plus vieux que N jours                                                                                                 |
| `BACKUP_DIR`                       | `./backups` | dossier des dumps (non versionné)                                                                                                      |
| `DEPLOY_SKIP_RESTART_IF_SOFT_ONLY` | `1`         | ne pas redémarrer si le diff est « soft » (docs/CHANGELOG seuls)                                                                       |
| `DEPLOY_QUIET_SECONDS`             | `180`       | n'applique un commit qu'après N s d'accalmie : une rafale de merges devient **un** redémarrage au lieu d'un par commit (`0` désactive) |
| `FORETMAP_BOOT_JOURNAL`            | _(activé)_  | `0` pour couper le journal de cycle de vie (`logs/boot-journal.ndjson`)                                                                |

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
