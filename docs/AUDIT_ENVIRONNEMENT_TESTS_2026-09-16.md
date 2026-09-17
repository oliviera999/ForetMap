# Audit — environnement d'exécution des sessions Claude Code & CI GitHub (16 septembre 2026)

**Question posée** : quelles sont les limites de l'environnement d'exécution (côté session
Claude Code sur le web et côté GitHub Actions), et que faudrait-il pour y mener des tests
plus réalistes ?

**Verdict court** : l'environnement de session n'est pas limité par ses capacités, il est
limité par son **amorçage**. À l'ouverture, le conteneur n'a ni `node_modules`, ni serveur
MariaDB, ni navigateur Playwright utilisable — donc aucune des suites du dépôt ne démarre.
Tout cela s'installe pourtant en **moins de deux minutes** avec le réseau disponible. Les
limites qui restent après amorçage sont d'un autre ordre : **pas de secrets tiers, pas de
données réelles, pas d'appareil réel**.

---

## 1. Méthode

Mesures réalisées le 16/09/2026 dans une session Claude Code sur le web
(conteneur éphémère, `linux 6.18`, x86_64), dépôt cloné sur
`claude/test-environment-limitations-lxikqg` (base `v1.157.25`). Toutes les durées
ci-dessous sont **mesurées**, pas estimées — les deux grosses suites ayant tourné en
parallèle sur 4 vCPU, leurs durées sont plutôt pessimistes.

## 2. Ce que le conteneur offre réellement

| Ressource          | État constaté                                                                    |
| ------------------ | -------------------------------------------------------------------------------- |
| CPU / RAM / disque | 4 vCPU, 15 Gio, ~30 Gio libres                                                   |
| Node / npm         | v22.22.2 / 10.9.7 (CI : Node 22 — aligné)                                        |
| Réseau sortant     | registre npm, api.github.com, `cdn.playwright.dev`, Docker Hub, GBIF, prod OK    |
| Docker             | client présent, **démon arrêté** — `dockerd` démarre à la main, `docker pull` OK |
| MariaDB / MySQL    | **absent**, installable par `apt` (10.11) en ~20 s                               |
| Navigateurs        | chromium préinstallé mais **révision ≠** celle attendue par `@playwright/test`   |
| `node_modules`     | **absent** au démarrage                                                          |
| `gh` CLI           | absent — GitHub passe exclusivement par les outils MCP                           |

## 3. Mesures après amorçage manuel

| Étape                                                       | Durée        | Résultat                              |
| ----------------------------------------------------------- | ------------ | ------------------------------------- |
| `npm ci` (1065 paquets)                                     | **59 s**     | OK                                    |
| `apt-get install mariadb-server` (10.11)                    | **22 s**     | OK                                    |
| Démarrage `mariadbd-safe` + bases + compte applicatif       | **~10 s**    | OK                                    |
| `npm run db:init` (schéma + migrations + seed → 159 tables) | **4,7 s**    | OK                                    |
| `npm test` (backend, `--test-concurrency=1`)                | **8 min 41** | **3581 tests, 0 échec**               |
| `npm run test:ui` (Vitest)                                  | **6 min 39** | **594 fichiers, 4336 tests, 0 échec** |
| `npm run test:content`                                      | **5 s**      | **64 tests, 0 échec**                 |
| `npm run build` (Vite/rolldown + sync des miroirs CJS)      | **4 s**      | OK                                    |
| `npx playwright install chromium webkit`                    | **24 s**     | OK (téléchargement CDN)               |
| `npx playwright install-deps webkit`                        | **29 s**     | OK (paquets système)                  |
| 1 spec e2e `plan-mobile` (serveur lancé par Playwright)     | **6,5 s**    | OK                                    |
| Projet `mobile-webkit` complet                              | **23 s**     | OK **après** `install-deps`           |

**Conclusion de cette section** : _toutes_ les portes de la CI (lint, format, backend,
contenu, UI, build, e2e chromium **et** webkit) sont franchissables ici. Le coût d'amorçage
total est d'environ **2 minutes**, à comparer aux ~20 minutes d'un aller-retour CI.

### Pièges rencontrés (et leur cause)

1. **`root@localhost` en `unix_socket`** — `mysql2` se connecte en TCP et échoue en
   `ER_ACCESS_DENIED_NO_PASSWORD_ERROR`. Un compte applicatif dédié (`foretmap`) est
   nécessaire ; `root`/`''` comme en CI ne fonctionne pas sur une MariaDB installée par `apt`.
2. **WebKit sans paquets système** — `libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libflite*`…
   manquants : tout le projet `mobile-webkit` (bloquant en CI) échoue au lancement du
   navigateur, avec une erreur qui ne ressemble pas à un échec de test.
3. **Révision de navigateur** — le chromium préinstallé de l'image n'est pas celui attendu
   par la version épinglée de Playwright : sans `playwright install`, e2e indisponible.
4. **`npm run build` touche `dist/`** — `dist/` étant versionné, un build de vérification
   salit l'arbre de travail ; penser à `git checkout -- dist/` quand le build n'est pas le
   livrable.
5. **`npm install` réécrit `package-lock.json`** — l'image embarque npm **10.9.7**, le lock
   a été produit par un npm plus récent : l'installation supprime les champs `libc` et
   génère un diff parasite. D'où `npm ci` à froid et `npm install --no-save` à chaud dans le
   script d'amorçage.

## 4. Limites qui subsistent après amorçage

Classées par impact réel sur la qualité de ce qu'on peut vérifier ici.

### 4.1 Aucun secret de service tiers (impact fort)

`PLANTNET_API_KEY`, `OPENAI_API_KEY`, `TREFLE_TOKEN`, `SMTP_*`, `GOOGLE_OAUTH_*`,
`MOODLE_*` / `LTI_*` sont absents. Conséquence : la pré-saisie biodiversité, l'envoi de
mails, l'OAuth Google et le lien Moodle ne sont testables **que via doubles**
(`tests/helpers/fakeMoodleServer.js`, mocks `speciesAutofill*`). Les régressions de contrat
d'une API externe (changement de forme de réponse Pl@ntNet, refus OAuth) sont **hors de
portée** de tout ce qui tourne ici — et de la CI, qui n'a pas non plus ces secrets.

### 4.2 Aucune donnée réelle (impact fort)

La base est reconstruite par `db:init` : schéma + seed. Volumétrie de production, formes de
données saisies par les élèves, photos réelles : rien de tout cela. Les problèmes de charge,
de pagination, de N+1 sur listes longues (cf. `AUDIT_CHARGE_BIODIVERSITE_2026-09.md`) ne se
reproduisent donc pas spontanément. C'est un choix assumé (interdiction de versionner un
dump : PII), pas un défaut de l'environnement.

### 4.3 Médiathèque GL absente (impact moyen)

`src/gl/assets` ne contient que les manifestes et un `placeholder.svg` (36 Kio). Le build le
signale : manifeste généré à 6 images contre 136 versionnées. Tout scénario GL qui dépend
d'un visuel réel (cadres d'image, mascottes, chapitres illustrés) est vérifiable en
structure, pas en rendu.

### 4.4 Écart de version MariaDB (impact faible mais réel)

`apt` fournit **10.11**, la CI utilise **11.4.10**. Les différences portent sur des points
rares (fonctions JSON, plans d'exécution, messages d'erreur). `FORETMAP_SESSION_DB=docker`
rétablit la parité exacte (le démon Docker démarre et Docker Hub est joignable), au prix du
pull d'image.

### 4.5 Pas d'appareil réel (impact moyen sur le mobile)

WebKit headless **n'est pas** Safari iOS — c'est déjà écrit dans `ci.yml` et confirmé par
`AUDIT_NAVIGATION_IPHONE_2026-09.md`. Géolocalisation, orientation, gestes multi-touch,
clavier virtuel, barre d'adresse rétractable : simulés. Les bugs « plan mobile » de
septembre ont d'ailleurs traversé cette barrière.

### 4.6 Conteneur éphémère et cloisonnements de l'agent (impact organisationnel)

- Tout ce qui n'est pas **poussé** est perdu à la fin de la session.
- L'écriture dans `.claude/` est refusée par le garde-fou « auto-modification » de l'agent :
  le script d'amorçage vit donc dans `scripts/`, et **son enregistrement en hook
  `SessionStart` doit être fait par un humain** (voir § 5.1).
- 4 vCPU : Playwright tourne en `workers: 1` (contrainte du `playwright.config.js`, base
  partagée), les deux grosses suites se marchent dessus si on les lance ensemble.

### 4.7 Côté GitHub (limites de la CI elle-même)

- **La suite e2e complète est non bloquante** (`continue-on-error: true`) : seuls les filets
  `plan-mobile` (4 specs) et `mobile-webkit` gardent la porte. Sur 53 fichiers de specs, la
  très grande majorité peut donc rougir sans rien empêcher — c'est un arbitrage explicite
  (budget CI, instabilité headless), mais c'est aujourd'hui le plus gros trou de couverture
  côté portes.
- **Feedback long** : ~20 min pour un aller-retour, alors que la même vérification coûte
  ~2 min d'amorçage + la suite ici.
- **Une seule étape dépend du réseau externe** (téléchargement des navigateurs), et c'est
  historiquement celle qui s'est figée (19/08/2026, d'où `timeout-minutes`).
- **Pas de `gh` CLI** côté agent : déclenchement (`workflow_dispatch`), lecture des logs de
  job et commentaires passent par les outils MCP GitHub — ce qui fonctionne, mais interdit
  les scripts `gh` de la documentation.

## 5. Améliorations proposées

### 5.1 P0 — amorçage automatique de la session (fait dans ce lot)

`scripts/bootstrap-web-session.sh` : idempotent, non interactif, ~2 min à froid et ~9 s à
chaud. Il installe les dépendances, installe **et démarre** MariaDB, crée les bases et le
compte applicatif, joue `db:init`, installe les navigateurs Playwright **avec** leurs
paquets système, écrit un `.env` de session et exporte les variables via `$CLAUDE_ENV_FILE`.

**Reste à faire par un humain** (l'agent n'a pas le droit d'écrire dans `.claude/`) :
créer `.claude/settings.json` avec

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/scripts/bootstrap-web-session.sh"
          }
        ]
      }
    ]
  }
}
```

Une fois ce fichier fusionné dans `main`, **toutes** les sessions suivantes démarrent avec
une base réelle et des navigateurs fonctionnels. Gain : une session peut vérifier son propre
travail au lieu de déléguer la découverte des régressions à la CI.

### 5.2 P1 — un jeu de données de test réaliste, anonymisé (outil livré)

`scripts/anonymize-local-db.js` (livré dans ce lot) transforme une copie locale d'un dump de
production en base de travail sans donnée personnelle, **à volumétrie conservée** :
identités réécrites (`users`, `gl_players`, `gl_admins`, `external_identities`, noms
dénormalisés des tâches), hachages remplacés par un mot de passe unique, purge des jetons /
du journal d'audit / des charges utiles `security_events` / des rapports de synchronisation
Moodle, et contenus libres remplacés par un texte **de même longueur** — le poids des
réponses API reste donc représentatif.

Le principe de `extract-biodiv-pedago-seed.js` (refuser d'écrire si un e-mail ou un bcrypt
traîne) est repris et généralisé : après écriture, **toutes** les colonnes texte de la base
sont balayées, et une colonne oubliée fait échouer la commande en la nommant. Vérifié à la
construction : en ajoutant une table hors plan contenant une adresse, le script sort en
code 1 et désigne `notes.txt`.

Le script s'exécute en local (refus si `DB_HOST` n'est pas local ou si `NODE_ENV=production`),
le dump n'est jamais versionné (`.gitignore`), et les fichiers `uploads/` ne doivent pas être
copiés — ils ne sont pas dans le dump.

#### Ce que le premier vrai dump a révélé (17/09/2026)

Un export phpMyAdmin de la production (8,7 Mo, MariaDB 11.4.13) a été importé puis anonymisé.
**Le plan d'anonymisation écrit à l'aveugle était incomplet** — et c'est le balayage final,
pas la relecture, qui l'a montré. Six colonnes portaient encore des motifs :

| Colonne                                                                     | Nature                                               | Traitement retenu                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `sync_actions.before_json` / `after_json`                                   | état nominatif du compte, action par action (Moodle) | vidées ; la ligne (type, horodatage) est conservée   |
| `zones` / `visit_zones` / `map_markers` / `visit_markers`.`restricted_note` | consigne d'accès en texte libre saisie par un prof   | texte de même longueur                               |
| `app_settings.value_json`                                                   | adresse de contact du corps éditorial « À propos »   | **exception déclarée**, limitée aux clés `content.%` |

Ce dernier cas a fait évoluer le contrôle : une exception ne porte plus sur une colonne
entière mais sur une **condition SQL**. Le balayage compte désormais deux fois par colonne —
tout ce qui correspond, puis ce qui reste une fois l'exception appliquée. Une adresse qui
apparaîtrait dans un réglage technique (SMTP, alertes) continue donc de faire échouer la
commande, alors qu'une tolérance posée sur `app_settings.value_json` en bloc l'aurait masquée.

**Leçon** : sur ce genre de tâche, la valeur n'est pas dans l'exhaustivité du plan écrit à
l'avance — elle est dans le contrôle qui refuse de conclure. Le plan initial couvrait
l'essentiel (comptes, hachages, jetons, journaux) et manquait quand même six colonnes.

#### Premières mesures sur volumétrie réelle

L'application démarrée sur cette base (481 comptes, 118 zones, 534 plantes, 94 tâches,
650 questions de quiz) donne immédiatement ce qu'une base semée ne peut pas donner :

| Route             | Éléments | Poids brut | Élément le plus lourd |
| ----------------- | -------- | ---------- | --------------------- |
| `GET /api/plants` | 534      | 912 Ko     | 3,0 Ko                |
| `GET /api/zones`  | 118      | 369 Ko     | 15,4 Ko               |
| `GET /api/tasks`  | 84       | 159 Ko     | 7,1 Ko                |

> **Correction du 17/09/2026.** Cette section concluait « près d'un mégaoctet pour ouvrir
> l'onglet Biodiversité sur un téléphone en 4G ». **C'est faux** : la mesure omettait
> `Accept-Encoding: gzip`, alors que le middleware `compression` couvre tout `/api`. Un
> navigateur reçoit **126 Ko**, pas 912. La reprise complète — poids réels, temps à froid et à
> chaud, absence de N+1, campagne de charge sur volumétrie réelle — est dans
> [`AUDIT_CHARGE_VOLUMETRIE_REELLE_2026-09-17.md`](AUDIT_CHARGE_VOLUMETRIE_REELLE_2026-09-17.md).
> Les chiffres bruts ci-dessus restent exacts ; c'est leur lecture qui ne l'était pas.

### 5.3 P1 — secrets de test cloisonnés

Pour sortir du « tout en double » sur les intégrations : une clé Pl@ntNet de test à quota
réduit, un `SMTP_JSON_TRANSPORT=1` déjà supporté (mails capturés, aucun envoi), un client
OAuth Google de test. À poser en **secrets GitHub** pour la CI et en variables
d'environnement de l'environnement Claude Code pour les sessions. Sans cela, aucune
vérification de contrat externe n'est possible, ici comme en CI.

### 5.4 P2 — parité CI exacte à la demande

`FORETMAP_SESSION_DB=docker` est déjà câblé dans le script d'amorçage (dockerd + `docker
compose up -d` sur `mariadb:11.4.10`). À utiliser pour reproduire un incident suspecté
propre à MariaDB 11.4.

### 5.5 P2 — refermer le trou e2e de la CI

Plutôt que « tout non bloquant », identifier le sous-ensemble stable des 53 specs et le
rendre bloquant par shards parallèles (la matrice GitHub Actions absorbe le temps). Les
mesures ci-dessus montrent que le coût unitaire d'une spec est faible (quelques secondes) :
c'est l'instabilité, pas la durée, qui a motivé le `continue-on-error`.

### 5.6 P3 — médiathèque GL de test légère

Une poignée d'images minuscules sous licence claire, suffisantes pour que le manifeste ne
soit plus dégradé et que les scénarios GL visuels tournent.

## 6. Ce qu'il faudrait fournir à une session, précisément

Ordre d'utilité décroissante. Pour chaque point : ce qu'il faut, sous quelle forme, ce que ça
débloque, et ce qui ne doit **pas** être transmis.

### 6.1 Le hook `SessionStart` (gratuit, immédiat)

Créer `.claude/settings.json` (§ 5.1). Un agent ne peut pas l'écrire lui-même. Débloque :
toute session part d'une base réelle et de navigateurs fonctionnels, sans intervention.

### 6.2 Un dump de la base, à anonymiser dès l'import

- **Forme** : un `.sql` (`mysqldump` ou export phpMyAdmin), déposé dans le conteneur de la
  session ou accessible par une URL temporaire. Nom de fichier couvert par `.gitignore`
  (`*_dump.sql`, `*-dump.sql`, `*_bdd_complete.sql`, `sql/dumps/`).
- **Traitement imposé** : `npm run db:import:dump -- --file …` puis **`npm run db:anonymize`**
  (§ 5.2) avant toute autre commande. Le balayage final refuse de conclure s'il reste un
  e-mail ou un bcrypt.
- **À ne pas transmettre** : le dossier `uploads/` (photos d'élèves) — il n'est pas dans le
  dump et n'est nécessaire à aucun test ; les sauvegardes chiffrées ; les exports Moodle
  nominatifs.
- **Débloque** : listes longues, pagination, réseau trophique dense, profils de charge
  (`npm run test:load`), reproduction des constats de
  `AUDIT_CHARGE_BIODIVERSITE_2026-09.md` — aujourd'hui invérifiables sur une base semée.

### 6.3 Un `.env` de travail — mais pas celui de production

Le fichier de production contient les identifiants o2switch, `DEPLOY_SECRET`, les jetons
Google et SMTP réels. Ce qui est utile à une session, c'est un `.env` **de test** :

| Variable(s)                                            | Ce que ça débloque                                            | Forme attendue                                          |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------- |
| `DB_*`                                                 | rien de plus — la session a déjà sa base locale               | **ne pas** fournir les identifiants de la base distante |
| `PLANTNET_API_KEY`, `PLANTNET_PROJECT`, `TREFLE_TOKEN` | pré-saisie espèces testée contre l'API réelle                 | clé de test / quota réduit, révocable                   |
| `OPENAI_API_KEY`, `SPECIES_AUTOFILL_OPENAI`            | branche IA de l'autofill                                      | clé dédiée, plafonnée                                   |
| `SMTP_*` avec `SMTP_JSON_TRANSPORT=1`                  | parcours mot de passe oublié **sans envoyer** un seul message | aucun secret réel nécessaire                            |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | OAuth enseignant de bout en bout                              | client de test, redirection `localhost`                 |
| `MOODLE_*`, `LTI_*`                                    | annuaire + lancement LTI réels                                | instance de recette, pas la prod                        |
| `JWT_SECRET`, `VISIT_COOKIE_SECRET`                    | déjà générés par le script d'amorçage                         | **ne pas** fournir ceux de production                   |

Règle simple : **tout secret confié à une session doit être révocable et sans effet de bord
sur la production**. Le conteneur est éphémère et `.env` est ignoré par Git, mais un secret
de production transmis reste un secret de production exposé — il faudrait le considérer
comme à renouveler.

### 6.4 Un jeton d'administration en lecture seule sur la prod

Les trois hôtes de production répondent depuis une session (`/api/health` → 200). Avec un
compte admin dédié, `npm run prod:admin-diagnostics`, `npm run prod:admin-tail` et
`npm run deploy:check:prod` deviennent exploitables : un incident signalé peut être instruit
sur pièces au lieu d'être deviné. Sans lui, la seule source reste le code et le récit.

### 6.5 Un appareil réel dans la boucle

WebKit headless ne remplace pas Safari iOS (§ 4.5). Pour le plan mobile, un aller-retour
humain — une capture, une description du geste qui échoue — vaut mieux que n'importe quel
ajout d'outillage. C'est le seul point de cette liste qu'aucun script ne refermera.

## 7. État réel de la suite e2e complète (mesuré, 16/09/2026)

La suite e2e complète n'étant pas bloquante en CI (§ 4.7), personne ne regarde son résultat.
Elle a donc été **exécutée deux fois de bout en bout** dans cette session, pour savoir ce
qu'elle raconte réellement.

| Exécution                                              | Durée         | Résultat                                |
| ------------------------------------------------------ | ------------- | --------------------------------------- |
| Base héritée des 3581 tests backend (l'ordre de la CI) | **20 min 17** | 89 réussites, **21 échecs**, 5 ignorés  |
| Base **recréée** juste avant (`DROP` + `db:init`)      | **26 min 44** | 79 réussites, **24 échecs**, 12 ignorés |

Enseignements, dans l'ordre d'importance :

1. **20 échecs sont communs aux deux exécutions.** Ils ne dépendent pas de l'état de la base :
   ce sont des constats stables, pas du bruit. Les tenir pour « instables » était une erreur
   de diagnostic.
2. **Repartir d'une base neuve ne « répare » pas la suite — c'est plus compliqué que ça.**
   Quatre scénarios (trois GL, un pack mascotte) échouent **uniquement** sur base neuve :
   ils dépendent de données accumulées par d'autres tests. Et les scénarios ignorés passent
   de 5 à 12 : sept scénarios se **sautent eux-mêmes** quand la donnée attendue manque, sans
   rien signaler. La dépendance à l'état joue donc dans les deux sens, et une partie de la
   suite ne teste rien sans le dire.
3. **Trois défauts francs, corrigés dans ce lot** — tous invisibles pour la CI puisqu'elle
   n'échoue pas sur cette suite :
   - `waitForTeacherMapReady` **défini mais jamais exporté** dans `e2e/fixtures/auth.fixture.js`,
     alors que `teacher-zone-contour-edit.spec.js` l'importe → `TypeError` avant la première
     assertion. Le scénario passe une fois l'export ajouté ;
   - `page.locator('.teacher-main .top-tabs').waitFor(...)` sans `.first()` (fixture, ligne 794) → `strict mode violation` : la navigation prof porte **deux** barres d'onglets
     depuis les trois pôles. Le commentaire voisin documentait déjà le piège pour un autre
     point d'appel — celui-ci avait été oublié. Corrigé : les variantes tablette et bureau de
     `modals-responsive` repassent ;
   - `tasks-flow.spec.js` attendait un onglet actif correspondant à `/Tâches/`, **sensible à
     la casse**, alors que la vue empruntée s'appelle « Cartes & tâches » depuis la
     réorganisation par pôles. Rien n'était cassé côté application : l'assertion avait vieilli.
     Corrigé et vérifié.
4. **Un constat produit, laissé à arbitrer** (aucune modification) : deux boutons portant le
   **même `data-testid` et le même `aria-label`** (« Couper la musique des zones ») sont
   rendus simultanément côté GL — l'un par `GLBoardChrome`, l'autre par `MusicPlayer`. Le
   test tombe en `strict mode violation`, mais le vrai sujet est en amont : deux commandes
   identiques à l'écran, annoncées à l'identique par un lecteur d'écran. Masquer l'ambiguïté
   côté test reviendrait à enterrer la question.
5. **Les 17 échecs restants** se répartissent en trois familles : session élève non établie
   pour les tâches (`token absent`), attentes de 25 s dépassées sur des vues carte/visite, et
   scénarios GL tributaires de la médiathèque absente (§ 4.3).

Conséquence pour la proposition § 5.5 : **rendre la suite e2e bloquante n'est pas qu'une
affaire de shards.** Il faut d'abord que chaque scénario crée les données dont il dépend au
lieu de les espérer — sans quoi l'ordre d'exécution et l'état de la base décident du
résultat, dans un sens comme dans l'autre. Les trois correctifs ci-dessus montrent aussi ce
que coûte le `continue-on-error` : un helper non exporté et un libellé d'onglet renommé ont
survécu des semaines dans une suite que personne ne lit.

---

_Index des audits : [`docs/audits/README.md`](audits/README.md). Mode d'emploi du script :
[`docs/LOCAL_DEV.md`](LOCAL_DEV.md) § « Sessions Claude Code sur le web »._
