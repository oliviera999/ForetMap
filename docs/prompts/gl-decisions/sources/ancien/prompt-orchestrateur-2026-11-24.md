# Prompt orchestrateur Claude Code — G&L : décisions du 19/11, partie 16, simplifications du 23/11 (chantier en lots)

> **Dépôt** `oliviera999/ForetMap`. Écrit le 23 novembre 2026 au soir sur `main` = prod = **v1.263.5**, commit
> `b8b5344` (`chore(release): v1.263.5 [skip bump]`), vérifié à 18 h 40 (heure de Casablanca). Aucune branche
> `claude/gl-decisions*` ni `claude/gl-mascotte*` n'existe à cette heure.
> **Revu et recalé le 23/11 à 20 h 30** (même commit, prod au même niveau, aucune branche du chantier, 19 catalogues
> sans écart ; gardes des migrations des étapes 19 et H3 vérifiées en prod) : catégorie `histoire` créée par la
> migration du lot H (sans elle, les 12 questions étaient perdues en silence), fuite de l'épilogue par le journal,
> bilan Team Spirit qui efface les retraits (étape 29, lot 3), ordre des lots selon le chemin critique, lot 6 sans
> attente, cinq reprises, texte de `olu-pf-marche`, question différente après le délai d'une heure.
> **Complété le 24/11 à 9 h 45** (clone recalé : `main` toujours sur `b8b5344`) : **étape 30**, une question ne se lit
> plus avec sa réponse visible sur le plateau derrière ou à côté (signalé par Oliv le 24/11), au lot 6.
> **Ajout du 24/11 à 9 h 50** (`main` toujours en `b8b5344`, aucune branche du chantier) : **lot B**, onglets des
> biomes (bug signalé par Oliv le 24/11 : sur les plateaux à deux biomes, tout le texte tombe dans le premier
> onglet). Correctif d'affichage, un utilitaire, indépendant des autres lots (étape B1).
> **Ajout du 24/11 à 12 h 30** (`main` et prod toujours en `b8b5344` / v1.263.5) : **étape 24 quinquies** au lot 2,
> questions de zone et questions de case qui se lisent sur le plateau (décision 34 ; les décisions 28 à 33 et l'étape 24 quater sont celles de l'addendum 3 ; contenu dans
> `claude/Questions_zones_P2_P4_GL_2026-11-24.md` du projet, appliqué en prod par le connecteur, pas par une session).
> **Mis à jour le 24/11 vers 12 h** : les données de la décision 34 sont **passées en prod** par le connecteur le
> 24/11 vers 11 h 55, sur feu vert d'Oliv (28 questions de zone des plateaux 2 à 4 réécrites, dix questions de case à
> `usage_tenir = 0`, relues en prod) ; décision 34, étape 24 quinquies, § 5bis, § 6 et § 10 alignés ; § 10 : ne plus
> réimporter le corpus QCM depuis le tableur (point 5 ter). L'addendum 1 appelle cette étape « 24 quinquies-Z » : l'addendum 4
> a pris le même numéro pour les rôles échangés (« 24 quinquies-R »).
> **Recalé le 24/11 à 12 h 35, après les quatre addenda** (Oliv, 12 h 12 : « Orchestrateur a la priorité ») :
> section **§ 00.8 Les addenda** (ordre de collage, priorité de ce prompt, lecture des numéros en double) ; ce prompt
> reprend ce que les addenda changeaient dans son propre texte : gel levé (§ 1), ordre, plafond et lots des addenda
> (§ 00.3), étiquettes de migration (§ 00.2), ordre du lot 2, péripéties (étape 24), rôle de la sonde (étape 35), § 6
> et § 9.
>
> **Ajout du 24/11 à 12 h 15** (`main` et prod toujours en `b8b5344` / v1.263.5, aucune branche du chantier) :
> **décision 37** (question de case : une case de plus, trois sous le voile, et une **sonde** du plateau), qui
> ajuste D1 ; **lot Q** (étapes 19, déplacée du lot 5, et 35) ; **règle des numéros de migration corrigée**
> (§ 00.2, point 3) : le curseur unique `schema_version` de la prod saute en silence une migration fusionnée après
> une migration de numéro plus haut, ce que des numéros attribués d'avance à des lots fusionnés dans le désordre
> auraient provoqué.
>
> **Ajout du 24/11 à 12 h 40** (`main` et prod toujours en `b8b5344` / v1.263.5) : la **décision 42** (coquilles et
> garde-fous du carnet de Sélène, liasse de fin de Sélène remise avec le double fond) est dans l'**addendum 3**, lot C,
> étapes C1 ter et C4 bis ; elle fait foi sur le § 6 ci-dessous (accent de Sélène).
>
> **Modèle : Opus, effort élevé**, pour la session orchestratrice comme pour chaque session de lot (le lot B se
> contente de Sonnet, effort moyen, si l'outil de lancement permet de choisir).
>
> Ce prompt **remplace** trois prompts du projet claude.ai d'Oliv, jamais lancés : « décisions de l'audit du
> 18/11 » (25 étapes, une PR), « mascottes case par case » (une PR) et « réécriture de toute la documentation »
> (une PR, à passer après les deux autres). Leur contenu est repris ici en entier, augmenté des décisions d'Oliv
> du 23/11 au soir : **S1** (un seul écran d'équipe, à la place de l'ancienne étape 18), **S2** (deux surfaces),
> **S3** (sort Relance retiré), **docs du prof** entrées au dépôt (par le lot de la documentation).
> S'y ajoute le **lot H** (page Histoire), décidé par Oliv le 23/11 à 18 h 37 : « Marquer comme lu » soumis à une
> question et validé par chaque élève depuis son compte, délai d'une heure gardé mais annoncé, textes corrigés pour
> tenir les garde-fous du récit, questions nouvelles (annexe H), illustrations légendées et mieux placées.
> Puis le **lot B** (24/11) : il absorbe le prompt `PROMPT_Claude_Code_GL_onglets_biomes.md` du projet, qui ne se
> lance plus seul.
>
> **Tu es d'abord la session orchestratrice** : lis le § 00 et suis-le. Une session lancée pour un lot lit le
> § 01, puis la fiche de son lot (§ 4) et les étapes qu'elle cite (§ 5). `dist` ne se committe pas. Le champ
> `version` ne se touche pas.

---

## 00. La session orchestratrice

### 00.1 Ton rôle

- Tu **ne codes pas** et tu ne fais aucun lot toi-même : ton contexte doit tenir tout le chantier. Tu prépares
  (lot 0), tu lances une session par lot, tu suis, tu fusionnes, tu relances ce qui casse, tu rends compte.
- Tu lances **au plus trois sessions de lot en même temps**, dans l'ordre de priorité du § 00.3, chacune dès que
  ses dépendances sont fusionnées sur `main`.
- **Fusion** : tu fusionnes la PR d'un lot dès que (1) son fichier de lot dit `faite`, (2) la PR n'est pas en
  brouillon, (3) **toute la CI est verte**, (4) elle n'a pas de conflit avec `main`. C'est le mode autorisé par
  Oliv le 20/11 pour les chantiers en lots (« merge tout ce qui est possible et on enchaîne »), repris ici.
  Méthode de fusion : celle de `.cursor/rules/foretmap-pr-workflow.mdc`. Jamais de fusion avec une CI rouge ou
  en cours (le 18/11, #664 a fini rouge après une fusion trop tôt).
- Rien ne s'écrit en prod **par toi ni par une session** (connecteur, SQL, réglage, synchronisation de catalogue) :
  c'est Oliv qui synchronise après le chantier (§ 10). **Mais chaque fusion déploie** : le cron de prod récupère
  `dist-artifact/main`, **passe les migrations** et redémarre le serveur (`docs/DEPLOY_DIST_ARTIFACT.md`). Les
  migrations des lots 4, 5 et H s'appliquent donc en prod à leur fusion, et les parties de test d'Oliv (16, 17)
  voient les états intermédiaires du chantier. Ne fusionne pas le **jeudi de 8 h à 15 h** (heure de Casablanca :
  séances de Sciences et technologie des 6e) : attends la fin de ce créneau.
- Ne crée **aucune tâche planifiée** pour relayer les sessions : le 20/11, une session lancée ainsi n'avait ni le
  dépôt ni le droit de pousser, et s'est arrêtée sans rien faire.

### 00.2 Préparation : le lot 0 (toi, sans code)

1. Clone le dépôt (si le clone coupe : `--filter=blob:limit=2m`). Lis `CLAUDE.md`,
   `.cursor/rules/foretmap-pr-workflow.mdc`, `.cursor/rules/foretmap-pr-merge-conflict.mdc`.
2. `git log --oneline -15`, PR ouvertes, branches `claude/gl-*`. Si `main` a bougé depuis `b8b5344` :
   `git log --stat b8b5344..origin/main -- lib/gl* src/gl src/shared/glTenir* routes/gl data/gl/tenir migrations docs/GL_TENIR_A_DEUX_REGLES.md docs/reference/gl`.
   Note dans le fichier d'état ce qui touche un lot ; chaque session revérifie de toute façon ses constats (§ 01).
   Si la branche `claude/gl-mascotte-case-par-case`, `claude/gl-decisions-audit-18nov`, `claude/gl-doc-reecriture`
   ou `claude/gl-onglets-biomes` existe (Oliv a pu lancer un des anciens prompts entre-temps) : arrête-toi avant de
   lancer quoi que ce soit, et dis à Oliv ce qui est déjà fait (lots à marquer `déjà fait`) et ce qui reste ; il
   tranche.
3. Relève le dernier numéro de migration `N` (391 au 23/11). **Les numéros `N+1`, `N+2`… de ce prompt et de ses
   addenda sont des étiquettes provisoires**, pas des numéros de fichier : lot 4 → `N+1` ; lot Q → `N+2` (étape 19)
   et `N+7` (étape 35) ; lot 5 → `N+3` (étape 26, si elle en a besoin) ; lot H → `N+4` ; lot V → `N+5` ; lot C →
   `N+6` ; lot 2 → `N+8` (étape 24 quinquies-R, addendum 4). Les lots B, S, T, P, F et A n'ont pas de migration. **Pourquoi** (lu dans `database.js › runMigrations`, vérifié le 24/11) : la
   prod ne garde qu'un curseur, `schema_version` ; à chaque déploiement, elle saute tout fichier de numéro inférieur
   au curseur, avec un simple avertissement (`recordMigrationFilesAndReportSkipped`). Si le lot H était fusionné
   avant le lot 4 avec des numéros attribués d'avance, la migration du lot 4 ne passerait jamais en prod, alors que
   la CI, qui part d'une base vide, resterait verte. **Règle** : une migration prend son numéro de fichier **au
   moment de la fusion**, strictement au-dessus de la plus haute migration de `main` (§ 01, Fin, point 4, et
   § 00.5). Écris dans le fichier d'état la correspondance étiquette → numéro réel à chaque fusion.
4. Branche `claude/gl-decisions-lot0` depuis `origin/main`. Verse :
   - `docs/prompts/GL_DECISIONS_PROMPT.md` : **ce prompt, mot pour mot** ; ajoute ce chemin à `.prettierignore`
     (comme `docs/prompts/GL_ECRANS_DE_SEANCE_PROMPT.md`) ;
   - `docs/prompts/GL_DECISIONS_ETAT.md` : le plan (tableau du § 00.3 avec une colonne « État » : `à faire`,
     `en cours`, `faite`, `fusionnée (#PR)`, `bloquée`), les numéros de migration, les écarts relevés au point 2,
     et une section « Pour le § 0 des règles » vide ;
   - `docs/prompts/gl-decisions/README.md` : une ligne : « Rapports des sessions de lot du chantier G&L décisions :
     un fichier `lot-<id>.md` par lot, écrit par sa session. »
   Les deux derniers passent `npm run format:check`. Commit, PR « docs(gl): chantier décisions — prompt et état »,
   CI verte, fusion. Les sessions de lot lisent le prompt sur `main`.
5. Pendant le chantier, le tableau du fichier d'état **ne se modifie pas sur `main`** (tu n'as pas de PR pour
   ça) : chaque session écrit son propre `docs/prompts/gl-decisions/lot-<id>.md`, et ton suivi vit dans ton
   contexte et dans les PR. Le lot 8 met le tableau final à jour.

### 00.3 Les lots

| Lot | Titre | Étapes (§ 5) | Charge | Attend | Fichiers principaux (réservés) | Migration |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Versement (toi) | — | très légère | — | `docs/prompts/GL_DECISIONS_*`, `.prettierignore` | — |
| 1 | Moteur du tour | 15, 16, 17 (serveur), 2, 11 | moyenne | 0 | `lib/glTour.js` (`changerPhaseTx`, `tirerErreurDuJour`, `equipeSuivanteTx`, `ajouterLumiereTx`), `lib/glDiagnostic.js`, `src/shared/glMainCore.js` | — |
| 2 | Catalogues et textes | 3, 5, 8, 22 (textes), 23, 24, 24 quinquies | moyenne : beaucoup de fichiers, peu de logique | 0 | `lib/glChasse.js` (`pisteDeReponse`), `lib/glRewardsCatalog.js`, `data/gl/tenir/{chasse-zones,badges,sorts,passeur-plateau4,olu-lignes,peripeties,qcm-feedbacks-zones}.json` et `exemple/`, `src/shared/glTenirCaseEffetCore.js`, `lib/glLoreFeuilletSpeciesReveal.js`, `src/shared/glGardeFousCore.js` (commentaire) | — |
| B | Onglets des biomes | B1 | très légère | 0 | `src/gl/utils/glEcosystemSections.js`, `src/gl/utils/glEcosystemMarkdown.js` (commentaire), `tests-ui/gl/glEcosystemSections.test.js`, `tests-ui/gl/GLEcosystemsView.test.jsx` | — |
| M | Mascottes case par case | annexe A | moyenne | 0 | `src/gl/utils/glBoardHops.js` (nouveau), `useGLBoardMascotMotion.js`, `useGLMarkerArrival.js`, `GLGameBoard.jsx` | — |
| 3 | Portes et surfaces, bilan Team Spirit | 14, 27, 12, 29 | légère | 0 | `GLTenirSettings.jsx`, `GLTenirProfilPanel.jsx`, `routes/gl/games/tenir.js` (profil), `lib/glQcmImport.js`, `GLTeamSpiritPanel.jsx` | — |
| 4 | Trame, Lumière, appareils, Lettre | 6, 7, 4, 10 | moyenne | 1 | `lib/glTrameDefis.js`, `lib/glTour.js` (`ajouterLumiereTx`), `lib/glEquipeEtat.js`, `lib/glTenirOlu.js`, `lib/glVoyageurPlume.js`, `routes/gl/lore.js` | `N+1` |
| 6 | L'erreur d'Olu visible, question sans sa réponse visible | 13, 22 (vent), 30 | moyenne | 0 | `GLProjectionView.jsx`, `GLTenirEcranEquipe.jsx`, `useGlTenirOlu.js`, `glTenirMoment.js`, `src/gl/styles/gl-theme.css` (`.gl-qcm-popover-overlay`), `src/gl/styles/gl-tenir.css` (plateau de l'écran d'équipe) | — |
| 5 | Escalier et règles de séance | 20, 26, 21, 25 | forte | 1, 2 | `lib/glTour.js` (montée de marche), `glTenirEscalierCore.js`, `lib/glEscalier.js`, `lib/glTenir.js` (validateur), `lib/glTenirInvariants.js`, `lib/glJournalPresentTenir.js`, `sorts.json` (SL005), `olu-lignes.json` (olu-41), `GLTourScreen.jsx` (bandeau du tour resté ouvert) | `N+3` si besoin |
| Q | La question de case récompensée : une case, trois sous le voile, une sonde | 19, 35 | moyenne | 1, 2, 5, 6 | `lib/glTour.js` (`bonneReponseDeCaseTx`), `lib/glChasse.js` (`fouillerTx`, `countFouillesUtilisees`, verdict), `routes/gl/games/chasse.js` (`/chasse/fouiller`), vue du tour (`sondesRestantes`), `lib/glTenirInvariants.js`, `lib/glTenirOlu.js` (clé `sonde`), `olu-lignes.json` (`olu-14`, `olu-18`, `olu-pf-sonde`), `glTenirMoment.js`, `GLTenirEcranEquipe.jsx`, `useGlChasse.js` | `N+2`, `N+7` |
| 7 | Au tableau, un seul écran d'équipe | 18 (et le bouton de l'étape 17) | forte, reprise (`bis`) prévue | 1, 3, 5, 6, Q | `src/gl/AppGL.jsx`, `GLTeamSessionView.jsx`, `GLTenirEquipeView.jsx` (supprimé), `GLTourScreen.jsx`, `GLTenirEcranEquipe.jsx`, `useGlTenirEquipe.js`, `lib/glTour.js` (`equipeSuivanteTx`), `GLProjectionView.jsx` (question posée) | — |
| H | Page Histoire : lu par une question, délai annoncé, textes, illustrations | H1, H2, H3, H4 | moyenne | 0 | `GLHistoryView.jsx`, `src/gl/utils/glStorySceneRefs.js`, `GLLearningAcknowledgeButton.jsx`, `src/shared/components/LearningAcknowledgeButton.jsx` et `LearningGatingQuestionPanel.jsx`, `src/shared/utils/learningGatingChallengeClient.js`, `routes/gl/learning.js`, `lib/learningGatingAcknowledge.js`, `lib/shared/{learningAckCore,resourceQuestionGatingCore}.js`, `lib/pedago/gatingProductCatalog.js`, `lib/glMarkerLoreQuestionPool.js`, `routes/gl/chapters.js` et `lib/gl/gamesRuntime.js` (épilogue), `data/gl/histoire/` (nouveau) | `N+4` |
| 8 | Décisions consignées, vérifications complètes | 1, 9 | légère | 1 à 7, B, M, H, Q | `docs/GL_TENIR_A_DEUX_REGLES.md` (§ 0), `docs/AUDIT_*`, `docs/prompts/GL_DECISIONS_ETAT.md` | — |
| 9 | Réécriture de toute la documentation | annexe C (étapes 2 à 6) | forte, reprise (`bis`) prévue | 8 | `docs/GL_TENIR_A_DEUX_REGLES.md` (v4), `docs/reference/gl/*`, `docs/GL_*.md` (alignements), `lib/glReferenceDocs.js`, `.claude/skills/*`, `tests/content/gl-reference-docs-vocabulaire.test.js` (nouveau) | — |

**Lots des addenda** (leurs lignes complètes, avec fichiers réservés, sont dans leurs addenda, § « Où verser ») : S et V
(addendum 2), C (addendum 3), T, P, F et A (addendum 4). Étapes des addenda versées dans les lots de ce prompt : lot 2,
24 bis et QV4 (addendum 1), 24 ter (addendum 2), 24 quater (addendum 3), 24 quinquies-R (addendum 4) ; lot 4, QV2 ;
lot 6, 33 ; lot 7, 31 et 32 ; lot S, S4 ; lot V, QV5. T et P attendent aussi Q ; le lot 8 attend tous les autres lots ;
le lot 9 attend aussi T, P, F et A.

**Ordre de priorité** (quand une place se libère, lance le premier lot prêt) : 1, 2, 3, B, M, 6, 5, Q, 4, 7, H, S, V,
C, T, P, F, A, 8, 9.
C'est l'ordre du **chemin critique** : le lot 7 (le seul qui rend le tableau jouable) attend 1, 3, 5, 6 et Q, le
lot Q attend 5 (même `lib/glTour.js`, même `olu-lignes.json`) et 6 (mêmes écrans), et le lot 5 attend 1 et 2 ; H, B et 4 n'attendent rien et ne bloquent que le lot 8. Au départ, trois sessions : lots 1, 2
et 3 (le lot 3, léger, libère vite sa place ; le lot B, très court, la prend ensuite). Les lots 8 puis 9 se lancent
seuls, chacun quand ce qu'il attend est fusionné : la doc décrit le code fusionné.

**Plafond** : 20 sessions de lot et 6 reprises (`bis`) au plus, soit 26 sessions lancées, lots des addenda compris
(les lots 7 et 9 prévoient déjà une reprise chacun). Au-delà : arrêt, rapport à Oliv.

### 00.4 Lancer une session de lot

- Outil : celui qui lance une session Claude Code **avec le dépôt attaché** (`create_session` ou équivalent ; le
  20/11, c'est ainsi que l'orchestratrice des écrans de séance a lancé ses sessions). Si l'outil permet de choisir
  le modèle et l'effort : Opus, effort élevé (lot B : Sonnet, effort moyen, suffit). Branche indiquée :
  `claude/gl-decisions-lot<id>` (`id` dans 1-9, `b`, `m`, `h` ou `q`).
- Message de lancement, mot pour mot (remplace `<id>` et `<titre>`) :

  > Chantier « G&L décisions » du dépôt oliviera999/ForetMap. Tu es la session du lot <id> (<titre>), et
  > seulement de ce lot. Clone le dépôt et lis `docs/prompts/GL_DECISIONS_PROMPT.md` sur `main` : le § 01
  > (règles des sessions de lot), puis la fiche du lot <id> au § 4 et les étapes qu'elle cite au § 5.
  > Travaille sur la branche `claude/gl-decisions-lot<id>` : crée-la depuis `origin/main`, ou reprends-la si
  > elle existe déjà (c'est une reprise : lis d'abord `docs/prompts/gl-decisions/lot-<id>.md` sur la branche).
  > Écris ton rapport dans ce fichier. Ouvre la PR, ne fusionne rien, ne lance aucune session, puis arrête-toi.
  > Modèle attendu : Opus, effort élevé.

- Si aucun outil de lancement n'existe : écris en tête du fichier d'état (lot 0) « relais manuel », avec les
  messages de lancement des lots 1, 2 et M prêts à copier, et arrête-toi en le disant à Oliv.

### 00.5 Suivre et fusionner

- Sonde les PR et les branches toutes les dix minutes environ (`gh pr list`, `gh pr checks`, `git ls-remote`),
  avec des sorties courtes : ton contexte doit tenir des heures.
- Lot `faite` + CI verte + sans conflit → fusion (§ 00.1), puis lance le lot suivant prêt.
- **Avant chaque fusion d'un lot qui ajoute une migration** : `git fetch` puis compare son numéro à la plus haute
  migration de `origin/main`. S'il n'est pas strictement au-dessus, renumérote-la toi-même sur la branche
  (`git merge origin/main`, `git mv migrations/<ancien>.sql migrations/<nouveau>.sql`, mêmes changements dans les
  tests et docs qui citent le nom), pousse, attends la CI. Note la correspondance dans le fichier d'état. Dans ton
  rapport final, demande à Oliv de lancer `node scripts/db-migration-status.js` sur le serveur après le dernier
  déploiement (aucune migration « en retard »).
- Conflit avec `main` limité à `CHANGELOG.md`, au fichier de lot ou à un doc (`docs/**`) : résous-le toi-même
  sur la branche (`git merge origin/main`, garde les deux côtés, entrées de CHANGELOG empilées), pousse, attends
  la CI. Conflit dans du code ou des données : lance la reprise du lot (`bis`) avec le même message, précédé de
  « Reprise : fusionne `origin/main` et résous le conflit dans <fichiers>. »
- CI rouge sur une PR `faite` : relance la reprise du lot (`bis`), message précédé de « Reprise : la CI de la PR
  #<n> est rouge (<jobs>) ; répare sans élargir le lot. » Les e2e « Voir comme » de `gl-users-admin` sont
  instables sous charge : relance d'abord le job une fois avant de conclure.
- Lot `partielle` (session arrêtée en route, travail vert poussé) : reprise `bis` sur la même branche.
- Session muette (ni commit ni PR sur sa branche depuis 90 minutes) : vérifie qu'elle a bien démarré ; sinon
  relance-la (compte comme une reprise).
- Lot `bloquée` : ne lance plus les lots qui l'attendent ; continue les autres ; dis-le dans le rapport final.

### 00.6 Si c'est toi qui t'arrêtes

Oliv te relance avec ce même prompt. Tu repars de l'état réel : PR fusionnées et ouvertes du chantier, branches
`claude/gl-decisions-lot*`, fichiers `docs/prompts/gl-decisions/lot-*.md` sur `main` et sur les branches. Ne
relance pas un lot dont la branche a bougé depuis moins de 90 minutes. Le lot 0 déjà fusionné ne se refait pas.

### 00.7 Fin du chantier : ton rapport à Oliv

Quand le lot 9 est fusionné (ou que tout ce qui pouvait l'être l'est), ton dernier message dit, court :
- le tableau des lots : PR, état, version de `main` après fusion ;
- les décisions livrées et écartées (avec la raison) ;
- les « choix faits sans demander » (§ 3, plus ceux des sessions) ;
- la section « À relire par Oliv » (textes nouveaux ou changés) ;
- les comptes signalés (tutoiement des cases P2-P4, lignes d'erreur d'Olu par plateau, doublons Passeur / zones,
  péripéties au masculin des autres plateaux) ;
- le banc (Lumière par chapitre, écart de cases au camp, dépense de gemmes : avant / après) ;
- ce qu'Oliv doit faire maintenant (§ 10), dans l'ordre.

### 00.8 Les addenda (24/11)

Quatre addenda complètent ce prompt. Oliv les colle après lui, dans cet ordre ; le lot 0 les verse mot pour mot, à la
suite du prompt, sous « Addenda » dans `docs/prompts/GL_DECISIONS_PROMPT.md` :

1. `claude/Addendum_orchestrateur_lot2_questions_lecture.md` (addendum 1 : décisions QV1 à QV5 ; étapes 24 bis, QV2,
   QV4, QV5) ;
2. `claude/Addendum_orchestrateur_immersion_GL_2026-11-24.md` (addendum 2 : décisions I1 à I10 ; lots S et V ; étapes
   24 ter, 31, 32, 33) ;
3. `claude/Addendum_orchestrateur_copiste_GL_2026-11-24.md` (addendum 3 : décisions 28 à 33 et 42 ; lot C ; étape
   24 quater) ;
4. `claude/Addendum_orchestrateur_direction_artistique_GL_2026-11-24.md` (addendum 4 : décisions 34 à 41 ; lots T, P,
   F, A ; étapes 24 quinquies-R et S4).

**Priorité** (Oliv, 24/11 à 12 h 12 : « Orchestrateur a la priorité ») : en cas de conflit, **ce prompt prévaut** ;
entre deux addenda, le plus récent (4, puis 3, 2, 1). Les phrases des addenda qui les font prévaloir sur le prompt se
lisent ainsi depuis cette date. Ce prompt a repris le 24/11 à 12 h 35 ce que les addenda changeaient dans son texte :
les **décisions** qu'un addendum porte (gel levé, rôles échangés, copiste, table de jeu, questions de validation,
immersion) restent prises ; seul un **détail** que les deux textes décrivent différemment se règle par le prompt.

**Numéros en double** (table de l'addendum 1) : « décision 34 » et « décision 37 » sans précision sont celles de ce
prompt ; celles de l'addendum 4 se citent « 34 (addendum 4) » et « 37 (addendum 4) » ; « 24 quinquies-Z » est l'étape
de ce prompt (questions de zone), « 24 quinquies-R » celle de l'addendum 4 (rôles échangés) ; migrations `N+7` (lot Q)
et `N+8` (lot 2).

**Écart tranché par ce prompt** : la sonde (étape 35) reste au rôle qui répond à la question de case, soit
l'Opératrice ou l'Opérateur depuis l'échange des rôles (décision 35 de l'addendum 4) : l'élève qui vient de répondre
sonde. L'addendum 4 la donnait à l'Éclaireuse ou l'Éclaireur ; sa plaque, au lot T, dit « Opératrice ou Opérateur, à
toi ».

---

## 01. Règles communes aux sessions de lot

### Début

1. Clone, puis `git checkout -b claude/gl-decisions-lot<id> origin/main` (ou reprends la branche existante et
   `git merge origin/main` : jamais de rebase, jamais de `--force`).
2. Lis `CLAUDE.md`, `.cursor/rules/foretmap-pr-workflow.mdc`, `docs/GL_TENIR_A_DEUX_REGLES.md` (règles v3, elles
   font foi) et, selon ton lot, `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md` (§ 4 et § 5.2),
   `docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md` (ce que les écrans de séance ont posé). Charge les skills du dépôt
   `gl-tenir-garde-fous`, `gl-tenir-catalogue`, `gl-tenir-moteur`, `gl-banc` (et `foretmap-docs-reference` si tu
   touches `docs/reference/`).
3. **Revérifie chaque constat de tes étapes sur le code actuel** (les numéros de ligne datent de `b8b5344`). Un
   constat déjà corrigé : n'y touche pas, écris « écarté : déjà corrigé » dans ton fichier de lot.
4. Base locale : MariaDB (`mysqld_safe`), `npm ci --ignore-scripts`, `npm run db:init`, `.env` avec `DB_*` et
   `JWT_SECRET`. `npm test` et `npm run test:ui` doivent être verts **avant** que tu commences ; sinon, note-le et
   répare seulement si c'est sur ton chemin.

### Pendant

- Un commit par étape, tests verts à chaque commit. Reste dans ton lot : une étape d'un autre lot ne se fait pas
  « en passant », même triviale.
- Touche le moins possible aux fichiers réservés d'un autre lot (§ 00.3). Si tu dois y toucher, une modification
  minimale, et dis-le dans ton fichier de lot.
- **Docs** : mets à jour, dans ton lot, les docs du sujet que tu changes (§ 7) : les règles (hors § 0) et
  `docs/API.md` pleinement ; dans `docs/reference/gl/`, seulement la phrase qui deviendrait fausse, sans
  restructurer (le lot 9 réécrit toute la doc de référence). **Le § 0 des règles et les `docs/AUDIT_*` ne
  s'écrivent qu'au lot 8** : une étape qui demande une ligne au § 0 → recopie cette ligne dans
  ton fichier de lot, section « Pour le § 0 des règles ».
- Données : un JSON par catalogue dans `data/gl/tenir/`, import tolérant. Aligne les copies `exemple/` quand un
  test y lit le texte que tu changes.
- `src/shared/*` est la source ; `lib/shared/*` est un miroir régénéré par le build : n'y touche jamais.
- Migrations : idempotentes, au numéro attribué dans `docs/prompts/GL_DECISIONS_ETAT.md`.
- Captures : `docs/captures/gl-decisions/lot-<id>/`. Là où une étape dit « dans la PR », lis « dans ton fichier de
  lot et la description de ta PR ».
- Si ton contexte sature : committe ce qui est **vert**, écris dans ton fichier de lot l'état `partielle` et ce qui
  reste, étape par étape, pousse, ouvre la PR **en brouillon**, arrête-toi. L'orchestratrice lancera la reprise.

### Fin

1. Vérifications du § 8 utiles à ton lot (au minimum lint, format, `test:ui`, `npm test`, `test:content` si tu
   touches des données ou des textes, build, e2e G&L touchés) : **toutes vertes**.
2. Relecture : sous-agent `gl-relecteur-garde-fous` sur le diff des textes et des JSON ; `gl-relecteur-science`
   en plus si du contenu scientifique change (lots 2 et 6 au moins). Corrige ce qu'ils relèvent, ou explique.
3. `CHANGELOG.md` sous `[Non publié]` : **ta propre entrée**, au-dessus des précédentes : « Modifié — G&L :
   décisions et partie 16, lot <id> (<titre>) » (le lot M : « Corrigé — G&L : les mascottes sautent de case en
   case » ; le lot B : « Corrigé — G&L : chaque onglet de biome affiche le texte de son biome »). Ne touche pas au
   champ `version`.
4. `git merge origin/main` (résous ; si un conflit touche un fichier hors G&L que tu ne comprends pas : état
   `bloquée`), vérifications relancées si le merge a apporté du code. **Si ton lot ajoute une migration**, donne-lui
   le numéro libre juste au-dessus de la plus haute migration de `origin/main` à ce moment (les `N+…` du prompt
   sont des étiquettes, § 00.2, point 3), et écris dans ton fichier de lot « étiquette `N+…` → fichier `<nnn>_…` ».
5. `docs/prompts/gl-decisions/lot-<id>.md` (passé à Prettier), sections : État (`faite`, `partielle`,
   `bloquée`) ; Commits ; Étapes livrées / écartées (raison) ; Choix faits sans demander ; Contrats de test changés
   (test-id, textes attendus) ; Pour le § 0 des règles ; Comptes demandés ; Banc (si demandé) ; À relire par
   Oliv ; Ce que les lots suivants doivent savoir.
6. Pousse. PR « fix(gl): décisions et partie 16 — lot <id> : <titre> » (le lot M : « fix(gl): les mascottes
   sautent de case en case » ; le lot B : « fix(gl): chaque onglet de biome affiche son texte »), **prête** (pas
   brouillon) si l'état est `faite`. Description : le contenu du fichier de lot, plus les captures. **Ne fusionne
   rien**, ne lance aucune session. Arrête-toi.

---

## 1. Contexte en dix lignes

Gnomes & Licornes est le jeu d'une année des 6e d'Oliv (SVT, lycée Lyautey), module G&L de ForêtMap (prod
`gl.olution.info`), dans la mouture « Tenir à deux », avec l'ensemble unifié et les écrans de séance. L'audit
post-fusion du 18/11 a laissé 14 décisions, qu'Oliv a tranchées le 19/11. Le 23/11, il a ajouté l'erreur d'Olu
visible des élèves, « Tenir à deux » comme seul jeu, puis, après avoir joué la partie 16 au tableau (trois tours :
**0 fouille, 0 question de case, 0 sort**), les correctifs et décisions de l'audit de cette partie. Le soir, il a
validé trois simplifications : un seul écran d'équipe partout (au tableau, ni fouille ni lecture n'avaient de chemin
dans l'interface), deux surfaces, Relance retiré ; et l'entrée au dépôt de deux docs courts pour le prof. Il veut
aussi que les mascottes sautent de case en case, et toute la documentation réécrite au présent pour « Tenir »
seul. Le 24/11, il a signalé un bug d'affichage des onglets de biomes (lot B). Aucune séance n'a encore été jouée
en classe.

**Le gel est levé** (décision 28 de l'addendum 3, Oliv le 24/11 à 11 h 20, redit à 11 h 41) : le chantier corrige,
retire **et ajoute** ce que les décisions nommées demandent (§ 3 et addenda), rien d'autre. Les règles, les routes, les
réglages et le schéma ne changent que là où une décision nommée le demande ; aucun défaut de réglage existant ne
change sans elle. Le code du jeu classique reste jusqu'à deux séances jouées : c'est une voie de repli, pas le gel.
**Exception nommée, lot H** (décisions H1 à H5) : une route d'accusé (`POST /api/gl/learning/chapter-story/:plateau`),
un type de ressource (`chapter_story`) et une migration de données (textes, questions, liens). Aucun schéma (les
colonnes `resource_type` et `target_type` sont des `VARCHAR`), aucun réglage (le délai d'une heure reste, décision d'Oliv redite le 23/11 à 20 h).

## 2. Garde-fous

**Lore et pédagogie** (tout texte visible d'un élève) :
- Le Souffle et le voile ne sont jamais personnifiés : pas d'ennemi, pas de créature. Ils se disent par leurs
  effets (tenir, pâlir, s'effacer), et le voile **avance**.
- Jamais le visage de Sélène. Jamais le nom du corbeau (Krâ / Kraa), ni son cri écrit « krâ ». Ni renversement
  spatial ni « chute sans bataille ». Rien du tiers `secret` du glossaire dans un QCM ou une piste.
  « Quatre mondes ».
- Une erreur ne coûte rien. Le ton est « Pas encore », jamais « Non ». Pas de morale dans la bouche d'Olu.
  Une piste ne nomme jamais la réponse.
- Le savoir sert à jouer, il ne paie pas (effet Matthieu).
- Parité fille / garçon. **Pas de point médian** (proscrit à l'école) : formes doubles « Gardienne / Gardien ».
- **Adresse** : « vous » quand l'écran parle à l'équipe (tablette d'équipe, projection, lignes d'Olu dites à
  l'équipe, cases du plateau), « tu » quand il parle à un élève (Seuil, compte perso). Le test
  `tests/content/gl-adresse-ecran-equipe.test.js` reste vert.

**Technique** :
- Le banc ne tourne jamais sur la prod (`tools/gl-sim/garde.js`).
- Les bourses sont privées vis-à-vis des autres équipes et de la projection, visibles sur l'écran de sa propre
  équipe. Isolement G&L / ForêtMap (un composant partagé se teste des deux côtés).
- Aucun état d'attente sans sortie automatique.
- Les droits viennent du serveur (`glTenirPermissionsCore`). L'écran cache un geste fermé (absent, pas grisé), il
  n'en ouvre jamais.
- **Horodatages** : `NOW()` écrit l'heure de session MySQL (UTC+1 en prod), alors que `database.js` lit les
  DATETIME comme de l'UTC (`timezone: 'Z'`). Dans le moteur G&L, compare toujours des valeurs écrites par la même
  horloge (`NOW()` avec `NOW()`), jamais un `new Date()` JS avec une colonne écrite par `NOW()`.

## 3. Les décisions d'Oliv

| # | Décision | Étape | Lot |
|---|---|---|---|
| 1 | (19/11) Un élève en Retrait **reçoit** la gemme d'une page tenue par son équipe. | 1 | 8 |
| 2 | (19/11) Au palier, la jauge de Lumière **repart à 0**. | 2 | 1 |
| 3 | (19/11) Une piste de zone ne nomme jamais un mot de la bonne réponse. | 3 | 2 |
| 4 | (19/11) `olu-pf-main` est **branchée**. | 4 | 4 |
| 5 | (19/11) Une seule source pour les badges : `lib/glRewardsCatalog.js`. | 5 | 2 |
| 6 | (19/11) Les cartes des « fils » sont **mélangées côté serveur**. | 6 | 4 |
| 7 | (19/11) La Trame apporte **un palier de Lumière par chapitre au plus**. | 7 | 4 |
| 8 | (19/11) Plafond de la bourse : **on ne touche à rien** avant deux séances réelles. | — | — |
| 9 | (19/11) Choix de la PR 4 **validés**. | 9 | 8 |
| 10 | (19/11) Noms de badges en **formes doubles**. | 5 | 2 |
| 11 | (19/11) « Regarde la piste de ton professeur » est **adouci**. | 8 | 2 |
| 12 | (19/11) Le pseudo de l'auteur d'une Lettre est **caché en projection** et aux autres équipes. | 10 | 4 |
| 13 | (19/11) « L'équipe vient de jouer. Voici où vous en êtes. » | 11 | 1 |
| 14 | (19/11) Les questions remplacées par les zones restent hors tirage, même sur une installation neuve. | 12 | 3 |
| 15 | (23/11) L'erreur du jour d'Olu se voit en projection et sur la tablette d'équipe. | 13 | 6 |
| 16 | (23/11) « Tenir à deux » est **le** jeu de G&L : plus aucune porte vers le jeu classique depuis l'interface ou l'API de partie. Le code du classique sera retiré après deux séances (hors chantier). | 14 | 3 |
| 17 | (23/11, D1) **Question de case : bonne réponse = +1 case, sans relance.** Ajustée le 24/11 par la décision 37. | 19 | Q |
| 18 | (23/11) Correctifs de la partie 16 : horodatages, erreur d'Olu sans répétition, fin de l'ordre. | 15-17 | 1 |
| 19 | (23/11, D3) **Escalier en cinq marches, une marche par jour au plus.** | 20 | 5 |
| 20 | (23/11, D4) **Page témoin : la zone endormie la plus avancée derrière la dernière équipe.** | 21 | 5 |
| 21 | (23/11, D7) « Corbeau », nom commun, est permis dans les pages de Sélène ; l'interface et les catalogues ne l'écrivent toujours pas. **ep-VI-02 sort du Passeur du plateau 1.** | 23 | 2 |
| 22 | (23/11, D8) Le suricate de la zone cz-p1-07 est gardé. | — | — |
| 23 | (23/11 soir, **S1**) **Un seul écran d'équipe, partout.** `GLTenirEquipeView` disparaît ; les tablettes montrent le même écran qu'ailleurs, avec « Le tour se joue au tableau. » ; au tableau, la console monte l'écran de l'équipe active (bourses masquées). Règle aussi la décision « S4 » du fichier d'état des écrans de séance. Remplace l'ancienne étape 18. | 18 | 7 |
| 24 | (23/11 soir, **S3**) **Le sort Relance est retiré** (`SL005` inactif, hors de l'escalier ; `olu-41` inactive). Grimoire à 18 sorts. | 26 | 5 |
| 25 | (23/11 soir, **S2**) **Deux surfaces** : « Tablettes » et « Tableau ». L'hybride sort des sélecteurs ; le moteur garde la valeur pour les anciennes parties. | 27 | 3 |
| 26 | (23/11 soir) **Toute la documentation G&L réécrite au présent** pour « Tenir » seul (règles v4, docs de référence), et les deux docs du prof (« L'essentiel du maître du jeu », « Déroulé d'une partie ») entrent au dépôt, à jour de ce chantier. | annexe C | 9 |
| 27 | (24/11) **Une question ne se lit jamais avec sa réponse visible** sur le plateau, derrière ou à côté (Oliv : « la réponse peut être visible par transparence… l'éléphant se voit bien »). Correctif d'affichage, sans donnée ni réglage. | 30 | 6 |
| 34 | (24/11) **Une question ne se répond ni par son indice ni par le dessin du plateau.** Les 28 questions de zone des plateaux 2 à 4 sont réécrites « un pas au-delà de l'indice » (comme celles du plateau 1 le 23/11) et dix questions de case qui demandent le nom d'une espèce peinte sur le plateau sortent du tirage. Données **passées en prod par le connecteur le 24/11** (feu vert d'Oliv, § 5bis) ; le lot 2 aligne le catalogue et pose un test. | 24 quinquies | 2 |
| 37 | (24/11, 11 h 47) **Question de case : une bonne réponse avance d'une case, de trois si l'équipe est sous le voile, et donne une sonde.** La sonde : toucher un dessin du plateau, une fois dans le tour, pour lire « chaud », « tiède » ou « froid » ; ni question, ni page ; dans une zone, au moins « chaud » ; empreinte visible de toute la classe ; perdue à la clôture du tour ; même chose pour les deux peuples. Les fouilles ne changent pas (2 par tour, 1 sous le voile, pour les deux peuples). Oliv : « Je suis ton avis. » | 19, 35 | Q |
| H1 | (23/11 soir) **Page Histoire : « Marquer comme lu », soumis à une question.** Chaque élève valide l'histoire **lui-même, depuis son compte**, même si elle a été lue en classe. | H1 | H |
| H2 | (23/11 soir) **Le délai d'une heure avant de réessayer est gardé**, mais l'élève en est prévenu, avant de répondre et après une erreur, de façon cohérente. | H2 | H |
| H3 | (23/11 soir) **Questions nouvelles, tirées du texte de l'Histoire.** | H3 (annexe H) | H |
| H4 | (23/11 soir) **Les illustrations de l'Histoire ont des légendes et sont mieux placées.** | H3, H4 | H |
| H5 | (23/11, 20 h) **« N'enfreins pas les garde-fous du récit. »** Les textes d'Histoire sont réécrits sans renversement spatial, sans amorce de la révélation, sans visage en acteur ni avant son plateau ; l'épilogue (« La chute sans bataille ») n'est plus servi aux élèves. **« Je reste sur ma décision d'1 h »** : délai inchangé, aucune erreur tolérée. | H1 (point 9), H2, H3 | H |
| B1 | (24/11) **Bug des biomes** : sur un plateau à deux biomes, chaque onglet affiche le texte (biotope et biocénose) de **son** biome ; aujourd'hui tout tombe dans le premier, le second n'a que les images. Correctif d'affichage, aucune donnée changée. | B1 | B |

**Déjà faits en prod par une autre session, sans code** (vérifiés le 23/11 à 18 h 40 par `gl_settings`) :
`gameplay.tenir_marche_pendant_tour` = `false` (S4 : le Marché vit au tour clos et en veillée) et
`gameplay.tenir_chapardeur` = `false` (S5 : oiseau chapardeur coupé, réglage de plateforme). Ne change aucun
défaut de réglage pour autant.

**Choix par défaut posés par Claude** (non tranchés un à un par Oliv ; appliqués, et listés dans le rapport final
pour qu'il puisse les retirer) :
- vérité des cases favorables neutres : « Belle rencontre : la caravane repart. » au lieu de « Une case
  favorable : on repart, sans gain. » (étape 22) ;
- vent de la caravane : « Porté par le vent : la case ne joue pas. » (étape 22) ;
- les deltas morts des cases (cœurs, gemmes neutralisées) **restent** en base : les anciennes parties classiques
  les lisent encore ;
- étape 18 : « Équipe suivante » apparaît quand l'équipe active n'a plus de geste ouvert, ou par « Passer »
  (journalisé) ; « Passer la question » seulement s'il tient sans route nouvelle ; bourses masquées sur l'écran de
  l'équipe active au tableau ;
- la page témoin n'est pas mise en évidence sur la projection (étape 21) : rien n'est ajouté à la projection ;
- le doc « Déroulé d'une partie » perd le mot « classique » de son titre (« classique » désigne désormais l'ancien
  jeu) ;
- 12 h comme seuil de la « marche par jour » et du tour resté ouvert ;
- `tenir_enabled` gardé au registre mais retiré de l'écran ; la valeur `hybride` gardée par le moteur (anciennes
  parties) mais retirée des sélecteurs, sans migration (aucune partie hybride en prod au 23/11) ; le code
  d'`glArriveeSuspendue` gardé, inerte sans Relance ;
- lot H : bouton réservé au compte d'élève (`gl_player`), jamais sur la tablette d'équipe ni chez le prof ; aucune
  récompense ; textes d'avertissement communs à toutes les ressources conditionnées de G&L ; une question tirée
  parmi trois par plateau, mélangée à poids égal (position V4a de l'audit des questions de validation, étendue à
  toutes les ressources G&L) ; ton du verrou « Pas encore » (V4b) ; délai d'1 h et aucune erreur tolérée (V4c écartée) ; textes d'Histoire réécrits dans le cadre des garde-fous du récit (annexe H, décision
  d'Oliv du 23/11 à 20 h) ; légendes écrites d'après les images ; épilogue réservé au prof ; références de scènes par nom ; galerie de fin seulement pour un texte sans scène citée ;
- les choix par défaut de l'annexe C (§ 3 : pas de « Depuis le … », jeu classique réduit à un encadré, audit d'août
  déplacé, règles v4).
- (revue du 23/11, 20 h 30) `olu-pf-marche` : « Le Marché ouvre, hors du tour, depuis ton compte. Ce que tu y
  achètes, tu le gardes toute l'année. » (étape 26) ; après une erreur et le délai d'une heure, une **autre**
  question des trois (étape H1, point 6) ; bilan Team Spirit ancien sans liste de cartes : retraits reconstitués
  dans l'ordre du panneau, marqués « à vérifier » (étape 29) ; aucune fusion le jeudi de 8 h à 15 h (§ 00.1).
- (24/11) étape 30 : fond de la fenêtre de question presque opaque, au vert pétrole du jeu, et flouté ; plateau de
  l'écran d'équipe flouté tant qu'une question y est ouverte (case ou zone), puis de la projection quand elle montre
  la question (lot 7) ; la fenêtre « Marquer comme lu » garde son fond (le texte derrière est celui qu'il faut avoir
  lu) ; pas de tri des questions dans ce chantier (§ 6).
- (24/11) décision 37 : textes « Une question du biome. Bonne réponse : la caravane avance d'une case, de trois sous
  le voile, et vous sondez le plateau. » (cases), « Sondez le plateau : touchez un dessin. » (carte du moment, rôle
  Opératrice ou Opérateur : l'élève qui vient de répondre, depuis l'échange des rôles ; § 00.8), `olu-pf-sonde` « Je ne vois pas les pages, je sens leur chaleur. Touchez un dessin :
  chaud, tiède ou froid. », `olu-14` « Juste ! La caravane avance, et vous pouvez sonder le plateau. », `olu-18`
  « La ou le Gestionnaire a tranché. Une équipe qui tranche, j'aime ça. » ; « sous le voile » s'apprécie au moment de
  la réponse ; le bonus ne s'ajoute pas au vent ni à Progression ; la case d'arrivée du bonus joue, sauf une case
  question (jamais deux questions de suite) ; la sonde n'est pas une fouille (elle ne consomme ni n'ajoute de
  fouille) ; l'oiseau témoin vole aussi vers une sonde.
- (24/11) lot B : le titre de biome qui redit exactement le nom de l'onglet (« Savane », « Taïga ») est retiré ; les
  autres (« Le Sahara », « Toundra — été polaire », « Toundra — nuit polaire ») restent ; « La limite des arbres »
  reste dans l'onglet de la taïga ; « Le biotope — milieu de vie » et « La biocénose — communauté du vivant » sont
  recopiés dans chaque onglet (seuls séparateurs visibles).

## 4. Fiches des lots

Chaque fiche dit quoi faire ; le détail est au § 5. Les vérifications de base (§ 8) valent pour tous.

### Lot 1 — Moteur du tour (étapes 15, 16, 17, 2, 11)

- Ordre : 15, 16, 17, 2, 11.
- **Banc, avant toute modification** : `npm run gl:sim:db`, puis
  `npm run gl:sim -- --scenario ensemble-unifie --runs 5 --seed 14` ; note dans ton fichier de lot les reculs
  de voile dus à la Lumière par chapitre (« avant étape 2 »). Refais-le après l'étape 2 (« après étape 2 »).
- Étape 17 : côté serveur seulement (409 `FIN_DE_L_ORDRE`) ; la console ne change pas : le bouton « Le voile
  avance » pour la dernière équipe se fait au lot 7.
- e2e : `e2e/gl-tenir-tablettes.spec.js` (texte de l'étape 11) et ceux du tour.

### Lot 2 — Catalogues et textes (étapes 3, 5, 8, 22 textes, 23, 24, 24 quinquies)

- Ordre : 24, 24 bis (addendum 1), 24 ter (addendum 2), 24 quater (addendum 3), 24 quinquies-Z (ce prompt),
  24 quinquies-R (addendum 4, rôles échangés), 8, 5, 3, 23, 22 (textes) ; QV4 (addendum 1) à la place que lui donne
  son addendum.
- Ne touche pas à l'escalier ni à `SL005` / `olu-41` (lot 5, S3).
- Capture : badge au titre le plus long à 390 px (`docs/captures/gl-decisions/lot-2/`).
- Relecteurs : `gl-relecteur-garde-fous` et `gl-relecteur-science` (pistes de zones, erreurs d'Olu, péripéties).
- `npm run test:content` et `DB_NAME=foretmap_sim npm run gl:import:tenir -- --fichier tous --strict --dry-run`.

### Lot B — Onglets des biomes (étape B1)

- N'attend aucun lot, ne partage aucun fichier avec un autre lot. Pas de migration, pas de donnée en base, pas de
  route : un utilitaire, un commentaire, des tests.
- Deux commits : logique et tests de l'utilitaire ; test du composant.
- Capture avant / après de l'onglet « Savane tropicale » du plateau 1 sur la base locale
  (`docs/captures/gl-decisions/lot-b/`).
- Pas de relecteur de contenu : aucun texte ne change.

### Lot M — Les mascottes sautent de case en case (annexe A)

- L'annexe A est le prompt complet de ce lot. Branche `claude/gl-decisions-lotm` (et non celle que l'annexe
  nommait autrefois).
- Captures dans `docs/captures/gl-decisions/lot-m/`.

### Lot 3 — Portes et surfaces, bilan Team Spirit (étapes 14, 27, 12, 29)

- Ordre : 14, 27, 12, 29. Aucune migration.
- Étape 29 : `GLTourScreen.jsx` (réservé aux lots 5 et 7) ne reçoit que les deux props passées au panneau ;
  dis-le dans ton fichier de lot.
- Captures : réglages « Tenir à deux » (sans la case de la mouture, sans « Hybride ») et panneau « Profil » ;
  bilan Team Spirit rouvert après enregistrement (cartes retirées encore cochées).

### Lot 4 — Trame, Lumière, appareils, Lettre (étapes 6, 7, 4, 10)

- Attend le lot 1 (l'étape 7 part de la jauge qui repart à 0, étape 2).
- Ordre : 6, 7, 4, 10. Migration de l'étape 7 au numéro `N+1`.
- Banc après l'étape 7 : mêmes commandes qu'au lot 1, note « après étape 7 ».
- Captures : écran « fils de l'adaptation » ; carnet de la classe en projection avec une Lettre.

### Lot 6 — L'erreur d'Olu visible, question sans sa réponse visible (étapes 13, 22 vent, 30)

- N'attend aucun lot : il ne partage aucun fichier avec le lot M (`GLGameBoard.jsx` et les crochets d'animation
  d'un côté, `GLProjectionView.jsx`, `GLTenirEcranEquipe.jsx`, `useGlTenirOlu.js`, `glTenirMoment.js` de l'autre).
  Si le lot M est fusionné pendant que tu travailles, `git merge origin/main` avant tes captures.
- Ordre : 13, 22 (vent), 30.
- Ne touche pas `GLTenirEquipeView` (le lot 7 le supprime) ni la console.
- Captures avant / après : projection 1920 × 1080, tablette 1024 × 768, avant et après correction ; pour l'étape
  30, tablette 1024 × 768 pendant une question de zone, et fenêtre de question d'une case du plateau ouverte.
- e2e de l'étape 13.

### Lot 5 — Escalier et règles de séance (étapes 20, 26, 21, 25)

- Attend les lots 1 et 2 (`lib/glTour.js` ; `sorts.json` et `olu-lignes.json` déjà retouchés). **L'étape 19 est
  passée au lot Q** (24/11) : ne touche pas à `bonneReponseDeCaseTx`.
- Ordre : 20 et 26 **dans le même commit** (le test de contenu compare les sorts de l'escalier à
  `ouverture_par_chapitre["1"]` : ils changent ensemble), puis 21, 25. Migration de l'étape 26 (si l'import ne
  retire pas le lien `gl_chapter_spells`), étiquette `N+3` (numéro réel au moment de la fusion, § 00.2).
- Banc : avant l'étape 20 et après les étapes 20 et 26 (écart de cases entre l'équipe la plus avancée et la dernière
  au camp ; dépense de gemmes par élève et par chapitre).
- Lance aussi `npm run gl:sim -- --scenario multi-appareils --runs 5 --seed 14`.

### Lot Q — La question de case récompensée (étapes 19 et 35, décision 37)

- Attend les lots 1, 2, 5 et 6 : `lib/glTour.js` et `olu-lignes.json` (lots 1, 2, 5), `GLTenirEcranEquipe.jsx` et
  `glTenirMoment.js` (lot 6). Le lot 7 l'attend : il monte la sonde dans le bloc « Équipe active » de la console.
- Ordre : 19, puis 35 (serveur, puis écran, puis catalogue et tests). Migrations, étiquettes `N+2` (étape 19, textes
  des cases) et `N+7` (étape 35, colonne `sonde`) ; numéros réels au moment de la fusion (§ 00.2, point 3).
- **Banc**, avant l'étape 19 puis après les étapes 19 et 35 : `npm run gl:sim:db`, puis
  `npm run gl:sim -- --scenario ensemble-unifie --runs 5 --seed 14`. Note : écart de cases entre l'équipe la plus
  avancée et la dernière au camp ; part des équipes sous le voile par plateau ; pages trouvées par chapitre ;
  carnet complet aux plateaux 3 et 4. Si le banc ne sait pas jouer la sonde, apprends à ses robots la règle la plus
  simple (sonder près de l'indice, fouiller le point le plus chaud) ; si c'est trop long, mesure sans la sonde et
  dis-le. Seuils d'alerte à écrire dans ton fichier de lot sans rien changer : carnet complet au-dessus de 60 % aux
  plateaux 1 et 2 (chasse trop facile), écart au camp qui se creuse par rapport à avant l'étape 19.
- Captures (`docs/captures/gl-decisions/lot-q/`) : tablette 1024 × 768, carte du moment « Sondez le plateau », puis
  le verdict et l'empreinte ; projection avec l'empreinte d'une sonde.
- Relecteurs : `gl-relecteur-garde-fous` (lignes d'Olu, textes des cases).

### Lot 7 — Au tableau, un seul écran d'équipe (étape 18 et bouton de l'étape 17, décision S1)

- Attend les lots 1, 3, 5, 6 et Q. Le plus gros lot : découpe tes commits (serveur `QUESTION_DUE` ; montage de
  l'écran d'équipe dans la console ; suppression de `GLTenirEquipeView` ; projection ; tests et e2e), pour qu'une
  reprise sache où elle en est.
- Captures : console au tableau, la suite d'une équipe (Lancer → Question → Fouiller → Lire → Équipe suivante),
  puis « Le voile avance » pour la dernière ; tablette en surface tableau (« Le tour se joue au tableau. ») ;
  projection pendant une question posée.
- E2E au tableau : un tour complet avec une case question, une fouille et une lecture.

### Lot H — Page Histoire (étapes H1, H2, H3, H4)

- Indépendant des autres lots : se lance dès le lot 0 fusionné. Le lot 8 l'attend, pour que le lot 9 décrive la page
  Histoire telle que fusionnée.
- Ordre : H3 (données, migration au numéro `N+4`), H4 (illustrations), H1 (bouton et route), H2 (avertissements).
- `lib/shared/learningAckCore.js`, `lib/shared/resourceQuestionGatingCore.js`, `lib/shared/gatingSettingsCore.js`
  et `lib/shared/cooldownDurationCore.js` n'ont **pas** de source dans `src/shared` (vérifié le 23/11) : ils se
  modifient là où ils sont ; c'est l'exception à la règle du miroir (§ 01).
- Fichiers d'autres lots : `routes/gl/lore.js` est réservé au lot 4 ; le lot H n'y ajoute qu'un filtre de tirage
  (catégorie `histoire`, étape H1 point 7) : modification minimale, signalée dans ton fichier de lot. Il touche aussi
  `routes/gl/chapters.js` et `lib/gl/gamesRuntime.js` (épilogue réservé au prof, point 9), qu'aucun lot ne réserve.
- Isolement G&L / ForêtMap : `LearningAcknowledgeButton`, `LearningGatingQuestionPanel` et
  `learningGatingChallengeClient` servent aussi ForêtMap ; leurs textes ForêtMap ne changent pas. Teste les deux
  côtés.
- Docs du lot : `docs/API.md` (route, `chapter_story_plateaux` dans `GET /api/gl/learning/me`) ; une ligne « Pour le
  § 0 des règles » : « 23/11 : l'Histoire de chaque chapitre se valide par chaque élève, depuis son compte, avec une
  question ; le délai d'une heure après une erreur est annoncé » ; dans « Ce que les lots suivants doivent savoir »,
  ce que le lot 9 doit écrire (élève seul, question, délai annoncé, épilogue réservé au prof, `scene:<nom>` pour qui
  édite un récit). Ne réécris pas les docs de référence : le lot 9 le fait.
- Relecteurs : `gl-relecteur-garde-fous` et `gl-relecteur-science` sur l'annexe H.
- Captures (`docs/captures/gl-decisions/lot-h/`) : Histoire des plateaux 1 et 4 à 1024 × 768 et à 390 px ;
  l'avertissement sous le bouton ; l'écran après une mauvaise réponse ; la page pendant le délai.
- E2E `e2e/gl-histoire.spec.js` avec un compte d'élève : figures légendées et avertissement au plateau 1 ; une
  mauvaise réponse affiche « Pas encore », la piste et l'heure ; une bonne réponse (horloge simulée avancée d'une
  heure) donne « Histoire lue ✓ » ; la tablette d'équipe voit la ligne, pas le bouton.

### Lot 8 — Décisions consignées, vérifications complètes (étapes 1 et 9)

- Se lance quand les lots 1 à 7, B, M, H, Q et ceux des addenda (S, V, C, T, P, F, A) sont fusionnés (ou `bloquée`,
  ce qu'il note).
- Lit tous les `docs/prompts/gl-decisions/lot-*.md`, fait l'étape 1, écrit le § 0 des règles (étape 9 et lignes
  « Pour le § 0 » de chaque lot) et les `docs/AUDIT_*`, met à jour le tableau de `docs/prompts/GL_DECISIONS_ETAT.md` (lots, PR,
  état) et ajoute à `docs/prompts/gl-decisions/README.md` la synthèse « À relire par Oliv ».
- Vérifications **complètes** du § 8 sur le code fusionné : les trois commandes du banc et tous les e2e G&L. Un
  échec qui vient d'un lot déjà fusionné : répare-le s'il est petit et dans le périmètre de ce lot, sinon écris-le
  (l'orchestratrice décide d'une reprise).
- Ne touche pas aux docs de référence : le lot 9 les réécrit.

### Lot 9 — Réécriture de toute la documentation (annexe C)

- Se lance quand le lot 8 est fusionné. L'annexe C est le prompt complet de ce lot, à lire avec ces ajustements :
  - branche `claude/gl-decisions-lot9`, PR et fichier de lot selon le § 01 (pas `claude/gl-doc-reecriture`) ;
  - « après la fusion de `claude/gl-mascotte-case-par-case` et de `claude/gl-decisions-audit-18nov` » se lit
    « après la fusion des lots 1 à 8, B et M de ce chantier » ;
  - **son étape 1 (deux surfaces) est déjà faite par le lot 3** (étape 27) : vérifie-la, ne la refais pas ;
  - son § 5 met « le sort Relance, l'écran d'équipe au tableau » hors périmètre : dans ce chantier, ils sont livrés
    (lots 5 et 7) ; la doc les décrit tels que fusionnés (Relance retiré, grimoire à 18 sorts, escalier marche 5 :
    le Marché, Farce et Question ; au tableau, le bloc « Équipe active » de la console et la tablette qui dit « Le
    tour se joue au tableau. ») ;
  - la question de case telle que fusionnée par le lot Q (décision 37) : une case, trois sous le voile, et la sonde
    (« chaud », « tiède », « froid », sans question ni page) ; essentiel-mj et deroule-partie la décrivent dans « Ce
    que font les élèves » et dans le tour d'une équipe (« Répondre », puis « Sonder ») ;
  - étape 2 : l'annexe « Historique des décisions » reprend aussi les lignes ajoutées au § 0 par le lot 8 ;
  - étape 4 : titre du déroulé « Gnomes & Licornes · Déroulé d'une partie » (sans « classique », mot qui désigne
    désormais l'ancien jeu) ; le « ⚠️ un tour non clos » devient le bandeau « Le tour du … est resté ouvert » du
    lot 5 ; « Et sans tablettes ? » décrit le bloc « Équipe active » (Lancer → Question → Fouiller → Lire → Équipe
    suivante ; bourses masquées ; « Le voile avance » après la dernière équipe) ;
  - étape 6 : le balayage des skills couvre aussi ce que les lots 1 à 7 ont pu laisser de faux (§ 7).
- Le lot est long (une vingtaine de documents, un commit par document) : la reprise `bis` reprend au document
  suivant, d'après le fichier de lot.

---

## 5. Étapes

### Étape 1 — Retrait et gemme de la page tenue (texte) · lot 8
- `docs/GL_TENIR_A_DEUX_REGLES.md`, trois endroits vérifiés le 23/11 :
  - § 0, ligne M19 (vers la ligne 38) ;
  - présences (vers la ligne 99 : « le gain d'une page tenue ne va qu'aux membres présents ») ;
  - § 6 (vers la ligne 163).
- À chaque endroit, préciser : « membre présent, **Retrait compris** : la conduite ne passe par aucune
  monnaie ». Garde la règle du pot (vers la ligne 182 : un membre en retrait ne verse pas). Payer et recevoir
  ne suivent pas la même règle, c'est voulu : dis-le en une phrase.
- Ajoute à un test existant de la page tenue le cas « élève en retrait reçoit la gemme », s'il n'y est pas.

### Étape 2 — Lumière : la jauge repart à 0 · lot 1
- `lib/glTour.js › ajouterLumiereTx` (vers la ligne 2342) : la boucle `while (total >= palier) { total -=
  palier; … }` garde le reste. Remplace-la : quand `total >= palier`, **un** palier est atteint et
  `total = 0`. Aligne le JSDoc.
- Le plafonnement de l'escalier (`palier - 1` tant que le module `lumiere` est fermé) ne change pas.
- Tests : 95 + 10 → un recul, jauge à 0 ; 99 + 1 → un recul, jauge à 0 ; 50 + 250 → **un** recul, jauge à 0 ;
  escalier fermé : 95 + 10 → 99, aucun recul.

### Étape 3 — Pistes de zone qui donnent la réponse · lot 2
**Code** — `lib/glChasse.js › pisteDeReponse(db, zone)` (vers la ligne 534), appelée vers la ligne 711 :
- Ajoute une garde : une ressource est **sautée** quand son nom (`terme` ou `nom_commun`) figure dans le texte
  de la bonne réponse de la question fixe de la zone (`gl_qcm_questions.reponse_texte`, via
  `zone.question_code`).
- Comparaison : minuscules, sans accents ni ponctuation, sur des mots entiers. Un nom de moins de 4 lettres ne
  déclenche pas la garde.
- Seule la question fixe compte : une question du thème de secours a déjà `piste: null`.
- Si toutes les ressources sont sautées, la piste vaut `null`. Lis la réponse en une seule requête par appel.
- Tests unitaires : terme présent dans la réponse → sauté ; terme présent dans la question seulement → gardé ;
  accents et majuscules ; nom court ; toutes les ressources sautées → `null`.

**Données** — `data/gl/tenir/chasse-zones.json`. État vérifié en prod et dans le dépôt le 23/11 :

| Zone | Question | Bonne réponse en prod | Ressources actuelles | Changement |
|---|---|---|---|---|
| `cz-p4-01` | `QCM0364` | « Le lièvre variable (ou lièvre d'Amérique) » | `especes` `SP0145` (Lièvre variable), `SP0140` | `especes` : `["SP0140", "SP0145"]` (Lynx boréal d'abord) |
| `cz-p4-10` | `QCM0176` | « De la fonte de la banquise, qui est son territoire de chasse » | `glossaire` `GL0015` (banquise) | `glossaire` : `["GL0220"]` (réchauffement climatique) |
| `cz-p4-06` | `QCM0152` | « …de nombreux prédateurs (harfang, renard, hermine…) » | `especes` `SP0054` (Harfang des neiges), `SP0052` | `especes` : `["SP0052", "SP0054"]` (Lemming d'Arctique d'abord) |
| `cz-p3-04` | `QCM0230` | « À cause du défrichement agricole… » | `glossaire` `GL0280` (défrichement) ; `especes` `SP0082`, `SP0258` | Inchangé : la garde saute `GL0280`, la piste tombe sur la fiche « Chêne pédonculé ». Vérifie que cette fiche n'en dit pas trop, et dis-le |
| `cz-p3-03` | `QCM0219` | « Symbiose : les deux partenaires y gagnent » | `glossaire` `GL0170` (mycorhize), `GL0257` (symbiose) | Inchangé : la garde protège si `GL0170` manque un jour |

Les 8 questions des zones du plateau 1 ont été **réécrites en prod le 23/11** (§ 5bis) : le test de contenu
ci-dessous les couvre aussi. **Les cinq questions du tableau ci-dessus ont été réécrites en prod le 24/11**
(décision 34, § 5bis) : les « bonnes réponses en prod » de la colonne 3 sont celles d'avant. Garde les changements de
ressources de la dernière colonne (ils restent sûrs) et vérifie chaque cas contre la nouvelle `reponse_texte`.

- Test de contenu dans `tests/content/`, avec un vrai `t.skip` sans corpus : pour chaque zone active, la piste
  calculée ne contient aucun mot de la bonne réponse, et chaque code de `glossaire` / `especes` existe et est
  actif.
- Corrige au passage `tests/content/gl-ensemble-unifie-zones.test.js` : les gardes `corpusPresent` et
  `cataloguePresent` sortent par `return`, sans `t.skip` (lignes 57, 94, 95, 119, 134, 138, 168, 171, 177).
  Fais-les appeler `t.skip(...)`.
- **Ne touche à aucun polygone** de `chasse-zones.json` : Oliv retracera les zones du plateau 1 après la
  synchronisation (§ 10).

### Étape 4 — Brancher `olu-pf-main` · lot 4
- La clé `main` est déclarée dans `lib/glTenirOlu.js › PREMIERE_FOIS_CLES`, avec le commentaire « la ligne
  attend le lot « plusieurs appareils » ». Aucun évènement ne la porte. Retire le commentaire.
- Évènement déclencheur : la **première main prise** dans la partie par un écran d'une équipe, alors qu'au
  moins un **autre** écran de la même équipe est connecté, en surface tablette (ou une ancienne partie hybride).
  Au tableau, rien.
- La ligne se dit **une fois par partie** (pas de `{equipe}`), avec la mémoire `gl_game_olu_premieres`. Elle
  passe par le chemin des autres « première fois » (`PREMIERE_FOIS_EVENT_TYPES`, `clesPremiereFois`). Ajoute
  un type d'évènement si besoin.
- Point d'accroche : `lib/glEquipeEtat.js`, où `mainChangee` est calculée et `signalerEquipe(gameId, teamId,
  'main')` appelé (vers les lignes 426-443), avec le suivi des écrans connectés. Vérifie et choisis.
- **Texte** : garde celui du catalogue (« Un seul écran joue à la fois. Vous voyez ce que fait votre camarade ;
  à la prochaine action, cet écran reprend la main. »).
- Tests : deux écrans, première main → la ligne est dite une fois ; un seul écran → rien ; surface tableau →
  rien ; deuxième main → rien.

### Étape 5 — Badges : une seule source, noms en formes doubles · lot 2
**Constat vérifié le 23/11** : les badges vivent sur le moteur commun (`lib/glRewards.js`, catalogue à paliers
`lib/glRewardsCatalog.js`). `data/gl/tenir/badges.json` (16 badges) et `gl_tenir_badges` sont hérités ; leurs
codes (`fouilleur`, `revelateur`…) ne recoupent pas les clés du catalogue (`chasse.fouilles`…) ; seul
`lib/glRewardsBackfill.js › LEGACY_MAP` en relie une partie. Aucun écran actif ne lit les « seuils » de
`badges.json`.

**Action** :
- `badges.json` : `format` devient `badges v1 — HÉRITÉ, non affiché : la source est lib/glRewardsCatalog.js
  (paliers)`. Aligne chaque `nom` sur le titre du catalogue quand `LEGACY_MAP` relie les deux ; sinon, applique
  seulement la forme double ci-dessous. N'aligne pas les seuils. Ne retire ni la table ni le fichier.
- Ajoute un test : pour chaque code de `LEGACY_MAP` présent dans `badges.json`, même nom que le titre du
  catalogue.
- **Noms en formes doubles**, dans `lib/glRewardsCatalog.js` (`title`), puis dans `badges.json` et sa copie
  `exemple/` :

| Titre actuel | Nouveau titre |
|---|---|
| Fouilleur | Fouilleuse / Fouilleur |
| Trouveur | Trouveuse / Trouveur |
| Lecteur | Lectrice / Lecteur |
| Nommeur | Nommeuse / Nommeur |
| Tisserand | Tisserande / Tisserand |
| Voyant des fils | Voyante / Voyant des fils |
| Gardien des fils | Gardienne / Gardien des fils |
| Réparateur | Réparatrice / Réparateur |
| Bon rangeur | Bonne rangeuse / Bon rangeur |
| Veilleur | Veilleuse / Veilleur |
| Grand voyageur | Grande voyageuse / Grand voyageur |
| Chuchoteur | Chuchoteuse / Chuchoteur |
| Correcteur du renard | Correctrice / Correcteur du renard |

- Les titres déjà neutres ne bougent pas : Porte-page, Pas encore, Mains tendues, Épaule, Mains de la Trame,
  Cartographe, Deux peuples, Esprit d'équipe.
- Retire le commentaire « nom à confirmer par Oliv » (vers la ligne 208 du catalogue).
- Aligne les textes qui citent ces titres : `data/gl/tenir/README.md` (ligne 177) ;
  `docs/reference/gl/guide-du-mj.md` (vers la ligne 484) ; `docs/reference/gl/chapitres-et-progression.md`
  (lignes 349-350) ; `src/gl/constants/glRewardsOlu.js` s'il en cite ; les tests.
- Vérifie à 390 px que chips et cartes de badge ne débordent pas, et joins une capture.
- **Ne touche pas** à `data/gl/tenir/titres.json` (« Passeur de Pages »…) : décision d'Oliv, signale-la.

### Étape 6 — Mélanger les cartes des « fils » · lot 4
- `lib/glTrameDefis.js` sert les cartes dans l'ordre du catalogue (`ORDER BY ordre ASC`), notamment
  `gl_trame_adaptation_cartes` (vers la ligne 304) et `gl_trame_fils_cartes` dans `loadFils` (vers la
  ligne 130). Pour jungle, savane et sahara, relier chaque carte à sa voisine suffit.
- Sers les cartes dans un **ordre mélangé déterministe**, avec pour graine la partie (ou la veillée), l'unité
  et l'élève ou l'équipe. Inspire-toi de `lib/glRandom.js` (mulberry32). L'ordre reste le même au rechargement
  et sur tous les écrans d'une équipe. Il ne donne **jamais** la solution par voisinage : si le mélange met
  côte à côte deux cartes d'un lien attendu, décale.
- Le serveur juge toujours contre les liens du catalogue.
- Vérifie les autres défis servis en `ORDER BY ordre` : `gl_trame_cartes` (vers la ligne 98), `ranger` (vers
  la ligne 239), `reparer` (vers la ligne 179). Même règle quand l'ordre donne la solution ; dis lesquels.
- Tests : même graine → même ordre ; deux élèves → ordres différents, sur un échantillon ; pour les trois
  biomes cités, aucune paire de voisines n'est un lien attendu.

### Étape 7 — Lumière venue de la Trame : un palier par chapitre au plus · lot 4
- Source vérifiée : `lib/glTrameDefis.js` (vers la ligne 1131) ajoute `n: 10` avec `source: 'defi_trame'` à
  chaque première réussite en mode équipe.
- Dans une partie (= un chapitre), le total apporté par `defi_trame` est plafonné à `lumiere_palier` (100 par
  défaut). Au-delà, la réussite garde tout le reste (première réussite, page, piste) mais n'ajoute plus de
  Lumière. Les cartes Team Spirit (`team_spirit`) et l'erreur d'Olu (`olu_corrige`) ne sont pas plafonnées.
- Stockage : colonne `trame_total INT NOT NULL DEFAULT 0` sur `gl_game_lumiere` (créée par
  `migrations/331_gl_tenir_tour.sql`), migration idempotente au numéro `N+1`. Lis-la et écris-la sous le même
  `FOR UPDATE` que `total`. Un recalcul depuis l'historique seulement s'il est plus simple et aussi exact.
- Pas de réglage nouveau. Règles, § 11 : « la Trame apporte au plus un palier par chapitre ».
- Tests : 11 réussites en mode équipe → 100 de Lumière venues de la Trame, pas 110 ; avec des cartes en plus,
  le palier suivant reste atteignable.

### Étape 8 — Retours « pas encore » du Mentorat et de la Lettre · lot 2
`data/gl/tenir/sorts.json` et sa copie `exemple/` :
- Mentorat (`retour_pas_encore`, ligne 535) : « Pas encore : il manque un morceau à ton explication. Si ton
  professeur a laissé une piste, lis-la ; tu repasses une autre semaine, sans rien repayer. »
- Lettre (ligne 577) : « Pas encore : ta page a besoin d'un détail de plus. Si ton professeur a laissé une
  piste, lis-la, et réécris ta page quand tu veux. Tu n'as rien à repayer. »
- Ne touche pas à `GLSeuilPagesVoyageur.jsx`.

### Étape 9 — Décisions consignées (doc) · lot 8
- `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md`, § 4 (lignes 77 à 113, toutes encore `[ ]`) : coche chaque case
  avec « Oliv, 19/11 : » et la décision du § 3. Pour le plafond : « décision après deux séances réelles ;
  levier : prix des sorts ». Ne coche pas le § 5.1 (relecture scientifique).
- `docs/GL_TENIR_A_DEUX_REGLES.md` § 0 : une ligne datée du 19/11 (décisions 1, 2, 7, 9, 12) ; une ligne du 23/11
  pour les décisions 15 à 21 ; une ligne du 23/11 au soir pour les décisions 23 à 25 (« un seul écran d'équipe ; le
  sort Relance est retiré ; deux surfaces, tablettes et tableau ») ; puis les lignes « Pour le § 0 » des fichiers
  de lot qui n'y seraient pas encore.
- Crée `docs/AUDIT_GL_PARTIE16_2026-11-23.md` : résumé d'une page de l'audit de la partie 16, à partir du § 3, des
  étapes 15 à 26 et du § 5bis de ce prompt (l'audit complet vit dans le projet claude.ai d'Oliv), avec le constat
  « au tableau, aucun chemin de fouille ni de lecture » et sa correction (étape 18).

### Étape 10 — Pseudo de l'auteur d'une Lettre · lot 4
- `lib/glVoyageurPlume.js` (ligne 154) écrit `discoveredByName` = pseudo de l'auteur dans l'état de feuillet de
  chaque équipe. `routes/gl/lore.js` le sert (`discoveredBy`, lignes 259 et 325) au carnet de la classe
  (`GLCarnetClasseView`), donc à la projection.
- Pour une page de source Lettre, sers `discoveredBy` **seulement** à l'auteur, aux membres de son équipe dans
  la partie en cours et au staff G&L. Il vaut `null` pour la projection, les autres équipes et les autres
  élèves. `discoveredByPlayerId` suit la même règle.
- Ne change pas la base. Sans nom, l'écran affiche « Une page de voyageur ».
- Tests : auteur, coéquipier, autre équipe, projection, prof.

### Étape 11 — Message de version d'état · lot 1
- `src/shared/glMainCore.js` (ligne 35) : `MESSAGE_ETAT_PERIME` devient « L’équipe vient de jouer. Voici où vous
  en êtes. »
- Aligne : `e2e/gl-tenir-tablettes.spec.js`, `src/gl/utils/glTenirMoment.js`, `docs/GL_TENIR_A_DEUX_REGLES.md`
  (hors § 0), `docs/API.md`, `docs/GL_TENIR_A_DEUX.md`. Les documents historiques (`docs/AUDIT_…`,
  `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md`) ne bougent pas.

### Étape 12 — Questions remplacées sur une installation neuve · lot 3
- `migrations/365_gl_ensemble_unifie_zones.sql` sort du tirage `QCM0213`, `QCM0612`, `QCM0618`, `QCM0605` et
  `QCM0451` (en prod : `usage_tenir = 0`, vérifié le 23/11). Un import du corpus fait **après** les migrations
  les recrée avec `usage_tenir = 1`.
- `lib/glQcmImport.js` : sur le modèle de la règle de taxonomie (vers les lignes 602-623), ajoute une liste
  `QUESTIONS_REMPLACEES_PAR_ZONES`, commentée « migration 365, ensemble unifié M22 ». À la **création**
  seulement, ces questions reçoivent `usage_tenir = 0`. À la mise à jour, la valeur choisie par le prof reste.
- Compte `usage_tenir_remplacees` dans le rapport d'import.
- **Ajoute à la même liste, sous un second commentaire « décision 34, 24/11 : questions de case qui se lisent sur
  le plateau », les dix codes sortis du tirage le 24/11** (§ 5bis) : `QCM0092`, `QCM0278`, `QCM0272`, `QCM0663`,
  `QCM0431`, `QCM0439`, `QCM0192`, `QCM0611`, `QCM0619`, `QCM0135`. Même règle (création seulement).
- Tests : base neuve, import → les cinq (et les dix) sont hors tirage ; question remise à 1 par le prof → l'import ne
  la change pas.

### Étape 13 — L'erreur du jour d'Olu, visible des élèves · lot 6
**Constat vérifié le 23/11 sur v1.263.5** :
- `lib/glTour.js › tirerErreurDuJour` tire une ligne `moment = 'erreur'` à l'ouverture du tour, stockée dans
  `gl_game_rounds.olu_erreur_json` et signalée par l'évènement `olu_erreur` (payload `texte`).
- `loadRoundView` sert `round.oluErreur.texte` à tous les écrans (via `lib/glTenirView.js`). La `correction`
  n'est servie qu'une fois l'erreur trouvée (`olu_corrige_team_id`) ou le tour clos.
- **Seul** `src/gl/components/mj/GLTourScreen.jsx` (console, vers la ligne 584) affiche la phrase et « Qui a
  trouvé l'erreur d'Olu ? ». `GLProjectionView.jsx` ne l'affiche pas. La tablette non plus :
  `src/gl/hooks/useGlTenirOlu.js` (ligne 170) saute le moment `erreur`.
- À la marche 2 de l'escalier, la tablette dit `olu-pf-erreur_du_jour` (« Aujourd'hui, je vais dire une bêtise,
  exprès… ») : la bêtise annoncée n'apparaît nulle part côté élèves.

**Changement attendu** (aucune route ni donnée nouvelle, tout est déjà servi) :
1. **Projection** (`GLProjectionView.jsx`), quand `round.oluErreur` existe :
   - phases `ouverture` et `jeu` : un bloc fixe, lisible du fond de la salle en 1080 p sans défilement, avec la
     tête d'Olu et « Olu : « {texte} » ». Dessous, en petit : « Une bêtise s'est glissée. Qui la trouve ? » ;
   - une fois l'erreur trouvée : « {nom de l'équipe} a trouvé ! », puis la correction en italique ;
   - à la clôture : la correction seule, ou rien si la place manque (la carte « À la prochaine séance » prime) ;
   - en phase `souffle`, le bloc s'efface : le voile garde la scène.
2. **Tablette d'équipe** (`GLTenirEcranEquipe`) : pendant `ouverture` et `jeu`, la phrase passe dans la **bulle
   d'Olu** : le hook renvoie `round.oluErreur.texte` au lieu de sauter le moment `erreur` ; la ligne « première
   fois » passe d'abord, la phrase suit. Sans correction ni bouton. Une fois l'erreur trouvée : « {équipe} a
   trouvé : {correction} ». La ligne disparaît avec la phase `souffle`. Si la bulle ne suffit pas sur une tablette
   1024 × 768 sans déplacer le plateau sous la ligne de flottaison, prends la variante la plus simple et dis
   laquelle.
3. **Console** : inchangée (le prof désigne l'équipe : « Qui a trouvé l'erreur d'Olu ? »). Surface tableau : la
   projection affiche le bloc ; l'écran de l'équipe active (étape 18) et les tablettes affichent la ligne dans la
   bulle d'Olu, comme en surface tablette.
4. **Escalier et réglage** : rien ne s'affiche si `olu_erreur_du_jour` est coupé ou si la marche 2 n'est pas
   montée (`lib/glTenir.js`, ligne 210 : `round.oluErreur` vaut alors `null`).
5. **Garde-fous** : la correction n'arrive jamais à un écran d'élève avant que le prof ait désigné une équipe, ou
   avant la clôture ; aucun « Non », aucun « faux » ; le texte passe le test d'adresse (équipe : « vous »).
6. **Guide du prof** (`docs/reference/gl/guide-du-mj.md`, lignes 300-306 et 732-734) : « Olu glisse son erreur du
   jour » devient « l'erreur du jour d'Olu s'affiche en projection et sur les tablettes ; vous désignez l'équipe
   qui l'a trouvée depuis la console ». Règles, § 3 « Les écrans de séance ».
7. **Tests** : unitaire du hook (moment `erreur` → phrase de `round.oluErreur`) ; e2e : partie à la marche 2,
   projection et tablette affichent la phrase sans la correction ; après « Qui a trouvé l'erreur d'Olu ? » depuis
   la console, les deux affichent la correction.

### Étape 14 — « Tenir à deux », seul jeu : fermer les portes vers le classique · lot 3
**Constat vérifié le 23/11** :
- Une partie est « Tenir » si `isTenirGame(settings, game)` : réglage `gameplay.tenir_enabled` **et**
  `gl_games.tenir_profil` non nul (`lib/glTenir.js`, vers les lignes 126-140).
- `gameplay.tenir_enabled` vaut `true` en prod. Il est **coupable en un clic** dans Réglages → « Tenir à deux »
  (`src/gl/components/settings/GLTenirSettings.jsx`, ligne 12 : « Mouture « Tenir à deux » active (nouvelles
  parties) »). Le libellé ment : le coupé fait basculer **toutes** les parties en cours en classique.
- `PUT /api/gl/games/:id/tenir/profil` accepte `profil: null` = « retour aux règles classiques »
  (`routes/gl/games/tenir.js`, vers les lignes 117-125) ; le test `tests/gl-tenir-relecture.test.js` (vers la
  ligne 282) le garantit. `routes/gl/games.js` (vers la ligne 278) crée une partie en `complet` si le réglage est
  actif.
- Le guide du prof (`docs/reference/gl/guide-du-mj.md`, lignes 296-298) promet encore un retour « aux règles
  classiques (profil « aucun ») » depuis la console, qui ne l'offre plus.

**Changement attendu** :
1. Retire la case `gameplay.tenir_enabled` de `GLTenirSettings.jsx` (et de tout autre écran qui l'expose : dis
   où). La clé reste au registre avec son défaut `true`.
2. `PUT /tenir/profil` refuse `profil: null` (400, « Profil invalide (complet ou court) ») ; commentaire et
   message d'erreur alignés.
3. Création de partie : inchangée. Pas de migration, pas d'écriture sur les parties existantes.
4. Le reste du classique ne bouge pas (`isTenirGame`, profils de séance hérités, `turns_enabled`,
   `player_actions_enabled`, score d'équipe, cœurs, plateau découverte). Aucun texte n'annonce ce retrait aux
   élèves.
5. Docs : `guide-du-mj.md` (lignes 296-298) sans le retour au classique ; `docs/GL_GAMEPLAY_PRESETS.md` (vers la
   ligne 68) et `docs/GL_TENIR_A_DEUX.md` (« Mode « tenir » d'une partie ») : « une partie sans profil (ancienne
   partie) joue encore le jeu classique ; on ne peut plus y revenir » ; `docs/reference/gl/economie-marche-sorts.md` :
   encart en tête « Le jeu classique (cœurs, score d'équipe) n'est plus proposé ; ce document le décrit pour les
   anciennes parties ». Pour le § 0 des règles : « Tenir à deux est le jeu de G&L : plus de retour au jeu
   classique depuis l'interface ou l'API ; le code du classique sera retiré après deux séances ».
6. Tests : `tests/gl-tenir-relecture.test.js` : « profil `null` → 400, `tenir_profil` inchangé » ;
   `tests-ui/gl/GLTenirSettings.test.jsx` : la case n'est plus rendue ; laisse les tests qui posent
   `tenir_profil: null` sur une fixture.

### Étape 15 — Horodatages des tours (partie 16, B1) · lot 1
**Constat vérifié** : partie 16, tour 2 : `started_at` 14:22:43, `ended_at` 13:25:56 → durée −57 min. Cause :
`lib/glTour.js` écrit `started_at` et `phase_changed_at` avec `NOW()`, mais `updates.chapardeur_at = new Date()`
(vers la ligne 618) et `updates.ended_at = new Date()` (vers la ligne 626) en UTC.
- Écris ces deux colonnes avec `NOW()` (le constructeur `sets` de la fin de `changerPhaseTx` prend des valeurs
  liées : ajoute la colonne en littéral `= NOW()`). `lib/glSeuil.js` (ligne 101) le fait déjà.
- Cherche dans `lib/gl*.js` toute autre écriture d'un `new Date()` JS dans une colonne DATETIME comparée à des
  `NOW()`, et aligne-la.
- `lib/glDiagnostic.js` : une durée négative vaut `null` avec une note « horodatage incohérent ».
- **Hors chantier** : `time_zone = '+00:00'` sur chaque connexion du pool (touche tout ForêtMap). Signale-le.
- Test : un tour ouvert puis clos a `ended_at >= started_at` et une durée ≥ 0 dans le diagnostic.

### Étape 16 — Erreur du jour sans répétition (partie 16, B2) · lot 1
- `tirerErreurDuJour(db, plateau, gameId)` tire avec remise. Tirage **sans remise dans la partie** : exclus les
  `id` déjà présents dans `olu_erreur_json` des tours précédents de la même partie. Pool vide → repars du pool
  du plateau complet ; puis repli « tous », puis toutes, comme aujourd'hui.
- Tests : 6 lignes au plateau, 6 tours → 6 erreurs différentes ; 7e tour → une erreur déjà vue, jamais celle du
  tour 6. (Le plateau 1 passe à 6 lignes au lot 2 ; les tests utilisent leurs propres fixtures.)

### Étape 17 — Fin de l'ordre au tableau (partie 16, B3) · lot 1
**Constat** : après la dernière équipe de l'ordre, « Équipe suivante » rend la main à la première
(`lib/glTour.js › equipeSuivanteTx` : `ordre[(idx + 1) % ordre.length]`).
- Serveur : quand l'équipe active est la dernière de l'ordre, `equipeSuivanteTx` répond 409 `FIN_DE_L_ORDRE`
  (« Toutes les équipes ont joué. »), sans rien écrire.
- Écran : pour la dernière équipe, « Équipe suivante » est **absent** ; à sa place, « Le voile avance » passe le
  tour en phase `souffle` (geste existant). Ce bouton vit dans l'écran de l'équipe active de la console (étape 18,
  lot 7) : **le lot 1 fait le côté serveur seulement**, la console actuelle ne change pas.
- Tests : 4 équipes, 3 « suivante » → la 4e est active ; 4e « suivante » → 409, l'équipe active ne change pas.

### Étape 18 — Un seul écran d'équipe, partout ; au tableau, l'écran de l'équipe active dans la console (décision 23, S1 ; partie 16, B4 et B5) · lot 7

**Constat vérifié dans le code le 23/11 (v1.263.5)** — au tableau, la chasse n'a aucun chemin dans
l'interface :
- `src/shared/glTenirPermissionsCore.js` (vers les lignes 107-111) : en surface `tableau`, un élève n'a **aucun**
  geste (« le prof porte les cinq gestes pour l'équipe active »).
- L'écran d'équipe d'un élève, en surface `tableau`, est l'ancien `GLTenirEquipeView` (`src/gl/AppGL.jsx`,
  `ecranEquipeEnTrois` exclut `surface === 'tableau'`, vers la ligne 821) : il n'affiche que des boutons grisés.
- La console « Jouer le tour » (`src/gl/components/mj/GLTourScreen.jsx`, carte d'équipe vers les lignes 30-112)
  ne propose, par équipe, que la saisie des dés et « Équipe suivante » : **ni « Fouiller », ni « Lire »**.
- Le mode fouille du plateau (`chasse.setFouilleMode`) n'est armé que par un écran d'équipe ; le compte du prof
  n'en monte jamais (`ecranEquipeMonte` exige `auth.teamId`, `AppGL.jsx` vers la ligne 814).
- `src/gl/hooks/useGlChasse.js` accepte un `teamId` pour agir à la place d'une équipe (`fouiller`, `ouvrir`,
  `tenir`, réponse de zone), mais **aucun appelant ne le passe** ; `useGlTenirEquipe` ne le passe que pour
  `peripetiePasser`. Côté serveur, le MJ agit déjà pour une équipe (`routes/gl/games/chasse.js ›
  resolveGesteActorOrRespond`, `teamIdFromBody`).
- Aucun composant de la console ne lit `round.questionsEnAttente` (`lib/glTour.js` vers la ligne 162) ; rien
  n'empêche « Équipe suivante » sur une question due. Partie 16 : 0 question posée, 0 fouille en trois tours.

**Changement attendu** :
1. **Un seul écran d'équipe** : supprime `src/gl/components/tenir/GLTenirEquipeView.jsx` (et son test
   `tests-ui/gl/GLTenirEquipeView.test.jsx`), son montage dans `AppGL.jsx` et dans
   `src/gl/components/tenir/GLTeamSessionView.jsx` (vers la ligne 205). Retire la condition
   `surface !== 'tableau'` de `ecranEquipeEnTrois`. Toutes les tablettes et tous les comptes d'élèves montrent
   `GLTenirEcranEquipe`, quelle que soit la surface. En surface `tableau` (et après « Tout au tableau »), la carte
   du moment d'une tablette ou d'un compte dit « Le tour se joue au tableau. » (nouvel état de
   `src/gl/utils/glTenirMoment.js`, adresse « vous ») ; le reste de l'écran (plateau, bandeau, tiroir, bulle
   d'Olu) ne change pas. Si un composant ou un test de `GLTenirEquipeView` sert encore ailleurs, réutilise sa
   logique dans `GLTenirEcranEquipe` plutôt que de garder le fichier.
2. **Au tableau, l'écran de l'équipe active dans la console** : dans « Jouer le tour », en surface `tableau` et
   en phase `jeu`, un bloc **« Équipe active : {nom} »** monte `GLTenirEcranEquipe` pour l'équipe active
   (`round.equipeActiveId`), à la place des cartes d'équipe pour cette équipe (les autres cartes restent, en
   lecture). Le prof, ou un élève de l'équipe venu au poste, touche les mêmes boutons que sur une tablette :
   lancer, répondre, fouiller (le plateau du bloc passe en mode fouille, comme sur une tablette), lire et faire
   tenir, jeter un sort.
   - **Agir pour l'équipe** : une prop `agirPourEquipe` (ou un nom plus clair) fait passer le `teamId` de
     l'équipe active dans **tous** les appels de l'écran : `useGlChasse` (fouille, **sonde** de l'étape 35,
     ouverture de page, tenue, réponse de zone), le lancer et la saisie des dés, la question de case (`caseQuestion.presenter` et la
     réponse), l'assistant de sort, la péripétie. Le serveur accepte déjà le prof pour toute équipe
     (`glTenirPermissionsCore` : « le prof peut toujours tout faire ») ; vérifie chaque route et dis lesquelles
     demandaient le `teamId` dans le corps. N'ajoute aucune route.
   - **Bourses masquées** dans ce bloc (bandeau, tiroir, pot des sorts : montant total seulement) : l'écran du
     prof peut être recopié au vidéoprojecteur, et les bourses restent privées vis-à-vis de la classe. Ni
     « Changer d'équipe », ni badges, ni chimère dans ce bloc.
   - **Une chose à la fois** : la carte du moment fait déjà avancer le geste suivant (répondre, lancer, fouiller,
     lire, sorts). Quand l'équipe active n'a plus de geste ouvert, la carte du moment montre **« Équipe
     suivante »** (pour la dernière de l'ordre : **« Le voile avance »**, étape 17 : ce bouton se fait ici, le lot 1
     a fait le côté serveur). Un lien discret **« Passer »** permet au prof de passer à l'équipe suivante avant la
     fin (journalisé, motif facultatif).
   - **Question due** : tant qu'une question de case de l'équipe active n'est ni répondue ni passée, « Équipe
     suivante » est absent ; la carte du moment propose la question et, en petit, « Passer la question » (issue
     `passee`, journalisée, sans effet). Serveur : `equipeSuivanteTx` répond 409 `QUESTION_DUE` dans ce cas.
     Pour la fouille, pas de blocage serveur : l'écran suffit. « Passer la question » passe par une route
     existante (un champ de plus dans le corps de la réponse de case, par exemple) : si ce n'est pas possible sans
     route nouvelle, ne fais pas ce lien (une mauvaise réponse ne coûte rien) et dis-le.
   - La **projection** montre la question pendant qu'elle est posée (texte et choix, jamais la bonne réponse
     avant la réponse). Si la vue de projection ne porte pas le texte de la question, ajoute-le à sa réponse
     existante seulement si c'est un champ de plus dans la même réponse ; sinon, renonce et dis-le. **Pendant
     qu'elle est posée, le plateau de la projection est flouté comme celui de l'écran d'équipe** (étape 30, même
     classe `is-question-ouverte`), pour que la réponse ne se lise pas sur le dessin.
   - Le bloc « Équipe active » monte `GLTenirEcranEquipe` : il hérite du plateau flouté pendant une question
     (étape 30, lot 6) ; vérifie-le sur ta capture.
   - Ne touche pas aux droits des élèves au tableau : ils restent sans geste depuis leurs appareils ; c'est le
     poste du prof qui joue.
3. **Surface tablette** (et anciennes parties hybrides) : rien ne change, hormis la suppression de l'ancien écran
   (qui n'y servait pas).
4. **Fichier d'état des écrans de séance** (`docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md`, décision « S4 ») :
   note « tranchée par Oliv le 23/11 : nouvel écran partout (chantier G&L décisions, lot 7, étape 18) ».
5. **Docs** : règles § 3 (un seul écran d'équipe ; au tableau, l'écran de l'équipe active dans la console) ;
   `docs/API.md` (409 `QUESTION_DUE`, issue `passee`, `teamId` des gestes du prof s'il change) ; dans
   `docs/reference/gl/`, seulement les phrases devenues fausses (le lot 9 réécrit).
6. **Tests** :
   - unitaire `glTenirMoment` : surface tableau → « Le tour se joue au tableau. » pour une tablette ; écran de
     l'équipe active → gestes ouverts dans l'ordre, puis « Équipe suivante », puis « Le voile avance » pour la
     dernière ;
   - UI : `GLTourScreen` en surface tableau monte l'écran de l'équipe active, sans bourse ; `AppGL` / session
     d'équipe en surface tableau monte `GLTenirEcranEquipe` ;
   - serveur : question due → 409 `QUESTION_DUE` ; « Passer la question » (s'il existe) → la suite reprend ;
     fouille et tenue faites par le prof pour l'équipe active → acceptées, attribuées à l'équipe ;
   - **e2e au tableau** (`e2e/gl-*.spec.js`) : un tour complet de deux équipes — lancer, question, fouille, lecture
     d'une page, « Équipe suivante », puis « Le voile avance ». Les e2e qui visaient l'ancien écran sont réécrits
     sur le nouveau (liste-les).
   - Captures : console au tableau 1920 × 1080 (l'écran de l'équipe active pendant une fouille, puis « Équipe
     suivante », puis « Le voile avance »), tablette en surface tableau 1024 × 768, projection pendant une
     question.

### Étape 19 — Question de case : une case, trois sous le voile, sans relance (D1, décision 37) · lot Q
**Constat** : `lib/glTour.js › bonneReponseDeCaseTx` (vers la ligne 2146) avance d'une case **et** réarme le dé
(relance, bornée par `tenir_relances_max_par_tour`) ; 16 cases sur 43 du plateau 1 sont des cases question. Une
bonne réponse vaut ainsi environ 8 cases : le savoir paie en mouvement, contraire à la thèse.
- Une bonne réponse avance d'**une case**, ou de **trois si l'équipe est sous le voile** au moment de la réponse
  (`lib/glChasse.js › isSousVoile`, déjà utilisé par la chasse ; c'est le même voile que la projection montre). Le
  savoir aide d'abord ceux qui sont derrière. Plus de réarmement du dé, plus d'effet `relance_case`.
- La case d'arrivée du bonus s'applique, **sauf une case question** : jamais deux questions de suite (une seule
  question par arrivée de jet). Au camp, on s'arrête au camp. Le bonus ne s'ajoute ni au vent ni à Progression.
- L'évènement `relance_bonus` garde son nom, avec `cases` (1 ou 3), `sousVoile` et `relance: false` ; le journal dit
  « une case de plus » ou « trois cases de plus : l'équipe sort du voile » (si elle en sort) ou « trois cases de
  plus ».
- La bonne réponse donne aussi **une sonde** (étape 35).
- `tenir_relances_max_par_tour` reste au registre ; il ne sert plus aux questions de case. Aligne
  `lib/glTenirInvariants.js` (vers la ligne 482).
- Migration idempotente (étiquette `N+2`, numéro réel à la fusion), gardée par l'ancien texte exact (vérifié en
  prod le 23/11 à 20 h 25 : 61 cases portent exactement ces deux textes) :
  - `description` : `'Une question du biome. Bonne réponse : une case de plus et vous relancez.'` →
    `'Une question du biome. Bonne réponse : la caravane avance d''une case, de trois sous le voile, et vous sondez le plateau.'`
    (61 cases, plateaux 1 à 4) ;
  - `effet_mecanique` : `'Question sur le biome. Bonne réponse : l''équipe avance d''une case et relance le dé
    (une relance par tour). Pas encore : rien ne change, on repart.'` → `'Question sur le biome. Bonne
    réponse : l''équipe avance d''une case (de trois si elle est sous le voile) et peut sonder le plateau une fois
    dans le tour. Pas encore : rien ne change, on repart.'`.
- `data/gl/tenir/olu-lignes.json` (et `exemple/` si un test les lit) : `olu-14` → « Juste ! La caravane avance, et
  vous pouvez sonder le plateau. » ; `olu-18` → « La ou le Gestionnaire a tranché. Une équipe qui tranche, j'aime
  ça. » (forme double). `olu-pf-avancer` (« Une bonne réponse, et elle avance encore d'une case. ») reste vrai : n'y
  touche pas.
- Règles (§ 4 « questions de case », § 5 « la chasse » pour la sonde), guide du prof : aligne-les.
- Tests : bonne réponse hors voile → +1 case, dé non réarmé ; sous le voile → +3 ; bonus qui finit sur une case
  question → pas de seconde question ; bonus qui finit au camp → camp ; évènement `relance_bonus` avec `cases` et
  `sousVoile`.

### Étape 20 — Escalier en cinq marches, une par jour (D3) · lot 5, même commit que l'étape 26
**Constat** : `src/shared/glTenirEscalierCore.js › ESCALIER_MARCHES` a 4 marches (séance 1 : `avancer`,
`chercher`, `defi_case`, `trame` ; séance 3 : `voile`, `page_temoin`, `sorts`, `lumiere`), avec 4 lignes
« première fois » d'Olu dans la même ouverture le 23/11. `lib/glTour.js` (vers la ligne 679) monte une marche à
**chaque** tour clos : deux tours joués le même jour ont ouvert deux marches.
- Nouvelles marches (Relance, `SL005`, n'y figure plus : étape 26) :

| Séance | `modules` | `sorts` |
|---|---|---|
| 1 | `avancer`, `chercher`, `trame` | — |
| 2 | `tenir`, `erreur_du_jour`, `defi_case` | — |
| 3 | `voile`, `page_temoin` | — |
| 4 | `sorts`, `lumiere` | `SL002`, `SL037`, `SL039`, `SL042`, `SL044` |
| 5 | `marche` | `SL036`, `SL004` |

  Le commentaire d'en-tête suit (marche 5 : « Farce, Question »). `ESCALIER_DERNIERE_SEANCE` passe à 5 de
  lui-même ; vérifie le validateur `escalier_pas` de `lib/glTenir.js` et `normaliserPas`.
- **Une marche par jour** : à la clôture d'un tour (`motif: 'tour_clos'`), ne monte la marche que si la dernière
  montée de la partie (dernier évènement `escalier_pas`, ou création de la partie pour la marche 1) date de **plus
  de 12 h** — comparaison en SQL, `NOW()` contre `created_at`. « Ouvrir la suite » du prof (`motif: 'prof'`)
  n'est pas bridé.
- Parties en cours : une partie au pas 4 garde son pas (elle voit Marché et sorts déjà ouverts : on ne referme
  rien).
- Libellés `lib/glJournalPresentTenir.js › ESCALIER_LABELS` : « trois sorts » à la marche 4 (trois par peuple),
  « deux sorts » à la marche 5.
- Tests : `tests/gl-tenir-escalier-pure.test.js` (marches, cumul, sorts ; les assertions sur `SL005` aux lignes 55,
  74, 103 et 109 changent) ; deux tours clos le même jour → une
  marche ; tour clos 13 h plus tard → marche suivante ; « Ouvrir la suite » le même jour → monte.
- Docs : règles (escalier), guide du prof (séance par séance), `GLTenirProfilPanel` s'il décrit les marches.
  Écris-y aussi : **un chapitre 1 joué en quatre séances n'atteint pas la marche 5** (Marché, Farce, Question
  s'ouvrent alors au plateau 2, où tout est ouvert) ; pour les ouvrir quand même, « Ouvrir la suite » à la
  séance 4. Le lot 9 le reprend dans essentiel-mj et deroule-partie.

### Étape 21 — Page témoin derrière la dernière équipe (D4) · lot 5
**Constat** : `lib/glEscalier.js › poserPageTemoinTx` pâlit la zone endormie au plus petit `rang_case` (au
plateau 1, toujours cz-p1-05, rang 5, loin derrière les équipes).
- Choisis la zone endormie au **plus grand `rang_case` inférieur ou égal au rang de la dernière équipe** (hors
  camp) ; s'il n'y en a pas, garde la règle actuelle (plus petit rang). Le reste ne change pas.
- N'ajoute rien à la projection ; note dans ton fichier de lot si elle montre déjà les zones pâlies.
- Tests : équipes aux rangs 12, 12, 13, 16, zones endormies aux rangs 5, 6, 7, 21 → zone du rang 7 ; toutes
  devant → zone du rang le plus petit.

### Étape 22 — Textes d'écran : vérité des cases, vent (choix par défaut)
**Textes · lot 2**
- `src/shared/glTenirCaseEffetCore.js` (vers la ligne 211) : `'Une case favorable : on repart, sans gain.'` →
  `'Belle rencontre : la caravane repart.'` ; aligne `tests/gl-tenir-case-effet-core.test.js`.
- **Test de contenu des cases** : étends l'esprit de `gl-adresse-ecran-equipe` aux cases du plateau 1 en base
  (`gl_chapter_markers.description` et libellés de `event_config_json.effects.*.label`, chapitre du plateau 1),
  avec un vrai `t.skip` sans corpus : aucun tutoiement (` tu `, ` te `, ` t'`, ` ton `, ` ta `, ` tes `,
  impératif « Tire »). Plateaux 2 à 4 : compte leurs occurrences et mets le nombre dans ton fichier de lot, sans
  faire échouer le test.

**Vent · lot 6**
- Vent de la caravane posant une équipe sur une case dont l'effet ne joue pas : la projection et la tablette
  disent « Porté par le vent : la case ne joue pas. » (au lieu d'un résumé vide).

### Étape 23 — Passeur du plateau 1 et « corbeau » (D7) · lot 2
- `data/gl/tenir/passeur-plateau4.json`, plateau `"1"` : la liste devient, dans cet ordre (déjà en prod) :

```json
"1": {
  "nb": 5,
  "pages": [
    { "feuillet_code": "ep-V-01", "ordre_voyage": 1042, "titre": "Premier pays, les premiers jours. La chaleur.", "biome_slug": "jungle_afc", "ordre": 1 },
    { "feuillet_code": "ep-I-sem", "ordre_voyage": 1043, "titre": "Premier pays. Un oiseau bleu.", "biome_slug": "savane", "ordre": 2 },
    { "feuillet_code": "ep-V-02", "ordre_voyage": 6002, "titre": "Toujours la chaleur. Une semaine plus tard, peut-être deux.", "biome_slug": "jungle_afc", "ordre": 3 },
    { "feuillet_code": "ep-V-03", "ordre_voyage": 1052, "titre": "Encore les tropiques. La nuit du grand bruit.", "biome_slug": "savane", "ordre": 4 },
    { "feuillet_code": "ep-seuil-1", "ordre_voyage": 1085, "titre": "Au bord des terres sèches.", "biome_slug": "savane", "ordre": 5 }
  ],
  "note": "ordre du récit (V-02 avant V-03) ; ep-I-colonne retirée (page de la zone cz-p1-04) ; ep-VI-02 retirée (son texte écrit le cri de l'oiseau), décision d'Oliv du 23/11"
}
```

  L'import désactive de lui-même les ordres 6 et 7 (`importPasseur`, désactivation par plateau).
- Le Passeur et une zone de chasse ne partagent plus une page : ajoute au test de contenu du Passeur « aucune page
  du Passeur n'est la page d'une zone active du même plateau » ; liste les doublons des plateaux 2 à 4 sans les
  corriger.
- Canal `espece_pays` : en partie « Tenir », une page du Passeur ne doit pas se gagner aussi par une fiche espèce
  (partie 16 : ep-V-01 par la fiche SP0027, puis relue par le Passeur). Voie la plus simple — exclure les pages du
  Passeur de la révélation par espèce (`lib/glLoreFeuilletSpeciesReveal.js`) en partie « Tenir », ou ne pas relire
  au Passeur une page déjà au carnet — et dis laquelle.
- **« Corbeau »** : `src/shared/glGardeFousCore.js` interdit `corbeau` pour l'interface et les catalogues ; les
  pages de Sélène le disent, c'est voulu. Écris-le dans le commentaire d'en-tête du noyau (« les feuillets du carnet
  ne passent pas par ce filtre ; le nom propre et le cri restent interdits partout ») et dans les règles § 1.
  Aucun changement de liste.

### Étape 24 — Catalogues : erreurs d'Olu, péripéties, retours de zones · lot 2
**`data/gl/tenir/olu-lignes.json`** (et `exemple/` si un test y lit ces lignes) :

| id | Champ | Nouveau texte |
|---|---|---|
| `olu-56` | `texte` | « Le baobab pousse au cœur de la forêt équatoriale. » |
| `olu-56` | `correction` | « Il pousse dans la savane : son tronc garde l'eau pour la saison sèche. » |
| `olu-58` | `correction` | « Les champignons ne sont ni des plantes ni des animaux : ils forment un groupe à part, et beaucoup sont des décomposeurs. » |
| `olu-61` | `correction` | « La plupart sont des conifères qui gardent leurs aiguilles ; le mélèze les perd, comme les bouleaux. » |
| `olu-64` | `correction` | « Ils mangent du bois et des végétaux morts : ce sont des décomposeurs. » |
| `olu-55` | `texte` | « Au pôle Nord, on croise des manchots. » |
| `olu-55` | `correction` | « Les manchots vivent dans l'hémisphère Sud ; il n'y en a pas dans le Grand Nord. » |

Ajouts (`olu-67` à `olu-77` sont pris : `olu-78` à `olu-81`), sur le modèle de `olu-56` (`moment: "erreur"`,
`expression: "explique"`, `variables: []`, `plateaux: [1]`) :

| id | `texte` | `correction` |
|---|---|---|
| `olu-78` | « Le lion est le roi de la jungle. » | « Le lion vit dans la savane, pas dans la forêt équatoriale. » |
| `olu-79` | « Le sol de la forêt équatoriale est très riche. » | « Il est pauvre : les feuilles mortes y sont décomposées et réutilisées très vite. » |
| `olu-80` | « Dans la forêt équatoriale, il ne pleut presque jamais. » | « Il y pleut presque tous les jours, toute l'année. » |
| `olu-81` | « Dans la savane, les arbres perdent leurs feuilles à cause du froid. » | « Ils les perdent à la saison sèche, pour garder leur eau. » |

Test de contenu : au moins 6 lignes `erreur` pour le plateau 1 (compte les plateaux 2 à 4).

**`data/gl/tenir/peripeties.json`** (formes doubles des rôles) :

| id | Nouveau texte |
|---|---|
| `per-01` | « Une mangouste a volé le dé. La ou le Gestionnaire relance de la main qui n'écrit pas. » |
| `per-02` | « Pluie de mousson sur la caravane : l'équipe répond à la prochaine question en chuchotant, et l'Opératrice ou l'Opérateur tranche en mimant. » |
| `per-04` | « Un calao s'est posé sur la carte. L'Éclaireuse ou l'Éclaireur désigne la fouille sans parler, du bout du nez. » |
| `per-06` | « Le baobab a soif : chaque membre dit un mot qui contient la lettre O avant que la ou le Gestionnaire ne lance. » |
| `per-07` | « Nuit dans la savane : l'équipe répond à la prochaine question les yeux fermés, en écoutant la ou le Secrétaire lire deux fois. » |

Textes alignés le 24/11 sur l'échange des rôles (décision 35 de l'addendum 4 : l'Opératrice ou l'Opérateur répond,
l'Éclaireuse ou l'Éclaireur fouille ; les dés restent à la ou au Gestionnaire). Aligne `tests/gl-tenir-import.test.js`
(ligne 33 lit « L'Opérateur relance »). Les péripéties des autres plateaux (`per-09` à `per-32`), la mission `mis-09`
et le badge `trouveur` sont réécrits à l'étape 24 quinquies-R de l'addendum 4, dans le même lot.

**`data/gl/tenir/qcm-feedbacks-zones.json`** : `QCM0069`, `QCM0251` et `GQCM0766` ont été réécrites en prod le
23/11 avec leurs retours (§ 5bis). L'import n'écrase pas un retour d'auteur, mais le fichier dit la vérité :
remplace `feedbacks.QCM0069` et `feedbacks.QCM0251` par les retours de l'annexe B ; remplace le bloc
`remplacement` (GQCM0766) par la version de l'annexe B ; ajoute à `note` : « questions des zones du plateau 1
réécrites le 23/11 (audit de la partie 16) ; la migration 344, gardée par l'ancien énoncé, ne s'applique plus ».

### Étape 24 quinquies — Questions qui se lisent sur le plateau ou dans l'indice (décision 34) · lot 2

**Constat du 24/11** (prod v1.263.5, plateaux regardés image par image) : 26 des 28 questions de zone des plateaux 2
à 4 se répondaient par leur propre indice (ex. `cz-p2-05` : l'indice dit « qui ne pousse naturellement qu'au
sud-ouest du Maroc », la question demandait où l'arganier est endémique) ; dix questions du tirage des cases
demandaient le nom d'une espèce peinte sur le plateau du chapitre (`QCM0092` et `QCM0278` : les éléphants, cas
probable signalé par Oliv). Les questions de zone et de case ne vivent qu'en base (`gl_qcm_questions`).

**Déjà fait en prod, ne le refais pas** (24/11 vers 11 h 55, par le connecteur, sur feu vert d'Oliv, relu en prod,
§ 5bis) : les 28 questions sont réécrites (énoncé, choix, bonne réponse, retours) et les dix questions de case sont à
`usage_tenir = 0`. Aucune session n'écrit en prod (§ 00.1). Pour une installation neuve, les dix codes sont ajoutés à
la liste de l'étape 12 (lot 3).

**Ce que fait le lot 2** :
1. **`data/gl/tenir/qcm-feedbacks-zones.json`** (le fichier dit la vérité, même si l'import n'écrase pas un retour
   d'auteur) : remplace les entrées de ces cinq questions réécrites par les retours ci-dessous (la bonne lettre n'a
   pas de retour) ; ajoute à `note` : « questions des zones des plateaux 2 à 4 réécrites le 24/11 ; les retours
   ci-dessus suivent les nouveaux énoncés ».

   ```json
   {
     "QCM0436": {
       "a": "La cendre ne refroidit rien. Regarde plutôt ce que le feu a dégagé autour du sol.",
       "c": "Les insectes reviennent vite après un feu. Qu'est-ce qui a changé au-dessus du sol ?",
       "d": "Il n'y a pas de pluie spéciale après un feu. Pense à ce qui manquait au pied des grands arbres, avant.",
       "e": "Une graine brûlée ne pousse plus. Celles des cônes fermés ont été protégées : où tombent-elles ?"
     },
     "QCM0195": {
       "a": "Ce ne sont pas des lianes : elles restent au ras du sol. Que reste-t-il d'elles quand tout est sombre ?",
       "b": "Elles reviennent chaque année au même endroit. Comment, si on ne les voit plus en été ?",
       "c": "Sans lumière, une fleur ne fabrique plus assez de sucre. Relis leur fiche : que font-elles de leurs réserves ?",
       "d": "Une plante ne marche pas. Relis leur fiche : où vont leurs réserves quand les feuilles fanent ?"
     },
     "QCM0396": {
       "b": "Un barrage de branches s'use : il faut le réparer sans cesse. Que devient l'eau quand personne ne le fait ?",
       "c": "L'eau gèle l'hiver, pas toute l'année. Que devient l'eau retenue sans le barrage ?",
       "d": "Seul le castor sait construire un barrage. Que devient l'eau retenue quand il part ?",
       "e": "Le feu n'a rien à voir avec le départ du castor. Pense à l'eau qu'il retenait."
     },
     "QCM0369": {
       "a": "L'engrais des saumons aidait les arbres. Que se passe-t-il s'il manque ?",
       "b": "Le saumon ne sale pas la rivière. Que perd le sol sans lui ?",
       "c": "Les ours mangent aussi des baies, mais ils ne changent pas pour toujours. Pense plutôt aux arbres.",
       "d": "Tout est relié dans la taïga. Relis la fiche du saumon : où finit son corps ?"
     },
     "QCM0138": {
       "a": "Le vent ne profite de rien. Qui pourrait venir se poser au chaud dans la fleur ?",
       "b": "Un renne ne se chauffe pas en mangeant une fleur. Qui est assez petit pour s'y poser ?",
       "c": "La neige a déjà fondu quand le pavot fleurit. Qui vient se poser sur la fleur ?",
       "e": "Aucun oiseau ne couve dans une fleur. Relis sa fiche : qui la pollinise ?"
     }
   }
   ```
2. **Test de contenu** `tests/content/gl-zones-indice-reponse.test.js` (vrai `t.skip` sans corpus en base) : pour
   chaque zone active de `chasse-zones.json` qui a un `question_code`, aucun mot de six lettres ou plus de
   `reponse_texte` (minuscules, sans accents) ne figure dans l'`indice` de la zone. Liste blanche commentée, une
   ligne par exception : `cz-p1-03` (« feuilles »), `cz-p1-04` (« petites »), `cz-p4-02` (« ruisseau »). Message
   d'échec en français, avec la zone, le mot et l'indice. Ne corrige aucune donnée pour faire passer le test : les
   réécritures étant en prod, il doit passer sur une copie de la base de prod ; s'il échoue, c'est un écart nouveau,
   écris-le dans ton fichier de lot.
3. Ne touche à aucun indice ni à aucun polygone de `chasse-zones.json`.

### Étape 25 — Journal et tour resté ouvert (partie 16, B11) · lot 5
- Journal (`lib/glJournalPresentTenir.js` ou l'insertion) : les pages données à l'ouverture d'une partie
  (aujourd'hui une ligne par page et par équipe, 20 lignes) se présentent en **une** ligne « Les équipes reçoivent
  les pages d'ouverture. » ; deux lectures de la même page par la même équipe à moins de 60 s ne font qu'une
  ligne.
- Console : à l'ouverture de l'écran du tour, si le tour courant est ouvert depuis plus de 12 h (calcul serveur,
  `NOW()` contre `started_at`), un bandeau propose « Le tour du {date} est resté ouvert. Le clore ? » (geste
  existant de passage en phase `clos`). Rien d'automatique.
- Tests : rendu du journal regroupé ; bandeau présent à 13 h, absent à 2 h.

### Étape 26 — Retirer le sort Relance (décision 24, S3) · lot 5, même commit que l'étape 20

**Constat vérifié le 23/11** :
- Relance (`SL005`, 2 gemmes, fenêtre `apres_jet`, 1 par tour et par équipe ; `lib/glSpellEffects.js` :
  `{ type: 'reroll', annule_precedent: true }`) est le seul sort qui fait **attendre** une case :
  `lib/glArriveeSuspendue.js` ne suspend l'arrivée que si l'équipe peut encore lancer Relance
  (`relanceDisponibleTx`, requête sur `gl_spells` jointe à `gl_chapter_spells`). Il entraîne l'état « Garder ce
  jet » / « Relance… » de la carte du moment, le bloc de console « Jets en attente (Relance possible) » et la
  règle « Relance rendue au souffle, premier jet réappliqué ».
- Avec la décision 17 (question de case sans relance), le mot « relance » sort entièrement du jeu.
- Les sorts déjà retirés (Nommer, Boussole, Héritage, Tablette, Musique, Lumière) portent `"actif": false` dans
  `sorts.json` et sont absents de `ouverture_par_chapitre`.

**Changement attendu** :
1. `data/gl/tenir/sorts.json` : `SL005` reçoit `"actif": false` et sort d'`ouverture_par_chapitre["1"]`
   (≈ l. 662). **Vérifie que l'import retire aussi le lien `gl_chapter_spells`** du chapitre du plateau 1 (sinon
   `relanceDisponibleTx` le verrait encore) ; s'il ne le fait pas, ajoute une migration idempotente (numéro
   `N+3`) qui supprime le lien `SL005` de `gl_chapter_spells`, et dis-le. La ligne reste en base, non lançable,
   comme les autres sorts retirés.
2. `src/shared/glTenirEscalierCore.js` : `SL005` hors de la marche 5 (étape 20). Le test de contenu qui compare
   `ESCALIER_SORTS` à `ouverture_par_chapitre["1"]` reste vert : d'où le même commit que l'étape 20.
3. `data/gl/tenir/olu-lignes.json` : `olu-41` (« Relance ! Le dé a droit à une seconde chance… ») passe
   `"actif": false`. Dans le même commit, `olu-pf-marche` (dite à la marche 5, pendant l'ouverture du tour, alors que
   le Marché est fermé pendant le tour depuis S4) devient : « Le Marché ouvre, hors du tour, depuis ton compte. Ce
   que tu y achètes, tu le gardes toute l'année. » (le « tu » reste : exception déjà déclarée par
   `tests/content/gl-adresse-ecran-equipe.test.js`) ; copie `exemple/` alignée si un test la lit.
4. **Code de l'arrivée en suspens** : il reste, inerte (sans Relance ouvert, `relanceDisponibleTx` renvoie `null`
   et la case s'applique tout de suite). Ne le supprime pas : il partira avec le nettoyage d'après deux séances.
   Les tests qui exercent ce mécanisme (`tests/gl-grimoire-v2.test.js`, `tests/gl-tenir-jets-paralleles.test.js`,
   `tests/gl-tenir-droits-serveur.test.js`, `tests/gl-ensemble-unifie-escalier.test.js`,
   `tests-ui/gl/GLTenirEcranEquipe.test.jsx`) gardent leurs fixtures où `SL005` est actif
   (`data/gl/tenir/exemple/`) : ils testent un code encore présent. Ajoute un test : avec le catalogue réel, aucun
   sort actif n'a l'effet `reroll`, et un jet au plateau 1 s'applique sans suspension.
5. Règles : § 10 (grimoire à **18 sorts** ; Relance dans « Sortis du grimoire »), § 3 (la règle « Relance rendue
   au souffle » et le bloc des jets en attente : « sans objet depuis le retrait de Relance »), § 15 (escalier) ;
   ligne du 23/11 pour le § 0 (lot 8). Test de contenu `tests/content/gl-tenir-donnees.test.js` (vers la
   ligne 150 : liste des sorts) à aligner. `economie-marche-sorts.md` : ajoute à l'encart posé par l'étape 14 « le
   sort Relance est retiré ».
6. Banc : `ensemble-unifie --runs 5 --seed 14` ; note la dépense de gemmes par élève et par chapitre, avant /
   après (Relance était un débouché des gemmes).

### Étape 27 — Deux surfaces, pas trois (décision 25, S2) · lot 3
**C'est l'étape 1 de l'annexe C** (prompt de la documentation), faite ici parce qu'elle touche les mêmes fichiers
que l'étape 14. Applique-la telle quelle (sélecteurs « Tablettes (les équipes jouent en même temps) » et « Tableau
(une équipe à la fois, le prof porte les gestes) » ; partie déjà hybride : option désactivée « Hybride (ancienne
valeur) » ; aucune migration ; moteur, registre et permissions inchangés ; tests), avec en plus :
- les libellés des réglages qui disent « tablette / hybride » (`GLTenirSettings.jsx`, lignes 17 et 106) disent
  « tablettes » ;
- docs du sujet (règles § 2 et M12 : « deux surfaces proposées ») ; la réécriture complète vient au lot 9 ;
- ton entrée de CHANGELOG du lot 3 porte la ligne « les surfaces proposées sont Tablettes et Tableau ».

### Étape 29 — Bilan Team Spirit : le formulaire relit ce qui est enregistré (audit du 19/11, J10) · lot 3
**Constat vérifié le 23/11 sur v1.263.5** : `src/gl/components/mj/GLTeamSpiritPanel.jsx` (lignes 12-15) repart à
chaque ouverture de « 6 cartes gardées, aucune retirée » ; il n'envoie pas la liste des cartes retirées
(`cartes_json` reste vide). Un second enregistrement du bilan **efface les retraits** : la compétence « Coopérer »
(barème 6 / 4-5 / 2-3 / 0-1, export Team Spirit) et l'honneur « Esprit d'équipe » sortent faux. La Lumière, elle,
ne compte jamais deux fois (`lumiere_comptee`, `lib/glTour.js` vers la ligne 2280).
- Le panneau charge le bilan déjà enregistré du tour courant par la route **existante**
  `GET /api/gl/games/:id/tenir/tour/team-spirit` (`routes/gl/games/tenir-tour.js`, vers la ligne 1011), et coche
  les cartes retirées d'après `cartes_json` ; à défaut (ancien bilan sans liste), il retire autant de cartes que
  `6 − cartesGardees`, dans l'ordre du panneau, et l'écrit en petit : « Bilan déjà enregistré : à vérifier ».
- À l'enregistrement, il envoie aussi `cartes` (la liste des cartes retirées), que le serveur écrit déjà dans
  `cartes_json`.
- Props ajoutées : `gameId` et `roundNumber`, passées par `GLTourScreen.jsx` (modification minimale).
- Tests UI : bilan enregistré avec deux cartes retirées → rouvert, les deux restent retirées ; second
  enregistrement sans toucher → mêmes `cartesGardees` et `cartes`.

### Étape 30 — Une question ne se lit jamais avec sa réponse visible (décision 27) · lot 6

**Signalé par Oliv le 24/11** : la réponse d'une question se lit parfois sur le plateau autour de la fenêtre (une
espèce, l'éléphant par exemple, bien visible derrière). **Constat lu dans le code le 24/11 sur v1.263.5** (pas vu à
l'écran ; la question exacte qu'Oliv a vue n'est pas identifiée) :
- **Fenêtre de question d'une case** (`src/gl/components/GLQcmPopover.jsx`, montée par `GLGameBoard.jsx` vers la
  ligne 803, ouverte à l'arrivée par `useGLMarkerArrival`) : son fond `.gl-qcm-popover-overlay`
  (`src/gl/styles/gl-theme.css`, vers les lignes 2868-2888) vaut `rgba(15, 23, 42, 0.48)`, **sans flou** ; la
  fenêtre fait 480 px de large au plus (`.gl-qcm-popover`, vers la ligne 2905). Le plateau se lit à travers le fond
  et tout autour de la fenêtre.
- **Écran d'équipe « Tenir »** (`src/gl/components/tenir/GLTenirEcranEquipe.jsx`, vers les lignes 282-289) : la
  question de case (« La question de la case ») et la question de zone (« Une page dort ici ») passent dans la carte
  du moment (`GLTenirMoment`, `moment.type === 'question'`, vers les lignes 155-174), **à côté** du plateau
  `.gl-tenir-ecran__plateau`, qui reste net : aucune fenêtre, aucun fond.
- Vérifie lequel des deux chemins s'ouvre sur une tablette « Tenir » à l'arrivée sur une case question
  (`markerArrivalEnabled` passé par `GLTeamSessionView.jsx` vers la ligne 152, et l'écran d'équipe en trois
  choses) ; dis-le dans ton fichier de lot. La correction couvre les deux.

**Changement attendu** (CSS et une classe ; aucune route, aucune donnée, aucun réglage, aucun texte) :
1. **Fond de la fenêtre de question** (`.gl-qcm-popover-overlay`) : `background: rgba(1, 58, 64, 0.94)` (le vert
   pétrole du jeu, `--gl-color-primary`) et `backdrop-filter: blur(16px) saturate(0.4)`, avec
   `-webkit-backdrop-filter` identique. La fenêtre elle-même ne change pas ; l'animation de sortie
   (`src/shared/styles/motion.css`, `overlayFadeOut`) reste. Vérifie que les boutons de la fenêtre gardent leur
   contraste (WCAG AA).
2. **Plateau de l'écran d'équipe pendant une question** : quand `moment.type === 'question'` (case ou zone), le
   conteneur `.gl-tenir-ecran__plateau` reçoit la classe `is-question-ouverte` et `aria-hidden="true"` ; dans
   `src/gl/styles/gl-tenir.css` : `filter: blur(14px) saturate(0.3) brightness(0.75)`, `pointer-events: none`,
   transition de 200 ms (aucune sous `prefers-reduced-motion`). Le plateau redevient net dès que la question est
   répondue, fermée ou passée. N'emploie pas le mot « voile » dans le nom de classe (c'est un mot du jeu). Le mode
   fouille (`is-fouille`) ne change pas : une fouille n'est pas une question.
3. Le même écran sert au bloc « Équipe active » de la console (lot 7) et à toutes les surfaces : il hérite du flou.
   La projection pendant une question posée est traitée au lot 7 (étape 18), avec la même classe.
4. **Hors champ** : la fenêtre « Marquer comme lu » (`LearningQuizPopover`, `.fm-quiz-popover`) garde son fond : le
   texte derrière est celui qu'il faut avoir lu. Le plateau découverte (`GLGuestDemoBoard`) ne change pas.
5. **Tests** :
   - UI `tests-ui/gl/GLTenirEcranEquipe.test.jsx` : moment `question` d'origine `case`, puis `zone` → classe
     `is-question-ouverte` et `aria-hidden` sur le plateau ; moment `lancer` ou `fouille` → absents ;
   - CSS, sur le modèle de `tests/visit-map-animations-css.test.js` : `.gl-qcm-popover-overlay` a un fond d'opacité
     ≥ 0,9 et un `backdrop-filter` ; `.gl-tenir-ecran__plateau.is-question-ouverte` a un `filter` avec `blur`.
6. **Captures** (`docs/captures/gl-decisions/lot-6/`) : avant / après, tablette 1024 × 768 pendant une question de
   zone ; fenêtre de question d'une case du plateau ouverte.
7. CHANGELOG (dans l'entrée du lot 6) : « la réponse d'une question ne se lit plus sur le plateau, derrière ou à côté
   de la fenêtre ». Aucune doc de référence à changer.

**Limite, à écrire dans ton fichier de lot** : ce correctif empêche de lire la réponse **pendant** la question. Une
équipe qui a regardé le dessin **avant** d'ouvrir la zone sait déjà ce qui y est dessiné : une question de zone qui
demande seulement de nommer l'espèce dessinée ne teste rien. Ce tri des questions est l'objet de l'étape 24 quinquies
(données passées en prod le 24/11, test au lot 2).

### Étape 28 — Docs du prof et réécriture de la documentation · lot 9
Voir la fiche du lot 9 (§ 4) et l'annexe C.

### Étape B1 — Onglets des biomes : chaque texte dans son onglet (décision B1) · lot B

**Constat vérifié le 24/11 sur v1.263.5** (code, base de prod, reproduction locale) :
- Page « Nature » → biomes du plateau (`GLNatureView` → `GLEcosystemsView`) : un plateau à deux biomes affiche deux
  onglets. **Tout le texte (biotope et biocénose des deux biomes) s'affiche dans le premier onglet ; le second n'a
  que les images du catalogue.** Vu par Oliv au plateau 1 ; les plateaux 2, 3 et 4 ont la même structure en base et
  sont touchés aussi.
- Cause : `src/gl/utils/glEcosystemSections.js › splitMarkdownByBiomes` découpe le markdown **seulement sur les
  titres `## `** et rattache au premier biome tout titre qu'il ne reconnaît pas, ainsi que le préambule. En prod,
  `gl_chapters.biotope_markdown` et `biocenose_markdown` des chapitres 3 à 7 sont tous construits ainsi :
  ```
  [préambule : une image par biome + légende en italique]   (P1, P3, P4 ; P2 n'en a pas)
  ## Le biotope — milieu de vie        (ou ## La biocénose — communauté du vivant)
  ### <biome A>
  texte
  ### <biome B>
  texte
  ```
  Le seul `##` (« Le biotope — milieu de vie ») ne correspond à aucun biome → tout part dans le premier onglet.
  Les `###` ne sont jamais lus.
- Reproduit en local : avec les biomes `jungle_afc` / `savane`, `buildEcosystemSections` rend 138 caractères pour la
  jungle et **0** pour la savane.
- Effet secondaire : l'image de la savane du préambule (`gl-biome-savane-01.png`) s'affiche dans l'onglet de la
  jungle.
- L'écran fusionne biotope et biocénose dans un seul bloc (`prepareEcosystemSectionMarkdown`) et ne rend **aucun**
  titre « Biotope » / « Biocénose » : le commentaire de `REDUNDANT_HEADING_RE` (`glEcosystemMarkdown.js`), qui dit
  le contraire, est faux.

Biomes liés en prod (`gl_chapter_biomes`, dans l'ordre) :

| Chapitre | Biomes | Titres `###` du texte |
| --- | --- | --- |
| 3 tropiques-africains (P1) | `jungle_afc` « Jungle d'Afrique centrale », `savane` « Savane tropicale » | « Jungle d'Afrique centrale », « Savane » |
| 4 aride-chaud (P2) | `sahara` « Désert chaud (Sahara) », `foret_mediterraneenne` | « Le Sahara », « Forêt méditerranéenne » |
| 5 tempere-atlantique (P3) | `foret_caducifoliee` « Forêt caducifoliée tempérée », `landes` « Landes atlantiques » | « Forêt caducifoliée », « Landes atlantiques » |
| 6 eurasie-continentale (P4) | `taiga` « Taïga (forêt boréale) », `toundra` « Toundra arctique » | « Taïga », « La limite des arbres », « Toundra — été polaire », « Toundra — nuit polaire » |
| 7 toundra-arctique (épilogue, sans plateau) | `toundra` seul | sans objet (un seul biome, pas d'onglets) |

Vérifié avec la logique actuelle `resolveBiomeForHeading` : tous les `###` ci-dessus se résolvent vers le bon biome,
sauf « La limite des arbres » (aucun) ; tous les `alt` des images de préambule aussi (« La jungle d'Afrique
centrale », « La savane africaine », « La forêt caducifoliée », « Les landes atlantiques », « La taïga », « La
toundra — été polaire / nuit polaire »).

**Changement attendu** (un seul fichier de logique ; aucune donnée en base, aucune route, aucun réglage) :

Réécris `splitMarkdownByBiomes(markdown, biomes)` (même signature, même retour `Map<slug, markdown>`) :
1. **Un seul biome** : texte entier, comme aujourd'hui.
2. **Lecture par blocs** : parcours ligne à ligne. Un titre est une ligne `^(#{2,3})\s+(.+?)\s*$`. Hors titre, les
   lignes vont au « bloc courant ».
3. **Titre qui désigne un biome** (`##` ou `###`, résolu par `resolveBiomeForHeading`) : le bloc courant devient ce
   biome.
   - Si le titre normalisé est **exactement** une clé du biome (slug ou nom, ex. « Savane », « Taïga », « Landes
     atlantiques », « Jungle d'Afrique centrale »), ne le recopie pas : l'onglet porte déjà le nom.
   - Sinon (« Le Sahara », « Toundra — été polaire », « Toundra — nuit polaire »), garde-le tel quel en `###` : il
     distingue les deux états de la toundra.
4. **Titre `##` qui ne désigne aucun biome** (« Le biotope — milieu de vie », « La biocénose — communauté du
   vivant ») : c'est un **titre commun**. Il revient au niveau commun (plus de biome courant) et il est **recopié en
   tête de la part de chaque biome qui reçoit ensuite du contenu sous lui** (une seule fois par biome) : ces titres
   sont le seul séparateur visible entre biotope et biocénose, ils restent dans chaque onglet.
5. **Titre `###` qui ne désigne aucun biome** (« La limite des arbres ») : reste dans le biome courant, titre
   compris. S'il n'y a pas de biome courant, il va au contenu commun (règle 6).
6. **Contenu commun** (préambule, ou contenu sous un titre commun avant tout titre de biome) : découpé en
   paragraphes (séparateur `\n\s*\n`).
   - Un paragraphe **image** (`<img … alt="…">` ou `![alt](…)`, seul dans son paragraphe) va au biome que désigne
     son `alt` (`resolveBiomeForHeading` sur l'alt). Le paragraphe suivant le suit s'il n'est qu'une légende en
     italique (`^\*{1,3}[^*].*\*{1,3}$` après trim).
   - Tout autre paragraphe commun, ou une image dont l'alt ne désigne aucun biome : au **premier biome**
     (comportement actuel, gardé).
7. **Compatibilité** : l'ancien format (`## <nom du biome>` directement, sans titre commun) donne le même résultat
   qu'aujourd'hui, à une différence près, voulue : le titre de biome n'est plus recopié en paragraphe nu
   (`Savane\n\ntexte`) mais retiré s'il est exact (règle 3) ou gardé en `###`. Adapte les deux tests existants de
   `tests-ui/gl/glEcosystemSections.test.js` qui l'attendaient si besoin, et dis-le dans ton fichier de lot.
8. Nettoie les lignes vides en trop (`\n{3,}` → `\n\n`) et `trim()` chaque part.

Laisse `buildEcosystemSections`, `GLEcosystemsView.jsx` et `GLLearnAndImport` tels quels. Dans
`glEcosystemMarkdown.js`, corrige **seulement le commentaire** de `REDUNDANT_HEADING_RE` (l'écran ne rend pas de
titres « Biotope / Biocénose ») ; ne change pas la regex (elle ne retire que `## Biotope` / `## Biocénose` exacts,
et les titres longs doivent rester).

**Tests** (`tests-ui/gl/glEcosystemSections.test.js`), avec les **vrais textes de prod** (copie abrégée mais même
structure : préambule d'images et légendes, `## Le biotope — milieu de vie`, `###` par biome), un cas par plateau :
- P1 (`jungle_afc`, `savane`) : l'onglet savane contient « Plus au sud » (biotope) et « gnous » (biocénose) ;
  l'onglet jungle n'en contient aucun ; l'image `gl-biome-savane-01.png` et sa légende « La savane africaine » sont
  dans la savane, pas dans la jungle ; les deux parts du biotope commencent par `## Le biotope — milieu de vie`.
- P2 (`sahara`, `foret_mediterraneenne`) : « nappe phréatique » dans le Sahara seulement, « sclérophylles » dans la
  forêt seulement ; la coupe `gl-coupe-sahara-sol.png` reste dans le Sahara.
- P3 (`foret_caducifoliee`, `landes`) : « humus » côté forêt, « tourbière » côté landes.
- P4 (`taiga`, `toundra`) : « La limite des arbres » et son texte dans la taïga ; « Toundra — été polaire » et
  « Toundra — nuit polaire » gardés en `###` dans la toundra ; les deux images de la toundra du préambule dans la
  toundra.
- Un biome seul (chapitre 7) : texte entier inchangé.
- Aucun texte perdu : pour chaque cas, chaque paragraphe non vide de l'entrée se retrouve dans au moins une part
  (hors titres de biome exacts retirés).

Dans `tests-ui/gl/GLEcosystemsView.test.jsx` : un rendu avec deux biomes au format de prod ; clic sur le second
onglet → son texte est visible, celui du premier ne l'est pas.

Docs : aucune règle ne change. Vérifie qu'aucun doc de `docs/reference/gl/` ne décrit ce défaut ; si une phrase dit
le contraire de la correction, mets-la à jour, sinon n'y touche pas.

### Étape H1 — Page Histoire : « Marquer comme lu », soumis à une question (décision H1) · lot H
**Constat vérifié le 23/11 sur v1.263.5** :
- `src/gl/components/GLHistoryView.jsx` (sous-onglet « Histoire » de « L'aventure », module `journalEnabled`,
  vrai en prod) affiche `gameState.game.story_markdown` et les scènes du chapitre. **Aucun bouton.**
- Le conditionnement « marquer comme lu par une question » existe pour les espèces, le glossaire, les tutoriels,
  les feuillets, les pages de contenu et les écosystèmes : types dans
  `lib/shared/resourceQuestionGatingCore.js › GL_RESOURCE_TYPES`, `lib/pedago/gatingProductCatalog.js ›
  GL_MARKABLE`, `lib/shared/learningAckCore.js › LEARNING_TARGET_TYPES` ; liens dans `gl_resource_question_links`
  (`resource_type VARCHAR(32)`) ; accusés dans `gl_learning_acknowledgements` (`target_type VARCHAR(16)`) ; bouton
  `src/gl/components/GLLearningAcknowledgeButton.jsx`.
- Réglages en prod (`gl_settings`, groupe `gating`) : `enabled` = true, `default_mode` = any,
  `default_required_correct` = 1, `granularity` = player, `allowed_wrong_attempts` = 0,
  `retry_cooldown_hours` = 1, `cooldown_scope` = resource, `lock_mode` = flow, `announce_on_button` = true,
  `max_questions_per_session` = 3.
- Lecteurs : un élève sur son compte est `gl_player` ; la tablette d'équipe est un `gl_guest` à session d'équipe
  (`lib/glGameAccess.js`) ; le prof est `teacher`.

**Changement attendu** :
1. **Type** `chapter_story` ajouté aux trois listes ci-dessus, à `src/gl/components/settings/GLGatingSettings.jsx`
   (`{ type: 'chapter_story', label: 'Histoire des chapitres' }`) et partout où `content_page` est énuméré pour le
   conditionnement (cherche `'content_page'` : `lib/glLearnableResources.js`, `lib/glVoyageur.js`…). **Pas** dans
   `lib/glFeuilletAcquisition.js` ni `lib/glFeuilletAcquisitionChannels.js` : lire l'histoire ne révèle aucune page
   du carnet. Référence = numéro du plateau, en texte (« 1 » à « 4 »).
2. **Route** `POST /api/gl/learning/chapter-story/:plateau` dans `routes/gl/learning.js`, sur le modèle de
   `/glossary/:code` : `requireGlAuth`, corps `{ confirm: true }`, `handleAcknowledge` avec `targetType:
   'chapter_story'`, `skipGating` si déjà lu, `resolveTarget` = un chapitre de `gl_chapters` avec ce
   `plateau_number` et un `story_markdown` non vide.
   - **Seul un `gl_player` valide** : tout autre lecteur reçoit 403 « Chacune et chacun valide l'histoire depuis
     son compte. ». Lire l'histoire en classe ne valide rien ; ni le prof ni la tablette d'équipe ne valident pour
     les élèves.
   - **Aucune récompense** : ni gemme, ni badge, ni Lumière, ni évènement de partie visible des autres équipes.
3. **État « déjà lu »** : `GET /api/gl/learning/me` (`groupLearningAcksByType`, `lib/shared/learningAckCore.js`)
   renvoie aussi `chapter_story_plateaux: ['1', …]`. Pas d'autre route de lecture.
4. **Écran** (`GLHistoryView.jsx`), sous le texte et les illustrations :
   - compte `gl_player` et plateau connu : `GLLearningAcknowledgeButton` (`acknowledgePath` de la route,
     `resourceType: 'chapter_story'`, `resourceRef` = plateau, `itemTitle` = « l'histoire de ce chapitre »,
     libellé « Marquer comme lu », état fait « Histoire lue ✓ »), avec l'avertissement visible de l'étape H2 ;
   - tablette d'équipe ou invité : une ligne « Chacune et chacun valide l'histoire depuis son compte. », sans
     bouton ;
   - prof : rien ; chapitre sans plateau (prologue, chapitres de test) : rien.
5. **Questions** : celles de l'annexe H, liées par l'étape H3 (trois par plateau). Un plateau sans lien approuvé se
   valide sans question (comportement actuel du bouton) : garde-le, et teste-le.
6. **Une question parmi trois** : aujourd'hui, la question posée est toujours la première par
   `ORDER BY l.weight DESC, l.question_code ASC` (`lib/learningGatingAcknowledge.js`), la même pour tous les
   élèves (constat de `claude/Audit_questions_validation_GL_2026-11-23.md`, position V4a). À poids égal, mélange
   les questions posables avec une graine = lecteur + ressource + nombre d'erreurs déjà comptées pour cette ressource
   (`wrong_attempts` de l'état du contrôle, lu par `lib/learningGatingAcknowledge.js`) : même question pour un même
   élève d'un appel à l'autre, questions différentes d'un élève à l'autre, et **une autre question des trois après
   le délai d'une heure** (l'élève relit le texte au lieu d'éliminer les choix qu'il a déjà vus). Si ce compte
   n'est pas lisible sans requête nouvelle, garde lecteur + ressource et dis-le. Le client garde son `slice` sur
   l'ordre reçu. Cela vaut pour toutes les ressources de G&L ; ForêtMap garde son ordre.
7. **Tirages** : une question de catégorie `histoire` (`gl_qcm_lore_questions.categorie_slug`) ne sert **qu'au**
   contrôle de l'Histoire. Exclus-la de tout tirage au hasard dans `gl_qcm_lore_questions` :
   `lib/glMarkerLoreQuestionPool.js › buildLorePoolQueryFilters`, `lib/glVoyageur.js`, `routes/gl/lore.js`,
   `lib/glQcmLoreQuestionQuery.js`, et tout autre tirage que tu trouves (`grep -rn gl_qcm_lore_questions lib
   routes`). La présentation par code (`/api/gl/lore/qcm/questions/:code/present`) ne change pas.
8. **Suivi du prof** : si la vue de suivi du conditionnement côté G&L compte déjà les lectures par ressource
   (`lib/learningGatingProgress.js` ne le fait que pour ForêtMap au 23/11 : `countFmRead`), ajoute
   `chapter_story` ; sinon, n'ajoute pas de vue et dis-le dans ton rapport.
9. **Épilogue réservé au prof** : le chapitre `toundra-arctique` (« Épilogue — Le bout du monde », id 7 en prod,
   sans plateau) révèle la « chute sans bataille » et l'origine du Souffle ; il se lit en classe par le prof en juin.
   Son `story_markdown` n'est **jamais servi à un lecteur qui n'est pas du staff G&L** : vide dans
   `routes/gl/chapters.js › readChapterFull` et dans l'état de partie (`lib/gl/gamesRuntime.js`, champ
   `story_markdown`) pour un `gl_player` ou un `gl_guest`. Liste nommée `CHAPITRES_RECIT_PROF_SEUL = ['toundra-arctique']`,
   commentée « garde-fou : chute sans bataille et renversement spatial jamais révélés aux élèves ». Ne change pas son
   texte : c'est le récit d'Oliv. Ferme de même **`lib/glPlayerJournal.js`** (vers la ligne 288 : une carte
   « chapitre » insérée dans le journal d'un élève affiche un extrait de `story_markdown` ; pour ce chapitre,
   pas d'extrait), et cherche toute autre route qui servirait ce texte à un élève (`grep -rn story_markdown lib
   routes`).
- **Tests** : route (`gl_player` après bonne réponse → accusé ; `gl_guest` d'équipe → 403 ; `teacher` → 403 ; déjà
  lu → aucune question ; plateau inconnu → 404) ; `GET /me` renvoie `chapter_story_plateaux` ; mélange (même
  question pour un même lecteur sur deux appels ; deux lecteurs → questions différentes sur un échantillon ; un
  poids 2 sort avant un poids 1) ; UI de `GLHistoryView` (bouton pour un élève, ligne pour la tablette, rien pour le
  prof) ; tirages (une question `histoire` n'est jamais tirée par le pool des cases ni par le Voyageur) ; épilogue
  (`gl_player` et `gl_guest` reçoivent un récit vide, le prof le texte entier).

### Étape H2 — Le délai d'une heure, annoncé avant et après (décision H2) · lot H
**Constat lu dans le code le 23/11** :
- Avant le clic : `src/shared/components/LearningAcknowledgeButton.jsx › buildButtonAnnounce` pose une pastille
  « 1 question » ; l'avertissement n'est que dans l'attribut `title` (infobulle), **invisible sur une tablette**.
  Bloqué : pastille 🔒, l'explication encore en infobulle.
- Introduction du contrôle (`src/shared/utils/learningGatingChallengeClient.js › buildGatingQuizIntroMessage`) :
  « Attention : une erreur bloquera la validation pendant 1 h. »
- Après une erreur : le serveur répond « Une erreur a été commise : réessaie dans 1 h pour valider cette
  ressource. » (repris comme retour par `LearningGatingQuestionPanel`, vers la ligne 119) ; puis
  `buildCooldownLockMessage`, sous le titre « Réessaie plus tard » : « Une erreur a été commise sur le contrôle de
  compréhension. Tu pourras réessayer de valider « … » dans 1 h. »

**Changement attendu, côté G&L seulement** (ForêtMap garde ses textes) : une option `voix: 'gl'` portée par
`GLLearningAcknowledgeButton` et `createGlGatingHandlers`, lue par les fabriques de textes ; côté serveur, le message
du verrou suit le produit (`gl`). Elle vaut pour **toutes** les ressources conditionnées de G&L (glossaire, espèces,
tutoriels, feuillets, pages de biome, Histoire) : même composant, même promesse.
1. **Avant de répondre**, sous le bouton, en texte visible (pas en infobulle), petit et discret :
   - Histoire : « 1 question sur ce que tu viens de lire. Si tu te trompes, tu pourras réessayer dans 1 heure. » ;
     ailleurs : « 1 question avant de valider. Si tu te trompes, tu pourras réessayer dans 1 heure. » ;
   - le délai vient du serveur (`retry_cooldown_hours`), écrit en toutes lettres (« 1 heure », « 2 heures »,
     « 30 minutes ») ; le texte suit le réglage s'il change un jour (délai 0 : « Si tu te trompes, tu peux réessayer
     tout de suite. »).
2. **Introduction du contrôle** : « Prends ton temps : si tu te trompes, tu pourras réessayer dans 1 heure. » à la
   place de « Attention : une erreur bloquera la validation pendant 1 h. » La phrase d'annonce d'Olu reste.
3. **Après une mauvaise réponse** : le verdict « Pas encore » (déjà affiché à part), puis le retour de la question
   (sa piste), puis « Relis le texte : tu pourras réessayer à 15 h 42. » — heure du jour de l'appareil, calculée
   depuis l'échéance renvoyée par le serveur. Message serveur en G&L : « Pas encore. Relis la page : tu pourras
   réessayer dans 1 heure. » (portée ressource) ou « Pas encore. Cette question reviendra plus tard. » (portée
   question). Le titre « Réessaie plus tard » devient « Pas encore ». Plus jamais « Une erreur a été commise ».
4. **Pendant le délai**, sur la page : le bouton est **absent** (pas grisé), remplacé par « Pas encore validé. Tu
   pourras réessayer à 15 h 42. » Le bouton revient seul à l'échéance (minuterie, sans rechargement).
5. **Aucun réglage ne change** : `retry_cooldown_hours` reste 1 et `allowed_wrong_attempts` reste 0 (décision H2,
   redite par Oliv le 23/11 à 20 h ; la position V4c de l'audit des questions de validation, une erreur tolérée,
   est écartée). Le délai ne coûte rien en jeu : ni gemme, ni case, ni page.
- **Tests** : fabriques de textes en voix G&L et en voix ForêtMap (ForêtMap inchangé, des deux côtés) ;
  avertissement visible dans le DOM ; message serveur G&L sans « erreur » ; heure affichée après une erreur ; retour
  du bouton à l'échéance (minuteries simulées) ; délai 0 et tolérance 2.

### Étape H3 — Textes d'Histoire et questions (décisions H3 et H4), données · lot H
- Copie l'annexe H dans `data/gl/histoire/histoire-chapitres.json` : elle fait foi pour les textes des plateaux 1
  à 4, les 12 questions et leurs liens.
- **Migration idempotente** (numéro `N+4`, attribué par l'orchestratrice au lot 0) :
  1. `UPDATE gl_chapters SET story_markdown = <texte de l'annexe> WHERE plateau_number = N AND story_markdown LIKE
     '%<garde_ancien_texte>%'`, pour N = 1 à 4. Si la garde ne trouve rien (texte déjà modifié par Oliv dans
     l'éditeur), ne touche à rien et dis-le dans ton rapport.
  2. **Catégorie d'abord** : `gl_qcm_lore_questions.categorie_slug` a une clé étrangère vers
     `gl_qcm_lore_categories(slug)`, et la catégorie `histoire` **n'existe pas** (vérifié en prod le 23/11 à 20 h 30 :
     huit catégories, de `cosmologie` à `sortileges`). Crée-la : `INSERT IGNORE INTO gl_qcm_lore_categories (slug,
     nom, emoji, description, order_index) VALUES ('histoire', 'Histoire des chapitres', NULL, 'Questions du contrôle
     « Marquer comme lu » de la page Histoire ; jamais tirées au hasard', 90)`. Les scopes `ch1` à `ch4` existent
     (plateaux 1 à 4).
  3. Les 12 questions dans `gl_qcm_lore_questions` (`LQCM0358` à `LQCM0369` ; plus haut code en prod au 23/11 :
     `LQCM0357` ; si un code est pris entre-temps, prends les suivants libres et aligne le JSON), avec les champs de
     `questions_communes`, `numero_dans_categorie` = rang dans le plateau (1 à 3) et `reponse_texte` = texte du bon
     choix. **Pas d'`INSERT IGNORE` ici** : il avale aussi les violations de clé étrangère, et une question perdue en
     silence laisserait un lien vers rien. Écris `INSERT … ON DUPLICATE KEY UPDATE question_code = question_code`
     (idempotent, mais une clé étrangère manquante fait échouer la migration).
  4. `INSERT IGNORE` des 12 liens dans `gl_resource_question_links` (`liens` de l'annexe : `qcm_lore`,
     `chapter_story`, plateau en texte, `is_gating` 1, poids 1, `origin` `manual`, `status` `approved` ; clé unique
     `uq_glrql`).
  5. Test de migration (base locale après `npm run db:init`) : 12 questions de catégorie `histoire`, 12 liens, et
     chaque lien mène à une question existante. Vérifie aussi qu'aucun test ne fige le nombre de catégories de lore
     (`grep -rn gl_qcm_lore_categories tests`).
- **Test de contenu** `tests/content/gl-histoire-chapitres.test.js` sur le JSON (et sur la base quand elle est là,
  avec un vrai `t.skip` sinon) :
  - 5 choix, une bonne réponse, un retour par mauvais choix, aucun retour sur la bonne lettre ;
  - la bonne réponse n'est jamais la plus longue (vérifié par Claude le 23/11 : 0 sur 12) ;
  - aucun mot de 5 lettres ou plus de la bonne réponse dans ses pistes ;
  - `findForbiddenString` nul sur les questions, les retours et les légendes (le texte des chapitres garde le nom
    « Grise » au plateau 2, qui est le sien) ;
  - aucun « Selene » sans accent, aucune ligne « *Tonalité », aucun `<img src="scene:` ;
  - chaque `scene:<nom>` figure dans la liste des 22 scènes connues (relevée le 23/11 dans
    `/uploads/media-library/_keys.json`) : `recit_01-chap1_` + `le-carnet-dans-la-savane`, `le-carnet-et-le-monde`,
    `lecture-du-carnet-nuit`, `page-se-recolore`, `point-d-eau-tari`, `savane-emerveillement` ; `recit_02-chap2_` +
    `campement-abandonne-selene`, `la-grise-mediterranee`, `reconnaissance-pays-mediterraneen`,
    `traversee-du-sahara` ; `recit_03-chap3_` + `foret-automne-le-silence`, `landes-nommer-ensemble`,
    `menace-grise-horizon` ; `recit_04-chap4_` + `dernier-campement-carnet`, `lac-gele-taiga`,
    `miroir-du-retour-se-trouble`, `taiga-marche-neige` ; `recit_05-chap5_` + `abri-de-glace-lecture-carnet`,
    `bout-du-monde-etoile-fixe`, `retour-par-le-miroir`, `toundra-ete-ouverture`, `toundra-hiver-aurores`.
- **Relecture** : `gl-relecteur-garde-fous` et `gl-relecteur-science` sur l'annexe H avant de clore l'étape.
- **Garde-fous du récit** (décision d'Oliv du 23/11 à 20 h) : n'ajoute ni ne rétablis rien de ce que l'annexe retire
  (direction d'où vient le grondement, « Et si le Souffle venait de chez nous ? », « les deux mondes sont liés »,
  « arme », visages en acteurs, lignes « *Tonalité* »). Le test de contenu vérifie aussi, sur les quatre textes :
  aucun « sud », « derrière vous », « chute », « liés », « Tonalité », « s'annonce », « brisez ».

### Étape H4 — Illustrations de l'Histoire : légendes et agencement (décision H4) · lot H
**Constat** (médiathèque et base lues le 23/11 ; affichage lu dans le code, pas vu à l'écran) :
- 36 scènes `recit_*` dans la médiathèque de prod, **aucune** légende (`recitCaption` vide partout).
- Les textes des plateaux 1 et 2 portent l'image sous la forme HTML `<img src="scene:1" …>`, celle qu'écrit l'éditeur
  riche. `src/gl/utils/glStorySceneRefs.js › applyStorySceneRefs` (page élève) ne résout que la forme markdown
  `![…](scene:N)` ; seul l'aperçu de l'éditeur (`src/gl/utils/glMarkdownEditorDisplay.js`, correctif E4 du 19/11)
  résout les deux. L'image d'ouverture des plateaux 1 et 2 est donc probablement cassée côté élève, et la scène
  n'est pas retirée de la galerie de fin.
- `scene:N` est le rang dans l'ordre alphabétique des clés : au plateau 1, `scene:1` = « le carnet dans la savane »,
  sous la légende « Le point d'eau tari » ; au plateau 2, `scene:1` = le campement, sous « L'épreuve de la Grise ».
- Les scènes non citées s'empilent en fin de page (`GLChapterScenes`), sans légende : cinq au plateau 1.
- Les textes répètent la légende en italique sous l'image.
- Le plateau 4 a fusionné les anciens chapitres 4 et 5, mais `chapterIllustrations(4)` ne lit que
  `recit_04-chap4_*` : les deux scènes de la toundra (`recit_05-chap5_toundra-*`) ne s'affichent nulle part.

**Changement attendu** :
1. **Références par nom** : `scene:<nom>`, où `<nom>` est la clé sans le préfixe `recit_0N-chapN_`
   (`scene:point-d-eau-tari`). Résolution d'abord parmi les scènes du chapitre, puis parmi toutes les scènes
   `recit_0N-chapN_<nom>` de la médiathèque (le plateau 4 cite ainsi les scènes de la toundra). `scene:N` reste
   compris. Les deux formes, markdown et `<img src="scene:…">`, sont résolues par **un seul** utilitaire de
   `src/gl/utils/`, partagé par la page élève et l'aperçu de l'éditeur. Une référence introuvable est retirée,
   comme aujourd'hui.
2. **Vraies figures** : `GLHistoryView` coupe le texte aux références de scènes et rend un `GLIllustrationFigure`
   entre deux morceaux de texte (pas d'image brute dans le markdown). Légende (`figcaption`) = le texte entre
   crochets de la référence, sinon `recitCaption`, sinon rien ; `alt` = la même phrase.
3. **Mise en page** (thème G&L, classe `gl-history`) :
   - colonne de texte de 68 caractères au plus, centrée ;
   - figure sur toute la largeur de la colonne, image entière (`object-fit: contain`, jamais rognée), coins arrondis
     12 px, marge verticale 1,25 rem ; hauteur au plus 55 vh, et 40 vh pour la première figure, pour que le titre du
     chapitre se voie sans défiler sur une tablette 1024 × 768 ;
   - image en portrait (`toundra-hiver-aurores`) centrée, largeur au plus 60 % ;
   - légende centrée, en italique, 0,9 rem, couleur atténuée, 0,4 rem sous l'image ;
   - deux figures qui se suivent (plateau 4) côte à côte à partir de 900 px de large, l'une sous l'autre en
     dessous ; aucun flottant ;
   - `loading="lazy"`, dimensions réservées pour que le texte ne saute pas au chargement.
4. **Galerie de fin** : si le texte cite au moins une scène, les scènes non citées ne s'affichent pas (l'auteur a
   choisi). S'il n'en cite aucune, la galerie reste, en grille de deux colonnes, avec les légendes `recitCaption` et
   le titre « Images du chapitre ».
5. **Éditeur** : vérifie que `![…](scene:<nom>)` survit à un enregistrement par l'éditeur riche (qui le réécrit en
   `<img src="scene:<nom>">`) et que son aperçu le résout ; test à l'appui.
6. Aucune donnée de la médiathèque ne change : les légendes vivent dans le texte (étape H3) ; le panneau
   `GLChapterScenesAdminPanel` reste le repli.
- **Tests** : utilitaire (nom, rang, forme HTML, nom inconnu retiré, scène `chap5` citée au plateau 4) ; UI de
  `GLHistoryView` (figure et légende, pas de galerie quand le texte cite des scènes).

### Étape 35 — La sonde (décision 37) · lot Q

**Ce que c'est** : après une bonne réponse à une question de case, l'équipe peut **sonder** le plateau une fois dans
le tour : elle touche un dessin, et lit « chaud », « tiède » ou « froid ». Ni question, ni page. C'est une aide à
la chasse, pas une fouille : elle ne consomme ni n'ajoute de fouille. Même règle pour les deux peuples.

**Serveur**
1. **Droit de sonder** : `bonneReponseDeCaseTx` écrit un effet `kind = 'sonde'` dans `gl_game_tenir_effets` (table
   existante, même usage que l'ancien `relance_case`) pour l'équipe et le tour. Sondes restantes = effets `sonde` du
   tour − empreintes de sonde du tour. Aucun stock : à la clôture du tour, il n'en reste rien.
2. **Geste** : sur la route existante `POST /api/gl/games/:id/chasse/fouiller`, un champ `sonde: true` dans le corps.
   **Aucune route nouvelle.** Mêmes droits que la fouille (`glTenirPermissionsCore` : phase `jeu`, l'équipe sur
   tablettes, le prof pour l'équipe active au tableau), mêmes contrôles de main et de version d'état. Refus sans
   sonde restante : 409 `PAS_DE_SONDE` (« Pas de sonde ce tour-ci. »).
3. **Verdict** : le calcul d'une fouille tombée à côté (`verdictForDistance`, distance au centre de la zone endormie,
   révélée ou pâlie la plus proche, seuils `fouille_seuils`). **Une sonde à l'intérieur d'une zone non trouvée vaut
   au moins « chaud »**, jamais « tiède » ni « froid ». Une sonde dans une zone déjà trouvée suit le calcul normal,
   sans dire qu'elle est trouvée. Jamais de question, jamais de changement d'état de zone, jamais de révélation.
4. **Empreinte** : une ligne dans `gl_game_chasse_empreintes`, visible de toute la classe comme les autres, avec une
   colonne nouvelle `sonde TINYINT(1) NOT NULL DEFAULT 0` (migration idempotente, étiquette `N+7`).
   `countFouillesUtilisees` (`lib/glChasse.js`, vers la ligne 248) ne compte que `sonde = 0`. Les badges de chasse
   (« Fouilleuse / Fouilleur ») ne comptent pas les sondes.
5. **L'oiseau témoin** vole vers le point sondé, comme pour une fouille. Évènement `chasse_sonde` (payload :
   `teamId`, `verdict`, point), présenté au journal (« {équipe} sonde le plateau : chaud. »).
6. **Vue du tour** : `sondesRestantes` par équipe, ajouté à la réponse existante de `GET …/tenir/tour` (un champ de
   plus, pas de route). Servi à l'équipe et au prof.

**Écran** (tablette d'équipe ; au tableau, le bloc « Équipe active » du lot 7)
7. **Carte du moment** (`glTenirMoment.js`) : quand `sondesRestantes > 0`, l'état « Sondez le plateau : touchez un
   dessin. », rôle « Opératrice ou Opérateur » (l'élève qui vient de répondre à la question de case, depuis l'échange
   des rôles de l'addendum 4 ; § 00.8 : ce prompt prévaut), placé juste avant « fouiller » dans l'ordre des gestes (répondre,
   lancer, sonder, fouiller, lire, sorts). Le plateau passe en mode fouille, bord doré, comme pour une fouille ; le
   toucher envoie `sonde: true` (`useGlChasse.js` : une option `sonde` sur `fouiller`).
8. **Verdict** : le retour récent d'une fouille, préfixé « Sonde : » (« Sonde : chaud, une page dort tout près. »),
   avec « Continuer » ; l'empreinte reste sur le plateau.
9. **Olu, première fois** : clé `sonde` dans `lib/glTenirOlu.js › PREMIERE_FOIS_CLES` et
   `PREMIERE_FOIS_EVENT_TYPES` (évènement `chasse_sonde`), ligne `olu-pf-sonde` ajoutée à `olu-lignes.json` :
   « Je ne vois pas les pages, je sens leur chaleur. Touchez un dessin : chaud, tiède ou froid. » (adresse
   « vous » : passe le test d'adresse).
10. **Projection** : l'empreinte apparaît comme les autres ; rien de plus.
11. **Escalier** : la sonde suit la question de case (module `avancer`) et la chasse (`chercher`), ouverts à la
    marche 1 : rien à ajouter.

**Tests** : bonne réponse → une sonde ; deux bonnes réponses dans le tour (cas rare) → deux ; sonde sans droit →
409 `PAS_DE_SONDE` ; sonde à côté → le même verdict qu'une fouille au même point ; sonde dans une zone endormie,
même au bord d'une grande zone → « chaud » et aucun changement d'état ; sonde → fouilles restantes inchangées ;
tour clos → plus de sonde ; licorne et gnome → même règle ; au tableau, le prof sonde pour l'équipe active ; UI de
la carte du moment (état « Sondez le plateau » puis verdict) ; ligne `olu-pf-sonde` une fois par partie.

**Docs** : règles § 5 (la sonde, en une phrase par point) et § 4 ; `docs/API.md` (`sonde` sur `/chasse/fouiller`,
409 `PAS_DE_SONDE`, `sondesRestantes`, évènement `chasse_sonde`) ; dans `docs/reference/gl/`, seulement la phrase
devenue fausse (le lot 9 réécrit) ; pour le § 0 des règles (lot 8) : « 24/11 : une bonne réponse à une question de
case avance d'une case, de trois sous le voile, et donne une sonde du plateau (chaud, tiède, froid, sans question ni
page) ; les fouilles ne changent pas ».

## 5bis. Déjà passé en prod les 23 et 24/11 par le connecteur (ne pas refaire)

| Table | Changement |
|---|---|
| `gl_chapter_markers` (plateaux 1 à 4) | 61 cases question : « Une question du biome. Bonne réponse : une case de plus et vous relancez. » (texte intermédiaire ; l'étape 19 le termine). |
| `gl_chapter_markers` (plateau 1) | 12 descriptions au « vous » (ids 9, 13, 15, 17, 21, 24, 26, 30, 32, 34, 38, 185) ; libellés des cases Trame 19, 188, 36 au « vous » (`event_config_json`, `JSON_SET`, deltas intacts). |
| `gl_qcm_questions` | 8 questions des zones du plateau 1 réécrites, avec retours : `QCM0068`, `QCM0063`, `QCM0098`, `QCM0069`, `QCM0281`, `QCM0251`, `GQCM0766`, `QCM0277`. |
| `gl_qcm_questions` (24/11, vers 11 h 55, décision 34) | 28 questions des zones des plateaux 2 à 4 réécrites (énoncé, choix, bonne réponse, retours) : `QCM0009`, `QCM0037`, `QCM0005`, `QCM0051`, `QCM0467`, `QCM0429`, `QCM0436`, `GQCM9305`, `GQCM9301`, `QCM0195`, `QCM0219`, `QCM0230`, `GQCM9302`, `QCM0636`, `GQCM9303`, `GQCM9304`, `QCM0182`, `QCM0639`, `QCM0364`, `QCM0396`, `QCM0369`, `QCM0397`, `QCM0138`, `QCM0152`, `QCM0124`, `QCM0134`, `QCM0385`, `QCM0176`. Textes dans `claude/donnees_zones/questions-zones-p2-p4.json` du projet ; état d'avant dans `claude/donnees_zones/sauvegarde_questions_2026-11-24.json`. |
| `gl_qcm_questions` (24/11, décision 34) | `usage_tenir = 0` (questions de case qui se lisent sur le plateau) : `QCM0092`, `QCM0278`, `QCM0272`, `QCM0663`, `QCM0431`, `QCM0439`, `QCM0192`, `QCM0611`, `QCM0619`, `QCM0135`. |
| `gl_tenir_passeur_pages` | Plateau 1 : ordre 3 = ep-V-02, ordre 4 = ep-V-03, ordres 6 et 7 désactivés. |
| `gl_lore_feuillets` | GL2P-04 : titre « Les formes de Sélène ». |
| `gl_settings` | `gameplay.tenir_marche_pendant_tour` = `false` ; `gameplay.tenir_chapardeur` = `false`. |

Rien du lot H n'est passé en prod : sa migration écrit les textes, les questions et les liens. Le lot B ne touche à
aucune donnée : les textes des biomes en base restent tels quels.

## 6. Hors périmètre

- Plafond et prix (bourse, sorts, parures) : après deux séances réelles. `data/gl/tenir/titres.json` : décision
  d'Oliv.
- Relecture scientifique (§ 5.1 de l'audit du 18/11) et autres lignes d'Olu (§ 5.3) : lot de contenu séparé.
- Polygones des zones de chasse : Oliv les retrace après la synchronisation.
- Tutoiement des cases des plateaux 2 à 4, péripéties des autres plateaux : lot de contenu. (« Selene » sans accent
  dans les feuillets et les questions de lore : réglé par le lot C, addendum 3, étapes C1 et C1 ter.)
- `time_zone` de la connexion MySQL : chantier ForêtMap séparé.
- **Retrait du code du jeu classique** et réécriture des docs de référence au présent (guide du MJ sans « Depuis
  le … », économie sans cœurs) : PR à part, après deux séances jouées.
- Suppression du code inerte (`glArriveeSuspendue`, fenêtre de fouille hybride) : après deux séances.
- Mise en évidence de la page témoin sur la projection.
- Étape 24 quinquies : la **réécriture des 28 questions de zone** et la **sortie du tirage des dix questions de case**
  (données en base) sont **faites en prod depuis le 24/11** (§ 5bis) ; aucune session ne les réécrit.
- **Photos des questions réécrites** (`photo_url`, montrée par la fenêtre de question du plateau, `GLQcmPopover` ; la
  légende n'y est pas affichée) : certaines ne vont plus avec le nouvel énoncé (`QCM0009` : des dromadaires pour une
  question sur le fennec) ou n'allaient déjà pas (`QCM0037` : un lotus ; `QCM0152` : un jaguar). Correction par le
  connecteur, sur décision d'Oliv ; aucune session.
- Lot H : le **texte** de l'épilogue (`gl_chapters` id 7) reste celui d'Oliv, lu par le prof en juin ; le lot le
  rend seulement invisible aux élèves (étape H1, point 9). Le prologue (`gl_chapters` id 1) ne change pas.
- Lot H : les réglages du conditionnement (délai, tolérance, mode) et les légendes de la médiathèque. Les autres
  positions de `claude/Audit_questions_validation_GL_2026-11-23.md` (V1 à V3, V5 à V8 : taxonomie non bloquante,
  questions vives des biomes, questions d'espèces et de feuillets, pages vierges de la Trame) : données par le
  connecteur ou chantier à part, sur décision d'Oliv.
- Lot B : les textes des biomes en base, les images du registre des biomes (doublon possible d'une image du
  catalogue dans un onglet : à constater après fusion, non corrigé ici).
- Toute fonctionnalité hors des décisions nommées (§ 3 et addenda) ; tout défaut de réglage existant changé sans
  décision ; toute écriture en prod.

## 7. Docs, par lot

| Doc | Lots |
|---|---|
| `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0) | 1 (11, 17), 2 (23), 3 (14, 27), 4 (7), 5 (20, 26), Q (19, 35), 6 (13), 7 (18) |
| `docs/GL_TENIR_A_DEUX_REGLES.md` § 0 | 8 |
| `docs/GL_TENIR_A_DEUX_REGLES.md` réécrites en v4 (§ 0 en annexe « Historique des décisions », écarts du 23/11 corrigés) | 9 |
| `docs/AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md`, `docs/AUDIT_GL_PARTIE16_2026-11-23.md` (nouveau) | 8 |
| `docs/reference/gl/guide-du-mj.md` | phrases devenues fausses : 2 (5), 3 (14, 27), 5 (19, 20, 26), 6 (13), 7 (18) ; réécriture complète : 9 |
| `docs/reference/gl/chapitres-et-progression.md` | 2 (5), 5 (20) ; réécriture : 9 |
| `docs/reference/gl/economie-marche-sorts.md`, `docs/GL_GAMEPLAY_PRESETS.md`, `docs/GL_TENIR_A_DEUX.md` | 3 (14), 5 (26) ; réécriture ou alignement : 9 |
| `docs/reference/gl/roles-et-connexion.md` | 7 (si la tablette en surface tableau y est décrite) ; réécriture : 9 |
| `docs/reference/gl/*` (tous), `essentiel-mj.md` et `deroule-partie.md` (nouveaux), `lib/glReferenceDocs.js`, `docs/GL_DEFIS.md`, `docs/GL_FEUILLET_ZONES.md`, `docs/GL_ARCHITECTURE.md`, `docs/GL_CARNET_JOUEUR.md` | 9 |
| `docs/API.md` (`discoveredBy`, `MESSAGE_ETAT_PERIME`, `PUT /tenir/profil` sans `null`, 409 `FIN_DE_L_ORDRE` et `QUESTION_DUE`) | 4, 1, 3, 1, 7 |
| `docs/API.md` (`sonde` sur `/chasse/fouiller`, 409 `PAS_DE_SONDE`, `sondesRestantes`, `chasse_sonde`, `relance_bonus.cases`) | Q |
| `.claude/skills/gl-*`, `foretmap-gl` : phrases devenues fausses (« le reste est gardé », `badges.json` comme source, erreur d'Olu à la console seulement, retour au classique possible, relance après une bonne réponse, escalier en quatre marches, trois surfaces, ancien écran au tableau, Relance, animation des pions) | chaque lot pour ce qu'il change ; 9 : balayage |
| `docs/API.md` (`POST /api/gl/learning/chapter-story/:plateau`, `chapter_story_plateaux`) | H |
| Page Histoire et contrôle de compréhension dans les docs de référence (élève seul, une question, délai annoncé, `scene:<nom>`) | 9, d'après le fichier du lot H |
| Page des biomes (un onglet par biome, son biotope et sa biocénose ; un texte de chapitre s'écrit `## Le biotope…`, puis un `###` par biome) | 9, d'après le fichier du lot B (s'il décrit la page ou l'édition des textes de biome) |
| `CHANGELOG.md` | chaque lot, sa propre entrée |

**Contrats de test changés** (chaque lot liste les siens) : `MESSAGE_ETAT_PERIME` ; titres des badges ; ordre des
cartes des « fils » ; jauge de Lumière après palier ; test-id de l'erreur d'Olu ; `PUT /tenir/profil` refuse
`null` ; case `tenir_enabled` et option « Hybride » absentes ; marches de l'escalier ; texte de vérité des cases
favorables ; péripéties ; bonne réponse de case sans relance ; `equipeSuivanteTx` (409) ; `GLTenirEquipeView`
supprimé ; `SL005` inactif ; retours de cinq questions de zone dans `qcm-feedbacks-zones.json` et test « indice sans
la réponse » (lot 2) ; bilan Team Spirit relu et liste `cartes` envoyée, dix questions de case ajoutées à la liste
des questions hors tirage à la création (lot 3) ; plateau flouté
(`is-question-ouverte`) pendant une question et fond de la fenêtre de question presque opaque (lot 6) ; textes d'avertissement et de délai du conditionnement en voix G&L, message serveur du
verrou en G&L, ordre des questions mélangé à poids égal, réponse de `GET /api/gl/learning/me`, rendu des scènes de
l'Histoire (lot H) ; titre de biome qui n'est plus recopié en paragraphe nu par `splitMarkdownByBiomes` (lot B).

## 8. Vérifications

Pour chaque lot (toutes vertes avant la PR) :

```bash
npm run lint && npm run format:check
npm run test:ui
npm test
npm run test:content
npm run build && npm run check:runtime
npx playwright test --project=chromium e2e/gl-*.spec.js   # au moins les specs touchées ; toutes au lot 8
```

Selon le lot : `npm run gl:sim:db` puis `npm run gl:sim -- --scenario ensemble-unifie --runs 5 --seed 14` (lots
1, 4, 5, Q, 8) ; `npm run gl:sim -- --scenario multi-appareils --runs 5 --seed 14` (lots 5, 8) ;
`DB_NAME=foretmap_sim npm run gl:import:tenir -- --fichier tous --strict --dry-run` (lots 2, 5, 8) ;
`e2e/visit-mascot.spec.js` (lot M) ; `e2e/gl-histoire.spec.js` et les tests ForêtMap du conditionnement (lot H). Ou
`/gl-verif`, puis les scénarios.

**Ne committe pas `dist`** (la CI publie `dist-artifact/main`) ; signale tout fichier modifié par le build
(`git status --short`). Les e2e « Voir comme » de `gl-users-admin` sont instables sous charge : signale-les, ne les
« corrige » pas.

## 9. Rapport final (lots 8 et 9, puis orchestratrice)

- Tableau des décisions de ce prompt (1 à 27, 34, 37, H1 à H5, B1), plus celles des addenda (28 à 33 et 42 de
  l'addendum 3 ; QV1 à QV5 de l'addendum 1 ; I1 à I10 de l'addendum 2 ; 34 à 41 de l'addendum 4, dont « 34 (addendum 4) » et
  « 37 (addendum 4) ») : livrée (lot, PR) ou écartée (raison).
- « Choix faits sans demander » : ceux du § 3 et ceux des sessions (source des badges ; formes doubles des 13
  titres ; texte de `olu-pf-main` gardé ; `cz-p3-04` vers la fiche du chêne ; « Une bêtise s'est glissée. Qui la
  trouve ? » ; place de l'erreur d'Olu sur la tablette ; voie du canal `espece_pays` ; prop d'action pour l'équipe
  active ; valeurs du fond et du flou de l'étape 30 ; etc.).
- Captures (dans `docs/captures/gl-decisions/`) : badge à 390 px ; « fils de l'adaptation » ; carnet de la classe
  avec une Lettre ; erreur d'Olu en projection et sur la tablette, avant et après correction ; question de zone sur
  la tablette, plateau flouté (lot 6) ; réglages sans la
  case de la mouture ni « Hybride » ; console au tableau, la suite d'une équipe puis « Le voile avance » ; tablette
  en surface tableau ; mascotte qui saute (lot M) ; page Histoire, avertissement et délai (lot H) ; onglet
  « Savane tropicale » avant / après (lot B) ; « Sondez le plateau » et l'empreinte d'une sonde (lot Q).
- Banc : reculs de voile dus à la Lumière par chapitre (avant étape 2, après étape 2, après étape 7) ; écart de
  cases au camp, part des équipes sous le voile, pages trouvées et carnet complet avant / après les étapes 19 et 35
  (lot Q) ; dépense de gemmes par élève avant / après l'étape 26.
- Comptes : tutoiement des cases P2-P4 ; lignes d'erreur d'Olu par plateau ; doublons Passeur / zones ; péripéties
  au masculin des autres plateaux.
- « **À relire par Oliv** » : textes nouveaux ou changés (étapes 5, 8, 11, 13, 14, 18, 19 (textes des cases, `olu-14`, `olu-18`), 22, 24, 26 (`olu-pf-marche`), 29, 35 (`olu-pf-sonde`, « Sondez le plateau »), H2, H3), pistes de
  zones, les textes et questions de l'Histoire (annexe H) ;
  puis la doc (lot 9) : essentiel-mj, deroule-partie, guide-du-mj en priorité.
- Vérification manuelle en dix lignes (§ 10, point 3).

## 10. Après le chantier (Oliv)

1. Synchroniser les catalogues : `gl_tenir_catalogues sync`, d'abord en `dry_run` (code à 6 chiffres par
   e-mail). Fichiers touchés : `chasse-zones`, `badges`, `sorts`, `olu-lignes`, `peripeties`, `passeur-plateau4`,
   `qcm-feedbacks-zones`. Les questions de zone des plateaux 2 à 4 sont déjà réécrites en prod (24/11, décision 34,
   § 5bis) : la synchro de `qcm-feedbacks-zones` n'écrase aucun retour d'auteur.
2. **Ensuite seulement**, retracer les 8 polygones des zones du plateau 1 dans l'éditeur de zones ; puis demander à
   Claude de les reporter dans `chasse-zones.json`, pour qu'une future synchro ne les écrase pas.
3. Sur une partie neuve de la classe de démonstration, projection ouverte :
   - au tableau : un tour complet depuis le bloc « Équipe active » (question, fouille, lecture), « Le voile
     avance » après la dernière équipe ; une tablette affiche « Le tour se joue au tableau. » ;
   - en tablettes : la mascotte saute de case en case ; la phrase d'Olu est en projection et sur la tablette ; la
     désigner trouvée : la correction s'affiche ; deux écrans pour une équipe : la ligne d'Olu de la main ;
   - une question de case et une question de zone : le plateau est flouté derrière et à côté, plus rien ne s'y lit ;
     il redevient net après la réponse ;
   - deux tours clos le même jour : une seule marche ; Relance n'apparaît nulle part ;
   - une bonne réponse à une question de case : la caravane avance d'une case (de trois si l'équipe est sous le
     voile), puis « Sondez le plateau » ; une sonde dans une zone dit « chaud », n'ouvre rien, et laisse les deux
     fouilles intactes ;
   - réglages « Tenir à deux » : plus de case pour couper la mouture, plus d'« Hybride ».
4. Ouvrir la documentation dans l'application (onglet « Contenus ») : les deux nouveaux documents en tête, aucune
   surcouche ancienne qui masquerait un fichier (« Réinitialiser » sinon) ; relire essentiel-mj et deroule-partie
   avant la répétition générale.
4 bis. Lot B (aucune synchro) : ouvrir les biomes des plateaux 1 à 4 ; chaque onglet montre son biotope puis sa
   biocénose, sous « Le biotope — milieu de vie » et « La biocénose — communauté du vivant » ; au plateau 4, la
   limite des arbres est dans la taïga. Vérifier qu'une image n'apparaît pas deux fois dans un onglet.
5. Lot H (aucune synchro : la migration suffit) : ouvrir l'Histoire du plateau 1 avec un compte d'élève de la
   classe de démonstration ; images et légendes, avertissement, une mauvaise réponse (« Pas encore », l'heure), puis
   une bonne réponse une heure plus tard (une autre question que la première) ; la même page depuis la tablette
   d'équipe. Relire les textes des quatre plateaux dans l'éditeur. **Ne réimporte plus les chapitres depuis un
   tableur avec une colonne « histoire » remplie** (`lib/glChaptersImport.js` réécrit `story_markdown`) : les textes
   d'avant reviendraient, avec leurs fautes de garde-fou ; les textes font foi dans `data/gl/histoire/`.
5 bis. Bilan Team Spirit : enregistrer un bilan avec une carte retirée, le rouvrir : la carte est toujours retirée.
5 ter. **Ne réimporte plus le corpus QCM depuis le tableur** (« QCM_Biomes_…_Consolidé ») : l'import met à jour
   l'énoncé, les choix et la bonne réponse des questions existantes (`lib/glQcmImport.js`, `ON DUPLICATE KEY UPDATE
   question = VALUES(question)…`, vérifié le 24/11) et remettrait les anciennes versions des 36 questions de zone
   réécrites les 23 et 24/11, celles qui se répondaient par leur indice. Pour ces questions, la base fait foi
   (sauvegarde et textes dans `claude/donnees_zones/` du projet). Les retours, eux, ne sont écrasés que par un retour
   non vide.
6. Ranger la « Partie découverte test » (id 16, classe 601) et **clore la partie 10** (« Partie découverte 2 »,
   dernière partie classique en cours). La partie 17 (surface tableau) peut servir au point 3.

---

## Annexe A — Lot M : les mascottes sautent de case en case

Prompt du lot M (écrit le 23/11 sur `b8b5344`). Branche `claude/gl-decisions-lotm`, PR selon le § 01. Si `main`
a bougé depuis `b8b5344`, `git log b8b5344..origin/main -- src/gl/hooks src/gl/components/GLGameBoard.jsx src/shared/glBoardPathCore.js lib/glTour.js`
d'abord, et dis dans ton fichier de lot ce qui a changé.

### A1. Contexte

En mode « Tenir à deux », c'est le **serveur** qui déplace les équipes (`lib/glTour.js`) ; les écrans (tablette
d'équipe, projection, console) relisent l'état. Plateaux en `numbered_path` (vérifié en prod sur la partie 17).
Ce lot est un **correctif d'animation** : il ne change aucune règle, aucune route, aucun schéma, aucun réglage par
défaut, aucun texte visible des élèves, aucune CSS. **Décision d'Oliv (23/11)** : « Quand une mascotte se déplace,
je veux qu'elle saute de case en case. »

### A2. Constats vérifiés (v1.263.5)

| Où | Constat |
| --- | --- |
| `lib/glTour.js` › jet (≈ l. 1859-1945) | Le serveur calcule la case d'arrivée (`targetMarkerAfterDice`), écrit la position (`applyTeamMoveTx`) et journalise un événement `move` avec la seule case d'arrivée. Aucun trajet n'est transmis. Même chose pour la Cordée, l'avance libre, les sorts `move_delta`, le vent de la caravane, l'auto-déplacement d'une case. |
| `src/gl/hooks/useGLBoardMascotMotion.js` › effet `[teams, boardHeightPx]` | La nouvelle position est posée d'un coup : **une seule glissade de 550 ms en ligne droite**, même pour 6 cases, en coupant à travers le décor. |
| même fichier › `moveTeamAlongPath` | Le saut case par case existe déjà (une étape `moveTeamTo` par case, 550 ms chacune, chaîne annulable par `pathChainRef`). |
| Appelants de `moveTeamAlongPath` | Seulement `GLGameBoard` › `handleDiceRollResult` (dé du plateau, MJ en mode classique), `handleEffectAutoMove`, et `GLGuestDemoBoard` (plateau découverte). En « Tenir », le plateau en `presentation="tenir"` ou `"projection"` masque `GLBoardChrome` et les dés passent par `tourApi.lancer` → serveur → rechargement → glissade unique. **Aucun écran « Tenir » ne fait sauter la mascotte.** |
| même effet, bug latent | Une équipe en cours d'animation (`animatingRef`) est sautée par l'effet, qui ne se relance pas à la fin de la chaîne : une position serveur arrivée pendant un trajet reste perdue jusqu'au rechargement suivant. |
| `src/gl/hooks/useGLMarkerArrival.js` | Le popover de case s'ouvre `moveDelayMs` (= 550 ms) après le changement de case : avec des sauts, il s'ouvrirait avant l'arrivée. `schedulePresentOnArrival` accepte déjà `options.moveDelayMs`. |
| `src/shared/glBoardPathCore.js` | `sortMarkersByPath`, `teamPathIndex`, `markersAlongPathSteps` (avant et arrière) existent. |

### A3. Garde-fous

- Ce lot ne touche à aucun geste : il anime ce que le serveur a déjà décidé.
- **Aucun état d'attente sans sortie** : la carte du moment n'attend pas la fin des sauts ; seul le popover posé
  **sur le plateau** (`useGLMarkerArrival`) attend.
- `prefers-reduced-motion` : la mascotte se téléporte, comme aujourd'hui.
- Isolement G&L / ForêtMap : ne touche ni `useMascotTransientState` ni `usePctAnchorTransform` (partagés avec la
  visite). Si tu dois y toucher, teste la visite (`e2e/visit-mascot.spec.js`,
  `tests/visit-map-animations-css.test.js`).
- Surface « tableau » : le même hook sert tous les écrans.

### A4. Choix par défaut

| Cas | Comportement |
| --- | --- |
| Changement de case entre deux repères du chemin, tous deux connus, de 1 à 12 cases | **Saut case par case**, 550 ms par case (`MAP_VIEW_MASCOT_MOVE_MS`), vers l'avant ou **vers l'arrière** |
| Joie à l'arrivée (`triggerHappy`) | Seulement pour un déplacement vers l'avant |
| Plus de 12 cases, case absente du chemin, premier affichage, reconnexion, changement de chapitre, plateau hors `numbered_path`, position libre | Inchangé : placement direct ou glissade unique |
| Plusieurs équipes déplacées en même temps (Cordée) | Chaque équipe a sa chaîne, en parallèle |
| Déplacement déjà animé par le client (dé du MJ en classique, auto-déplacement) | Pas de second trajet quand le rechargement serveur arrive avec la même case |
| Plateau découverte (`GLGuestDemoBoard`) | Inchangé |
| Nouveau réglage, nouvelle CSS | Aucun (constante exportée `GL_BOARD_HOP_MAX_CASES = 12`) |

### A5. Étapes (un commit par étape)

**M1 — Planificateur pur `src/gl/utils/glBoardHops.js`**
- `export const GL_BOARD_HOP_MAX_CASES = 12;`
- `export function planBoardHops({ sortedMarkers, fromMarkerId, toMarkerId, maxCases = GL_BOARD_HOP_MAX_CASES })` :
  liste ordonnée des repères à franchir, **case de départ exclue, case d'arrivée incluse** ; vers l'arrière, dans
  l'ordre du recul ; `[]` si départ = arrivée ; `null` si l'un des deux est absent du chemin ou `null`, ou si
  l'écart dépasse `maxCases`. S'appuie sur `sortedMarkers` déjà triés par `sortMarkersByPath`.
- Tests `tests-ui/gl/glBoardHops.test.js` : avance de 1 et de 6, recul de 3, départ = arrivée, repère inconnu,
  `null` en entrée, 13 cases (→ `null`), 12 cases (→ 12 repères), case de départ (rang 0). Fonction pure.

**M2 — `useGLBoardMascotMotion` suit la case affichée et fait sauter**
- Nouveaux paramètres : `markers = []`, `boardMovement = null`. `sortedMarkers` mémoïsé par `sortMarkersByPath`.
- Ref `shownMarkerByTeamRef` (équipe → repère où la mascotte **est affichée**, ou `null`), mis à jour au placement
  direct, à chaque étape de `moveTeamAlongPath` (option `markerId` de `moveTeamTo` quand `arrival === 'marker'`),
  et par `moveTeamTo` sans repère (→ `null`). Ref `teamsRef` (dernière liste reçue).
- Fonction `syncTeam(team)`, utilisée par l'effet **et** par la fin de chaîne : (1) équipe en animation → rien ;
  (2) si `boardMovement?.isNumberedPath`, pas de mouvement réduit, case affichée connue, `team.position_marker_id`
  différent, et `planBoardHops(...)` non vide → `moveTeamAlongPath(id, plan, { triggerHappy: avance })` ;
  (3) sinon → comportement actuel.
- Fin de chaîne (`isLast`, résolution `true`) : retire l'équipe d'`animatingRef`, puis `syncTeam` sur la version de
  `teamsRef` (rattrape une position arrivée pendant le trajet). Pas de boucle.
- Nettoyage des nouveaux timers et chaînes au démontage. `GLGameBoard` passe `markers` et `boardMovement` au hook ;
  `GLGuestDemoBoard` peut ne rien passer.

**M3 — Le popover de case attend la fin des sauts**
- `useGLMarkerArrival.js` : paramètre `boardMovement` ; au changement de case de l'équipe suivie, `planBoardHops`
  de `prev` vers `markerId` ; délai = `plan?.length ? plan.length × moveDelayMs : moveDelayMs`, passé à
  `schedulePresentOnArrival(marker, teamId, { moveDelayMs: délai })`. Les appels de `GLGameBoard` qui attendent
  déjà la fin du trajet ne changent pas.

**M4 — Tests d'écran**
- `tests-ui/gl/useGLBoardMascotMotion.test.js` (minuteries simulées) : case 2 → 5 : repères 3, 4, 5 à 0, 550,
  1 100 ms, `walking` faux à 1 650 ms ; recul 6 → 3 sans joie ; 13 cases → placement direct ; mouvement réduit →
  placement direct ; premier rendu → placement direct ; position reçue pendant un trajet → rattrapée à la fin ;
  trajet lancé par `moveTeamAlongPath` puis rechargement avec la même case → aucune étape de plus ; plateau hors
  `numbered_path` → placement direct.
- `useGLMarkerArrival` : popover d'une case à question atteinte en 4 cases à 4 × 550 ms, pas avant.
- `tests-ui/gl/GLGameBoard*.test.jsx`, `GLBoardMascot.test.jsx` : verts sans changer leurs attentes ; sinon,
  explique. Si un e2e attendait la mascotte à destination 550 ms après un jet « Tenir », attends par sondage
  (`expect.poll`) et liste-le.

**M5 — Docs** : CHANGELOG (« Corrigé — G&L : les mascottes sautent de case en case » : tablette, projection,
console ; 12 cases au plus ; recul case par case ; mouvement réduit inchangé ; popover à l'arrivée) ;
`guide-du-mj.md` : une phrase là où le guide décrit le plateau, s'il le fait ; skills qui décrivent l'animation des
pions.

**Hors périmètre du lot M** : arc de saut, poussière, son, cadence réglable, changement serveur, carte du moment,
plateau découverte. Captures : trois images d'un jet de 4 sur la projection (`docs/captures/gl-decisions/lot-m/`).

---

## Annexe B — Retours des zones réécrites (pour `qcm-feedbacks-zones.json`, étape 24)

Texte exact en prod depuis le 23/11 ; la bonne lettre n'a pas de retour (c'est `feedback_correct` qui sert).

**QCM0069** (bonne réponse D) :
```json
{
  "a": "Les magnans mordent fort et sont des millions : peu d'oiseaux s'y frottent. Que font les autres petites bêtes quand la colonne arrive ?",
  "b": "Les magnans ne protègent personne : tout ce qui ne fuit pas risque d'être mordu.",
  "c": "Les fourmis qui coupent des feuilles vivent en Amérique. Les magnans, elles, chassent.",
  "e": "Les fourmis ne transportent pas d'eau. Ce qui compte se passe devant la colonne, pas derrière."
}
```

**QCM0251** (bonne réponse E) :
```json
{
  "a": "Un éléphant ne mange pas d'insectes : il mange des plantes. Et en saison sèche, qu'est-ce qui manque le plus ?",
  "b": "Ce n'est pas un marquage : les éléphants arrachent et mâchent le bois. Que contient-il ?",
  "c": "Pour se gratter, un tronc suffit, sans l'abîmer. Ici, l'éléphant arrache et avale le bois.",
  "d": "Il y a parfois des abeilles dans les vieux baobabs, mais l'éléphant, lui, avale le bois du tronc."
}
```

**Bloc `remplacement` (GQCM0766)** :
```json
{
  "question_code": "GQCM0766",
  "biome_slug": "savane",
  "categorie_slug": "faune",
  "question": "Chez les suricates, la sentinelle change souvent. Qu'est-ce que ça permet au groupe ?",
  "choix_a": "Chacun peut manger à son tour.",
  "choix_b": "Le chef se repose pendant que les autres travaillent.",
  "choix_c": "Les petits apprennent à creuser plus vite.",
  "choix_d": "Les rapaces ne voient plus personne.",
  "choix_e": "Le groupe n'a plus besoin de cri d'alarme.",
  "reponse_correcte": "A",
  "feedback_correct": "Oui : une sentinelle ne mange pas, elle guette. En se relayant, chaque suricate peut chercher sa nourriture, et le groupe n'est jamais sans guetteur. Elle crie différemment pour un rapace ou pour un chacal.",
  "feedback_b": "Chez les suricates, la garde tourne : ce n'est pas un rôle réservé au chef. Que gagne chacun, à tour de rôle ?",
  "feedback_c": "Les petits apprennent au terrier, avec des adultes qui les gardent. La sentinelle, elle, surveille.",
  "feedback_d": "Les rapaces voient très bien depuis le ciel. La sentinelle ne cache personne : elle prévient.",
  "feedback_e": "Au contraire : c'est la sentinelle qui pousse le cri d'alarme. Sans elle, personne ne prévient."
}
```

---

## Annexe C — Lot 9 : prompt de la réécriture de la documentation

Prompt écrit le 23/11 au soir dans une autre session du projet, mot pour mot, avec ses deux annexes (les docs du
prof). Lis-le avec les ajustements de la fiche du lot 9 (§ 4), qui priment.

`````markdown
# Prompt Claude Code — G&L : réécriture de toute la documentation, deux surfaces

> Dépôt `oliviera999/ForetMap`. Rédigé le **23 novembre 2026** sur `main` **v1.263.5**, commit `b8b5344`
> (`chore(release): v1.263.5 [skip bump]`). Prod au même niveau.
> **Une seule PR**, branche `claude/gl-doc-reecriture`. **Ne fusionne rien toi-même.**
> Modèle conseillé : Opus, effort élevé. Lot long (une vingtaine de documents) : un commit par document ; si la
> session approche de sa limite, arrête-toi après un commit, pousse, et écris en tête de la PR « à reprendre au
> document N ».
>
> **Ordre de lancement** : ce prompt passe **après** la fusion de `claude/gl-mascotte-case-par-case` et de
> `claude/gl-decisions-audit-18nov` (décisions du 19/11, erreur d'Olu visible, « Tenir à deux » seul jeu,
> correctifs de la partie 16). La doc doit décrire le code **fusionné**. Si l'une de ces deux PR n'est pas
> fusionnée quand tu commences, arrête-toi et dis-le : ne réécris pas une doc sur un code qui va changer.
>
> `dist` n'est plus versionné : ne le committe pas.

---

## 0. Avant tout

1. `git merge origin/main` sur ta branche, puis `git log --oneline -20` : relève la version et vérifie que les
   deux PR ci-dessus sont dans l'historique. Lis le CHANGELOG sous `[Non publié]` et les deux ou trois dernières
   versions publiées.
2. Lis `CLAUDE.md`, `.cursor/rules/foretmap-pr-workflow.mdc`, `.cursor/rules/foretmap-docs-reference.mdc` et le
   skill `foretmap-docs-reference` (`.claude/skills/`). Charge aussi `gl-tenir-garde-fous` et `gl-tenir-moteur`.
3. Lis `docs/GL_TENIR_A_DEUX_REGLES.md` (il fait foi pour les règles) et `docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md`.
4. Vérifie qu'aucune surcouche de doc n'a été éditée dans l'application : la table `gl_reference_docs` était vide
   le 23/11. Si tu y as accès en local seulement, dis-le dans la PR et rappelle à Oliv de regarder l'onglet
   « Contenus » → documentation avant de déployer (une surcouche masquerait le nouveau fichier).
5. Si un constat ci-dessous ne tient plus sur `main`, n'y touche pas et note-le dans la PR.

## 1. Contexte

Gnomes & Licornes est le jeu d'une année des 6e d'Oliv (SVT, lycée Lyautey). Depuis le 23/11, **« Tenir à deux »
est le seul jeu** : le jeu classique (le prof déplace, QCM qui rapportent un score, cœurs) n'est plus proposé ;
son code reste jusqu'à une PR de retrait, après deux séances jouées. Aucune séance n'a encore été jouée en classe.

La documentation s'est écrite **par couches** : chaque lot a ajouté sa section « Depuis le 14 novembre… »,
« Ensemble unifié : … (17 novembre) », « Écrans de séance : … (20 novembre) » sans réécrire ce qui précède.
Tout y est, mais un prof ne peut pas savoir ce qui vaut aujourd'hui, et des couches se contredisent. Oliv demande
**une réécriture de toute la doc**, au présent, pour le jeu tel qu'il est.

Constats vérifiés le 23/11 sur v1.263.5 (à revérifier après fusion des deux PR) :

| Doc | Écart |
| --- | --- |
| `docs/reference/gl/guide-du-mj.md` (770 l.) | Ouvre sur le jeu classique (profils Minimal / MJ + tours, vitalité cœurs / gemmes). Trois surfaces dont l'hybride. Retrait qui « joue, fouille et lit… peut tenir une page » (l. 312-313, 321-322) contredit par l. 516 et les règles § 3. Marché depuis la tablette avec « Qui agit ? » (l. 492) contredit par l. 513. « Jouer le tour » « projeté au tableau » (l. 301) alors que la projection est un écran à part. Une dizaine de sections datées. |
| `docs/reference/gl/presentation.md` | Section « L'économie du jeu : cœurs et gemmes », 14 mentions des cœurs. |
| `docs/reference/gl/economie-marche-sorts.md` | Titre « cœurs, gemmes… », 37 mentions des cœurs, trois parties sur le classique avant « Tenir ». |
| `docs/reference/gl/chapitres-et-progression.md` | Chapitre 5, « prologue », vitalité, avant les sections « Tenir » datées. |
| `docs/reference/gl/carte-du-royaume.md` | Effets machine en cœurs (« sinon −1 cœur »). |
| `docs/reference/gl/qcm-et-pedagogie.md` | Deux jeux de questions présentés à égalité ; « Tenir » en fin de doc. |
| `docs/reference/gl/README.md` | « Les deux monnaies ». |
| `docs/reference/gl/audit-mecaniques-2026-08.md` | Audit d'août : historique, pas une référence. |
| `docs/GL_TENIR_A_DEUX_REGLES.md` (v3) | Daté du 17/11 alors qu'il contient les écrans du 20-22/11 ; § 1.9 « le client grise » contre § 3 « plus aucun bouton grisé » ; hybride « n'est plus proposé » (faux à l'écran : étape 1) ; § 3 et § 15 : dés `physique` au tableau, alors que `tenir_des_mode_par_surface` vaut `serveur` partout en prod et n'est pas listé ; § 13 « attend la PR 3 » (fusionnée le 18/11) ; § 18 « Attendus de livraison » (historique). |
| `docs/GL_TENIR_A_DEUX.md` | « deux monnaies privées », 6 mentions des cœurs. |
| `docs/GL_DEFIS.md` | 5 mentions des cœurs. |
| `docs/GL_GAMEPLAY_PRESETS.md`, `docs/GL_FEUILLET_ZONES.md` | Fonctions du jeu classique présentées comme courantes. |

Réglages de prod posés par Oliv le 23/11 (à décrire tels quels) : `gameplay.tenir_marche_pendant_tour` = **false**
(le Marché est fermé pendant le tour) ; `gameplay.tenir_chapardeur` = **false** (l'oiseau chapardeur coupé pour le
chapitre 1, à rallumer s'il le veut avant le plateau 2). Autres valeurs de prod utiles : `tenir_surface` =
`tablette`, `tenir_des_mode_par_surface` = `serveur` partout, `tenir_sablier_phase_secondes` = 480,
`tenir_sablier_secondes` = 180, `tenir_delai_debat_secondes` = 8. Relis-les par l'API d'administration si tu
peux ; sinon prends ces valeurs.

## 2. Garde-fous

**Contenu** (la doc de référence est lue par des profs, et certains passages reviennent un jour vers les élèves) :
- Le Souffle et le voile ne sont jamais personnifiés : ni ennemi ni créature ; ils se disent par leurs effets
  (pâlir, s'effacer, se dessécher), et le voile **avance**.
- Jamais le visage de Sélène. Le nom du corbeau (et son cri écrit) n'apparaît nulle part : écris « l'oiseau ».
  Ni renversement spatial ni « chute sans bataille ». « Quatre mondes ».
- Une erreur ne coûte rien ; le ton est « Pas encore ». Le savoir sert à jouer, il ne paie pas.
- Parité : formes doubles (« Éclaireuse ou Éclaireur », « la ou le Secrétaire »), **jamais de point médian**.
- Adresse des écrans quand tu les cites : « vous » à l'équipe, « tu » à l'élève.

**Doc de référence** (`docs/reference/`, règle `foretmap-docs-reference`) :
- Français simple, **aucun nom de fichier, de route, de table ou de réglage technique** dans `docs/reference/gl/`
  (sauf encadré « Pour les curieux », que tu n'ajoutes pas). Nomme les choses par leur libellé à l'écran.
- **Chaque libellé cité entre guillemets existe dans `src/gl`** (vérifie par grep) ; sinon reformule sans
  guillemets.
- Les incohérences restantes vont dans un encadré « ⚠️ Points d'attention » à la fin du document concerné,
  jamais tues.
- Les marqueurs « 🔧 À implémenter » d'Oliv sont des demandes de changement : il n'y en a aucun dans
  `docs/reference/gl/` au 23/11 (seulement leur mode d'emploi dans `README.md` et `guide-du-mj.md`) ; s'il en
  apparaît un, garde-le tel quel et signale-le.
- Isolement : `docs/reference/gl/` ne parle que de G&L.

**Technique** : ce lot ne change **aucune règle, aucune route, aucun schéma, aucun réglage par défaut**. Seul code
touché : l'étape 1 (deux libellés d'écran et un test). Tout le reste est de la doc.

## 3. Décisions d'Oliv (23/11)

| # | Décision | Étape |
| --- | --- | --- |
| 1 | **Deux surfaces proposées, pas trois** : « Tablettes » et « Tableau » ; « Tout au tableau » reste le passage d'urgence. Le moteur garde la valeur `hybride` pour les anciennes parties. | 1 |
| 2 | **Réécrire toute la documentation G&L**, au présent, pour « Tenir à deux » seul. | 2 à 6 |
| 3 | Marché fermé pendant le tour ; chapardeur coupé au chapitre 1 (réglages déjà posés en prod). | doc |

**Choix par défaut posés par Claude** (applique-les, liste-les dans la PR pour qu'Oliv puisse les retirer) :
- **Pas de « Depuis le … »** dans la doc de référence. L'historique vit dans le CHANGELOG, les `docs/AUDIT_*` et
  les `docs/prompts/*` ; la doc dit ce qui est.
- Le **jeu classique** n'est plus décrit dans `docs/reference/gl/`, sauf un encadré unique dans
  `presentation.md` : « Les anciennes parties créées avant novembre 2026 sans « Tenir à deux » jouent encore
  l'ancien jeu (cœurs, score d'équipe). On ne peut plus en créer ; elles seront retirées. » Les fonctions qui
  servent aussi à « Tenir » restent (comptes, connexion, démonstration, invité, Moodle, Seuil, carnet personnel,
  fiches et « marquer appris », feuillets d'ouverture, liasse du copiste, mascottes, projection…). En cas de doute
  sur une fonction, vérifie dans le code qu'elle sert en « Tenir » (`isTenirGame`) avant de la retirer, et liste
  chaque passage retiré dans la PR avec sa raison.
- `audit-mecaniques-2026-08.md` sort de la doc de référence : déplace-le en `docs/AUDIT_MECANIQUES_GL_2026-08.md`
  (avec `git mv`), corrige les liens qui y mènent.
- Les **règles** deviennent la **v4** : même contenu de règles, réécrit au présent ; le tableau des décisions
  (§ 0) part en annexe « Historique des décisions » en fin de document.

## 4. Étapes (un commit par étape ou par document, doc relue avant chaque commit)

### Étape 1 — Deux surfaces proposées (décision 1)

**Constat** : `src/gl/components/mj/GLTenirProfilPanel.jsx` (ligne 5-9, `SURFACES`) propose `tableau`, `hybride`,
`tablette` ; `src/gl/components/settings/GLTenirSettings.jsx` (vers la ligne 247) propose l'option « Hybride
(tablettes d'équipe + tableau) ». Les règles v3 disent pourtant (M12) que l'hybride n'est plus proposé. Depuis les
décisions du 19/11, l'hybride ne diffère de la tablette que par la fenêtre de fouille ouverte par le prof.
Aucune partie hybride en prod le 23/11 (`gl_games` : surfaces `tableau` et `tablette` seulement).

**Changement** :
- Retire `hybride` des deux sélecteurs. Libellés : « Tablettes (les équipes jouent en même temps) » et « Tableau
  (une équipe à la fois, le prof porte les gestes) » ; garde la cohérence avec les libellés existants s'ils sont
  déjà repris ailleurs.
- Une partie déjà en `hybride` (ancienne ou de test) : le sélecteur l'affiche « Hybride (ancienne valeur) » en
  option désactivée tant qu'elle n'est pas changée, pour ne pas mentir sur son état. Aucune migration.
- Ne touche ni au registre (`lib/glSettings.js`, `TENIR_SURFACES`), ni au moteur, ni à `glTenirPermissionsCore`,
  ni aux branches `hybride` de `GLTourScreen.jsx`, ni aux tests du moteur qui jouent l'hybride.
- Tests : `tests-ui/gl/GLTenirSettings.test.jsx` (lignes 54-55 choisissent `hybride`) passe sur `tablette` ;
  ajoute « les sélecteurs ne proposent que tableau et tablette » et le cas « partie hybride → option désactivée
  affichée ». Vérifie `tests-ui/gl/GLTourScreen.test.jsx` et `GLTenirEcranEquipe.test.jsx` : ils peuvent garder des
  fixtures `hybride` (le moteur l'accepte toujours).
- CHANGELOG : une ligne « Modifié — G&L : les surfaces proposées sont Tablettes et Tableau ».

### Étape 2 — Règles v4 (`docs/GL_TENIR_A_DEUX_REGLES.md`)

- Titre « Règles de référence v4 », date du jour, une phrase : « v4 = v3 réécrite au présent ; aucune règle
  changée par cette réécriture. »
- Garde le plan § 1 à § 17 ; l'ancien § 0 (décisions) devient l'annexe A « Historique des décisions », complétée
  des décisions du 19/11 et du 23/11 que la PR des décisions y a ajoutées ; l'ancien § 18 (attendus de livraison
  des cinq PR) part dans la même annexe, résumé en trois lignes.
- Corrige : § 1.9 « le client grise » → « l'écran masque » ; surfaces (deux proposées, l'hybride gardé par le
  moteur pour les anciennes parties) ; dés : `des_mode_par_surface` décrit au § 3 et listé au § 15 avec ses
  valeurs ; § 13 : retire « attend la PR 3 » ; le Marché pendant le tour et le chapardeur avec leurs valeurs de
  prod (« coupé en prod depuis le 23/11 »).
- Relis chaque phrase « Depuis… », « désormais », « n'est plus », « a disparu » : écris l'état, pas le
  changement (sauf dans l'annexe).
- Vérifie contre le code fusionné (escalier en cinq marches, question de case sans relance, page témoin, erreur
  d'Olu visible, fin de l'ordre, suite du tour au tableau, Lumière qui repart à 0…) que les règles disent ce que
  fait le moteur ; un écart restant → « ⚠️ » en fin de section et liste dans la PR.

### Étape 3 — Docs techniques G&L à aligner (pas de réécriture complète)

- `docs/GL_TENIR_A_DEUX.md` : « une monnaie », plus de cœurs dans ce qui décrit « Tenir » ; section « mode
  tenir d'une partie » alignée sur la décision « seul jeu » (déjà touchée par la PR des décisions : vérifie).
- `docs/GL_DEFIS.md` : retire les cœurs ; vérifie les défis contre le code.
- `docs/GL_GAMEPLAY_PRESETS.md`, `docs/GL_FEUILLET_ZONES.md` : un encart en tête « Fonction du jeu classique,
  plus proposée depuis le 23/11 ; retirée avec le code du classique », le reste inchangé.
- `docs/GL_ARCHITECTURE.md`, `docs/GL_CARNET_JOUEUR.md`, `docs/API.md` (parties G&L) : cherche « cœur »,
  « hybride », « deux monnaies », « prologue », « Plume », « Nommer » et toute promesse d'un retour au classique ;
  corrige ce qui décrit « Tenir » à tort. Ne réécris pas ces docs.
- **Ne touche pas** aux documents historiques : `docs/AUDIT_*`, `docs/prompts/*`, `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md`,
  `docs/GL_UNIFIE_TABLETTE_SCIENCE_DEFIS_PROMPT.md`, `docs/GL_EQUIPES_AUTO_PROMPT.md`.

### Étape 4 — Deux nouveaux documents pour le prof

- Crée `docs/reference/gl/essentiel-mj.md` à partir de l'**annexe A** et `docs/reference/gl/deroule-partie.md` à
  partir de l'**annexe B** (textes d'Oliv et de Claude, écrits sur v1.263.5).
- Mets-les à jour sur le code fusionné : les encarts « Décidé le 23 novembre, pas encore en place » deviennent la
  règle au présent (escalier en cinq marches, une par jour ; question de case sans relance ; page témoin derrière la
  dernière équipe) ; les « ⚠️ Points d'attention » corrigés par la PR des décisions disparaissent (fin de l'ordre,
  erreur d'Olu seulement sur l'écran du prof, durées fausses, question de case sautée au tableau, et la chasse au
  tableau si la suite du tour au tableau est livrée — vérifie à l'écran ou dans le code) ; les autres restent.
  Retire la ligne « État décrit : version 1.263.5 » au profit de « État décrit : version X » (celle de `main`).
- Section « Et sans tablettes ? » du déroulé : décris le tour au tableau tel que livré par la PR des décisions
  (geste par geste, avec ses libellés réels).
- Ajoute-les en tête de `READING_ORDER` dans `lib/glReferenceDocs.js` : `essentiel-mj`, `deroule-partie`, puis
  l'ordre actuel. Aligne `tests/gl-reference-docs.test.js` et `tests-ui/gl/GLReferenceDocsPanel.test.jsx` s'ils
  figent l'ordre (le slug `presentation` et `guide-du-mj` doivent rester).

### Étape 5 — Réécriture de `docs/reference/gl/` (un commit par document)

Pour chaque document : **réécris au présent, pour « Tenir à deux »**, sans sections datées ; une structure
« À quoi ça sert → Qui l'utilise → Comment ça se passe → ⚠️ Points d'attention → Pour aller plus loin », comme les
docs ForêtMap ; liens relatifs entre docs à jour ; longueur raisonnable (vise la moitié de l'actuel quand le
document est en couches).

| Document | Ce qu'il devient |
| --- | --- |
| `README.md` | Sommaire : essentiel-mj et deroule-partie en tête ; « une monnaie, les gemmes » ; plus d'audit d'août. Aligne aussi la section G&L de `docs/reference/README.md` (statuts ✅). |
| `presentation.md` | Ce qu'est G&L (une année, Quatre mondes, deux peuples, le carnet, le voile), les quatre rôles de compte, le tour des modules utiles en « Tenir », l'encadré unique sur les anciennes parties classiques. Plus de section « cœurs et gemmes ». |
| `lore-deux-peuples.md` | Relecture : garde-fous ci-dessus, « le camp » / « le Seuil », formes doubles. Peu de changements attendus. |
| `roles-et-connexion.md` | Comptes, connexion, tablette d'équipe (QR de la classe, demande d'entrée, « Tout accepter »), projection, deux surfaces. Garde les sections comptes / démonstration / invité / Moodle / « Voir comme » si elles décrivent l'existant. |
| `guide-du-mj.md` | **Le guide complet, au présent** : avant la séance (créer la partie, composer les équipes, imprimer le QR) ; pendant (l'écran « Jouer le tour » en mode séance : bandeau, Demandes, équipes, sablier, voile, erreur d'Olu, Team Spirit ; la tablette d'équipe en trois choses ; la projection) ; le tour au tableau ; après (Team Spirit, exports, badges) ; le camp ; incidents ; Olu, aide et visites guidées ; lire et amender cette doc depuis le jeu ; ⚠️. Renvoie à essentiel-mj et deroule-partie pour le résumé et la séance type, sans les recopier. |
| `chapitres-et-progression.md` | Plateaux et chapitres (4 à 6 séances), équipes rebrassées et peuples inversés, escalier du chapitre 1, voile, carnet de la classe, camp et « Ce qui change », honneurs, titres, badges (noms en formes doubles). Plus de chapitre 5 ni de prologue. |
| `carte-du-royaume.md` | Le plateau, les cases et la vérité des cases, les zones de chasse (tracer une zone dans l'éditeur, puis demander qu'elle soit reportée dans le catalogue du dépôt pour qu'une synchronisation ne l'efface pas), empreintes, l'oiseau témoin, le voile. |
| `economie-marche-sorts.md` | Une monnaie (départ, plafond, d'où viennent les gemmes, réserve de la caravane), le Marché (annonces, échange, dons, parures ; fermé pendant le tour), le grimoire (sorts par chapitre et par moment, pot partagé, sorts du Travail honorés ou remboursés, Mentorat, Lettre, but de l'année). |
| `qcm-et-pedagogie.md` | Les questions en « Tenir » : question de case, question de zone et sa piste, question de lecture, l'erreur qui révèle (« Pas encore »), écrire une bonne question (curiosité, un pas au-delà de l'indice, bonne réponse pas la plus longue), défis de case, défis de la Trame ; fiches et « marquer appris » s'ils servent en veillée. |

Chaque document réécrit doit être **vrai pour le code fusionné** : si tu décris un geste, retrouve-le dans
`src/gl` ; si une règle, dans `docs/GL_TENIR_A_DEUX_REGLES.md` et le moteur. Un doute → ⚠️, pas d'invention.

### Étape 6 — Skills et garde de vocabulaire

- Skills `.claude/skills/gl-*`, `foretmap-gl`, `foretmap-docs-reference` : aligne ce qui serait devenu faux (trois
  surfaces, deux monnaies, doc en couches, nouveaux documents de référence).
- Ajoute `tests/content/gl-reference-docs-vocabulaire.test.js`, qui lit `docs/reference/gl/*.md` et échoue si :
  un titre commence par « Depuis le » ou contient une date entre parenthèses ; un document contient « Cinq
  mondes », « Krâ », « Kraa », « krâ », un point médian (`·` entre deux lettres), « hybride » ; « cœur » apparaît
  dans un autre document que `presentation.md` (encadré des anciennes parties) ou plus de deux fois dans
  celui-ci. Message d'échec en français, avec le document et la ligne.

## 5. Hors périmètre

- Toute règle, route, réglage par défaut, donnée de catalogue : ce lot n'en change aucun.
- Le retrait du code du jeu classique (PR à part, après deux séances jouées).
- Le sort Relance, l'écran d'équipe au tableau et toute décision d'Oliv non listée au § 3.
- Les docs ForêtMap (`docs/reference/foretmap/`, `docs/reference/plan/`…).

## 6. Vérifications (toutes vertes avant la PR)

```bash
npm run lint && npm run format:check
npm run test:ui
npm test
npm run test:content
npm run build && npm run check:runtime
npx playwright test --project=chromium e2e/gl-*.spec.js
```

Puis, pour la doc : `grep -rn "Depuis le" docs/reference/gl/` vide ; tous les liens relatifs de
`docs/reference/gl/*.md` et de `docs/GL_TENIR_A_DEUX_REGLES.md` mènent à un fichier existant (écris un petit
contrôle ou vérifie à la main, et dis comment). Lance le sous-agent `gl-relecteur-garde-fous` sur le diff des docs
de référence et `gl-relecteur-science` sur `qcm-et-pedagogie.md` et `chapitres-et-progression.md`.
**Ne committe pas `dist`.** Les e2e « Voir comme » de `gl-users-admin` sont instables sous charge : signale-les.

## 7. Description de PR attendue

- Tableau des documents : réécrit / aligné / déplacé / inchangé, avec la longueur avant → après.
- Passages retirés parce qu'ils ne décrivaient que le jeu classique (une ligne chacun).
- Écarts doc / code trouvés en route : corrigés dans la doc, ou laissés en ⚠️ (et lesquels méritent un correctif
  de code, sans le faire).
- « Choix faits sans demander » : ceux du § 3 et les tiens.
- Contrats de test changés : sélecteurs de surface ; ordre de lecture des docs ; nouveau test de vocabulaire.
- Capture des deux sélecteurs de surface ; capture du panneau « Documentation » de l'app avec les deux nouveaux
  documents en tête.
- Section « **À relire par Oliv** » : essentiel-mj, deroule-partie, guide-du-mj, en priorité.
- **La CI doit être verte avant toute fusion.**

## 8. Après déploiement (Oliv)

1. Ouvrir la documentation dans l'application (onglet « Contenus ») : les deux nouveaux documents en tête, aucune
   surcouche ancienne qui masquerait un fichier (« Réinitialiser » sinon).
2. Relire essentiel-mj et deroule-partie avant la répétition générale ; les imprimer si utile.
3. Dans les réglages d'une partie de test : seules « Tablettes » et « Tableau » sont proposées.

---

## Annexe A — « L'essentiel du maître du jeu » (texte de départ, v1.263.5)

````markdown
# Gnomes & Licornes · L'essentiel du maître du jeu

> **Pour le prof qui mène la partie.** Ce qu'il faut savoir, en deux pages. Le détail fait foi dans les
> règles de référence (« Tenir à deux », v3) et le guide du maître du jeu.
> État décrit : version 1.263.5 de l'application (23 novembre 2026).

## Le jeu en six phrases

- Une année, un voyage en **Quatre mondes** : un plateau par chapitre, joué en 4 à 6 séances, **un tour par séance**,
  une dizaine de minutes en début de cours.
- **Quatre équipes** de cinq (quatre si besoin) : deux de **Gnomes**, qui réparent, deux de **Licornes**, qui
  révèlent. Les équipes sont rebrassées à chaque chapitre ; chacun change de peuple entre les chapitres 1 et 2, puis 3
  et 4.
- Des **pages du carnet de Sélène** dorment dans les dessins du plateau. Une équipe fouille et trouve une page ; une
  équipe **de l'autre peuple** la fait **tenir** en répondant à sa question de lecture. Personne ne réussit seul.
- À chaque fin de tour, **le voile avance** derrière la caravane : sous le voile, une équipe fouille moins et ses pages
  trouvées pâlissent. Rien n'est jamais retiré.
- Une seule monnaie, **les gemmes** (3 au départ, 8 au plus, gardées toute l'année) : elles viennent surtout des
  pages tenues ; elles paient les sorts et les parures.
- **Une erreur ne coûte rien.** Le savoir sert à jouer (indices, pistes) ; il ne rapporte rien.

## Vos gestes, dans l'ordre (écran « Jouer le tour »)

| Moment | Bouton | Ce que vous faites | Durée |
| --- | --- | --- | --- |
| Avant | « Lien de projection » | Ouvrir la projection au vidéoprojecteur. Ligne des tablettes : « Tout accepter » | 2 min |
| Le tour s'ouvre | « Ouvrir le tour » | Lire à voix haute l'erreur volontaire d'Olu ; les équipes posent leurs cartes Job | 1 min |
| À vous de jouer | « Passer en jeu » | Le sablier du tour part (8 min). Traiter « Demandes », circuler ; quand une équipe trouve l'erreur d'Olu, toucher son nom (« Qui a trouvé l'erreur d'Olu ? ») | 8 min |
| Le voile avance | « Le voile avance » (ou « Le voile dort ») | Le dé gris est tiré ; faire lire la page du jour (bouton « La page du jour » de la projection) | 1 à 2 min |
| Tour terminé | « Clore le tour » | La projection affiche « À la prochaine séance » ; la laisser pendant l'activité | 30 s |
| Fin de l'activité | « Bilan Team Spirit » | Six cartes gardées par défaut : ne toucher que celles qui ont été retirées | 1 min |

Aux séances 1 et 2 du chapitre 1, le voile n'est pas encore ouvert : le bouton s'appelle « Passer à la suite ».

## Ce que font les élèves

**Les cartes Job** tournent à chaque cours. Ce sont des conseils, jamais une obligation : n'importe qui peut toucher
le bouton.

- **Gestionnaire** : lance les dés.
- **Éclaireuse ou Éclaireur** : répond à la question de la case.
- **Opératrice ou Opérateur** : fouille (touche le dessin où l'indice mène).
- **Secrétaire** : lit et fait tenir les pages.
- **Assistante ou Assistant** : jette les sorts ; dans une équipe de quatre, répond aussi à la question.

**L'écran de l'équipe** montre le plateau, **une seule carte** (le geste à faire, en gros bouton, avec le rôle
au-dessus) et Olu. Ce qui n'est pas permis n'apparaît pas. Le reste (cases à venir, carnet de la classe, présences)
est dans le tiroir « L'équipe ».

**Les cartes Team Spirit** (six par équipe et par activité : Question ×2, Écoute, Orga, Règles, Équipe) se retirent
pendant l'activité. Elles nourrissent la Lumière de la classe et le bilan de la compétence « Coopérer » (6 cartes :
très bonne maîtrise ; 4-5 : satisfaisante ; 2-3 : fragile ; 0-1 : insuffisante). Aucune ne donne de gemme.

## Ce que l'application fait seule

L'ordre des équipes (la plus en retard d'abord) ; le vent (dès le tour 2, une équipe seule en dernière place avance de
trois cases) ; un seul dé au tour qui suit une case Souffle ; les péripéties ; la page témoin (séance 3 du chapitre 1) ;
l'ouverture des règles séance après séance au chapitre 1 ; les phrases d'Olu la première fois qu'un geste arrive ;
la levée du retrait à la clôture du tour ; les présences (tout le monde est présent par défaut) ; tout ce qui attend
et que vous n'avez pas traité, qui se règle seul.

Deux réglages de la plateforme, posés le 23 novembre : **le Marché est fermé pendant le tour** (il s'ouvre au tour
clos et à la maison) ; **l'oiseau chapardeur est coupé** pour le chapitre 1 (à rallumer, si vous le voulez, avant le
plateau 2).

## Ce qui attend votre geste : le panneau « Demandes »

Une ligne par demande, la plus ancienne en haut, un bouton par ligne.

- **Dés à valider** (si les dés sont physiques).
- **Sort à honorer** : Question, Conseil, Pause, Rôle, déjà payés ; « Honorer » quand c'est fait, sinon « Refuser et
  rembourser ».
- **Défi à juger** : le critère n'est visible que de vous. « Relevé » → le voile recule de deux cases ; « Pas
  encore » → rien.
- À partir du chapitre 3 : **Lettres à relire**, **Mentorats à écouter** (« Valider » ou « Réussi », sinon « Pas encore » avec
  une piste : l'élève réessaie sans repayer). Plus tard : chimères du Bestiaire.

## Les mots à dire, les mots à éviter

| Dire | Éviter |
| --- | --- |
| « Pas encore. », « La page dort encore ici. » | « Non », « faux », « raté », « perdu » |
| « Le voile avance », « la page pâlit », « le monde se dessèche » | Le Souffle « attaque », « chasse », « ronge » ; « monstre », « ennemi » |
| « l'oiseau » | Son nom (réservé au final de juin) |
| « Quatre mondes » | « Cinq mondes » |
| « vous » à l'équipe ; « Secrétaire, à toi » à un élève | Une règle expliquée d'avance : la classe la rencontre en jouant |
| « La réponse est dans la fiche… » | Donner la réponse après un « pas encore » |

Jamais le visage de Sélène ; rien sur la fin du voyage.

## Le chapitre 1 s'apprend en jouant (l'escalier)

| Séance | Ce qui s'ouvre |
| --- | --- |
| 1 | avancer, la question de case, fouiller, le défi de case, les défis de la Trame (hors tour) |
| 2 | faire tenir une page ; l'erreur du jour d'Olu |
| 3 | le voile et son dé gris ; la page témoin ; trois sorts ; la jauge de Lumière |
| 4 | le Marché ; trois sorts de plus |
| 5 et 6 | rien de nouveau |

Chaque tour clos monte une marche. Classe rapide : « Ouvrir la suite » (panneau « Profil »). Aux plateaux 2 à 4,
tout est ouvert dès la première séance.

Décidé le 23 novembre, pas encore en place : cinq marches au lieu de quatre, une seule par jour (le défi de case
passe à la séance 2, les sorts et la Lumière à la 4, le Marché à la 5) ; la question de case ne donnera plus de
relance.

## Si ça coince

- **Une tablette décroche** : flèche « Relire l'écran » dans son bandeau. Sinon, rescanner le QR de la classe, toucher
  la mascotte ; vous acceptez (la ligne des tablettes se déplie seule quand une tablette attend).
- **« L'équipe a déjà joué ce geste »** : deux appareils ont touché en même temps, un seul geste a compté. Rien n'est
  perdu.
- **Un élève manque** : sur sa tablette, l'équipe touche « Il manque quelqu'un ? » (vous pouvez le faire) ;
  « Quelqu'un vient d'arriver » le remet dans le tour.
- **Un élève perturbe** : « Retrait ». Il reste avec son équipe, ne verse pas au pot, regarde sans jouer depuis son
  compte ; le retrait se lève seul à la fin du tour. Aucune gemme n'est retirée.
- **Un pion est mal placé** : « Corriger la position… » (motif obligatoire).
- **Une équipe posée sur une case par un sort ou le vent** : la case ne joue pas ; votre fenêtre de case propose
  « Appliquer » ou « Ne pas appliquer ».
- **Mot de passe oublié** : bouton en face de l'élève ; le mot provisoire s'affiche une minute (pas sur l'écran projeté).
- **Le réseau tombe, la classe s'agite** : « Tout au tableau », puis « Rendre la main aux équipes » (voir l'encadré).

## ⚠️ Points d'attention (version 1.263.5, à revérifier après chaque mise à jour)

- **Au tableau, la chasse ne se joue pas.** En surface « tableau », et après « Tout au tableau », votre écran ne
  propose ni fouille ni lecture pour l'équipe active, et les tablettes n'affichent que des boutons grisés. Jouez la
  séance en surface « Tablettes » ; « Tout au tableau » ne sert qu'à finir les dés d'un tour. (Constat fait dans le
  code, pas encore à l'écran.)
- **« Équipe suivante »**, après la dernière équipe, repart sur la première : passez plutôt au voile.
- **L'erreur d'Olu** ne s'affiche que sur votre écran : lisez-la à voix haute.
- **Un tour non clos reste ouvert** d'une séance à l'autre : touchez toujours « Clore le tour ».
- **Les durées de tour** affichées à la clôture peuvent être fausses (heures mal enregistrées).
- **Clore le chapitre ferme le lien de projection** : créez-en un nouveau pour montrer le camp.
- **Les zones de chasse du plateau 1** sont encore des gabarits, pas posées sur les dessins : à retracer avant la
  première séance.
````

## Annexe B — « Déroulé d'une partie classique » (texte de départ, v1.263.5)

````markdown
# Gnomes & Licornes · Déroulé d'une partie classique

> **Pour le prof.** Une séance type, minute par minute, puis un chapitre de bout en bout. Partie jouée sur
> **tablettes** (une par équipe), avec la projection au vidéoprojecteur et votre poste.
> À lire avec « L'essentiel du maître du jeu ». État décrit : version 1.263.5 (23 novembre 2026).

## Le matériel

- **Votre poste** : la console, onglet « Jouer le tour ».
- **Le vidéoprojecteur** : la projection (lien ouvert depuis votre poste, réglée pour 1920 × 1080). Aucun geste de jeu
  ne s'y fait, aucune bourse ne s'y affiche.
- **Quatre tablettes**, une par équipe, et la **feuille du QR de la classe** (imprimée une fois pour l'année).
- **Les cartes Job** (cinq par équipe) et **les cartes Team Spirit** (six par équipe).
- Les élèves n'ont pas besoin de leur compte pendant le tour : ils s'en servent à la maison (le Seuil).

## Avant le chapitre (une fois, un quart d'heure)

1. **Créer la partie** : la classe, le plateau, le profil « Complet », la surface « Tablettes ». À partir du
   deuxième chapitre, « Copier la configuration d'une partie » reprend vos réglages.
2. **Composer les équipes** : « Composer automatiquement » rebrasse la classe et inverse les peuples quand il le faut.
   Relire, déplacer, appliquer.
3. **Vérifier le plateau** : les zones de chasse posées sur les bons dessins, les cases relues.
4. **Imprimer le QR de la classe** (la première fois seulement).
5. Au chapitre 1 : ouvrir le **test « avant »** sur olution.

## La veille (cinq minutes)

- Regarder « Demandes » : rien ne doit y traîner de la séance précédente.
- Noter les **défis de case** à juger demain (les équipes concernées les ont sur leur écran) et leur critère.

## La séance, minute par minute

Une douzaine de minutes de jeu, puis l'activité du jour.

### Mise en place (deux minutes, pendant que la classe s'installe)

- Ouvrir la projection : « Lien de projection ».
- Chaque équipe prend sa tablette et ses cartes Job (les rôles tournent à chaque cours).
- Chaque tablette scanne le QR de la classe (ou tape le code), puis touche la mascotte de son équipe.
- Vous : **« Tout accepter »** sur la ligne des tablettes. Elle doit dire « 4 tablettes connectées ✓ ».

### 1. Le tour s'ouvre (une minute) · « Ouvrir le tour »

- L'ordre des équipes est fixé : la plus en retard joue d'abord. Dès le tour 2, une équipe seule en dernière place
  est poussée de trois cases par le vent.
- **Olu glisse une erreur exprès** (à partir de la séance 2 du chapitre 1). Lisez-la à voix haute : la première équipe
  qui la corrige gagne un point de Lumière pour la classe.
- Une phrase au plus sur la nouveauté du jour ; Olu la dit aussi à l'écran. On n'explique pas les règles : la classe
  les rencontre.

### 2. À vous de jouer (huit minutes) · « Passer en jeu »

Les quatre équipes jouent **en même temps**. Sur chaque tablette, la carte du moment propose le geste suivant ; le
sablier du tour tourne sur les tablettes et la projection. À zéro, rien n'est annulé.

Le tour d'une équipe, dans l'ordre :

1. **Lancer les dés** · Gestionnaire. Le pion avance, la case d'arrivée s'applique :
   - case **Trame** : une gemme à chaque membre ;
   - case **Souffle** : au prochain tour, l'équipe ne lance qu'un dé (rien d'autre) ;
   - case **péripétie** : une petite consigne à jouer, ou « on passe » ;
   - case **Défi** : un défi à préparer pour la séance suivante ; le tour continue.
2. **Répondre à la question de la case** (case question) · Éclaireuse ou Éclaireur. « Valider » s'allume au bout de
   huit secondes : le temps d'en parler. Juste : une case de plus et une relance (une fois par tour ; décidé le
   23 novembre, pas encore en place : une case de plus, sans relance). « Pas encore » : rien n'est perdu.
3. **Fouiller** · Opératrice ou Opérateur. Deux fouilles par tour (une seule sous le voile). L'équipe lit l'indice
   dans le carnet de la classe (tiroir « L'équipe ») et touche le dessin où il mène :
   - à côté : « froid », « tiède » ou « chaud », et une empreinte reste sur le plateau ;
   - dans une zone : une question. Juste : **la page est trouvée**. « Pas encore » : rien n'est perdu, et l'écran
     dit où lire la réponse (une fiche ou un mot du glossaire). Une Licorne qui se trompe révèle quand même la zone à
     toute la classe ;
   - dans une zone **pâlie** : seuls les Gnomes peuvent la réparer.
4. **Lire et faire tenir** · Secrétaire. Une page trouvée par **l'autre peuple** attend un lecteur. Question de lecture
   juste : la page tient, et chaque membre présent de l'équipe lectrice gagne une gemme.
5. **Jeter un sort** · Assistante ou Assistant, au moment que le sort permet (avant de lancer, après le jet, pendant
   le tour). Le coût se partage seul entre les présents.

Quand l'équipe a tout joué, sa tablette dit « Votre tour est joué. Regardez les autres équipes. »

**Vous**, pendant ce temps : traiter « Demandes », circuler, débloquer une équipe, toucher le nom de l'équipe qui a
trouvé l'erreur d'Olu.

### 3. Le voile avance (une à deux minutes) · « Le voile avance »

- Le dé gris est tiré, plus le bonus du plateau (3, 4, 5 puis 6). « Le voile dort » le laisse en place une semaine.
  Aux séances 1 et 2 du chapitre 1 : « Passer à la suite ».
- La **page du jour** (la page de route du Passeur) : la projection l'ouvre par « La page du jour ». Un élève la lit
  à voix haute.
- La projection montre les équipes passées sous le voile et les zones pâlies. Rien n'est retiré.

### 4. Tour terminé (trente secondes) · « Clore le tour »

- La projection passe sur **« À la prochaine séance »** : la page du jour, l'indice d'une page qui dort encore, les
  défis à préparer. Laissez-la pendant l'activité.
- Une équipe qui finit l'activité en avance peut jouer aux **défis de la Trame** sur sa tablette.

### 5. Fin de l'activité (une minute)

- Pendant l'activité, honorer depuis « Demandes » les sorts du Travail (Question, Conseil, Pause, Rôle).
- À la fin : **« Bilan Team Spirit »**. Six cartes gardées par défaut ; ne touchez que celles qui ont été retirées.

## À la maison, sans vous (la veillée)

Depuis son compte, au Seuil : lire et faire tenir des pages (quatre par semaine au plus), les défis de la Trame (une
piste par semaine), les fiches d'espèces, le Marché, et, à partir du chapitre 3, la Lettre et le Mentorat.

## Un chapitre de bout en bout

| Séance | Ce qui arrive (chapitre 1) | Ce que vous pouvez dire (Olu le dit aussi) |
| --- | --- | --- |
| 1 | avancer, la question de case, fouiller, le défi de case ; les défis de la Trame hors tour | « Des pages dorment dans les dessins. L'indice vous dit où chercher. » |
| 2 | faire tenir une page ; l'erreur d'Olu | « Une page trouvée attend un lecteur de l'autre peuple. » |
| 3 | le voile ; une page pâlit d'elle-même près du départ (les Gnomes la réparent) ; trois sorts ; la Lumière | « Le voile avance derrière nous. » |
| 4 | le Marché (depuis les comptes) ; trois sorts de plus | « Le Marché s'ouvre, chez vous, depuis vos comptes. » |
| 5 et 6 | rien de nouveau ; on vise le camp | — |

Décidé le 23 novembre, pas encore en place : un escalier en cinq marches, une seule par jour (1 avancer et
chercher ; 2 tenir, l'erreur d'Olu, le défi de case ; 3 le voile et la page témoin, qui pâlira derrière la dernière
équipe ; 4 les sorts et la Lumière ; 5 le Marché). Deux tours joués le même jour n'ouvriront qu'une marche.

Aux plateaux 2 à 4, tout est ouvert dès la première séance. Nouveaux sorts : au chapitre 2, Grand Regard, Abri,
Cordée, Conseil, Pause, Rôle ; au chapitre 3, Esquive, Mentorat, Lettre, Choix ; au plateau 4, chaque équipe reçoit
une Cordée offerte.

## Le camp (fin de chapitre)

- La première équipe arrivée gagne l'honneur de l'**Avant-garde** ; ensuite, à chaque tour, son jet fait avancer
  l'équipe la plus en retard. Elle continue de fouiller, lire et jeter des sorts.
- **Clore la partie** quand les quatre équipes sont au camp, ou à la date que vous avez fixée (la caravane porte
  les retardataires) : honneurs, sceaux, titres et badges s'attribuent seuls.
- **Créer un nouveau lien de projection** (la clôture ferme l'ancien) pour montrer « Ce qui change au prochain
  chapitre » : le peuple de chacun, ses nouveaux sorts, ce que le plateau apporte.
- Un défi de case resté sans décision s'annule sans effet.
- Télécharger les exports (Team Spirit, badges) ; au chapitre 1, ouvrir le **test « après »** sur olution.
- Créer la partie suivante : copier la configuration, composer automatiquement.
- Avant le plateau 2, si vous le voulez : rallumer l'oiseau chapardeur dans les réglages (coupé pour le chapitre 1).

## Et sans tablettes ?

En surface « tableau », une seule équipe joue à la fois (sablier de trois minutes) et vous portez ses gestes depuis
votre écran, puis « Équipe suivante ».

⚠️ **Version 1.263.5** : au tableau, votre écran ne propose encore ni fouille ni lecture pour l'équipe active (constat
fait dans le code). Tant que ce n'est pas corrigé, jouez sur tablettes ; « Tout au tableau » sert seulement à finir
les dés d'un tour quand le réseau flanche.
````
`````

---

## Annexe H — Lot H : textes de l'Histoire, questions et liens (pour `data/gl/histoire/histoire-chapitres.json`)

Rédigé par Claude le 23/11 à partir des textes en base (`gl_chapters` ids 3 à 6) et des 22 scènes de la médiathèque,
regardées une à une. Chaque chapitre liste ses changements. laissée à Oliv (étape H3). Contrôlé le 23/11 : bonne réponse jamais la plus longue (0 sur 12), aucune piste qui
reprend un mot de la bonne réponse, filtre `findForbiddenString` muet sur questions, retours et légendes.

```json
{
  "format": "histoire-chapitres v1",
  "note": "Textes de la page Histoire des plateaux 1 à 4 (gl_chapters.story_markdown), corrigés contre les garde-fous, avec scènes référencées par nom et légendées ; questions du contrôle « Marquer comme lu » (gl_qcm_lore_questions, catégorie histoire) et leurs liens (gl_resource_question_links, type chapter_story). Rédigé par Claude le 23/11/2026, relu le 23/11 au soir contre les garde-fous du récit (aucun renversement, aucune chute, Souffle et visages dits par leurs effets). Les textes en base au 23/11 sont cités par leur phrase de garde.",
  "chapitres": [
    {
      "plateau": 1,
      "chapter_id_prod": 3,
      "garde_ancien_texte": "votre première arme contre l'Effacement",
      "story_markdown": "![Le point d'eau tari, au cœur de la jungle.](scene:point-d-eau-tari)\n\n## Chapitre 1 — Tropiques africains\n\n### *Premiers signes du Souffle*\n\n> Page de Sélène, ouverte au seuil du voyage.\n\nDe l'autre côté du miroir, la Trame s'ouvre dans toute son abondance : d'abord la jungle équatoriale, où le jour s'éteint sous la canopée, puis la savane d'or, sous un ciel sans hiver. C'est ici que Sélène a commencé son voyage, et c'est ici que vous reprenez le sien.\n\n![La savane d'or, où le voyage commence.](scene:savane-emerveillement)\n\n**Votre enjeu.** Retrouver vos marques, apprendre à *voir*. Les pages du carnet de Sélène se sont dispersées dans le paysage. Un peuple les trouve, l'autre les tient : c'est ainsi que le carnet se reconstruit.\n\n![Une page reprend ses couleurs.](scene:page-se-recolore)\n\n**Le rebondissement.** Au cœur de la jungle, un point d'eau s'est tari sans raison ; une tiédeur étrange flotte, venue de nulle part. La matriarche des éléphants vous conduit à la première page intacte de Sélène. Puis, sous vos yeux, une page pâlit et s'efface. Il faudra faire vite, et ensemble.\n\n![Penchés sur le carnet, à la nuit tombée.](scene:lecture-du-carnet-nuit)",
      "changements": [
        "Scène d'ouverture : la bonne image (point-d-eau-tari) au lieu de scene:1 = carnet-dans-la-savane ; forme markdown au lieu de <img src=\"scene:1\">, que la page élève ne résout pas",
        "Légende en double (ligne en italique sous l'image) retirée : la légende devient celle de la figure",
        "« votre première arme contre l'Effacement » retiré : nom d'un visage avant son plateau, et vocabulaire de combat",
        "« Votre enjeu » décrivait le jeu classique (nommer une espèce fait réapparaître la page) : réécrit pour « Tenir à deux » (un peuple trouve, l'autre tient)",
        "« Le compte à rebours commence. » → « Il faudra faire vite, et ensemble. » (ton anti-catastrophiste)",
        "Ligne d'auteur « *Tonalité : …* » retirée (note pour le prof, servie aux élèves)",
        "Selene → Sélène ; trois scènes de plus placées dans le texte",
        "« Le Souffle s'annonce » (verbe d'agent) → « Premiers signes du Souffle » ; légendes sans affirmation de règle"
      ]
    },
    {
      "plateau": 2,
      "chapter_id_prod": 4,
      "garde_ancien_texte": "Premier soupçon que les deux mondes sont liés",
      "story_markdown": "![La traversée du Sahara.](scene:traversee-du-sahara)\n\n## Chapitre 2 — Aride chaud\n\n### *La Grise*\n\n> Page de Sélène, écrite la gorge sèche.\n\nAprès la forêt, la soif : le Sahara, qui brûle le jour et gèle la nuit, puis la forêt méditerranéenne, où l'on retrouve enfin des arbres, endurcis par le soleil.\n\n**Votre enjeu.** Traverser l'aridité, atteindre la mer, suivre la piste de Sélène qui se précise. Vous trouverez une **trace** d'elle : un campement abandonné, sa gourde, un fanion délavé. Sélène a existé ; elle est passée là.\n\n![Le campement abandonné de Sélène et son fanion délavé.](scene:campement-abandonne-selene)\n\n**Le trouble.** En arrivant dans la garrigue, vous reconnaissez votre propre pays : les oliviers, les chèvres dans les arganiers, l'odeur du maquis. Ce monde-miroir ressemble au vôtre.\n\n![Un paysage familier : oliviers, garrigue, la mer au loin.](scene:reconnaissance-pays-mediterraneen)\n\n**Les couleurs qui s'en vont.** Dans la garrigue, les couleurs pâlissent et s'éteignent, jusqu'aux **vôtres**. Pour les garder, ravivez celles d'un coin de garrigue : retrouver, nommer, faire revivre.\n\n![La garrigue pâlit : les couleurs s'éteignent.](scene:la-grise-mediterranee)",
      "changements": [
        "Image remise dans l'ordre (elle tombait entre le sous-titre et la page de Sélène) ; forme markdown au lieu de <img src=\"scene:1\"> ; scene:1 montrait le campement sous la légende « L'épreuve de la Grise »",
        "Ligne en italique « *L'épreuve de la Grise.* » en tête retirée",
        "Ligne « *Tonalité* » retirée ; Selene → Sélène ; les quatre scènes placées dans le texte",
        "« trace tangible » → « trace » (mot de 6e) ; « Premier soupçon que les deux mondes sont liés » retiré (amorce de la révélation finale, garde-fou du renversement)",
        "« L'épreuve de la Grise » (la Grise en actrice) et « menacent de vous déteindre » → « Les couleurs qui s'en vont » : la Grise se dit par son effet, les couleurs pâlissent jusqu'aux vôtres",
        "« Là où le Souffle a passé » retiré (le Souffle dit par ses effets)"
      ]
    },
    {
      "plateau": 3,
      "chapter_id_prod": 5,
      "garde_ancien_texte": "il vient du *sud*",
      "story_markdown": "![La forêt d'automne s'est tue.](scene:foret-automne-le-silence)\n\n## Chapitre 3 — Tempéré atlantique\n\n### *Le Silence*\n\n> Page de Sélène, à demi effacée.\n\nPlus au nord, le monde a ralenti : la forêt de chênes et de hêtres aux quatre saisons bien marquées, puis la lande battue par l'océan.\n\n**Un matin.** La forêt ne chante plus. Plus un oiseau, plus un insecte. À la place, un grondement sourd s'installe, au loin. On voudrait demander au Passeur ce qui se passe. Il ne répond pas : il rend la question.\n\n![Un ciel lourd sur la lande.](scene:menace-grise-horizon)\n\n**Retrouver sa voix.** Là où le silence s'installe, les voix s'éteignent, et avec elles le pouvoir de nommer. On ne garde sa voix qu'à plusieurs : c'est en **nommant ensemble, à voix haute**, le vivant de la lande que les voix reviennent.\n\n![Sur la lande, nommer ensemble, à voix haute.](scene:landes-nommer-ensemble)",
      "changements": [
        "**Garde-fou du renversement spatial** : le paragraphe « Le retournement » disait d'où vient le grondement (« du sud, de derrière vous… vous croyiez marcher vers le Souffle ; il monte de derrière ») et posait « Et si le Souffle venait de chez nous ? ». Retiré : le grondement vient « au loin », le Passeur rend la question sans qu'elle soit écrite",
        "« Le Souffle menace de voler votre voix » et « vous brisez le Silence » (le Silence en adversaire) → « Retrouver sa voix » : là où le silence s'installe, les voix s'éteignent ; en nommant ensemble, elles reviennent",
        "« quatre saisons franches » → « bien marquées » ; ligne « *Tonalité* » retirée ; Selene → Sélène ; trois scènes placées dans le texte"
      ]
    },
    {
      "plateau": 4,
      "chapter_id_prod": 6,
      "garde_ancien_texte": "fuyant quoi ?",
      "story_markdown": "![La marche dans la taïga enneigée.](scene:taiga-marche-neige)\n\n## Chapitre 4 — Grand Nord\n\n### *Le Détricotage, puis l'Effacement*\n\n> Page de Sélène : son écriture devient fébrile.\n\nLe froid commande tout. D'abord l'immense taïga, ceinture sombre de conifères ; puis la limite des arbres, où la forêt s'arrête net ; puis la toundra, rase jusqu'à l'océan gelé. C'est le chapitre le plus long et le plus rude du voyage.\n\n**Votre enjeu.** Comprendre une chaîne : un lac gèle trop tôt, les poissons manquent, les oiseaux partent, les renards maigrissent. Un fil lâche, et d'autres suivent. Mais un fil se reprend : les Gnomes savent par où commencer la réparation.\n\n![Le lac a gelé trop tôt ; les oiseaux s'en vont.](scene:lac-gele-taiga)\n\n**La rencontre.** Dans un dernier coin vert, un homme assis vous offre le thé. Il vous conseille de vous arrêter là. Sur les faits, il n'a pas tort. Ce sera à vous de dire pourquoi vous repartez.\n\n**Le rebondissement.** Sous le dernier arbre, vous atteignez le **dernier campement de Sélène**. Son carnet s'arrête là, au milieu d'une phrase. Elle est repartie vers le pôle sans lui, en hâte, ne laissant derrière elle que des feuillets épars, de plus en plus pâles. Vers quoi ? Et le carnet que vous portez pâlit **plus vite**. Le miroir du retour se trouble.\n\n![Le dernier campement de Sélène, son carnet ouvert dans la neige.](scene:dernier-campement-carnet)\n\n![Le miroir du retour se trouble.](scene:miroir-du-retour-se-trouble)\n\n**Au-delà des arbres.** La toundra fleurit sous un soleil qui ne se couche plus. Profitez-en : un jour, il se couche, et la nuit polaire commence.\n\n![L'été de la toundra, sous le soleil de minuit.](scene:toundra-ete-ouverture)\n\n![La nuit polaire et ses aurores.](scene:toundra-hiver-aurores)",
      "changements": [
        "« Assister à un effondrement en chaîne » → « Comprendre une chaîne », et la chaîne se termine sur la réparation par les Gnomes (garde-fou anti-catastrophiste)",
        "« les renards dépérissent » → « maigrissent » ; « Un fil lâche, et cent suivent » → « d'autres suivent »",
        "« fuyant quoi ? » retiré (laissait entendre que Sélène fuit quelque chose) ; « Derrière vous, le miroir… » → « Le miroir du retour se trouble » (aucune direction)",
        "« il se couche, et ne se relève pas » → « et la nuit polaire commence » (exact, moins sombre)",
        "Ligne « *Tonalité* » retirée ; Selene → Sélène",
        "Scènes : les deux scènes de la toundra (médiathèque recit_05-chap5_*) entrent au plateau 4, qui a fusionné les anciens chapitres 4 et 5 ; les trois autres scènes recit_05 (abri de glace, bout du monde, retour par le miroir) restent à l'épilogue"
      ]
    }
  ],
  "questions": [
    {
      "question_code": "LQCM0358",
      "plateau": 1,
      "chapitre_slug": "ch1",
      "question": "Dans l'histoire, qu'est-ce qui montre que quelque chose ne va pas au cœur de la jungle ?",
      "choix_a": "Les éléphants quittent la savane pour la mer.",
      "choix_b": "Il neige sur la canopée pour la première fois.",
      "choix_c": "Un point d'eau s'est tari sans raison.",
      "choix_d": "La rivière déborde après un orage.",
      "choix_e": "Les arbres perdent leurs feuilles en une nuit.",
      "reponse_correcte": "C",
      "feedback_correct": "Oui : un point d'eau qui se vide sans raison, et une tiédeur venue de nulle part. Dans une forêt où il pleut presque tous les jours, c'est un signe que quelque chose cloche.",
      "feedback_a": "Les éléphants restent là : la matriarche guide même les voyageurs. Relis le paragraphe « Le rebondissement ».",
      "feedback_b": "Il ne neige pas sous l'équateur. Relis ce qui flotte dans l'air, au cœur de la jungle.",
      "feedback_d": "Ce qui se passe au cœur de la jungle est bien plus discret. Relis le début du rebondissement.",
      "feedback_e": "Les arbres de la forêt équatoriale gardent leurs feuilles toute l'année. Relis le rebondissement : qu'est-ce qui a changé ?"
    },
    {
      "question_code": "LQCM0359",
      "plateau": 1,
      "chapitre_slug": "ch1",
      "question": "Pourquoi l'histoire dit-elle qu'il faudra faire vite ?",
      "choix_a": "Les pluies vont bientôt fermer les chemins.",
      "choix_b": "La matriarche des éléphants va repartir.",
      "choix_c": "Le miroir ne reste ouvert qu'une journée.",
      "choix_d": "La nuit tombe d'un coup.",
      "choix_e": "Une page s'efface sous leurs yeux.",
      "reponse_correcte": "E",
      "feedback_correct": "Oui : une page pâlit, puis disparaît. Le carnet peut oublier ce qu'il raconte : c'est pour ça qu'il faut faire vite, et ensemble.",
      "feedback_a": "La pluie ne ferme aucun chemin dans ce chapitre. Relis la fin du rebondissement : qu'arrive-t-il au carnet ?",
      "feedback_b": "La matriarche guide les voyageurs, elle ne part pas. Relis la dernière phrase avant « Il faudra faire vite ».",
      "feedback_c": "Le texte ne dit rien sur la durée du miroir. Relis ce que les voyageurs voient arriver au carnet.",
      "feedback_d": "Sous la canopée, le jour s'éteint, c'est vrai, mais ce n'est pas la raison. Relis la fin du rebondissement."
    },
    {
      "question_code": "LQCM0360",
      "plateau": 1,
      "chapitre_slug": "ch1",
      "question": "D'après l'histoire, comment le carnet de Sélène se reconstruit-il ?",
      "choix_a": "Les éléphants rapportent les pages dispersées.",
      "choix_b": "Un peuple trouve une page, l'autre la tient.",
      "choix_c": "Chaque équipe garde ses pages pour elle seule.",
      "choix_d": "Les pages reviennent seules quand il pleut.",
      "choix_e": "L'équipe la plus rapide retrouve tout le carnet.",
      "reponse_correcte": "B",
      "feedback_correct": "Oui : Gnomes et Licornes ne font pas la même chose. L'un trouve, l'autre tient : seul, aucun peuple n'y arrive.",
      "feedback_a": "Les éléphants guident, mais ils ne rapportent rien. Relis « Votre enjeu » : qui fait quoi ?",
      "feedback_c": "Le carnet ne se reconstruit pas chacun dans son coin. Relis « Votre enjeu » : combien de peuples faut-il ?",
      "feedback_d": "Les pages ne reviennent pas toutes seules. Relis « Votre enjeu » : il y a deux gestes, faits par deux peuples.",
      "feedback_e": "Ici, ce n'est pas une course. Relis « Votre enjeu » : que fait chacun des deux peuples ?"
    },
    {
      "question_code": "LQCM0361",
      "plateau": 2,
      "chapitre_slug": "ch2",
      "question": "D'après l'histoire, pourquoi le Sahara est-il si dur à traverser ?",
      "choix_a": "Il y pleut sans arrêt pendant des mois.",
      "choix_b": "Ses arbres sont si serrés qu'on s'y égare.",
      "choix_c": "La mer le recouvre deux fois par jour.",
      "choix_d": "Il brûle le jour et gèle la nuit.",
      "choix_e": "Il y fait froid toute l'année.",
      "reponse_correcte": "D",
      "feedback_correct": "Oui : le jour, le sable brûle ; la nuit, sans nuages pour garder la chaleur, il peut geler. Il faut tenir face aux deux.",
      "feedback_a": "Au Sahara, il pleut très rarement. Relis la première phrase après la page de Sélène.",
      "feedback_b": "Au Sahara, les arbres sont rares. Relis la première phrase après la page de Sélène : deux moments de la journée y sont nommés.",
      "feedback_c": "Le Sahara est loin de la mer. Relis la phrase qui le décrit, juste après la page de Sélène.",
      "feedback_e": "Il n'y fait pas froid tout le temps. Relis la phrase qui décrit le Sahara : le jour et la nuit n'y sont pas pareils."
    },
    {
      "question_code": "LQCM0362",
      "plateau": 2,
      "chapitre_slug": "ch2",
      "question": "Quelle trace montre que Sélène est vraiment passée par là ?",
      "choix_a": "Un campement abandonné, avec sa gourde.",
      "choix_b": "Son nom écrit dans le sable des dunes.",
      "choix_c": "Une lettre qu'elle a laissée aux voyageurs.",
      "choix_d": "Des traces de pas qui mènent à la mer.",
      "choix_e": "Une page du carnet accrochée à un olivier.",
      "reponse_correcte": "A",
      "feedback_correct": "Oui : un campement, une gourde, un fanion délavé. Ce sont des objets laissés par quelqu'un : Sélène a existé, elle est passée là.",
      "feedback_b": "Le vent efface vite ce qu'on écrit dans le sable. Relis « Votre enjeu » : quels objets trouve-t-on ?",
      "feedback_c": "Sélène n'a pas laissé de lettre ici. Relis « Votre enjeu » : la trace est faite d'objets.",
      "feedback_d": "Le texte ne parle pas de pas. Relis « Votre enjeu » : qu'est-ce qu'on trouve sur la piste de Sélène ?",
      "feedback_e": "Les oliviers arrivent plus tard, dans la garrigue. Relis « Votre enjeu » : que trouve-t-on dans le désert ?"
    },
    {
      "question_code": "LQCM0363",
      "plateau": 2,
      "chapitre_slug": "ch2",
      "question": "Qu'est-ce qui trouble les voyageurs en arrivant dans la garrigue ?",
      "choix_a": "Les arbres y sont plus hauts que dans la jungle.",
      "choix_b": "Il n'y a plus aucun animal à observer.",
      "choix_c": "Ils y reconnaissent leur propre pays.",
      "choix_d": "La mer a disparu derrière les dunes.",
      "choix_e": "Les chèvres refusent de manger les feuilles.",
      "reponse_correcte": "C",
      "feedback_correct": "Oui : oliviers, chèvres dans les arganiers, odeur du maquis… Ce monde-miroir ressemble beaucoup au vôtre.",
      "feedback_a": "Les arbres de la garrigue sont plutôt bas, endurcis par le soleil. Relis « Le trouble ».",
      "feedback_b": "Il y a des animaux dans la garrigue : le texte en cite même un. Relis « Le trouble ».",
      "feedback_d": "La mer est là, au bout du voyage. Relis « Le trouble » : qu'est-ce qui semble familier ?",
      "feedback_e": "Au contraire, les chèvres grimpent dans les arbres pour manger. Relis « Le trouble » : à quoi ce paysage ressemble-t-il ?"
    },
    {
      "question_code": "LQCM0364",
      "plateau": 3,
      "chapitre_slug": "ch3",
      "question": "Un matin, à quoi les voyageurs remarquent-ils que la forêt a changé ?",
      "choix_a": "Les chênes n'ont plus une seule feuille.",
      "choix_b": "La forêt ne chante plus du tout.",
      "choix_c": "L'océan a recouvert la lande.",
      "choix_d": "Il fait soudain aussi chaud qu'en été.",
      "choix_e": "Les champignons ont envahi les sentiers.",
      "reponse_correcte": "B",
      "feedback_correct": "Oui : plus un oiseau, plus un insecte. Quand les animaux se taisent, c'est souvent le signe que le milieu va mal : le silence se remarque avant le reste.",
      "feedback_a": "En automne, les chênes perdent leurs feuilles chaque année : c'est normal. Relis le paragraphe « Un matin ».",
      "feedback_c": "La lande est au bord de l'océan, mais il ne la recouvre pas. Relis « Un matin » : qu'est-ce qu'on n'entend plus ?",
      "feedback_d": "Le texte ne parle pas de chaleur. Relis « Un matin » : écoute ce qui manque.",
      "feedback_e": "Les champignons poussent bien en automne, mais ce n'est pas le changement du texte. Relis « Un matin »."
    },
    {
      "question_code": "LQCM0365",
      "plateau": 3,
      "chapitre_slug": "ch3",
      "question": "D'après l'histoire, comment les voix reviennent-elles sur la lande ?",
      "choix_a": "En se taisant jusqu'au printemps.",
      "choix_b": "En allumant un grand feu sur la lande.",
      "choix_c": "En courant plus vite que les autres équipes.",
      "choix_d": "En recopiant seul chaque page du carnet.",
      "choix_e": "En nommant le vivant, tous ensemble.",
      "reponse_correcte": "E",
      "feedback_correct": "Oui : on ne garde sa voix qu'à plusieurs. Nommer ensemble ce qui vit autour de soi, c'est déjà commencer à le protéger.",
      "feedback_a": "Se taire, c'est laisser le silence s'installer. Relis « Retrouver sa voix ».",
      "feedback_b": "Un feu abîmerait la lande. Relis « Retrouver sa voix » : ce qu'il faut garder, c'est la voix.",
      "feedback_c": "Ici, ce n'est pas une course. Relis « Retrouver sa voix » : combien faut-il être ?",
      "feedback_d": "Seul, on n'y arrive pas. Relis « Retrouver sa voix » : on garde sa voix comment ?"
    },
    {
      "question_code": "LQCM0366",
      "plateau": 3,
      "chapitre_slug": "ch3",
      "question": "Qu'est-ce qui caractérise la forêt de chênes et de hêtres de ce chapitre ?",
      "choix_a": "Une chaleur humide toute l'année.",
      "choix_b": "Une seule saison, sèche et brûlante.",
      "choix_c": "Une nuit qui dure des semaines.",
      "choix_d": "Quatre saisons bien marquées.",
      "choix_e": "De la pluie seulement en été.",
      "reponse_correcte": "D",
      "feedback_correct": "Oui : au climat tempéré, chaque saison a son visage. Les chênes et les hêtres perdent leurs feuilles en automne et les retrouvent au printemps.",
      "feedback_a": "Ça, c'est le climat de la jungle, au premier chapitre. Relis la phrase qui décrit la forêt de chênes et de hêtres.",
      "feedback_b": "Ça ressemble plutôt au désert du deuxième chapitre. Relis la phrase qui décrit la forêt de ce chapitre.",
      "feedback_c": "La longue nuit, c'est pour bien plus au nord. Relis la phrase qui décrit la forêt de chênes et de hêtres.",
      "feedback_e": "Le texte ne parle pas de pluie. Relis la phrase qui décrit la forêt : que dit-elle de l'année ?"
    },
    {
      "question_code": "LQCM0367",
      "plateau": 4,
      "chapitre_slug": "ch4",
      "question": "Dans la taïga, un lac gèle trop tôt. Pourquoi les oiseaux s'en vont-ils ?",
      "choix_a": "Ils ne trouvent plus de quoi manger.",
      "choix_b": "Ils ont peur du bruit de la glace.",
      "choix_c": "Le froid leur fait perdre leurs plumes.",
      "choix_d": "Ils partent chercher les feuillets de Sélène.",
      "choix_e": "Ils doivent rejoindre la jungle avant l'hiver.",
      "reponse_correcte": "A",
      "feedback_correct": "Oui : sous la glace, les poissons deviennent impossibles à attraper. Quand une proie manque, ceux qui la mangent doivent partir ou maigrir : c'est une chaîne.",
      "feedback_b": "La glace ne leur fait pas peur. Relis la chaîne de « Votre enjeu » : qu'est-ce qui vient juste avant leur départ ?",
      "feedback_c": "Les plumes protègent justement du froid. Relis la chaîne de « Votre enjeu », dans l'ordre.",
      "feedback_d": "Les feuillets, ce sont les voyageurs qui les cherchent. Relis la chaîne de « Votre enjeu ».",
      "feedback_e": "Beaucoup d'oiseaux migrent, c'est vrai. Mais ici, relis la chaîne : qu'est-ce qui leur manque juste avant qu'ils partent ?"
    },
    {
      "question_code": "LQCM0368",
      "plateau": 4,
      "chapitre_slug": "ch4",
      "question": "Que montre la chaîne « un lac gèle, les poissons manquent, les oiseaux partent, les renards maigrissent » ?",
      "choix_a": "Seuls les plus forts tiennent dans le froid.",
      "choix_b": "Les renards font fuir les oiseaux du lac.",
      "choix_c": "Les êtres vivants dépendent les uns des autres.",
      "choix_d": "Un lac gelé ne change rien pour la forêt.",
      "choix_e": "Chaque animal vit seul, sans lien avec les autres.",
      "reponse_correcte": "C",
      "feedback_correct": "Oui : un fil lâche, et d'autres suivent. Mais l'inverse est vrai aussi : en réparant un fil, on aide tous ceux qui en dépendent.",
      "feedback_a": "Dans la chaîne, même les forts maigrissent. Relis-la : chaque maillon touche le suivant.",
      "feedback_b": "Les renards subissent la chaîne, eux aussi. Relis-la dans l'ordre : par quoi tout commence ?",
      "feedback_d": "Le lac gelé est justement le début de toute la chaîne. Relis « Votre enjeu ».",
      "feedback_e": "Si chacun vivait seul, rien ne passerait de l'un à l'autre. Relis la phrase « Un fil lâche… »."
    },
    {
      "question_code": "LQCM0369",
      "plateau": 4,
      "chapitre_slug": "ch4",
      "question": "Un homme offre le thé et conseille de s'arrêter. Que dit l'histoire de son conseil ?",
      "choix_a": "Il ment pour garder le carnet.",
      "choix_b": "Sur les faits, il n'a pas tort.",
      "choix_c": "Il veut que les voyageurs rentrent chez eux.",
      "choix_d": "Il ne connaît rien au Grand Nord.",
      "choix_e": "Il parle d'un autre voyage que le vôtre.",
      "reponse_correcte": "B",
      "feedback_correct": "Oui : sur les faits, il n'a pas tort, et pourtant vous repartez. Pourquoi ? C'est à vous de le dire : la réponse vous appartient.",
      "feedback_a": "Il ne cherche pas à prendre le carnet. Relis « La rencontre » : que dit le texte de ce qu'il affirme ?",
      "feedback_c": "Le texte ne dit pas où il veut vous envoyer. Relis « La rencontre », phrase par phrase.",
      "feedback_d": "Il vit dans ce dernier coin vert : il connaît le pays. Relis « La rencontre ».",
      "feedback_e": "Il parle bien de votre voyage. Relis « La rencontre » : que dit le texte de son conseil ?"
    }
  ],
  "questions_communes": {
    "categorie_slug": "histoire",
    "tier_lore": "recit",
    "statut": "actif",
    "niveau": "6e",
    "source_lore": "Page Histoire du plateau (gl_chapters.story_markdown), texte du 23/11/2026"
  },
  "liens": {
    "question_dataset": "qcm_lore",
    "resource_type": "chapter_story",
    "resource_ref": "numéro du plateau, en texte : \"1\" à \"4\"",
    "is_gating": 1,
    "weight": 1,
    "origin": "manual",
    "status": "approved",
    "note": "Contrôle « Marquer comme lu » de l'Histoire (23/11/2026)"
  }
}
```
