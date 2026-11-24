# Chantier G&L « décisions » : règles communes des sessions de lot

Tu es la session d'**un** lot du chantier, et de ce lot seulement. Lis ce fichier en entier, puis ta fiche
`docs/prompts/gl-decisions/lots/<lot>.md`. Tu n'as besoin d'aucun autre fichier du kit, sauf ceux que ta fiche nomme.
Tu réponds, commentes et documentes en français.

Calé le 24/11/2026 sur `main` = `d65dca4` (v1.263.7). Les numéros de ligne des fiches datent de `b8b5344`
(v1.263.5) ; entre les deux, `main` n'a changé que hors G&L.

## 1. Ce qui fait foi

1. Ta fiche de lot, puis ce fichier.
2. Les règles v3 du jeu : `docs/GL_TENIR_A_DEUX_REGLES.md`.
3. Le registre des décisions d'Oliv : `docs/prompts/gl-decisions/DECISIONS.md` (ta fiche cite celles qui te
   concernent ; n'ouvre le registre que pour lever un doute).

Les anciens textes du chantier (`sources/ancien/`) ne font **plus** foi : ne les lis pas pour savoir quoi faire.

Plus de gel des fonctionnalités (Oliv, 24/11) : le chantier corrige, retire et ajoute ce que les décisions nommées
demandent, **rien d'autre**. Une idée d'amélioration hors de ta fiche va dans ton rapport, pas dans le code.

## 2. Garde-fous (bloquants)

**Lore**

- Le Souffle et le voile ne sont jamais personnifiés : ni créature, ni ennemi, ni verbe d'agent (tuer, rôder, viser,
  attaquer, ronger, chasser). Ils se disent par leurs effets : pâlir, s'effacer, se taire. Le voile **avance**.
- Jamais le visage de Sélène. Jamais le nom ni le cri de l'oiseau avant juin ; les écrans et les catalogues disent
  « l'oiseau », les pages de Sélène et cinq questions de lore disent « corbeau » (nom commun).
- Ni renversement spatial ni chute sans bataille. Rien du tiers `secret` du lexique dans un texte d'élève.
- « Quatre mondes ». Un nom de visage (la Grise, le Silence, le Détricotage, l'Effacement) n'apparaît pas avant son
  plateau.

**Pédagogie**

- Une erreur ne coûte rien. Retour d'erreur : « Pas encore… » puis une piste, jamais « Non », « Faux », « Raté ». Une
  piste ne nomme jamais la réponse.
- Le savoir sert à jouer, il ne paie pas.
- Parité : formes doubles (« l'Opératrice ou l'Opérateur »), **jamais de point médian**.
- Adresse : « vous » quand l'écran parle à l'équipe, « tu » quand il parle à un élève. Un écran ne mélange pas les deux.
- Les mots du voyage, à l'écran d'un élève après la connexion : « la caravane » (toute la classe, jamais une équipe),
  « le monde », « le chemin », « le paysage » ; jamais « joueur », « partie », « MJ », « feuillet », « statistiques ».
  L'espace personnel de l'élève s'appelle **« Mon sac »** à partir de la vague 2 (avant : « Le Seuil »).
- Rôles du tour (décision du 24/11) : **l'Éclaireuse ou l'Éclaireur fouille** ; **l'Opératrice ou l'Opérateur répond à
  la question de case et sonde**.

**Technique**

- Jamais le banc sur la prod (`tools/gl-sim/garde.js`). Aucune écriture en prod : ni connecteur, ni SQL, ni réglage, ni
  synchronisation de catalogue.
- Bourses privées vis-à-vis des autres équipes et de la projection, visibles sur l'écran de sa propre équipe.
- Les droits viennent du serveur (`glTenirPermissionsCore`) : l'écran cache un geste fermé (absent, pas grisé), il
  n'en ouvre jamais. Aucun état d'attente sans sortie automatique.
- Isolement G&L / ForêtMap : un composant partagé (`src/shared/*`, `src/components/*`) se teste des deux côtés.
- `src/shared/*` est la source ; `lib/shared/*` est son miroir, **versionné**, que le serveur, le banc et la prod
  chargent. Ne l'édite jamais à la main ; après tout changement de `src/shared/*`, lance `npm run sync:shared-cores`
  **avant** `npm test` et le banc, et committe le miroir avec la source (`npm run sync:shared-cores:check` le contrôle).
- `dist` ne se committe pas. Le champ `version` ne se touche pas.
- Les textes visibles des élèves que ta fiche donne se recopient **mot pour mot**. Tu n'en inventes pas : un texte
  qui manque va dans ton rapport, section « À relire par Oliv », avec ta proposition.

## 3. Début de session

1. Tu travailles dans ta propre copie du dépôt (arbre de travail). Branche : `claude/gl-decisions-<lot>`, créée depuis
   `origin/claude/gl-decisions-integration` (`git fetch origin` d'abord). Si elle existe déjà sur le distant, c'est une
   **reprise** : reprends-la, lis `docs/prompts/gl-decisions/rapports/<lot>.md` sur la branche, puis
   `git merge origin/claude/gl-decisions-integration`. Si `git checkout` refuse la branche (« already used by
   worktree » : l'ancienne copie de travail existe encore), travaille en tête détachée
   (`git checkout --detach origin/claude/gl-decisions-<lot>`) et pousse par
   `git push origin HEAD:claude/gl-decisions-<lot>`. Jamais de rebase, jamais de `--force`.
2. Lis `CLAUDE.md`, `docs/GL_TENIR_A_DEUX_REGLES.md`, et charge les skills du dépôt `gl-tenir-garde-fous`,
   `gl-tenir-catalogue`, `gl-tenir-moteur`, `gl-banc` (et `foretmap-docs-reference` si tu touches `docs/reference/`).
3. **Revérifie chaque constat de ta fiche sur le code** (`git grep -n`). Un constat déjà corrigé : n'y touche pas,
   écris « écarté : déjà corrigé » dans ton rapport. Un chemin ou un symbole introuvable : cherche son équivalent,
   dis-le dans ton rapport ; s'il n'y en a pas, l'étape est `bloquée`.
4. **Isolation locale.** Plusieurs sessions tournent sur la même machine, et le démarrage de session du dépôt
   (`scripts/bootstrap-web-session.sh`) a déjà lancé MariaDB, créé le compte `foretmap` (mot de passe
   `foretmap_local`, tous les droits) et **exporté** `DB_NAME=foretmap_test` : cette variable prime sur un `.env`, et
   une variable que tu exportes ne survit pas d'une commande à la suivante. Donc :
   - `npm ci --ignore-scripts` dans ta copie ;
   - écris une fois `/tmp/gl-decisions-<lot>.env.sh` (tirets du lot remplacés par des soulignés dans les noms de
     base) :

     ```bash
     export DB_HOST=localhost DB_PORT=3306 DB_USER=foretmap DB_PASS=foretmap_local
     export DB_NAME=foretmap_<lot>_dev TEST_DB_NAME=foretmap_<lot>_test GL_SIM_DB=foretmap_<lot>_sim
     export JWT_SECRET=${JWT_SECRET:-gl_decisions_secret_local_0123456789}
     export VISIT_COOKIE_SECRET=${VISIT_COOKIE_SECRET:-gl_decisions_visite_local_0123456789}
     ```

   - **commence chaque commande npm, node ou playwright par** `. /tmp/gl-decisions-<lot>.env.sh && …`. Sans cela, les
     tests écrivent dans `foretmap_test` et le banc dans `foretmap_sim`, que les autres sessions utilisent ;
   - crée tes trois bases (`mariadb -uforetmap -pforetmap_local -e "CREATE DATABASE IF NOT EXISTS …"`), puis
     `npm run db:init`. Si MariaDB ne répond pas : `mysqld_safe &`, et dis-le dans ton rapport ;
   - **les e2e se lancent un lot à la fois** : `npm run test:e2e` libère le port 3000 en tuant ce qui l'écoute. Prends
     le verrou : `flock /tmp/gl-decisions-e2e.lock npx playwright test --project=chromium <fichiers>` ;
   - les e2e réécrivent des captures suivies par git (`docs/captures/tenir-v2/`, `docs/captures/ecrans-de-seance/`) :
     après les e2e, `git checkout -- docs/captures/tenir-v2 docs/captures/ecrans-de-seance`, sauf pour une capture
     que ta fiche te demande de refaire ;
   - ne lance jamais `npm run dev` ni un serveur sur un port fixe en dehors de ce verrou.
5. `npm test` et `npm run test:ui` avant de commencer : s'ils sont rouges, note-le, et répare seulement ce qui est sur
   ton chemin.

## 4. Pendant

- Un commit par étape de ta fiche, tests verts à chaque commit. Préfixe `feat(gl)`, `fix(gl)` ou `chore(gl)`.
- **Pousse ta branche après chaque commit d'étape** : c'est ce qui dit à l'orchestratrice que tu avances, et ce qui
  sauve ton travail si la session s'arrête.
- Reste dans ton lot. Une étape d'un autre lot ne se fait pas « en passant ».
- **Fichiers d'un autre couloir** : ta fiche liste ce que tu peux y toucher. Tout autre fichier d'un autre couloir :
  une modification minimale, dite dans ton rapport.
- Tests dans le même commit que le code. Une assertion sur des **données** va dans `tests/content/`.
- Données : un JSON par catalogue dans `data/gl/tenir/`, import tolérant ; aligne `exemple/` quand un test y lit le
  texte que tu changes.
- **Catalogues et prod** : à chaque déploiement, le serveur synchronise seul les catalogues changés
  (`lib/glTenirSync.js`, par empreinte). Là où une fiche dit « Oliv synchronise après la vague », lis « Oliv vérifie
  qu'il ne reste aucun écart, et synchronise à la main s'il en reste un ». Un texte de catalogue que tu changes sera
  donc servi aux élèves dès que ta vague arrive sur `main` : relis-le comme tel.
- **Migrations** : idempotentes, gardées par l'ancien texte ou par l'état du schéma. Ta fiche donne une **étiquette**
  (`mig-…`), pas un numéro : le numéro de fichier se prend au dernier moment (section 6, point 3). Toute migration
  ajoutée ou renumérotée oblige à régénérer `sql/schema_fingerprint.json`, dont le champ `migration` doit nommer le
  **dernier** fichier (`tests/schema-fingerprint.test.js`) : sur une base fraîche (`npm run db:init` sur une base
  vide), `npm run db:schema-fingerprint -- --write`, puis committe. Un conflit sur ce fichier à la fusion de
  l'intégration se règle en le régénérant, jamais à la main.
- **Docs** : dans ton lot, les règles (hors § 0), `docs/API.md` pour toute route changée, et dans
  `docs/reference/gl/` seulement la phrase qui deviendrait fausse. Le § 0 des règles et les `docs/AUDIT_*` ne
  s'écrivent qu'au lot `fin-1` : une ligne destinée au § 0 se recopie dans ton rapport, section « Pour le § 0 des
  règles ».
- `CHANGELOG.md` : tu n'y touches **pas**. Écris ton entrée dans `changelog.d/gl-decisions-<lot>.md`, au format du
  `CHANGELOG.md` : un titre `### Modifié — G&L : …` (ou `### Corrigé — G&L : …`), puis ses puces. Elles sont reportées
  à la fin de la vague.
- Captures avant / après des écrans touchés : `docs/captures/gl-decisions/<lot>/`.
- **Si ton contexte sature** : committe ce qui est vert, écris dans ton rapport l'état `partielle` et ce qui reste,
  étape par étape, pousse, arrête-toi. Une autre session reprendra.

## 5. Le banc fait foi

Aucune CI n'est attendue : seul le banc local décide qu'un lot peut être fusionné (Oliv, 24/11).

```bash
. /tmp/gl-decisions-<lot>.env.sh && npm run gl:sim:db
. /tmp/gl-decisions-<lot>.env.sh && npm run gl:sim -- --scenario ensemble-unifie --runs 5 --seed 14
. /tmp/gl-decisions-<lot>.env.sh && npm run gl:sim -- --scenario multi-appareils --runs 5 --seed 14
```

La base du banc vient de `GL_SIM_DB`, lue dans l'environnement de la commande, pas dans un `.env` (section 3).

Constaté le 24/11 sur `main` (`d65dca4`) : `ensemble-unifie` joue deux classes (« moyenne », « difficulte ») fois cinq
exécutions, une quarantaine de secondes chacune, soit sept minutes environ ; `multi-appareils`, trois à quatre
minutes. Chaque commande écrit `reports/gl-sim/<date>-<scénario>/summary.json`.

**Banc vert** = tout ce qui suit :

- aucun scénario ne s'arrête avant la fin ;
- aucune violation d'invariant du moteur, aucune réponse 5xx ;
- aucune bourse d'une autre équipe servie à un élève ; aucun mot interdit dans un texte servi.

Le banc affiche aussi des « attendus » d'équilibrage (`attendus 8/10 (manqués : …)`) : ce sont des **avertissements**,
pas des violations. Sur `main` au départ, `partGnomes`, `equipesSousVoile` et `doublePlafond` sont déjà manqués à
certains plateaux (`docs/prompts/gl-decisions/verifs/banc-main-d65dca4.txt`). Ne compte que les attendus manqués **en
plus** de ceux du départ.

Ta fiche dit ton régime :

- **fumée** (ton lot ne touche pas au moteur) : le banc doit être vert, sans seuil ; une seule passe, à la fin ;
- **seuils** (ton lot touche au moteur) : une passe **avant** toute modification, une passe **après** ; compare aux
  mesures de départ du chantier (`docs/prompts/gl-decisions/ETAT.md`, section « Mesures de départ ») et écris les
  deux séries dans ton rapport. Relève dans `summary.json`, par plateau, ces champs et pas d'autres :
  `carnetComplet` (part des exécutions), `ecartLicornesGnomes`, `gemmesPayeesEnSortsParEleve`, `reculsLumiere`,
  `equipesSousVoilePct`, `pagesTrouveesEvts`. Sont des **alertes** : `carnetComplet` au-dessus de 60 % aux plateaux 1
  et 2 ; `ecartLicornesGnomes` ou `gemmesPayeesEnSortsParEleve` à plus de 25 % de la mesure de départ ;
  `reculsLumiere` en hausse. Une alerte que la décision de ton lot explique ne bloque pas : dis-le. Une alerte
  inexpliquée : état `bloquée`, sans rien changer aux réglages ;
- **complet** (lots `fin-*`) : les deux scénarios, plus `npm run gl:sim -- --scenario all --runs 3 --seed 11`.

Si le banc ne sait pas jouer une règle nouvelle, apprends-la à ses robots dans ton lot, de la façon la plus simple, et
dis-le.

Lint, format, tests et build t'aident à trouver une erreur ; lance-les (section 6). Ils ne remplacent pas le banc.

## 6. Fin de session

1. Vérifications : `npm run lint && npm run format:check`, `npm run test:ui`, `npm test`, `npm run test:content` si tu
   touches des données ou des textes, `npm run build && npm run check:runtime`, `npm run check:bundle`, les e2e G&L
   que ta fiche nomme (sous le verrou). Les e2e « Voir comme » de `gl-users-admin` sont instables sous charge :
   signale-les, ne les « corrige » pas.
2. Relecture par les sous-agents du dépôt : `gl-relecteur-garde-fous` sur le diff des textes et des JSON ;
   `gl-relecteur-science` en plus si un contenu scientifique change. Corrige, ou explique. Si tu ne peux pas lancer de
   sous-agent, lis `.claude/agents/gl-relecteur-garde-fous.md` (et `-science.md`), applique leur grille toi-même sur
   ton diff, et dis-le dans ton rapport.
3. `git fetch origin && git merge origin/claude/gl-decisions-integration`. Résous les conflits de ton lot ; un
   conflit dans un fichier que tu ne comprends pas : état `bloquée`. **Si ton lot ajoute une migration**, donne-lui
   maintenant le premier numéro libre au-dessus de la plus haute migration de la branche d'intégration, et écris dans
   ton rapport « étiquette `mig-…` → fichier `<nnn>_…` ». Relance tests et banc si la fusion a apporté du code.
4. Écris `docs/prompts/gl-decisions/rapports/<lot>.md` :
   - **État** : `faite`, `partielle` ou `bloquée` ;
   - Commits ; Étapes livrées ; Étapes écartées (raison) ;
   - Choix faits sans demander ;
   - Contrats de test changés (test-id, textes attendus) ;
   - Migrations (étiquette → fichier) ;
   - Banc (régime, mesures avant / après, alertes) ;
   - Pour le § 0 des règles ;
   - À relire par Oliv (textes nouveaux ou changés) ;
   - À faire par Oliv après la vague (réglage, catalogue à synchroniser, image) ;
   - Ce que les lots suivants doivent savoir.
5. Pousse ta branche (`git push -u origin claude/gl-decisions-<lot>`). **Ne fusionne rien, ne lance aucune session.**
6. Ton dernier message, dix lignes au plus : état, dernier commit, banc (vert ou non, alertes), migrations, ce qui
   bloque. Jamais de diff ni de journal de test.
