# Audit général — l'application et le jeu (août 2026)

> **Statut : document d'audit. Aucun comportement modifié.**
> Périmètre : ForetMap **et** Gnomes & Licornes, avec un accent sur **le jeu** et sur
> **ce que le joueur perçoit**. Lecture croisée du code, des migrations, des tests, de la
> CI, des pull requests ouvertes et de la documentation de référence.
> État audité : `package.json` **1.88.0**, tête de `main` = merge de la PR #294 (2026-08-15).
>
> Les constats sont **sourcés** (`fichier:ligne`, numéro de PR) et vérifiés dans le code,
> pas déduits de la documentation. Quand la documentation dit vrai, c'est signalé — c'est
> une force.

---

## 1. En une page

**Le socle est solide et la culture d'ingénierie est au-dessus de la moyenne** : 325 fichiers
de tests backend, 401 fichiers de tests UI, 41 scénarios e2e, 172 migrations idempotentes,
une documentation fonctionnelle **honnête** (elle liste ses propres faiblesses), une
authentification qui ré-hydrate les droits en base à chaque requête, un marché
transactionnel correctement verrouillé. Rien de tout cela n'est courant à cette échelle.

**Et pourtant le problème principal n'est pas technique.**

Cet audit a commencé par identifier deux défauts sérieux sur le QCM — la bonne réponse
lisible côté navigateur, et un jeton rejouable permettant de gonfler le score. Les deux
sont **réels et présents sur `main` aujourd'hui**. Les deux sont aussi **déjà corrigés**,
avec tests et documentation, dans les PR **#277** (2026-08-02) et **#275** (2026-07-31),
ouvertes et **jamais fusionnées**.

Ce n'est pas un cas isolé : **26 pull requests sont ouvertes, presque toutes en brouillon,
à raison d'environ une par jour depuis le 20 juillet**, et la quasi-totalité sont des
`fix(...)` — dont plusieurs explicitement `fix(sécurité)` et anti-triche (§2). Pendant ce
temps, seule la file « fonctionnalités » (OLU) est fusionnée.

**Le diagnostic tient donc en une phrase : ce projet trouve ses bugs remarquablement bien,
et ne les corrige pas — parce que les correctifs ne sont pas fusionnés.** Chaque jour
d'attente supplémentaire les éloigne de `main` (ils ciblent v1.85–1.87) et les met en
conflit les uns avec les autres.

Le plus frappant : **l'outil qui règlerait cela existe déjà dans le dépôt et ne s'exécute
sur aucune de ces PR**, parce qu'il ignore les brouillons — et qu'elles sont toutes en
brouillon (§2.3). Le premier geste utile de tout ce document tient en une ligne de YAML.

Le reste de cet audit apporte ce que la file de PR ne couvre pas :

1. **Le jeu a deux régimes et l'application n'en montre qu'un** (§5.0) — GL se joue en
   séance (plateau animé par le MJ) **et hors séance** (feuillets, marquage « appris »,
   carnet, entraînement). Recherche exhaustive sur `src/`, `lib/`, `data/` et
   `docs/reference/` : **zéro occurrence** de « hors séance » ou équivalent. L'élève arrive
   toujours sur l'onglet Cartes, ne voit jamais le statut de la partie, et hors séance ses
   clics sur le plateau n'ont aucun effet — sans un mot. C'est un défaut de **conception de
   l'expérience**, pas de code, et il conditionne tout le reste de la perception du jeu.
2. **Le passage à l'échelle « une classe »** (§6.1) — un défaut d'architecture temps réel
   qui multiplie la charge par le nombre d'élèves **et** par la durée de la séance. **Aucune
   PR ouverte ne le traite.** C'est le risque technique n°1 restant.
3. **Les ruptures d'expérience côté joueur** (§5.2) — le premier écran d'un nouveau joueur
   est vide et non expliqué, les chargements d'onglet sont des pages blanches. Correctifs
   courts, rendement perçu maximal. **Aucune PR ouverte ne les traite.**
4. **Réseau et conformité** (§6.5, §6.6) — polices Google en CDN pour une application
   scolaire destinée à des mineurs, CSP quasi absente, GL sans PWA.

---

## 2. 🔴 Le constat qui domine tous les autres : le stock de correctifs non fusionnés

### 2.1 Les faits

**26 pull requests ouvertes** au 2026-08-15, la plus ancienne datant du **2026-07-20**.
Cadence : **une PR par jour ouvrable**, très régulière — signature d'un pipeline
d'investigation automatisé qui tourne et produit. **Toutes sont en brouillon** sauf la PR
Dependabot #287.

Répartition par nature :

| Nature                                      | Nombre | Exemples                                             |
| ------------------------------------------- | ------ | ---------------------------------------------------- |
| Correctifs de sécurité / anti-triche        | ~8     | #275, #277, #284, #285, #286, #276, #272, #267       |
| Correctifs de robustesse / concurrence      | ~10    | #279, #283, #288, #291, #274, #273, #266, #263, #295 |
| Correctifs fonctionnels (exports, blocages) | ~3     | #262, #265                                           |
| Documentation                               | ~4     | #260, #271, #280, #289                               |
| Fonctionnalité                              | 1      | #296 (OLU lot 2)                                     |
| Dépendances                                 | 1      | #287                                                 |

**Ce qui est fusionné, en revanche** : #290, #292, #293, #294 — c'est-à-dire la file
« fonctionnalités » (OLU, partage FM/GL). La file « correctifs » ne l'est jamais.

### 2.2 Deux exemples vérifiés en détail

J'ai lu les diffs de #277 et #275 pour vérifier qu'il s'agit bien de vrais correctifs, pas
d'ébauches :

- **PR #277** retire `correctChoiceId` du JWT de présentation, résout désormais la bonne
  réponse **côté serveur** depuis `reponse_correcte` + `choiceLetters`, **refuse de croire
  les jetons hérités** qui l'exposeraient encore, propage le correctif aux quatre points
  d'appel (catalogue GL, lore, QCM de partie, quiz ForetMap), ajoute un test qui décode
  effectivement le base64url du JWT pour vérifier l'absence du champ, et met à jour
  `docs/API.md` **et** la doc de référence.
- **PR #275** ajoute un `jti` par présentation, une table de consommation
  (`gl_qcm_presentation_uses`, migration `171`), un `409` « Présentation déjà utilisée » en
  cas de rejeu, déplace l'enregistrement de tentative de gating **après** la consommation
  (pour qu'un rejeu ne pollue pas le gating), et livre un test d'intégration complet qui
  vérifie que le score reste à 1.

**Ce sont des correctifs de qualité de production, complets, testés et documentés.** Ils
dorment depuis deux à trois semaines.

### 2.3 Pourquoi cela empire tout seul

- **Dérive de version.** Chaque PR a bumpé `package.json` depuis sa base : #275 → 1.85.4,
  #277 → 1.85.6, #284 → 1.87.2, #291 → 1.87.7, #295 → 1.87.9. `main` était à **1.88.0** au
  moment de l'audit. **Toutes** entrent donc en conflit sur `package.json`,
  `package-lock.json` et la tête du `CHANGELOG.md` — et **entre elles**.
- **🔴 Le remède existe déjà… et il est désactivé exactement là où il faudrait.** Le dépôt
  dispose d'un workflow `auto-resolve-conflicts.yml` (+ `scripts/auto-resolve-conflicts.js`)
  qui fait précisément ce qu'il faut : à chaque push sur `main` et **toutes les heures**, il
  réintègre `main` dans les PR ouvertes et résout sans risque les conflits récurrents —
  `CHANGELOG.md` par union, bumps `package.json` / `package-lock.json`. Excellente idée,
  correctement implémentée.

  **Mais il ignore les brouillons.** `AUTO_RESOLVE_INCLUDE_DRAFTS` ne vaut `'1'` que sur un
  déclenchement **manuel** (`workflow_dispatch`) ; les exécutions horaires et sur push
  passent `'0'`, et le script coupe court :
  `if (pr.isDraft && !includeDrafts) { … ignorée }` (`scripts/auto-resolve-conflicts.js:370`).

  Or **les 26 PR de la file sont toutes en brouillon**. L'automatisation qui maintiendrait
  le backlog fusionnable ne s'exécute donc sur **aucune** de ses PR. C'est le seul constat
  de ce document dont le correctif tient en **une ligne** : passer `include_drafts` à `1`
  pour la planification horaire (ou sortir les PR de l'état brouillon).

  _Vérifié en conditions réelles : ce workflow s'est déclenché sur la PR de cet audit à la
  seconde où elle est passée « prête à relire », et a résolu les conflits
  `package.json` / `package-lock.json` tout seul. Il marche — il ne voit simplement pas la
  file._

- **Une règle documentaire, mais pas de garde-fou.** `.cursor/rules/foretmap-pr-merge-conflict.mdc`
  demande de vérifier les autres PR qui bumpent à chaque publication : elle constate le
  problème sans l'endiguer, parce qu'elle suppose une fusion rapide.
- **Chevauchement de code.** #275 et #277 modifient toutes deux `lib/glQcmChoices.js` dans
  la **même fonction** (`presentQuestion` / `verifyPresentationAnswer`). Fusionner l'une
  rendra l'autre conflictuelle. Plus on attend, plus la résolution demande de
  re-comprendre deux correctifs à la fois.
- **Numéros de migration.** #275 réserve `migrations/171`. Sur `main`, le numéro 171 est
  effectivement **libre** (on passe de `170` à `172`) — donc c'est encore jouable
  aujourd'hui. Mais rien n'empêche une autre PR de le réclamer, et la fenêtre se referme.
- **Coût cognitif.** Vingt-six correctifs à relire d'un coup est un travail bien plus lourd
  que vingt-six relectures d'un correctif.

### 2.4 Recommandation — c'est le lot 0, avant tout le reste

0. **Le geste à une ligne, à faire en premier** : activer `include_drafts` sur la
   planification horaire d'`auto-resolve-conflicts.yml`. La file redevient mécaniquement
   fusionnable sans qu'on ait rien décidé d'autre, et le coût de la décision suivante baisse
   d'un cran. _(§2.3)_
1. **Décider explicitement du sort de cette file.** Soit ces PR sont des propositions
   valides et il faut les fusionner ; soit elles ne le sont pas et il faut les fermer. Le
   statu quo — les laisser ouvertes **et en brouillon** — est la seule option qui coûte sans
   rien rapporter.
2. **Fusionner par lots thématiques, du plus ancien au plus récent**, en commençant par la
   sécurité : #277 + #275 (QCM) puis #284, #285, #286, #276, #272, #267. Résoudre les
   conflits de version en faveur de `main` (garder la version de `main`, réappliquer un
   seul bump à la fin du lot).
3. **Changer la règle de bump.** Faire porter le `bump` de `package.json` **à la fusion**
   (au moment du merge, ou par un job dédié) et non dans chaque branche. La cause première
   des conflits est que chaque PR touche la même ligne du même fichier — c'est évitable par
   construction, pas par vigilance. Cela reste vrai même avec l'auto-résolution active :
   mieux vaut supprimer le conflit que le réparer soixante fois.
4. **Plafonner la file.** Si le pipeline d'investigation produit une PR par jour, il faut un
   rythme de fusion d'au moins une par jour, sinon une pause du pipeline. Une file qui ne
   se vide pas n'est pas un backlog, c'est un dépotoir — et les correctifs de sécurité y
   perdent leur caractère urgent par accoutumance.

---

## 3. Le chantier en cours — où en est le train

| Chantier                                           | Avancement réel                                                                                                        | Risque                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **OLU narrateur** (`docs/MASCOT_NARRATEUR_OLU.md`) | **Lot 1/7 fusionné** (bulle + machine à écrire, branchés sur la visite guidée). **Lot 2 en PR #296**, ouverte ce jour. | Deux arbitrages 🔴 encore ouverts (§11 du plan) : réceptacle des visuels, surcharges d'aide en prod. |
| **Partage FM/GL** (`docs/PARTAGE_FM_GL.md`)        | Axe A partiellement livré (A1–A4), axe B amorcé (B0–B3), axe C = décisions de non-partage.                             | Faible. Plan mesuré, faux positifs documentés, chaque lot a ses tests.                               |
| **Conditionnement par QCM** (gating)               | Phase 3 livrée, **désactivée par défaut**. Reste optionnel : granularité `team`, gating `lore_glossary`/`feuillet`.    | Un arbitrage de game design non tranché (§5.3.2) : le verrou de 3 jours par défaut.                  |
| **Chasse aux bugs (quotidienne)**                  | **~20 correctifs produits, 0 fusionné** depuis le 20 juillet.                                                          | 🔴 Voir §2.                                                                                          |

**Observation de méthode à conserver.** Le §9.1 de `PARTAGE_FM_GL.md` raconte un test
intermittent requalifié en vrai bug de production après avoir été rendu déterministe. C'est
exactement la bonne réaction, et elle mérite d'être citée comme référence interne : _un
flake mérite d'être rendu déterministe avant d'être classé comme flake_.

---

## 4. Ce qui est robuste — à ne pas casser

### 4.1 L'authentification et l'isolement produit

`middleware/requireGlAuth.js` fait trois choses justes que beaucoup de projets ratent :

- **Le jeton ne porte que l'identité, jamais les permissions.** Les droits sont ré-hydratés
  en base à chaque requête (`authenticateGl`) : révocation de rôle, désactivation ou
  suppression prennent effet à la requête suivante.
- **Une panne d'infrastructure renvoie 503, pas 401** (`GlAuthInfraError`). Le commentaire
  explique pourquoi : un 401 ferait boucler les reconnexions. Raisonnement de production.
- **L'isolement produit est vérifié au niveau du jeton** (`verifyJwtForProduct(token, …, 'gl')`)
  **et du socket** : `subscribe:gl-game` appelle `canAccessGlGame` avant de rejoindre la
  room (`lib/realtime.js:156-182`). L'isolement est appliqué aux deux couches, pas
  seulement déclaré.

### 4.2 Le rendu de contenu utilisateur

`src/utils/markdown.js` : liste blanche stricte de balises et d'attributs, DOMPurify, et un
hook `afterSanitizeAttributes` qui contraint les schémas d'URL (`https?:`, `/uploads/`,
`/maps/` pour les images) et force `rel="noopener noreferrer"` sur les liens externes. Les
élèves écrivent dans le forum et « Mon journal » : cette surface est correctement fermée.
Corollaire honnête : cela **compense** une CSP quasi inexistante (§6.5).

### 4.3 L'économie — les échanges du Marché

`lib/glMarket.js` : `settleTradeInTx` verrouille les deux joueurs (`FOR UPDATE`, lignes
205-212), vérifie les soldes **avant** d'appliquer les deltas (218-225), refuse l'échange
vide, et l'ensemble tourne dans une transaction. La double acceptation gèle l'offre
(`frozen_at`). Correct y compris en concurrence : deux élèves qui cliquent en même temps ne
peuvent pas dupliquer de gemmes.

### 4.4 Les migrations et la reproductibilité

172 migrations idempotentes, table `schema_version`, et une discipline visible : la
migration `151` **régularise deux tables créées manuellement en production** pour garantir
que « base neuve = prod ». C'est le genre de dette que la plupart des projets laissent
pourrir.

### 4.5 La documentation de référence

`docs/reference/` est un actif rare : non technique, destinée aux profs et MJ, et surtout
**honnête**. `presentation.md` signale de lui-même que le titre du jeu ne correspond pas à
son contenu ; `qcm-et-pedagogie.md` avertit que le verrou de re-tentative « n'est pas un
bug ». Un audit qui trouve la documentation déjà à jour sur ses propres faiblesses peut se
concentrer sur ce que la doc ne voit pas — le code et le process.

### 4.6 L'accessibilité de la navigation

`GLMobileNav.jsx` / `GLTopBar.jsx` : `role="tab"`, `aria-selected`, `aria-controls`,
`tabIndex` rotatif, `useDialogA11y` pour le piège de focus du tiroir, blocage du scroll du
corps. `e2e/gl-responsive-accessibility.spec.js` vérifie réellement ces attributs. 62 des
119 composants GL portent des attributs ARIA. `prefers-reduced-motion` est respecté côté
hooks **et** côté CSS.

---

## 5. Côté joueur — l'expérience telle qu'elle est perçue

On suit un élève de 10 ans, de sa première connexion à sa première réponse juste.

### 5.0 🔴 Le jeu a deux régimes, et l'application n'en montre qu'un

**L'intention produit** (confirmée par le porteur du projet) : GL se joue **en séance**,
animé par le MJ — le plateau, les tours, le dé, les QCM d'arrivée sur repère — **et hors
séance**, seul : consulter les contenus, **marquer « appris »**, **trouver des feuillets**,
tenir son carnet, s'entraîner aux QCM, échanger au marché, écrire au forum. Ce sont deux
régimes complémentaires, pas un jeu et son accessoire.

**Ce que l'application en dit : rien.** Recherche exhaustive sur `src/`, `lib/`, `data/` et
`docs/reference/` — **zéro occurrence** de « hors séance », « hors partie », « entre deux
séances », « à la maison ». Ni l'interface, ni l'aide contextuelle, ni la documentation de
référence ne mentionnent l'existence du second régime. Un élève ne peut pas deviner qu'il a
le droit de jouer quand la classe est finie ; un professeur ne peut pas le lui dire en
s'appuyant sur l'outil.

Quatre mécanismes concrets renforcent cette invisibilité :

**(a) L'onglet d'arrivée est toujours la surface de séance.**
`defaultTabForGlAuth` renvoie `maps` pour tout joueur, en toute circonstance
(`src/gl/utils/glAppShellHelpers.js:205-208`). Hors séance, l'élève atterrit donc
précisément sur **la seule chose qu'il ne peut pas faire**, au lieu d'être conduit vers La
nature, L'aventure ou Mon journal — c'est-à-dire vers le jeu qui lui est ouvert.

**(b) Le statut de la partie n'est jamais montré au joueur.** `draft`, `live`, `paused`,
`ended` : la seule lecture de `game.status` côté front est dans la console MJ
(`GLGameMasterConsole.jsx:104`). Or `canPlayerMoveMascot` exige `status === 'live'`
(`useGlGameRuntime.js:515`). Conséquence directe : **hors séance, l'élève clique sur la
carte et il ne se passe rien — sans le moindre message.** Le jeu ne lui dit pas « la séance
est terminée, mais tu peux continuer par ici » ; il ne lui dit rien du tout, ce qui se lit
comme une panne.

**(c) L'aide contextuelle est écrite pour l'administrateur, pas pour le joueur.** Les 26
entrées de `data/gl/help.default.json` se terminent **toutes** par la même phrase :
« _Les modules visibles dépendent des réglages MJ. Désactive un module dans Réglages
plateforme pour épurer la navigation joueur._ » — une consigne d'administration affichée
**à l'élève**, qui n'a ni les droits ni l'usage. Aucune entrée n'explique quoi faire, ni en
séance ni hors séance. Le panneau d'aide, qui serait le véhicule naturel de la distinction
entre les deux régimes, est aujourd'hui du remplissage.

**(d) Techniquement, le hors séance fonctionne — mais à une condition non dite.** Deux
comportements différents :

- **Marquer « appris » est totalement indépendant de la partie** : l'acquittement est
  indexé sur le lecteur (`buildReaderKey`), pas sur un jeu (`routes/gl/learning.js`,
  `GET /api/gl/learning/me`). ✅ Fonctionne hors séance, toujours.
- **L'acquisition de feuillets est dure-gatée sur une partie** :
  `const gameId = parseGlId(req.body?.gameId ?? req.glAuth.gameId); if (!gameId) return null;`
  (`routes/gl/learning.js:132-133`, et le même verrou pour la révélation par étude d'espèce
  aux lignes 247-248). L'attribution est « best-effort » : en l'absence de partie, elle
  renvoie `null` **en silence**, sans erreur ni message.

  La bonne nouvelle : `resolveGlPlayerActiveMembership` (`routes/gl/auth.js:198-231`)
  retourne aussi les parties `paused` et `ended` — elle ne fait que **classer** les `live`
  en premier. Un élève déjà affecté à une équipe conserve donc son `gameId` entre les
  séances, et l'acquisition de feuillets continue de marcher chez lui. **Mais un élève
  jamais affecté à une équipe peut marquer « appris » indéfiniment sans jamais gagner un
  seul feuillet**, sans qu'aucun écran ne le lui signale.

**C'est le même défaut que le §5.2.1, vu par l'autre bout** : l'affectation à une équipe est
la clé silencieuse de la moitié du jeu, et rien ne le dit.

**(e) Pourquoi cela n'a jamais été attrapé.** La fixture e2e crée systématiquement la partie
avec `status = 'live'` **en dur** (`e2e/fixtures/gl.fixture.js:22-23`) et affecte
immédiatement le joueur à une équipe. **Les 41 scénarios jouent donc tous en séance, dans
une partie active, avec une équipe attribuée.** Le régime hors séance et l'état « joueur
sans équipe » — c'est-à-dire la moitié du produit et l'écran d'accueil de tout nouvel élève —
ne sont couverts par **aucun** test de bout en bout. Le trou de couverture épouse exactement
le trou de conception.

**Recommandations** (par ordre de rendement) :

1. **Router l'arrivée selon le régime.** Si aucune partie n'est `live`, l'onglet d'arrivée
   devient La nature (ou le dernier onglet consulté), pas Cartes.
2. **Afficher l'état du jeu au joueur**, en une ligne de chrome : « Séance en cours » /
   « Hors séance — tu peux continuer à explorer, apprendre et retrouver des feuillets ».
   C'est la phrase qui manque, et elle porte à elle seule la compréhension des deux régimes.
3. **Expliquer sur la carte, hors séance**, plutôt que de laisser les clics sans effet :
   remplacer le silence par « Le plateau s'anime pendant les séances. En attendant… » avec
   deux ou trois liens vers ce qui est jouable maintenant.
4. **Réécrire l'aide contextuelle pour le joueur** — c'est un chantier de contenu, pas de
   code, et il croise directement le chantier OLU (§3), dont c'est précisément le rôle de
   porter cette voix. Retirer d'abord la consigne d'administration des 26 entrées.
5. **Décider du cas « appris sans équipe »** : soit l'acquisition de feuillets devient
   possible hors partie (rattachée au joueur plutôt qu'à l'équipe), soit l'interface le dit
   franchement (« tu pourras récupérer des feuillets dès que ton professeur t'aura mis dans
   une équipe »). Le silence actuel est la seule option à exclure.
6. **Documenter les deux régimes** dans `docs/reference/gl/presentation.md` et
   `chapitres-et-progression.md` : aujourd'hui, la doc de référence décrit un jeu de séance.

### 5.1 Ce qui est réussi et qu'il faut protéger

- **Le mode découverte est un vrai produit d'appel.** `GLGuestDemoBoard.jsx` n'est pas une
  démo vide : parcours scripté sur le plateau 1, déplacement animé de la mascotte le long
  de vrais points, découvertes de feuillets réels (`/api/gl/lore/demo-feuillets`), et mur
  d'inscription à la fin. Un visiteur comprend le jeu **en jouant**. C'est la meilleure
  page du produit.
- **La mise en scène est soignée** : musique de zone à l'arrivée (`useGLZoneMusicArrival`),
  comportements ambiants de mascotte par équipe (`useGLBoardAmbientBehavior`), dé virtuel
  3D, machine à écrire des bulles (lot 1 OLU), popovers de glossaire au clic sur un terme
  dans le texte. L'attention au sensible est réelle et rare dans une application scolaire.
- **Le carnet personnel (« Mon journal ») est une bonne idée pédagogique**, bien exécutée :
  articles libres + import de ce qu'on a appris avec titre réel et lien de retour, en fil
  chronologique, persistant **d'une partie à l'autre**. C'est le seul objet du jeu qui
  appartienne vraiment à l'élève.
- **Le vocabulaire a été assaini** (« Glossaire scientifique » vs « Lexique lore », « QCM
  biomes » vs « QCM lore ») et les réglages avertissent quand le Marché est activé sans la
  vitalité. Les corrections de 2026-07 se voient.

### 5.2 Les ruptures d'expérience — par ordre de ce que ça coûte à l'élève

Aucune PR ouverte ne traite les points ci-dessous.

#### 5.2.1 🔴 Le premier écran d'un nouveau joueur est un plateau vide, sans un mot

**Le parcours réel.** Un joueur se connecte. `defaultTabForGlAuth` l'envoie sur l'onglet
**Cartes** (`src/gl/utils/glAppShellHelpers.js:205-208`). S'il n'a pas encore été affecté à
une équipe — **ce qui est l'état normal de départ**, la doc de référence le dit
explicitement (« Les joueurs sont créés **sans équipe** »,
`docs/reference/gl/roles-et-connexion.md:141`) — alors :

- `activeGameId` reste `null`, donc `gameState` reste `null` (`useGlGameRuntime.js:190-221`) ;
- `GLMapView` est rendu **sans condition** (`AppGL.jsx:800`) ;
- `GLGameBoard` n'a **aucune sortie anticipée** quand `chapter` est absent : il calcule
  quand même une image de fond ;
- `resolveGlBoardImageUrl` retombe sur son `fallbackUrl` par défaut, qui vaut
  **`/maps/map-foret.svg`** (`src/gl/utils/glLegacyMediaUrl.js:157, 165`) — c'est-à-dire
  **la carte de la forêt de ForetMap**, l'autre application.

**Ce que voit l'élève** : la carte d'un potager sans rapport avec le royaume, sans mascotte,
sans repère, sans message. Le panneau « Rejoindre une équipe » ne s'affiche pas non plus,
car il est conditionné à `gameState?.game` (`AppGL.jsx:872`).

**Pourquoi c'est grave** : ce n'est pas un cas limite, c'est **le premier contact de chaque
élève** avec le jeu, et le seul message que l'application lui envoie est « c'est cassé ».

**Correctif** : un état vide explicite dans `GLGameBoard` (ou en amont dans `GLMapView`)
quand `chapter` est absent — « Ta partie n'a pas encore commencé. Ton professeur va
t'attribuer une équipe. » **et surtout un renvoi vers ce qui est jouable dès maintenant**
(La nature, Le monde G&L, Mon journal), conformément au §5.0 : cet écran est le meilleur
endroit pour apprendre au joueur que le jeu ne se limite pas au plateau. Et **supprimer le
repli `/maps/map-foret.svg`** d'un composant GL : un produit ne doit jamais afficher
l'illustration de l'autre.

#### 5.2.2 🟠 Sur le plateau, le joueur est spectateur — ce qui n'est un problème que parce que le §5.0 n'est pas dit

Le déplacement autonome du joueur exige **toutes** ces conditions
(`useGlGameRuntime.js:510-517`) : réglage `mascotMoveActor === 'players'`, équipe attribuée,
partie `live`, **`!boardMovement.isNumberedPath`**, et pas encore bougé ce tour.

La quatrième est structurante : en mode **repères numérotés** — le mode « plateau de jeu »
classique, celui qui donne son sens au dé — **le joueur ne peut jamais déplacer sa
mascotte**. Seul le MJ le peut, et lui seul peut faire avancer du résultat du dé
(`canDiceAdvancePath` exige `isMjMapControls`, lignes 69-73).

Ce n'est pas un bug : c'est cohérent avec l'animation en classe au vidéoprojecteur, où le
plateau est l'écran **du groupe** et non celui de l'élève. **Lu à travers le §5.0, ce choix
devient même le bon** : le plateau est la surface de la séance ; l'agentivité de l'élève
vit ailleurs — contenus, feuillets, marquage « appris », carnet — et elle est disponible en
permanence.

**Le défaut n'est donc pas la passivité sur le plateau : c'est que rien ne l'explique.** Un
élève qui ne connaît que l'onglet Cartes — celui sur lequel l'application le dépose par
défaut — conclut légitimement que le jeu consiste à regarder, et qu'il ne marche pas quand
la séance est finie.

**Recommandation** : traiter ce point avec le §5.0 plutôt que séparément. Nommer les deux
surfaces dans les profils de séance (« séance projetée » vs « séance sur tablettes ») et
dans `docs/reference/gl/carte-du-royaume.md`. Alternative technique si l'on veut aussi de
l'agentivité **sur le plateau** : autoriser le jet de dé joueur à avancer **sa propre**
équipe sur le chemin numéroté, garde de tour comprise (`last_dice_round_number` existe
déjà).

#### 5.2.3 🟠 Les écrans de chargement sont littéralement invisibles

Le fallback de tous les `Suspense` du shell GL est
`<div className="gl-tab-loading" aria-busy="true" />`, utilisé à **5 endroits**
(`AppGL.jsx:757`, `GLMondeView.jsx:92`, `GLAdventureView.jsx:64`, `GLJoueursView.jsx:62`
et `:67`).

**La classe `gl-tab-loading` n'existe dans aucune feuille de style du dépôt.** C'est donc un
`div` vide, sans hauteur, sans contenu, sans indicateur. Quand un élève ouvre « Mon
journal » ou « Histoire » (chargés en `lazy`), il voit **une page blanche** jusqu'à
l'arrivée du chunk. Sur le Wi-Fi d'un établissement, plusieurs secondes de « rien ».

**Correctif** : quelques lignes de CSS (squelette ou indicateur + libellé « Chargement… »)
et un `role="status"`. Probablement le meilleur rapport effort/perception de tout ce
document.

#### 5.2.4 🟡 La bannière d'erreur est muette pour les lecteurs d'écran et ne se ferme pas

`GLAppBanners.jsx:28` : `{error ? <div className="gl-error-banner">{error}</div> : null}`.

Toutes les autres bannières du même fichier portent `role="status"` (aperçu joueur,
impersonation, mode découverte). **La seule qui compte vraiment n'en a pas** : elle n'est
pas annoncée. Elle n'a pas non plus de bouton de fermeture et reste affichée jusqu'à ce
qu'une autre action appelle `setError('')`. Correctif : `role="alert"` + bouton de
fermeture.

#### 5.2.5 🟡 Le refus d'abonnement temps réel n'est écouté par personne

Le serveur émet `gl:game:subscription-refused` avec un message clair
(`lib/realtime.js:161-165, 177-180`). **Aucun code client n'écoute cet événement** (vérifié
sur tout `src/`). Un joueur dont l'abonnement est refusé perd silencieusement le temps réel :
sa carte se fige, personne ne le lui dit, et il ne l'apprendra qu'en rechargeant la page.
Branche de protocole morte → soit on l'écoute, soit on supprime l'émission.

### 5.3 Trois tensions de game design à trancher

#### 5.3.1 Le nom du jeu et son contenu

Déjà identifié (registre `INCOHERENCES.md`, point G1), corpus narratif **rédigé**
(`lore-deux-peuples.md` : gnomes = observation, licornes = récit, transformation à chaque
seuil de biome). Il reste à **coller ce corpus dans les contenus** — action MJ/admin, pas
action de code. C'est le point le plus rentable du chantier éditorial : le socle existe, il
dort.

#### 5.3.2 Le verrou de 3 jours après une mauvaise réponse

Quand le conditionnement par QCM est activé, une **mauvaise réponse verrouille la ressource
entière pendant 3 jours par défaut** (`lib/settings.js:348-354`,
`gating.retry_cooldown_days` côté GL, migration `165`).

La documentation le dit honnêtement, donc ce n'est pas un piège caché. Mais pour du
**cycle 3 (9-12 ans)** avec en général **une séance par semaine**, un verrou de 3 jours
signifie en pratique : _l'élève qui se trompe est exclu de ce contenu pour toute la séance,
et souvent pour la suivante._ C'est l'inverse du message pédagogique du jeu (« apprendre =
restaurer »), et cela punit précisément l'élève qui en aurait le plus besoin.

**Recommandation** : passer le défaut à **0 jour** (verrou désactivé), ou à un délai en
**minutes** plutôt qu'en jours. Le réglage accepte déjà 0 — il ne s'agit que de changer la
valeur par défaut et l'aide associée. Garder le mécanisme, changer son curseur.

#### 5.3.3 Les cœurs et les gemmes portent trois rôles

Jauge de vie/pouvoir + monnaie d'échange + coût/récompense de contenu. La doc le signale
elle-même. Ajout de cet audit : **le plafond à 99 détruit de la valeur en silence** (§6.4).

---

## 6. Ce qui est à consolider — par ordre de risque

### 6.1 🔴 Le temps réel ne passe pas à l'échelle « une classe » — et le coût croît pendant la séance

**Aucune PR ouverte ne traite ce point.** C'est le risque technique n°1 restant. Trois
défauts qui se **multiplient** entre eux.

**(a) Chaque événement provoque un rechargement complet de l'état chez tous les clients.**

`useGlGameRuntime.js:240-269` : à la réception de **n'importe quel** `gl:game:event`, le
client appelle `reloadGame()` (ligne 268) — un `GET /api/gl/games/:id` complet. Avec 30
élèves connectés, **une** action du MJ déclenche **30** requêtes.

**(b) Cette requête relit et renvoie l'intégralité du journal de la partie.**

`readGameState` (`lib/gl/gamesRuntime.js:99`) exécute 8 requêtes, dont :

```sql
SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
  FROM gl_game_events
 WHERE game_id = ?
 ORDER BY id ASC          -- aucun LIMIT  (lignes 156-162)
```

puis `replayGameEvents(eventsRaw, …)` (ligne 203) rejoue **tout** le journal et reconstruit
une `timeline` complète. Le résultat contient donc le journal **deux fois** : `events`
(ligne 234) **et** `replay.timeline` (ligne 237).

Or des événements sont écrits pour presque tout : déplacement, jet de dé, réponse QCM,
narration, score, changement de tour, début de manche, lancement de sort, changement de
vitalité, présentation de contenu, découverte de feuillet. Une séance d'une heure avec 6
équipes produit facilement **plusieurs centaines à quelques milliers** de lignes.

**(c) Personne n'utilise ces données.**

- `replay` : **aucun consommateur** dans `src/`. Vérification faite sur tout le dépôt : les
  seuls fichiers qui le référencent sont `tests/gl-game-events-replay.test.js` et
  `tests/gl-marker-effect-auto-move.test.js`. Il est calculé et sérialisé **pour rien** en
  production.
- `events` : un seul consommateur, `useGLMascotStateMachine.js:31-32`, qui ne lit que
  **`events[events.length - 1]`** — le dernier événement… lequel **vient précisément
  d'arriver par le socket**.

**L'effet composé.** Le coût par requête croît **linéairement** avec le nombre d'événements
déjà produits, et le nombre de requêtes croît lui aussi avec ce nombre. La charge d'une
séance est donc **quadratique dans sa durée** : la fin de séance est bien plus lourde que le
début — exactement le pire moment pour ralentir.

**(d) Le plafond de débit est partagé par tout l'établissement.**

`lib/rateLimit.js:109-116` : **1200 requêtes/minute/IP** sur `/api/*`. Une classe entière
est derrière **une seule IP publique** (NAT de l'établissement) — le dépôt en a conscience,
`load/artillery-10vu.yml` est explicitement construit là-dessus. Avec l'amplification (a),
une vingtaine d'actions MJ par minute × 30 clients = 600 requêtes/minute **rien que pour
les rechargements**, plus les actions propres des élèves et les utilisateurs ForetMap de la
même IP. Le budget est atteignable, et le mode de défaillance est le pire possible :
**429 pour toute la classe en même temps**.

**(e) Le test de charge ne teste pas le chemin chargé.**

`load/artillery-gl.yml` n'appelle que `/api/health`, `/api/gl/auth/config`, `/api/version`
et un login. **`GET /api/gl/games/:id` n'y figure pas.** Le seul endpoint qui pose problème
est le seul qui n'est pas mesuré — ce qui explique qu'il n'ait pas encore été vu.

**Plan de correction, par ordre de rendement :**

1. **Retirer `replay` de la réponse HTTP** (garder la fonction, appelée par les tests). Gain
   immédiat : moitié du corps de réponse et tout le coût CPU du rejeu. _Aucun test de
   contrat ne l'assert_ — vérifié.
2. **Borner `events`** (`ORDER BY id DESC LIMIT 50` puis inversion) ou, mieux, supprimer le
   champ et alimenter `useGLMascotStateMachine` avec le **dernier événement reçu par le
   socket**, déjà disponible gratuitement.
3. **Ne pas recharger tout l'état à chaque événement** : appliquer le delta du socket
   (`move`, `score`, `turn_change` portent déjà leur charge utile), ne recharger
   intégralement que sur `game_status` ou dérive détectée, et coalescer les rafales par un
   dé-rebond de quelques centaines de millisecondes.
4. **Ajouter `GET /api/gl/games/:id` au scénario de charge GL**, avec un journal pré-rempli
   de plusieurs centaines d'événements — sinon le test restera aveugle au défaut.

Les points 1 et 2 sont des lots courts, sans changement fonctionnel, et couvrent l'essentiel
du gain.

### 6.2 ✅ L'intégrité du QCM — constat confirmé, correctifs déjà écrits mais non fusionnés

Deux défauts **présents sur `main`** aujourd'hui :

**(a) La bonne réponse voyage en clair jusqu'au navigateur.** `lib/glQcmChoices.js:47-56`
signe un JWT contenant `correctChoiceId`, renvoyé tel quel au client
(`routes/gl/qcm.js:229-230`, idem `lore.js` et le flux plateau) puis relu par
`GLQcmPopover.jsx:76`. **Un JWT n'est pas chiffré** : sa charge utile est du base64.
N'importe quel élève sachant ouvrir les outils de développement peut lire la bonne réponse
**avant de répondre**. Dans une classe de cycle 3, il suffit d'un seul.

**(b) Le jeton est rejouable.** `verifyPresentationAnswer` (lignes 72-106) vérifie la
signature, le `kind` et le `questionCode` — **aucun usage unique**. Pendant 15 minutes
(`PRESENTATION_TTL`), le même jeton peut être renvoyé indéfiniment, et
`routes/gl/games/qcm.js:171-186` accorde **+1 au score de l'équipe à chaque fois**.

**Ces deux points sont exactement l'objet des PR #277 et #275** (§2.2), toutes deux
complètes, testées et documentées. **Il n'y a rien à concevoir : il y a à fusionner.**

Reste **un point que ces PR ne traitent pas** : une équipe de 5 qui répond à la même
question du plateau marque mécaniquement +5, puisque chaque joueur obtient sa propre
présentation. Il faut trancher la règle — « une question du plateau rapporte des points
**par équipe**, pas par joueur » — et l'appliquer côté serveur (clé d'unicité
`(gameId, teamId, questionCode)` sur l'attribution de score).

### 6.3 🟠 Une requête de glossaire inutile à chaque réponse au QCM

`routes/gl/games/qcm.js:188-194` : la table de glossaire **entière**
(`WHERE statut = 'actif'`) est lue **avant** de savoir si le résultat servira — les termes
ne sont utilisés que si `verification.correct` (ligne 195). Une mauvaise réponse paie donc
un balayage complet de table pour rien, et une bonne réponse le paie sans cache.

Correctif : déplacer la requête dans la branche `if (verification.correct)` et mémoriser le
résultat (le glossaire change rarement). Deux minutes de travail, sur un chemin appelé une
fois par élève et par question.

### 6.4 🟠 L'économie perd de la valeur en silence au plafond de 99

`lib/glVitality.js:33-34` applique `clampVitality` (lignes 3-7, `VITALITY_MAX` = 99)
**après** l'addition. Dans un échange de Marché, si le receveur est à 95 cœurs et en reçoit
20 : le donneur en perd 20, le receveur en gagne 4, **16 disparaissent** — et l'échange
s'affiche comme « complété », sans le moindre avertissement.

Les écrans avertissent bien le **dépensier** (« il te restera N », correctif de 2026-07)
mais jamais le **receveur** du dépassement. Pour des élèves qui négocient, c'est vécu comme
une triche de l'application.

**Correctif** : dans `settleTradeInTx`, calculer le dépassement avant application et soit
refuser l'échange (`409` + « X ne peut pas recevoir plus de N cœurs »), soit l'afficher dans
l'aperçu des deux côtés. La première option est la plus lisible pour des enfants.

### 6.5 🟠 Sécurité de la page — CSP quasi absente

`server.js:127-131` : `helmet({ contentSecurityPolicy: false, … })`, et la seule directive
posée est `img-src` (`server.js:199-200`). Il n'y a **ni `default-src`, ni `script-src`, ni
`frame-ancestors`, ni `object-src`**.

L'assainissement du Markdown (§4.2) est bon, ce qui rend le risque **actuel** faible. Mais
la CSP est la ceinture qui rattrape la bretelle, et la surface d'écriture des élèves ne fait
que grandir (forum, journal, articles avec images, encarts).

**Correctif progressif, sans casser la SPA** : commencer par les directives sans risque —
`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` —
puis, une fois les polices auto-hébergées (§6.6), poser `default-src 'self'` en
`Content-Security-Policy-Report-Only` avant de basculer.

### 6.6 🟠 Polices Google en CDN — performance de première ouverture et RGPD

`gl.html:6-11` et `index.vite.html:31-36` chargent leurs polices depuis
`fonts.googleapis.com` / `fonts.gstatic.com` via une feuille de style **bloquant le rendu**.

- **Performance** : sur le réseau d'un établissement (filtrage, latence, DNS lent), le
  premier affichage attend une ressource tierce. C'est la pire dépendance possible quand 30
  tablettes démarrent en même temps.
- **Conformité** : application scolaire française, utilisateurs **mineurs**. Le CDN Google
  Fonts transmet l'adresse IP du client à un tiers — sujet régulièrement soulevé par les
  autorités européennes de protection des données. Ce n'est pas théorique dans un contexte
  lycée.

**Le dépôt sait déjà faire** : la police emoji est auto-hébergée
(`public/fonts/noto-color-emoji.woff2`) avec un script dédié (`npm run fonts:sync-noto-emoji`).
Il s'agit d'appliquer la même recette à Caudex/Cinzel (GL) et Playfair Display/DM Sans
(ForetMap). Effort faible, triple gain : performance, conformité, et CSP possible ensuite.

### 6.7 🟡 GL n'a pas la résilience réseau de ForetMap

ForetMap est une PWA : `manifest.json`, `sw.js`, enregistrement du service worker avec
gestion de mise à jour (`src/main.jsx:18-40`). **GL n'a ni manifeste, ni service worker**
(`gl.html` — aucune référence).

Conséquence en classe : une coupure Wi-Fi de quelques secondes est absorbée côté ForetMap et
brutale côté GL. Et GL ne peut pas être « installé » sur une tablette, alors que c'est
précisément l'usage visé.

C'est une **asymétrie de plus** entre les deux produits — dans le sens inverse de celle
qu'analyse `PARTAGE_FM_GL.md` (qui documente ce que GL a et que ForetMap n'a pas). Cet axe
mériterait d'y être ajouté.

### 6.8 🟡 Poids du chargement initial

Pour un joueur GL : `gl.js` **344 Ko** + `gl.css` **122 Ko** + `react-vendor` **190 Ko** +
un chunk partagé de **116 Ko** (nommé `usePrefersReducedMotion-*`, ce qui trahit un découpage
`manualChunks` ne segmentant pas selon l'intention) ≈ **770 Ko non compressés** avant la
première image du plateau. S'y ajoute `visitMascotPackExtras.css` à **165 Ko** — une feuille
de style de 165 Ko est un signal en soi.

Ce n'est pas critique (gzip aide beaucoup), mais sur 30 tablettes simultanées c'est le
second facteur de lenteur perçue après les polices.

**Pistes** : confirmer sur le graphe réel que `GLContentsAdminView` (**215 Ko**, écran
d'administration) n'est jamais dans le chemin d'un joueur — il est bien en `lazy`
(`AppGL.jsx:48-50`) ; revoir les `manualChunks` pour que les noms reflètent des domaines ;
auditer les 165 Ko de CSS de packs mascotte.

---

## 7. Qualité, tests et CI

### 7.1 Le volume est là

| Domaine                       | Volume                       |
| ----------------------------- | ---------------------------- |
| Tests backend (node:test)     | **325 fichiers**, ~47 400 l. |
| Tests UI (Vitest)             | **401 fichiers**, ~37 300 l. |
| e2e (Playwright)              | **41 scénarios**, ~5 900 l.  |
| Code produit (routes+lib+src) | ~197 000 l.                  |

Un ratio tests/code d'environ **0,45**, pour un projet de cette nature, est très bon. Et les
PR de correctifs livrent systématiquement leurs tests (§2.2) — la règle « tests dans le même
lot que le code » est réellement appliquée.

### 7.2 🟠 Le filet e2e ne retient rien

`.github/workflows/ci.yml`, étape « Run Playwright smoke e2e » : **`continue-on-error: true`**,
avec ce commentaire :

> La suite Playwright complète ne tient pas dans le budget CI (timeout global) et reste
> instable en headless : on ne bloque plus le job `test` dessus.

Autrement dit : **les 41 scénarios qui décrivent les parcours joueur réels — connexion,
plateau, QCM, marché, journal, dé, socket — ne bloquent aucune fusion.** Ils tournent, et
leur échec est ignoré.

C'est cohérent à court terme (une CI rouge en permanence ne sert à rien) et **dangereux à
moyen terme** : les scénarios non bloquants pourrissent, et le jour où on en aura besoin ils
seront tous rouges pour de mauvaises raisons. Les trois quarts des ruptures d'expérience de
la §5.2 sont exactement ce qu'un e2e verrait.

**Recommandation** : découper la suite. Un **sous-ensemble « parcours critiques »** — 5 à 8
scénarios choisis pour leur stabilité — qui **bloque** la CI ; le reste en
`continue-on-error`, exécuté la nuit (`schedule`). Mieux vaut 6 scénarios qui font foi que
41 qui ne font autorité sur rien.

### 7.3 🟠 Le hors séance n'est couvert par aucun scénario

Angle mort plus grave encore que le précédent, parce qu'il n'est pas un choix : la fixture
GL crée toujours la partie avec `status = 'live'` en dur
(`e2e/fixtures/gl.fixture.js:22-23`) et affecte immédiatement le joueur à une équipe.

**Les 41 scénarios décrivent donc un seul régime de jeu sur les deux** (§5.0), et ne
rencontrent jamais l'écran d'accueil d'un élève sans équipe (§5.2.1). Ajouter deux
scénarios — « joueur sans équipe » et « joueur hors séance (partie `ended`) » — vaut
probablement plus que dix scénarios supplémentaires en séance, et ils appartiennent au
sous-ensemble bloquant recommandé ci-dessus.

### 7.4 Ce que la CI garde correctement

`lint` → `format:check` → `test:ui` en job parallèle sans MySQL, puis backend + couverture +
build en job avec MariaDB : le découpage est intelligent (le job `quality` ne paie pas les
40 s de démarrage de la base). Les commentaires expliquent chaque choix non évident
(`health-start-period`, `NODE_ENV=production` pour servir `dist/`). Cette CI a été pensée,
pas copiée.

---

## 8. Signaux de process

### 8.1 L'architecture front de GL — le passe-plat

`GLMapView.jsx` est un composant de **119 lignes qui ne fait que transmettre ~50 propriétés**
à `GLGameBoard`, lequel les redéclare toutes (`GLGameBoard.jsx:42-94`). Toute nouvelle
option de gameplay doit être écrite **quatre fois** : `useGlGameRuntime` → `AppGL` →
`GLMapView` → `GLGameBoard`.

Ce n'est pas urgent, mais c'est le frein principal à l'évolution du plateau. Un contexte
React (`GLGameplayContext`) regroupant les drapeaux dérivés (`canMoveMascot`, `turnsEnabled`,
`canRollDice`, `showPlateau*`…) supprimerait deux étages. À faire **avant** le prochain gros
lot de gameplay, pas après.

### 8.2 `AppGL.jsx` reste le carrefour

1108 lignes, ~25 `useState`, l'orchestration de toutes les fenêtres surgissantes, de la
musique, des cibles de navigation profonde et des permissions. `useGlGameRuntime` (609 l.) a
déjà été extrait — c'était le bon geste. Extractions restantes évidentes : les cibles de
focus (6 `useState` + un `switch`) dans un `useGlDeepLinkFocus`, et le bloc musique de zone
(5 `useState`/`useEffect`) dans un `useGlZoneMusicRuntime`.

### 8.3 Le `CHANGELOG` et le versionnage

**528 Ko**, une section `[Non publié]` qui accumule depuis longtemps, `package.json` à
**1.88.0** sans release formelle correspondante. La traçabilité est irréprochable — chaque
lot est raconté avec ses causes et ses arbitrages, ce qui est précieux. Mais un fichier de
528 Ko n'est plus consulté par un humain, « où en est le produit ? » n'a plus de réponse
courte, et **la tête de ce fichier est le principal point de conflit des 26 PR ouvertes**
(§2.3).

**Recommandation** : figer une release, archiver l'historique ancien dans
`CHANGELOG.archive.md`, ne garder que les 3 à 5 dernières versions, et déplacer le bump de
version hors des branches. La règle existe déjà dans `docs/VERSIONING.md` — c'est son
application qui a dérivé.

### 8.4 La surface d'outillage

74 scripts dans `scripts/`, ~120 entrées `scripts` dans `package.json`, 65 documents dans
`docs/` dont **9 audits antérieurs** (celui-ci fait le dixième). Chacun se justifie pris
isolément ; l'ensemble demande un effort d'orientation réel à tout nouvel arrivant. Un
`docs/README.md` d'aiguillage — quel document pour quelle question, lesquels sont
historiques — coûterait une heure.

**Et surtout** : produire un dixième audit n'a de valeur que si les neuf premiers ont été
suivis d'effet. Le §2 suggère que ce n'est pas le cas — le goulot n'est pas le diagnostic.

---

## 9. Plan d'action proposé

Classé par **rendement**, pas par difficulté.

### Lot 0 — Vider la file de correctifs (préalable à tout le reste)

0. **Activer `include_drafts` sur la planification horaire d'`auto-resolve-conflicts.yml`**
   — une ligne, et la file redevient fusionnable toute seule. Puis décider du sort des 26 PR
   ouvertes ; fusionner par lots thématiques en commençant par la sécurité (#277, #275, puis
   #284, #285, #286, #276, #272, #267) ; déplacer le bump de version hors des branches pour
   supprimer la cause première des conflits. _(§2.3, §2.4)_

### Lot 1 — Rendre les deux régimes visibles (le lot le plus structurant côté joueur)

1. **Routage d'arrivée selon le régime** : sans partie `live`, l'onglet d'arrivée n'est plus
   Cartes. _(§5.0-1)_
2. **Indicateur d'état permanent** dans le chrome joueur : « Séance en cours » / « Hors
   séance — tu peux continuer à explorer, apprendre et retrouver des feuillets ». _(§5.0-2)_
3. **Plateau hors séance : expliquer au lieu de ne rien faire** — message + liens vers ce
   qui est jouable maintenant. _(§5.0-3)_
4. **Trancher le cas « appris sans équipe »** : acquisition de feuillets possible hors
   partie, ou message explicite. Aujourd'hui l'échec est silencieux
   (`routes/gl/learning.js:132-133`). _(§5.0-5)_
5. **Aide contextuelle** : retirer la consigne d'administration des 26 entrées de
   `data/gl/help.default.json`, puis les réécrire pour le joueur — à croiser avec le
   chantier OLU. _(§5.0-4)_
6. **Documenter les deux régimes** dans `docs/reference/gl/`. _(§5.0-6)_

### Lot 2 — Les premières secondes du joueur (petit, très rentable)

7. État vide explicite du plateau quand il n'y a pas de partie, **avec renvoi vers le hors
   séance** ; suppression du repli `/maps/map-foret.svg` côté GL. _(§5.2.1)_
8. Styles réels pour `gl-tab-loading` + `role="status"`. _(§5.2.3)_
9. `role="alert"` et bouton de fermeture sur la bannière d'erreur. _(§5.2.4)_
10. Écoute de `gl:game:subscription-refused` (ou suppression de l'émission). _(§5.2.5)_

### Lot 3 — Charge : le trio à coût quasi nul

11. Retrait de `replay` de la réponse `GET /api/gl/games/:id`. _(§6.1)_
12. `events` borné ou supprimé ; `useGLMascotStateMachine` alimenté par l'événement socket.
    _(§6.1)_
13. Requête de glossaire déplacée dans la branche « bonne réponse ». _(§6.3)_
14. `GET /api/gl/games/:id` ajouté au scénario Artillery GL, avec journal pré-rempli. _(§6.1)_

### Lot 4 — Intégrité du jeu (au-delà du lot 0)

15. Règle « une question du plateau rapporte des points **par équipe** » appliquée côté
    serveur. _(§6.2)_
16. Dépassement du plafond 99 refusé ou affiché dans l'échange. _(§6.4)_

### Lot 5 — Réseau et conformité

17. Auto-hébergement des polices (même recette que la police emoji). _(§6.6)_
18. CSP progressive : `frame-ancestors`/`object-src`/`base-uri`/`form-action`, puis
    `default-src` en Report-Only. _(§6.5)_
19. Manifeste + service worker pour GL, alignés sur ForetMap. _(§6.7)_ — d'autant plus
    justifié que le hors séance implique un usage **hors du réseau de l'établissement**.

### Lot 6 — Arbitrages produit (décision avant code)

20. Défaut du verrou de re-tentative : 3 jours → 0 (ou minutes) — d'autant plus critique
    hors séance, où personne n'est là pour débloquer l'élève. _(§5.3.2)_
21. Mode « repères numérotés » : assumer le plateau comme surface de séance et le
    documenter, **ou** rendre le jet de dé joueur agissant. _(§5.2.2)_
22. Intégrer le corpus « Les deux peuples du seuil » dans les contenus du jeu. _(§5.3.1)_

### Lot 7 — Dette structurelle (avant le prochain gros lot de gameplay)

23. `GLGameplayContext` pour supprimer le passe-plat `AppGL` → `GLMapView` → `GLGameBoard`.
    _(§8.1)_
24. Sous-ensemble e2e « parcours critiques » **bloquant** en CI, reste en nocturne — dont
    **un parcours hors séance**, aujourd'hui couvert par aucun scénario. _(§7.2)_
25. Release formelle + archivage du `CHANGELOG`. _(§8.3)_

---

## 10. Ce que cet audit n'a pas couvert

Par honnêteté sur la portée :

- **Aucune exécution.** Pas de base MySQL ni de dépendances installées dans l'environnement
  d'audit : les tests, le lint et le build **n'ont pas été rejoués**. Les constats de charge
  sont des lectures de code et des raisonnements de complexité, **pas des mesures**. Le lot 2
  devrait être mesuré avant/après.
- **Les PR ouvertes n'ont pas toutes été lues.** Seules **#275** et **#277** ont été
  examinées ligne à ligne. Les autres sont caractérisées par leur titre et leur date ; leur
  contenu réel reste à vérifier avant fusion — le §2 dit qu'il faut les traiter, pas qu'il
  faut les fusionner les yeux fermés.
- **Le côté ForetMap élève** n'a été parcouru qu'en surface (structure, tailles, frontière
  d'erreur, PWA). `docs/AUDIT_UX_ELEVE.md` couvre ce terrain ; il gagnerait à être re-daté.
- **Les écrans d'administration et le studio de cartes** (GL : ~4 500 lignes à eux seuls)
  n'ont pas été audités en profondeur — hors du périmètre « côté joueur ».
- **Aucune revue de contenu pédagogique** (justesse des fiches espèces, des QCM). Voir
  `docs/RAPPORT_VALIDITE_SCIENTIFIQUE_PLANTS.md`.

---

## 11. Pour aller plus loin

[Registre d'arbitrage](reference/INCOHERENCES.md) · [Partage FM/GL](PARTAGE_FM_GL.md) ·
[OLU narrateur](MASCOT_NARRATEUR_OLU.md) · [Architecture GL](GL_ARCHITECTURE.md) ·
[Évolution](EVOLUTION.md) · [Versionnage](VERSIONING.md) ·
[Doc de référence](reference/README.md)
