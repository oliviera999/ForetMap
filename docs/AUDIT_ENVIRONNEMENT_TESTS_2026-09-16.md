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

### 5.2 P1 — un jeu de données de test réaliste, anonymisé

Le dépôt sait déjà le faire pour la biodiversité :
`scripts/extract-biodiv-pedago-seed.js` refuse d'écrire s'il détecte un e-mail ou un
hachage bcrypt. Étendre ce principe à un **échantillon structurel anonymisé** (zones,
plantes, tâches, observations — identités remplacées, volumétrie conservée) donnerait ce qui
manque le plus : des tests de liste, de pagination et de charge qui ressemblent à la prod.
C'est le chantier le plus rentable après le hook, et le seul qui touche à des données
sensibles : il demande une décision explicite.

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

## 6. Ce qu'il faudrait me fournir, par ordre d'utilité

1. **Le hook `SessionStart`** (§ 5.1) — ou l'autorisation d'écrire dans `.claude/`.
2. **Un jeu de données anonymisé** (§ 5.2) — décision à prendre, PII à exclure par
   construction.
3. **Des secrets de test** (§ 5.3) — Pl@ntNet, OAuth, SMTP capturé.
4. **Un accès en lecture aux logs de production** (`/api/admin/logs`, `/api/admin/diagnostics`
   — la prod est joignable depuis la session, seul le jeton manque) : aujourd'hui, un bug
   signalé en prod ne peut être instruit qu'à partir du code et du récit de l'utilisateur.
5. **Un appareil réel dans la boucle** (§ 4.5) — un aller-retour humain sur iPhone reste
   irremplaçable pour le plan mobile ; aucun outil ne le remplacera à court terme.

---

_Index des audits : [`docs/audits/README.md`](audits/README.md). Mode d'emploi du script :
[`docs/LOCAL_DEV.md`](LOCAL_DEV.md) § « Sessions Claude Code sur le web »._
