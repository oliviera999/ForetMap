# Fiche — quoi lancer dans quel cas

Index opérationnel des commandes `npm` / scripts Node. Pas un inventaire :
pour chaque situation, **la première commande qui suffit**, puis les variantes.

Détails d’environnement : [LOCAL_DEV.md](LOCAL_DEV.md).
Prod et cron : [EXPLOITATION.md](EXPLOITATION.md).
Imports WordPress GL : [GL_IMPORT_FROM_YO.md](GL_IMPORT_FROM_YO.md).

## Règles avant de taper

1. **Dry-run d’abord.** Tout ce qui écrit en base (`gl:import:*`, purge, compactage
   d’aide, suggestions pédagogiques, uploads orphelins) ne change rien tant qu’on
   n’ajoute pas `--apply` ou `--write`.
2. **Quelle base ?** `.env` → `DB_NAME` (souvent `foretmap_local`). Les tests
   isolés forcent `foretmap_test`. Un dump recréé vise aussi `foretmap_local` par
   défaut — **jamais** la prod depuis le poste sans le vouloir.
3. **Secrets.** Les sondes prod lisent `DEPLOY_SECRET` (ou alias) dans `.env`
   local, jamais dans le chat. Moodle : `MOODLE_*`. Compte prof de seed :
   `TEACHER_ADMIN_*`.
4. **Ne pas enchaîner deux écritures** (import dump + import GL + purge) sans
   relire le rapport du dry-run.

---

## 1. Je démarre (ou je reprends) en local

| Je veux…                                                   | Lancer                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Tout installer d’un coup (Docker + `.env` + schéma + seed) | `npm run local:setup`                                                  |
| Juste (re)créer le schéma et le seed sur `foretmap_local`  | `npm run db:init`                                                      |
| Uniquement les migrations, sans re-semer                   | `npm run db:migrate`                                                   |
| Vérifier Node / `.env` / MariaDB                           | `npm run check:local`                                                  |
| Attendre que MySQL réponde (déjà dans `local:setup`)       | `node scripts/wait-mysql-ready.js`                                     |
| Créer ou reset le compte prof admin                        | `npm run db:seed:teacher`                                              |
| Lancer l’app                                               | `npm run dev` (API + watch) et, si besoin, `npm run dev:client` (Vite) |

**Après un `git pull` qui touche le front :** `npm run build` si tu sers `dist/`
(`NODE_ENV=production`), sinon `npm run dev` suffit.

**Police emoji manquante** (carrés à la place des pictos) :

```bash
npm run fonts:sync-noto-emoji
```

**Smoke « manches dans le cambouis »** (check + tests isolés, sans build) :

```bash
npm run smoke:local:fast
```

Check + build + tests isolés : `npm run smoke:local`.

---

## 2. Je remplis une base vide (contenus)

### Forêt / biodiversité (ForetMap)

Jeu versionné **sans données personnelles** (`sql/biodiv_pedago_seed.sql`) :

```bash
npm run db:import:biodiv
```

(`import-biodiv-pedago` puis enrichissement des fiches `plants`.)

Régénérer ce seed depuis un dump **local non versionné** (le script refuse
emails / hash bcrypt) :

```bash
npm run db:seed:biodiv:extract -- chemin/vers/dump.sql
```

Importer un dump SQL complet dans une base **locale** (DROP + CREATE — destructif) :

```bash
npm run db:import:dump -- --file chemin/vers/dump.sql --db foretmap_local
```

Ensuite, si l’ancien schéma `students`/`teachers` est encore là :

```bash
npm run db:backfill:users
```

Contrôle lecture seule du corpus pédagogique : `npm run audit:pedago`.

### Gnomes & Licornes (XLSX dans `data/gl/`)

Toujours **sans `--apply` d’abord**. Chaque commande affiche un rapport JSON.

```bash
npm run gl:import:chapters          # + -- --apply
npm run gl:import:species
npm run gl:import:spells
npm run gl:import:glossary
npm run gl:import:lore-glossary
npm run gl:import:lore-feuillets
npm run gl:import:qcm
npm run gl:import:qcm-lore
```

Fichier autre que le défaut : `-- --file=/chemin/fichier.xlsx --apply`.

Modèle Excel chapitres vide : `npm run gl:import:chapters:example`.

**WordPress (yo.olution.info → GL)** — procédure complète :
[GL_IMPORT_FROM_YO.md](GL_IMPORT_FROM_YO.md).

```bash
npm run gl:import:wp -- --source-base-url https://yo.olution.info --target=all --dry-run
npm run gl:import:wp -- --source-base-url https://yo.olution.info --target=all --apply
```

**Médias GL** déjà sur le disque :

```bash
npm run gl:import:media -- --dry-run
npm run gl:audit:media-keys
```

---

## 3. Je vérifie avant de livrer

| Je veux…                                                        | Lancer                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| Backend + utilitaires                                           | `npm test`                                                  |
| UI Vitest                                                       | `npm run test:ui`                                           |
| Les deux                                                        | `npm run test:all`                                          |
| Un fichier de test à la fois (reset BDD entre chaque)           | `npm run test:local`                                        |
| Parcours navigateur                                             | `npm run test:e2e` (libère le port 3000, bypass rate-limit) |
| e2e sans tuer un serveur déjà en `--foretmap-e2e-no-rate-limit` | `E2E_REUSE_SERVER=1 npm run test:e2e`                       |
| Lint / format                                                   | `npm run lint` puis `npm run format:check`                  |
| Charge Artillery (serveur déjà up)                              | `npm run test:load:light` puis `test:load`                  |
| Politique de verrous **réellement** en base                     | `npm run gating:check`                                      |
| Moodle configuré ?                                              | `npm run moodle:check`                                      |

**Piège e2e :** ne pas laisser un `npm start` « normal » sur le port 3000 —
Playwright le réutilise et tu prends des **429**.

Nettoyer les rapports locaux : `npm run clean:local`.

---

## 4. Je livre (dev → serveur)

### Cas A — cron auto-deploy (le plus courant)

Le serveur fait `git pull` : il faut un `dist/` **commité** et à jour.

```bash
npm run ship -- -m "feat(…): titre du lot"
```

Enchaîne build (Vite + miroirs CJS) → lint/format/tests → entrée CHANGELOG →
commit → push. Variantes : `--minor`, `--dry-run` (rien poussé), `--skip-tests`.

À la main (même idée) : `npm run build` puis commit/push. Ne **pas** bumper
`package.json` : le workflow de fusion s’en charge
([VERSIONING.md](VERSIONING.md)).

### Cas B — bundle à extraire sur l’hébergeur (pas de npm au boot)

```bash
npm run deploy:prepare:runtime          # dossier + ZIP sous deploy/runtime/
npm run deploy:prepare:runtime:fast     # skip install + skip build (dist déjà là)
npm run deploy:prepare:runtime:selector # CloudLinux : sans node_modules
```

Seulement le front (`dist/` + ZIP) : `npm run deploy:prepare`.

Le **Build** cPanel (Setup Node.js App) n’est pas un cas supporté. S’il échoue
en `ERESOLVE` (`eslint-plugin-jsx-a11y` / ESLint 10) : variable
`NPM_CONFIG_LEGACY_PEER_DEPS=true`, détail dans [EXPLOITATION.md](EXPLOITATION.md).

### Juste après un déploiement

```bash
npm run deploy:check:prod
```

Trois hosts (Foret / GL / Plan). Un seul produit : `deploy:check:prod:foret`
ou `npm run deploy:check -- --base-url http://127.0.0.1:3000`.

---

## 5. La prod (ou le staging) se comporte mal

Prérequis : `DEPLOY_SECRET` (ou `FORETMAP_DEPLOY_CHECK_SECRET` /
`FORETMAP_DEPLOY_SECRET`) dans le `.env` **local**.

| Symptôme                              | Lancer                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- |
| « C’est debout ? »                    | `npm run deploy:check:prod`                                                |
| « Pourquoi ça a redémarré ? »         | `npm run prod:uptime-report` (`-- --hours=168` pour une semaine)           |
| JSON diagnostics complet              | `npm run prod:admin-diagnostics`                                           |
| Dernières lignes Pino + snapshot      | `npm run prod:admin-tail`                                                  |
| Check **puis** logs (un seul geste)   | `npm run prod:remote-debug`                                                |
| Chrome `ERR_HTTP2_PROTOCOL_ERROR`     | `npm run prod:transport-probe`                                             |
| Depuis Cursor (MCP, secret hors chat) | `npm run mcp:diag` — voir [MCP_FORETMAP_CURSOR.md](MCP_FORETMAP_CURSOR.md) |

Alerte e-mail (cron, **ne fait jamais échouer** la chaîne si SMTP est down) :

```bash
node scripts/ops-alert.js "Sujet court" "Corps"
```

---

## 6. Je fais le ménage (local ou instance déjà en service)

Toujours le dry-run d’abord.

| Situation                                  | Dry-run                                            | Écriture                                                |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------- |
| Comptes e2e / clones de tâches récurrentes | `npm run db:cleanup:dev:dry`                       | `npm run db:cleanup:dev`                                |
| Fichiers `uploads/` orphelins              | `npm run db:uploads:reconcile:dry`                 | `npm run db:uploads:reconcile`                          |
| Journaux trop vieux (IP, audit, events GL) | `node scripts/purge-audit-logs.js`                 | `npm run logs:purge -- --apply`                         |
| Bulles d’aide figées (Foret / GL)          | `npm run help:compact:dry` / `gl:help:compact:dry` | même commande sans `:dry`                               |
| Tutoriels HTML identiques                  | `node scripts/merge-duplicate-tutorials.js`        | `npm run tutorials:dedup -- --apply`                    |
| Tables `collective_*` obsolètes            | `npm run db:collective:cleanup:audit:dry`          | `npm run db:collective:cleanup:audit`                   |
| Admin RBAC + orphelins                     | `npm run db:admin:audit:dry`                       | `npm run db:admin:audit` / `:fix-orphans`               |
| Images encore en base64                    | `npm run db:migrate:images:dry`                    | `npm run db:migrate:images` puis `:clear` après recette |
| Mascottes livrées supprimées à restaurer   | `npm run visit:mascots:restore:dry`                | `npm run visit:mascots:restore`                         |

Forcer une passe de tâches récurrentes (JSON sur stdout) :

```bash
npm run tasks:spawn-recurring
```

Annuaire Moodle (rentrée) : `npm run moodle:sync -- --dry-run` puis `--apply`.
Codes de sortie prévus pour le cron : [CRONTAB.md](CRONTAB.md).

---

## 7. Je fabrique un pack mascotte

Chaîne habituelle : **découper les planches → (option) aligner → zipper → valider**.

```bash
npm run mascot:olu-cut -- --in dossier-planches --out public/assets/mascots/olu-planches/frames
npm run mascot:olu-pack
npm run mascot:pack:validate -- docs/packs/olu-planches-pack.json
```

Même idée pour gnome (`mascot:gnome1-cut` / `mascot:gnome1-pack`),
renard 2 (`mascot:renard2-cut` puis `mascot:renard2-cut-align-walk`),
renard sac (`mascot:fox-backpack`).

Docs : [MASCOT_PACK.md](MASCOT_PACK.md), [MASCOT_OLU_PLANCHES_SPRITES.md](MASCOT_OLU_PLANCHES_SPRITES.md).

Les miroirs CJS (`sync:visit-pack-lib`, `sync:gl-pack-lib`, `sync:shared-cores`)
sont **déjà** enchaînés par `npm run build`. Ne les relancer à la main que si tu
modifies la validation pack **sans** rebuild.

---

## 8. Ne pas lancer à la légère

| Commande                                 | Pourquoi                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run db:import:dump`                 | Recrée la base cible (DROP).                                                          |
| `npm run logs:purge -- --apply`          | Efface des journaux (dont IP d’élèves).                                               |
| `npm run db:uploads:reconcile`           | Supprime des fichiers disque.                                                         |
| `npm run db:migrate:images:clear`        | Vide `image_data` après bascule disque.                                               |
| `npm run tutorials:dedup -- --apply`     | Supprime des lignes pédagogiques (contenu identique, métadonnées du doublon perdues). |
| `node scripts/auto-resolve-conflicts.js` | Outil **CI** : ne résout que CHANGELOG / version. Pas un jouet local.                 |

---

## Voir aussi

| Doc                                      | Quand                                      |
| ---------------------------------------- | ------------------------------------------ |
| [LOCAL_DEV.md](LOCAL_DEV.md)             | Docker, ports, e2e, charge, bundle runtime |
| [EXPLOITATION.md](EXPLOITATION.md)       | Cron, redémarrage, HTTP/2, jobs quotidiens |
| [API.md](API.md)                         | Contrats HTTP, observabilité               |
| [GL_ARCHITECTURE.md](GL_ARCHITECTURE.md) | Modules GL, imports, isolement             |
| [GL_TESTS.md](GL_TESTS.md)               | Matrice de tests GL                        |
| [CRONTAB.md](CRONTAB.md)                 | Déploy, backup, Moodle, uptime             |
| [VERSIONING.md](VERSIONING.md)           | CHANGELOG, bump, `ship`                    |
