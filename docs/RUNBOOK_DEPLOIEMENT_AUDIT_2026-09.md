# Déploiement des suites de l'audit du 25/09/2026 — ce qu'il faut faire côté serveur

Procédure pour mettre en production #550 (fusionnée), #551 et #552 : migrations **292 à 301**.
Toutes les commandes se lancent **sur le serveur**, dans le dossier de l'application (celui qui
contient `package.json`), avec le `.env` de production. Chaque appel au client MariaDB porte
`--default-character-set=utf8mb4`.

> ⚠️ **Urgent si le cron a déjà déployé `main`.** #550 est dans `main` depuis le 25/09 à 21 h 25
> (UTC). Le cron déploie `main` automatiquement, mais **ne lance pas les migrations** tant que
> `DEPLOY_AUTO_MIGRATE` vaut `0` (valeur par défaut). Or le code de #550 écrit la colonne
> `user_plant_observation_events.client_uuid` (migration 296) : tant que les migrations 292-297
> ne sont pas passées, **« Espèce observée » échoue** (erreur 500) pour les élèves. Si c'est le
> cas, faire tout de suite les étapes 1 à 3 ci-dessous.

## 0. Vérifier l'état

```bash
set -a; . ./.env; set +a                     # charge DB_USER, DB_NAME, DB_PASS dans le shell
git log -1 --oneline                         # commit déployé
mysql --default-character-set=utf8mb4 -u "$DB_USER" -p "$DB_NAME" \
  -e "SELECT version FROM schema_version"    # version du schéma (attendu avant : 291)
grep -E '^DEPLOY_AUTO_MIGRATE|^DEPLOY_DB_PRE_MIGRATE_BACKUP' .env
```

## 1. Sauvegarde vérifiée (avant toute migration)

Le script de sauvegarde a été corrigé dans #551 (`utf8mb4`, sans `DEFINER`, dump vérifié). Tant
que #551 n'est pas déployée, utiliser la commande directe :

```bash
command -v mariadb-dump || command -v mysqldump     # un des deux doit exister
MYSQL_PWD="$DB_PASS" mariadb-dump --default-character-set=utf8mb4 \
  --single-transaction --quick --routines --triggers --events --no-tablespaces \
  -u "$DB_USER" "$DB_NAME" | sed -E 's/ DEFINER=`[^`]*`@`[^`]*`//g' \
  | gzip -c > backups/foretmap-avant-audit.sql.gz
gzip -dc backups/foretmap-avant-audit.sql.gz | tail -n 1     # doit finir par « Dump completed »
```

Après déploiement de #551 : `bash scripts/db-backup.sh --label avant-migration` (vérifie tout
seul l'archive et la marque de fin).

## 2. Migrations

```bash
npm run db:migrate
mysql --default-character-set=utf8mb4 -u "$DB_USER" -p "$DB_NAME" -e "SELECT version FROM schema_version"
```

| Migration | Effet                                                             | Contrôle après passage                                                                                                       |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 292       | vue `v_zone_inventory` recréée (`SQL SECURITY INVOKER`)           | `SHOW CREATE VIEW v_zone_inventory`                                                                                          |
| 293       | fiches « danger validé » sans relecteur repassent « à valider »   | `SELECT COUNT(*) FROM plants WHERE hazard_reviewed=1 AND hazard_reviewed_by IS NULL` → 0                                     |
| 294       | 4 notions de collège, rattachements                               | `SELECT COUNT(*) FROM curriculum_notions` → 16                                                                               |
| 295       | rôle trophique `detritivore`, animaux reclassés                   | `SELECT COUNT(*) FROM plants WHERE trophic_role='detritivore'` (14 sur le fixture)                                           |
| 296       | `client_uuid` sur les observations d'espèce                       | `SHOW COLUMNS FROM user_plant_observation_events LIKE 'client_uuid'`                                                         |
| 297       | rangs des paliers « bébé », « expert », « ultime » (90, 310, 315) | `SELECT slug,\`rank\`,min_done_tasks FROM roles WHERE min_done_tasks IS NOT NULL ORDER BY min_done_tasks` → rangs croissants |
| 298       | QF0212 reformulée                                                 | `SELECT question FROM quiz_questions WHERE question_code='QF0212'`                                                           |
| 299       | `client_uuid` sur `task_logs` et `user_journal_articles`          | `SHOW COLUMNS FROM task_logs LIKE 'client_uuid'`                                                                             |
| 300       | liens historiques repris dans `resource_question_links`           | `SELECT COUNT(*) FROM resource_question_links WHERE origin='editorial' AND note LIKE 'migration 300%'`                       |
| 301       | niveau des classes déduit du nom                                  | `SELECT COUNT(*) FROM \`groups\` WHERE curriculum_niveau IS NULL` → à compléter à la main (étape 5)                          |

Les migrations **doivent passer dans l'ordre** : le moteur saute sans rien dire tout numéro
inférieur à la version courante. Ne jamais déployer une branche qui apporte 300 ou 301 avant
298-299 (la garde `tests/migrations-numbering.test.js` l'empêche désormais en CI).

**Pour les prochains déploiements**, deux options :

- mettre `DEPLOY_AUTO_MIGRATE=1` dans le `.env` : le cron fait alors sauvegarde + migration +
  redémarrage dans le même passage (la sauvegarde pré-migration est active par défaut) ;
- ou garder `0` et lancer `npm run db:migrate` juste après chaque fusion qui apporte une
  migration.

## 3. Redémarrage et contrôle

Redémarrer l'application (Setup Node.js App) si le cron ne l'a pas fait, puis :

```bash
npm run deploy:check:prod
node -e "require('isomorphic-dompurify'); console.log('dompurify ok')"   # vue des tutoriels (P0)
node -e "require('sharp'); console.log('sharp ok')"                       # question 14, dernier contrôle
```

## 4. Contrôles fonctionnels rapides

- Un élève confirme « Espèce observée » sur une fiche : le compteur augmente.
- Un professeur ouvre « Rattacher des questions aux contenus » : le nombre de contenus qui se
  valident sans question s'affiche.
- Hors ligne (mode avion) sur un téléphone : marquer une tâche terminée, puis rétablir le
  réseau : la tâche part seule.

## 5. Tâches d'administration après déploiement

- **Niveau des classes (question 5)** : écran Groupes → filtre « sans niveau » ; compléter les
  classes que la migration 301 n'a pas pu déduire (sur le fixture : 5 groupes sur 32, dont des
  groupes de test). Le formulaire propose un niveau d'après le nom.
- **Fiches « danger »** : les fiches remises « à valider » par la migration 293 doivent être
  relues par un professeur qui a la permission `plants.hazards.validate`.
- **Textes visiteurs** : `npm run audit:visitor-texts` (lecture seule). Code de sortie 1 s'il
  reste une incitation non arbitrée ; les zones grises sont listées pour information.
- **Modules pédagogiques** : les quatre interrupteurs (`ui.modules.*`) sont allumés par défaut ;
  rien à faire sauf si vous voulez en éteindre un.

## 6. Hors serveur (sur votre poste)

- **Graine biodiversité** : après la migration 295, régénérer `sql/biodiv_pedago_seed.sql` à
  partir d'un dump de production **gardé sur votre poste** (il contient des données
  personnelles) : `node scripts/extract-biodiv-pedago-seed.js <dump.sql>` (le script refuse
  d'écrire s'il trouve un e-mail ou un hachage), puis commiter le seul fichier régénéré.
- **Lot BCDEG** : ses migrations doivent être renumérotées **à partir de 302** (292 à 301 sont
  pris, et la numérotation doit rester continue).

## 7. Bascule `dist-artifact` (question 16), quand vous voulez

Runbook complet : `docs/DEPLOY_DIST_ARTIFACT.md`, § 3.

1. Contrôle à blanc : `npm run deploy:dist:verify` → « artefact complet (N fichiers) », N égal
   au nombre de fichiers de `dist/` ; puis `rm -rf dist.candidate`.
2. `DEPLOY_DIST_SOURCE=branch` dans le `.env` ; laisser passer un ou deux déploiements.
3. Me le signaler : je prépare alors la PR courte qui retire `dist/` du dépôt.
   Retour arrière : `DEPLOY_DIST_SOURCE=repo`.

## 8. Retour arrière

Le retour arrière du cron annule le **code**, pas la base. En cas de problème grave après les
migrations : restaurer la sauvegarde de l'étape 1
(`gunzip -c backups/foretmap-avant-audit.sql.gz | mysql --default-character-set=utf8mb4 -u "$DB_USER" -p "$DB_NAME"`),
puis redéployer le commit précédent.
