# Audit — Construire, déléguer ou remplacer : arbitrage de la surface logicielle et points de convergence (septembre 2026)

> **Date :** 16 septembre 2026 · **Périmètre :** dépôt entier (ForetMap, Visite, G&L, Plan
> Lyautey) · **Statut : audit et cadrage, aucune modification de code, de schéma ni de réglage.**
> Aucune donnée de production consultée.
>
> **Question posée :** au regard de tout ce qui existe comme outils, gabarits, LMS et
> bibliothèques, la voie du sur-mesure choisie pour ForetMap est-elle pertinente ? Une voie plus
> facile n'existait-elle pas — et en existe-t-il une aujourd'hui ?
>
> **Réponse courte :** le **cœur** du projet justifie pleinement le sur-mesure — aucun produit du
> marché ne fait « la carte d'une vraie forêt comestible avec zones, espèces, observations,
> réseau trophique et chantiers saisonniers validés ». La **périphérie**, en revanche
> — quiz, conditionnement pédagogique, forum, tutoriels, glossaire, groupes, calendrier — pèse
> **52 433 lignes applicatives, soit 19,6 % du code**, et réimplémente des fonctions que le Moodle
> de l'établissement rend nativement, Moodle auquel le dépôt est **déjà relié**. La voie plus
> facile existait au départ ; elle n'existe plus sous forme de réécriture. Ce qui reste accessible,
> et qui est l'objet de ce document, c'est **une discipline de soustraction** : décider par écrit
> ce qu'on ne construira plus, et faire de LTI le seul chantier dont le solde en lignes de code
> est négatif.
>
> **Ce document ne rouvre pas** : la grille de partage interne (`docs/PARTAGE_FM_GL.md` §8), le
> plan de convergence technique (`docs/AUDIT_CONVERGENCE_APPS_2026-09.md`, dont la §8 constate
> ici que les lots 0 à 4 sont livrés), l'arbitrage de version (`docs/AUDIT_EVOLUTION_V1_V2_2026-09.md`),
> ni la spécification du lien Moodle (`docs/AUDIT_MOODLE_IDENTITES_2026-09.md`). Il ajoute l'axe
> qu'aucun d'eux ne traite : **faut-il continuer à écrire ce code, ou le déléguer ?**
>
> **Index des audits datés :** [`docs/audits/README.md`](audits/README.md).

---

## 1. En une page

**Le projet a fait le bon choix sur le fond et un choix coûteux sur les bords.** La partie
irremplaçable — carte, zones, espèces, réseau trophique, tâches saisonnières, jeu G&L — représente
l'essentiel de la valeur et n'existe nulle part ailleurs. À côté d'elle s'est constitué, sans
décision explicite, **un mini-LMS** : `routes/quiz.js`, `routes/forum.js`, `routes/glossary.js`,
`routes/tutorials.js`, `routes/learning-gating.js`, `routes/learning-links.js`,
`routes/school-calendar.js`, `routes/groups.js`, `routes/rbac.js`. Chacune de ces routes a été
ajoutée pour une bonne raison locale. Mises bout à bout, elles reconstruisent Quiz, Forum,
Glossaire, Livre, Achèvement d'activité, Cohortes, Groupes et Calendrier — c'est-à-dire Moodle,
qui tourne à `https://olution.info` et avec lequel le dépôt échange déjà des identités.

**Trois constats de mesure changent la conclusion habituelle :**

1. **La convergence interne est faite.** Contrairement à ce que le plan de septembre laissait
   attendre, `src/shared/pct-map/` (5 301 lignes) est consommé par les **quatre** surfaces
   (ForetMap, Visite, G&L, Plan) ; l'étanchéité de `src/shared/` est **tenue à zéro import
   remontant** et gardée par une règle ESLint en erreur ; `Button`, `BottomSheet`,
   `MapActionButton` et les feuilles de tokens partagées existent ; l'échappement du glossaire
   lore passe par `renderMarkdownToSafeHtml`. Les lots 0 à 4 de
   `AUDIT_CONVERGENCE_APPS_2026-09.md` sont **livrés**. Il ne faut donc pas les reprogrammer.
2. **Les garde-fous de non-divergence sont complets**, y compris ceux qui n'apparaissent pas
   dans les workflows sous forme de commande nommée. Les huit noyaux miroirs ESM/CJS de
   `lib/shared/*Core.js` sont vérifiés **au caractère près** par `tests/shared-cores-sync.test.js`,
   qui rejoue la génération en mémoire (`checkAll()`), relance `sync-shared-cores.js --check` dans
   un sous-processus et compare les clés publiques exportées de part et d'autre ; ce fichier tourne
   dans le job `test` via `npm run test:coverage`, sans `continue-on-error`. Les miroirs
   `lib/visit-pack/`, `lib/gl-pack/` et `lib/term-autolink/` sont couverts par le workflow
   **`frontend-dist.yml`**, qui rebâtit puis compare (`git diff --quiet`). **Aucun écart mesuré
   aujourd'hui entre l'architecture cible et le dépôt** (cf. §6.0).
3. **Le seul chantier à solde de code négatif est écarté du périmètre.** `routes/lti.js` déclare
   en tête : « Aucun AGS, aucun Deep Linking ». Ce sont précisément les deux mécanismes qui
   permettraient de **supprimer** du code (édition des liaisons, remontée des scores) au lieu d'en
   ajouter.

**Donc : la question n'est plus « fallait-il un LMS ? » mais « où s'arrête ce qu'on écrit ? ».**
La §7 propose une charte du non-développement ; la §6 classe les points de convergence en
nécessaires, utiles et à écarter.

---

## 2. Méthode

Tout ce qui suit est mesuré sur la tête de `main` (`package.json` 1.157.29), pas estimé. Les
commandes sont reproductibles.

| Mesure                       | Commande                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Volumétrie applicative       | `find routes lib src -type f \( -name "*.js" -o -name "*.jsx" \) -exec cat {} + \| wc -l`                                   |
| Surface HTTP                 | `grep -rhoE "router\.(get\|post\|put\|delete\|patch)\(" routes/ \| wc -l`                                                   |
| Union « briques génériques » | `find routes lib src -type f \( -name "*.js" -o -name "*.jsx" \) \| grep -iE "<motif §4>" \| sort -u \| xargs cat \| wc -l` |
| Tables                       | `grep -ohiE "CREATE TABLE IF NOT EXISTS [\`a-z\_]+" database.js migrations/\*.sql \| sort -u`                               |
| Étanchéité `src/shared/`     | `grep -rnE "from '\.\./\.\./(gl\|components\|services\|hooks)/" src/shared/ \| wc -l`                                       |
| Adoption du noyau carte      | `grep -rl "shared/pct-map" src/`                                                                                            |

**Limite assumée de la méthode.** Le classement « générique / spécifique » se fait par motif de
nom de fichier, donc les périmètres se recouvrent (un module de conditionnement QCM compte à la
fois dans « quiz » et dans « gating »). Les totaux par brique de la §4 sont **additionnés avec
doublons** et servent à comparer des ordres de grandeur entre briques ; le chiffre global de
52 433 lignes, lui, est une **union dédupliquée** de 261 fichiers.

---

## 3. Ce que le dépôt est devenu

| Mesure                                     | Valeur                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Code applicatif (`routes` + `lib` + `src`) | **266 978 lignes**, 1 480 fichiers                                                                    |
| Tests (`tests`, `tests-ui`, `e2e`)         | ~159 700 lignes (521 fichiers backend, 277 UI, 53 e2e)                                                |
| Documentation                              | 123 fichiers, 42 043 lignes                                                                           |
| Base                                       | 160 tables (67 `gl_`, 11 `visit_`, 82 autres), 259 migrations                                         |
| Surface HTTP                               | 661 endpoints, dont **328 en G&L (49,6 %)**                                                           |
| Produits servis                            | 3 (`foret`, `gl`, `plan`) — `lib/products.js`                                                         |
| Exécution                                  | o2switch mutualisé, Passenger, **une** instance Node, Socket.IO en polling                            |
| Lien LMS                                   | Moodle 5.2 : annuaire (`lib/moodle/`, 22 fichiers / 5 352 l.) + LTI 1.3 (`lib/lti/`, `routes/lti.js`) |

Deux de ces lignes méritent d'être lues ensemble : **661 endpoints** et **une seule instance Node
sur mutualisé**. La surface fonctionnelle croît beaucoup plus vite que la capacité
d'exécution et que la capacité de maintenance. C'est le vrai plafond du projet, et il n'est pas
technique (cf. §8).

---

## 4. Inventaire chiffré : spécifique, générique, délégable

Lignes agrégées par domaine sur `routes/` + `lib/` + `src/` + tests (avec recouvrements, cf. §2).

### 4.1 Briques génériques — 52 433 lignes applicatives (19,6 %), 261 fichiers, + 29 903 lignes de tests

| Brique                      | routes | lib   | src   | tests | Total  | Équivalent existant                                | Verdict proposé                      |
| --------------------------- | ------ | ----- | ----- | ----- | ------ | -------------------------------------------------- | ------------------------------------ |
| Conditionnement / gating    | 1 883  | 4 019 | 5 129 | 8 473 | 19 504 | Achèvement d'activité + restriction d'accès Moodle | **Geler** (cf. 4.3)                  |
| Quiz / QCM                  | 1 534  | 3 223 | 3 789 | 3 623 | 12 169 | Moodle Quiz, H5P                                   | **Geler**, déléguer le certifiant    |
| Journal personnel           | 1 086  | 2 217 | 3 669 | 2 950 | 9 922  | aucun équivalent réel                              | **Garder** (spécifique déguisé)      |
| Tutoriels / visites guidées | 1 237  | 1 304 | 2 795 | 3 604 | 8 940  | Livre, Leçon Moodle                                | **Geler**                            |
| Glossaire                   | 775    | 1 502 | 3 453 | 2 803 | 8 533  | Glossaire Moodle                                   | **Garder le rendu, geler l'édition** |
| Médiathèque                 | 404    | 1 431 | 2 035 | 2 604 | 6 474  | Dépôt Moodle, Directus                             | **Garder** (cloisonnement produit)   |
| Groupes / sous-groupes      | 891    | 1 895 | 1 583 | 1 581 | 5 950  | Cohortes + groupes Moodle (**déjà en miroir**)     | **Déléguer la source de vérité**     |
| RBAC / permissions          | 1 192  | 1 531 | 610   | 2 243 | 5 576  | Rôles Moodle, Keycloak                             | **Garder** (granularité métier)      |
| Commentaires contextuels    | 720    | 229   | 668   | 1 350 | 2 967  | Annotations                                        | **Garder**                           |
| Forum                       | 827    | —     | 835   | 852   | 2 514  | Forum Moodle                                       | **Déléguer**                         |
| Calendrier scolaire         | 55     | 164   | —     | 241   | 460    | Calendrier Moodle                                  | **Déléguer**                         |

### 4.2 Briques spécifiques — le cœur, non substituable

| Brique                           | Total   | Pourquoi rien ne la remplace                                                                             |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| G&L (jeu complet)                | 116 141 | Jeu de rôle pédagogique à chapitres, feuillets, marché, sortilèges, équipes                              |
| Visite + mascottes               | 44 054  | Moteur de mascotte multi-renderer (Rive, spritesheet, `sprite_cut`) piloté par états                     |
| Carte (4 surfaces, noyau unifié) | 38 846  | Carte **en pourcentages sur image**, pas géospatiale : ni Leaflet ni MapLibre ne la donnent telle quelle |
| Zones / plantes / espèces        | 33 920  | Pré-saisie multi-sources + Pl@ntNet, propre au corpus de l'établissement                                 |
| Tâches                           | 23 178  | Chantiers saisonniers récurrents, affectation par groupe, validation prof                                |
| Réseau trophique                 | 6 588   | Objet pédagogique sans équivalent grand public                                                           |

**C'est cette colonne qui justifie le projet.** Un LMS aurait transformé chacune de ces six lignes
en « une page de cours avec une image » : le projet aurait perdu son objet.

### 4.3 Pourquoi « geler » plutôt que « supprimer »

Trois des briques génériques sont **plus spécifiques qu'elles n'en ont l'air**, et les supprimer
coûterait plus cher que de les garder :

- le **conditionnement** est polymorphe sur des ressources ForetMap _et_ G&L
  (`resource_question_links` / `gl_resource_question_links`) : Moodle ne sait pas conditionner
  l'accès à une fiche d'espèce de la forêt ni à un feuillet de lore ;
- le **journal personnel** importe des éléments appris (feuillet, écosystème, fiche espèce,
  tutoriel, glossaire) avec leur lien réel — c'est un objet du projet, pas un blog ;
- le **glossaire** est auto-lié dans les textes de lore et de contenu, avec popover : c'est un
  rendu, pas un dictionnaire.

**« Geler » signifie donc : le code existant reste, il est maintenu en correctif, et il ne reçoit
plus de fonctionnalité nouvelle.** Toute demande d'enrichissement sur une brique gelée part vers
Moodle par lien profond. C'est la règle qui arrête la croissance sans imposer de réécriture.

---

## 5. Le seul chantier à solde de code négatif : LTI Deep Linking + AGS

`routes/lti.js` pose aujourd'hui, en toutes lettres, « Aucun AGS, aucun Deep Linking ».
L'arbitrage était raisonnable pour le lot M6 (livrer l'entrée depuis le cours avant tout le
reste). Il mérite d'être rouvert **maintenant**, parce que ces deux mécanismes sont les seuls de
toute la feuille de route qui **retirent** du code :

| Mécanisme                             | Ce qu'il apporte                                                                                      | Ce qu'il permet de ne plus maintenir                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Deep Linking** (LTI-DL 2.0)         | Le prof choisit la cible (produit, écran, chapitre) **depuis Moodle** au moment où il crée l'activité | L'écran d'administration des liaisons cours → produit / écran (`lib/lti/bindings.js` et son UI)      |
| **AGS** (Assignment & Grade Services) | Les scores de QCM remontent dans le carnet de notes Moodle                                            | Les écrans de suivi de notes côté ForetMap / G&L, et la pression future pour en construire davantage |

**Effet de bord vertueux :** dès que la note vit dans Moodle, la brique « quiz » de la §4.1 cesse
d'être une candidate à l'enrichissement — elle devient un simple collecteur de tentatives. Le gel
décrit en §4.3 se tient tout seul, au lieu de reposer sur la discipline.

**Préalable non négociable :** la couche A (annuaire) doit être opérationnelle en établissement.
Le critère terrain M4 et la section 21.7 de `AUDIT_MOODLE_IDENTITES_2026-09.md` restent ouverts.
Sans couche A, AGS n'a pas d'élève à qui attribuer une note.

---

## 6. Points de convergence : nécessaires, utiles, à écarter

Classement selon un critère unique, différent de celui de l'audit de convergence (qui classait par
bénéfice produit) : **est-ce que cela réduit la surface à maintenir ou le risque de perte du
projet ?**

### 6.0 Un point candidat, écarté après vérification

Une première lecture des workflows fait croire à un garde-fou manquant : `package.json` déclare
`sync:shared-cores:check`, et **aucun job de `.github/workflows/ci.yml` n'appelle ce script par son
nom**. La conclusion serait qu'un miroir CJS peut diverger de sa source ESM sans que la CI le
signale. **Elle est fausse**, et la vérification mérite d'être consignée parce que l'erreur est
facile à refaire :

| Miroir                                                  | Contrôle de non-divergence                                                                                                                                                                     | Où il tourne                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `lib/shared/*Core.js` (8 paires)                        | `tests/shared-cores-sync.test.js` : régénération en mémoire (`checkAll()`), `--check` relancé en sous-processus, inventaire des paires figé, égalité des clés publiques et des types ESM ↔ CJS | job `test` → `npm run test:coverage`, sans `continue-on-error` |
| `lib/visit-pack/`, `lib/gl-pack/`, `lib/term-autolink/` | `frontend-dist.yml` : `npm run build` (qui enchaîne les synchros via `scripts/build-safe.js`) puis `git diff --quiet` sur ces dossiers                                                         | workflow `Frontend dist`, sur chaque PR                        |

Autrement dit, le contrôle existe et il est bloquant ; il passe simplement par la suite de tests
plutôt que par une étape de workflow nommée. **Il n'y a donc aucun geste de code à faire ici**, et
aucun écart mesuré entre l'architecture cible et le dépôt.

### 6.1 Nécessaires — sans quoi quelque chose casse ou se perd

| #      | Point de convergence                                                                                                                                                                            | Pourquoi nécessaire                                                                                                                                                                                                  | Effort   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **N1** | **Déclarer Moodle source de vérité des identités et des groupes**, et l'écrire dans `docs/reference/`.                                                                                          | Deux annuaires sans maître déclaré, sur des comptes de mineurs, produisent des divergences qu'on répare mal. Le code du miroir existe déjà (`lib/moodle/teamsMirror.js`) ; ce qui manque est la **décision écrite**. | ~0,5 j   |
| **N2** | **Clore le critère terrain M4 et la section 21.7** de la spécification Moodle.                                                                                                                  | Tout le reste (AGS, Deep Linking, gel des briques génériques) en dépend. Un chantier qui reste « presque fini » indéfiniment bloque la décision de ne plus construire.                                               | terrain  |
| **N3** | **Charte du non-développement** (§7), versionnée et opposable.                                                                                                                                  | Sans règle écrite, la surface continuera de croître par décisions individuellement raisonnables. C'est le mécanisme, pas l'intention, qui manque.                                                                    | ~0,5 j   |
| **N4** | **Continuité : un second lecteur du code.** A minima, un `docs/reference/` complet pour l'exploitation courante et une personne de l'établissement capable de redémarrer, restaurer et publier. | 266 978 lignes applicatives, 160 tables, un mainteneur. C'est le risque le plus élevé du projet, et il n'est pas technique (cf. §8).                                                                                 | à cadrer |

### 6.2 Utiles — gain réel, différable sans dommage

| #      | Point de convergence                                                                                                                 | Gain                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **U1** | **Deep Linking + AGS** (§5).                                                                                                         | Le seul chantier à solde de lignes négatif. Utile et non nécessaire **uniquement** parce que N2 le précède.               |
| **U2** | **Registre de réglages unique** : fusionner `lib/settings.js` (déclaratif, 3 portées) et `lib/glSettings.js` + validateurs de route. | Deux conceptions opposées du même objet ; le produit doit être un paramètre, jamais une branche.                          |
| **U3** | **Aide, thème de marque et centre de notifications convergés** (lot 7 de l'audit de convergence).                                    | ForetMap gagne l'aide à contenu serveur, G&L le centre de notifications, Plan l'identité de l'établissement.              |
| **U4** | **Désencombrement de carte** (`clusterMarkers`, étiquettes au zoom, priorité par catégorie).                                         | Le noyau `pct-map` est déjà partagé : le gain profite aux quatre surfaces d'un seul coup.                                 |
| **U5** | **Arbitrage éditorial « ForetMap héberge G&L » vs « plateforme à deux produits »**, posé par `AUDIT_EVOLUTION_V1_V2_2026-09.md` §7.  | G&L pèse 49,6 % de la surface HTTP. La réponse change le nom du dépôt et la façon de présenter le tout à l'établissement. |

### 6.3 À écarter — convergences qui coûteraient plus qu'elles ne rapportent

| Point                                                                                              | Pourquoi l'écarter                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Réécrire la plateforme sur Directus / Supabase / Payload**                                       | C'était la voie facile en mars 2026. À 259 migrations et avec l'historique de centaines d'élèves, c'est troquer une dette connue contre un risque inconnu.                                         |
| **Remplacer le moteur de carte par Leaflet ou MapLibre**                                           | La carte est **en pourcentages sur image**, pas géospatiale ; `src/shared/pct-map/` est déjà unifié sur les quatre surfaces. Le remplacement serait exactement le geste que cet audit déconseille. |
| **Fusionner fiches de glossaire, forum, stats et tutoriels FM ↔ GL**                               | Déjà tranché par `PARTAGE_FM_GL.md` ; la mesure du jour le confirme.                                                                                                                               |
| **Faire de Plan Lyautey un quatrième produit à part entière** (back-office, auth, contenu propres) | Il doit rester une **surface** de la carte `lyautey`, alimentée par le contenu ForetMap. Chaque produit autonome multiplie le coût de la couche plateforme.                                        |
| **Poser une V2 maintenant**                                                                        | Déjà tranché : clôture CHANGELOG et CI verte d'abord (`AUDIT_EVOLUTION_V1_V2_2026-09.md` §7).                                                                                                      |
| **Mode sombre, scission `src/foret/`**                                                             | Confort. À reprendre quand N1–N4 sont tenus.                                                                                                                                                       |

---

## 7. Charte du non-développement (proposition)

À verser dans `docs/reference/` une fois validée, et à citer en revue de PR.

1. **Ce qui ressemble à une fonction de LMS part chez Moodle.** Notes, cohortes, calendrier
   scolaire, forum de cours, quiz certifiant, dépôt de devoirs : on crée un lien profond, jamais
   une route.
2. **Les briques gelées (§4.1) reçoivent des correctifs, pas des fonctionnalités.** Une demande
   d'enrichissement sur une brique gelée se répond par « dans Moodle », pas par une migration.
3. **Une nouvelle table se justifie par écrit** : quel objet du terrain la rend nécessaire, et
   pourquoi aucune table existante ne convient. 160 tables, c'est déjà au-delà de ce qu'une
   personne tient en tête.
4. **Pas de quatrième produit.** Une nouvelle surface est un écran de ForetMap, avec ses réglages
   de visibilité — pas un host, un service worker, un manifest et un shell de plus.
5. **Une dépendance éprouvée l'emporte sur 300 lignes maison**, en citant la source et en
   respectant la licence (`.cursor/rules/foretmap-external-inspiration.mdc`).
6. **Tout code partagé arrive avec son garde-fou anti-retour** (test, règle ESLint, ou vérification
   CI) — la règle d'étanchéité de `src/shared/` et le contrôle de non-divergence des noyaux
   miroirs (§6.0) sont les modèles à suivre.
7. **Un chantier qui n'a pas de définition de terminé vérifiable ne démarre pas.** Un chantier
   « presque fini » bloque les décisions qui en dépendent (cas de M4).
8. **Toute fonctionnalité nouvelle répond d'abord à : "que se passe-t-il si je ne suis plus là ?"**
   Si la réponse est « personne ne saura la maintenir », elle ne s'écrit pas.

---

## 8. Le risque dont aucun audit ne parle

Les cinquante audits de `docs/` traitent de charge, de bugs, d'UX, de convergence, de
versionnage. Aucun ne traite du risque qui domine tous les autres :

> **266 978 lignes applicatives, 160 tables, 661 endpoints, trois produits, un mainteneur, dans un
> lycée.**

Le jour où cette personne n'est plus disponible, personne ne reprend l'ensemble. Un Moodle avec
des plugins, un professeur référent numérique le reprend. C'est l'argument le plus fort en faveur
de la « voie facile » — et il ne porte pas sur le passé : **il porte sur chaque ligne ajoutée à
partir d'aujourd'hui.**

Ce risque ne se traite pas par un outil. Il se traite par trois gestes, dans l'ordre :
la charte (N3), la documentation de référence complète pour l'exploitation courante (N4), et le
report vers Moodle de tout ce que Moodle sait faire (N1, U1).

---

## 9. Synthèse en quatre lignes

1. **Le sur-mesure était justifié sur le cœur** — carte, forêt, réseau trophique, tâches, G&L : rien
   de tout cela n'existait ailleurs, et un LMS aurait fait perdre l'objet du projet.
2. **Il ne l'était pas sur la périphérie** — 52 433 lignes, 19,6 % du code, reconstruisent des
   fonctions du Moodle auquel le dépôt est déjà branché.
3. **La convergence interne est faite, garde-fous compris** — noyau carte partagé sur quatre
   surfaces, `src/shared/` étanche et gardée par ESLint, kit d'interface commun, non-divergence des
   miroirs ESM/CJS vérifiée au caractère près dans la suite de tests (§6.0). Rien à reprogrammer de
   ce côté.
4. **La seule voie plus facile encore disponible est la soustraction** : une charte du
   non-développement, Moodle déclaré maître des identités, et LTI poussé jusqu'à Deep Linking et
   AGS — le seul chantier qui retire du code au lieu d'en ajouter.

---

## 10. Ce que cet audit ne fait pas

- Aucune modification de code, de schéma, de réglage ; aucune donnée de production consultée.
- Il ne rouvre pas les arbitrages tranchés par `PARTAGE_FM_GL.md`, `AUDIT_CONVERGENCE_APPS_2026-09.md`,
  `AUDIT_EVOLUTION_V1_V2_2026-09.md` et `AUDIT_MOODLE_IDENTITES_2026-09.md` ; il les cite et les
  complète.
- Il ne chiffre pas l'effort d'AGS et de Deep Linking : cela demande un audit court dédié, après
  la clôture du critère terrain M4.
- Il ne propose **aucune** migration, aucun renommage et **aucun geste de code** : les points
  N1 à N4 relèvent de la décision, de la documentation et du terrain.
