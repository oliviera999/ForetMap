# Prompt Claude Code · Gnomes & Licornes · l'ensemble unifié en 4 PR (la première en deux temps : 1a, 1b)

> À coller tel quel dans Claude Code, dépôt `oliviera999/ForetMap`. Modèle conseillé : le plus capable disponible,
> effort élevé ; **une session par PR, cinq sessions, dans l'ordre : 1a, 1b, 2, 3, 4**. Chaque session part de `main`
> à jour, après fusion de la PR précédente. **Ne fusionne rien toi-même** : tu ouvres les
> PR, Oliv fusionne.

Relevé le 17 novembre 2026 : `main` à **v1.242.2**, commit `9468652` (16/11). Prod `gl.olution.info` en v1.242.2,
catalogues « Tenir » synchronisés, aucun écart dépôt / base. **Aucune séance n'a encore été jouée en classe** ; la
première est prévue en décembre ou après : les quatre PR passent avant, et le chapitre 1 se jouera directement avec
les règles ci-dessous.

PR ouvertes à faire fusionner **avant** de commencer (elles touchent les mêmes fichiers) : **#659** (Cordée,
`lib/glSpellCast.js`) et **#661** (Relais, `lib/glSpellEffectsApply.js`). **#660** est une PR de doc sans rapport.
Si elles ne sont pas fusionnées, pars de `main` quand même et rebase quand elles le seront ; ne les recopie pas.

Données : branche **`claude/gl-ensemble-unifie-donnees`**, dossier `data/gl/tenir/ensemble-unifie/` (11 fichiers,
§ 5). Récupère-les par `git checkout origin/claude/gl-ensemble-unifie-donnees -- data/gl/tenir/ensemble-unifie`,
intègre-les aux catalogues, puis **supprime ce dossier d'attente** dans la PR qui consomme son dernier fichier.

---

## 1. Contexte en dix lignes

- Jeu d'écologie d'une année pour des 6e (11 ans), module G&L de ForêtMap. Quatre plateaux de 42 cases, deux peuples
  qui coopèrent (Gnomes : réparer ; Licornes : révéler), un carnet à retrouver page par page, un voile qui avance
  derrière la caravane.
- Mouture en vigueur dans le code : « Tenir à deux » v2 (`docs/GL_TENIR_A_DEUX_REGLES.md`, 250 lignes, 15/11).
- Ce prompt applique **l'ensemble unifié** des six audits du 15 novembre : 19 décisions de mécanique (M), 7 de lore
  (L), toutes tranchées par Oliv les 16 et 17 novembre. Il réécrit les règles en **v3** dans le même fichier.
- Fil directeur : **on enlève avant d'ajouter**. Chaque PR supprime au moins autant d'états et de réglages qu'elle en
  crée. Priorité à ce qui simplifie le jeu pour l'élève ou le prof et libère du temps de séance.
- Lis d'abord `CLAUDE.md`, `.cursor/rules/foretmap-pr-workflow.mdc`, puis les skills `gl-tenir-garde-fous`,
  `gl-tenir-moteur`, `gl-tenir-catalogue`, `gl-banc`, `gl-contenu-science`. Lance les sous-agents
  `gl-relecteur-garde-fous` et `gl-relecteur-science` avant chaque PR, et `/gl-verif`.

## 2. Garde-fous (bloquants, dans chaque PR)

**Lore.** Le Souffle (le voile, en jeu) n'est jamais personnifié : ni créature, ni verbe d'agent ; il se décrit par
ses effets (pâlir, se taire, s'effacer). Jamais le visage de Sélène. L'oiseau n'est jamais nommé (identifiant `kraa`
toléré dans le code). Ni renversement spatial, ni « chute sans bataille ». Rien du tiers `secret` du glossaire lore
côté élève. Un nom de visage n'apparaît pas avant son plateau. Le copiste n'intervient pas.

**Pédagogie.** Une erreur ne coûte **rien** : ni ressource, ni tour, ni temps d'attente. Retours « Pas encore »,
jamais « Non », « faux », « raté ». Le savoir sert à jouer, il ne paie pas : aucune ressource pour une bonne réponse
ou un défi. Bourses privées, distance au voile publique, aucun classement. Olu dit le geste, jamais de morale.
Parité fille / garçon dans tout libellé genré.

**Technique.** Le banc ne tourne jamais sur la prod (base `_sim` ou `_test`). Isolement G&L (`/api/gl/*`).
Aucun état d'attente sans sortie automatique. SQL paramétré. Chaînes visibles passées par
`src/shared/glGardeFousCore.js › findForbiddenString`. Miroirs CJS régénérés (`npm run sync:shared-cores`), `dist`
commité après `npm run build`. CHANGELOG sous `[Non publié]`, **ne touche pas au champ `version`**. Numéros de
migration : le dernier est `355` ; vérifie `migrations/` sur `main` et les PR ouvertes avant d'en prendre un.

## 3. Décisions verrouillées (ne pas rouvrir)

| #   | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **Une seule monnaie, les gemmes** (`power_points`), 3 au départ, plafond 8, gardée toute l'année. Les cœurs (`health_points`) sortent de tout écran et de toute règle G&L « Tenir ». La conduite ne passe par aucune monnaie.                                                                                                                                                                                                                                                                                                                                     |
| M2  | **Fouilles : 2 par équipe et par tour, 1 sous le voile**, pour les deux peuples. Une zone pâlie ne se fouille que par une équipe gnome (c'est la réparation). **Seule une fouille licorne « pas encore » dans une zone la révèle à toute la classe** ; une fouille gnome « pas encore » ne révèle rien. Fin de la fouille de réparation en plus. Le carnet de la classe et la projection affichent « révélée par X, trouvée par Y, tenue par Z ».                                                                                                                 |
| M3  | **Case Souffle : au tour suivant, l'équipe ne lance qu'un dé.** Même effet pour les deux peuples et les quatre plateaux. Ni recul, ni tour passé, ni ressource retirée. Cases positives : leur mouvement, sans ressource ; seule la case Trame donne une gemme.                                                                                                                                                                                                                                                                                                   |
| M6  | **Grimoire à 19 sorts.** Sortent : Nommer `SL041`, Héritage `SL033`, Boussole `SL038`, Tablette `SL006`, Musique `SL007`. Ouvertures : ch. 1 Progression, Relance, Farce, Lanterne, Bourrasque, Sentier, Relais, Question ; ch. 2 Grand Regard, Abri, Cordée, Conseil, Pause, Rôle ; ch. 3 Esquive, Mentorat, Lettre, Choix ; 3e trimestre Consécration. Cordée : lancée **pendant le jeu**, effet au **prochain tour** des deux équipes (fin de la fenêtre `avant_jets_pacte`). Écran des sorts en cinq moments, ne montrant que ce qui est lançable et payable. |
| M7  | **Trois cases Défi par plateau**, à l'arrêt exact : rangs 11, 20 et 29 (30 au plateau 4). L'ancienne case Défi du rang 40 ou 41 redevient case question.                                                                                                                                                                                                                                                                                                                                                                                                          |
| M8  | **Apprendre en jouant** : escalier automatique du chapitre 1, lignes d'Olu « première fois », page témoin, écrans « Maintenant, vous pouvez… » et « Ce qui change », une seule limite de veillée, accroche de fin de séance. Remplace le profil `prologue`.                                                                                                                                                                                                                                                                                                       |
| M9  | **Questions de case** : d'abord les questions vives pas encore posées dans la partie, puis les autres sous un plafond de difficulté par plateau `{1: 2, 2: 3, 3: 3, 4: 3}` ; à partir du plateau 2, une question sur cinq vient d'un biome déjà traversé (spirale).                                                                                                                                                                                                                                                                                               |
| M10 | **Cinq rôles, conseillés, jamais bloquants** : Gestionnaire (lance les dés), Éclaireuse / Éclaireur (répond à la question de case), Opératrice / Opérateur (fouille), Secrétaire (lit et fait tenir), Assistante / Assistant (jette les sorts ; à quatre, fait aussi l'Éclaireur). L'écran appelle le rôle, n'importe quel membre peut agir.                                                                                                                                                                                                                      |
| M12 | Tablette par défaut, dés tirés par l'app, sablier du tour à 8 min : **déjà réglé en prod** (lot 0). La surface `hybride` sort des choix proposés.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M13 | **Plusieurs appareils par équipe** : la main, version d'état, sessions d'équipe protégées, bourses au propriétaire, absent spectateur, délai de débat de 8 s.                                                                                                                                                                                                                                                                                                                                                                                                     |
| M14 | **Charge du prof** : sorts du Travail débités tout de suite (le prof honore, ou refuse et rembourse) ; Retrait levé à la clôture du tour ; présences sans confirmation ; bilan Team Spirit « 6 par défaut, touche ce que tu as retiré » ; copier la configuration d'une partie ; mot de passe d'élève réinitialisé en un appui.                                                                                                                                                                                                                                   |
| M16 | **Plateau 4 : une Cordée offerte par équipe** pour le chapitre.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| M17 | **La Lumière, version simple** : jauge commune qui ne descend jamais ; chaque carte Team Spirit gardée ajoute 1, l'erreur d'Olu corrigée ajoute 1 ; **à 100, le voile recule de 5, d'office**, et la jauge repart à 0. Plus de choix à enregistrer, plus de sort « Lumière » `SL050`.                                                                                                                                                                                                                                                                             |
| M18 | Une séance de Trame par chapitre pour toute la classe : aucune ligne de code, sauf le + 10 de M20.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| M19 | **Gemmes rares** : une page tenue rapporte + 1 gemme à chaque membre présent de l'équipe **qui la fait tenir** (les lecteurs), plus rien à l'équipe qui l'a trouvée. Carnet complet : + 1 à tous, voile − 3 (inchangé). Parures de 2 à 8 gemmes, **gardées toute l'année** et rééquipables. Consécration (8) visible grisée dès le chapitre 1.                                                                                                                                                                                                                    |
| M20 | Une réussite à un défi de la Trame ouvre aussi **une piste** (une page endormie du chapitre se révèle à la classe), dans la même limite d'une piste par semaine que l'étude d'une fiche ; en mode équipe, pendant une séance de Trame, elle ajoute **10 à la Lumière**. Jamais de gemme.                                                                                                                                                                                                                                                                          |
| M21 | **Trois défis de la Trame de plus, sans nouvel écran**, ouverts aux deux peuples : « Le bon rôle », « Les fils de l'adaptation », « Le bon pays ».                                                                                                                                                                                                                                                                                                                                                                                                                |
| M22 | **Chaque question de zone trouve sa réponse sur le site** (fiche d'espèce ou terme de glossaire relié à la zone).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M23 | **Mentorat** : coût 3, jamais remboursé, un seul par séance et par classe, un « pas encore » se retente sans repayer. **Lettre** : coût 2, un « pas encore » se réécrit sans repayer, trois amorces d'Olu. **La Plume sort** du grimoire du voyageur.                                                                                                                                                                                                                                                                                                             |
| L2  | Lexique : la fin de chapitre s'appelle **le camp** (sorts « du camp ») ; **le Seuil** reste l'espace personnel de l'élève. Honneur Éclaireurs → **Avant-garde** ; Passeurs → **Compagnons** ; badges Passeur de page → **Porte-page**, Passeur de seuil → **Grand voyageur** ; sceau licorne Éclaireuses → **Révélatrices** (pages trouvées + zones révélées).                                                                                                                                                                                                    |
| L5  | La zone `cz-p2-08` s'active avec le feuillet `ep-I-06`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| L7  | Une Lettre validée est une **page du voyageur, en marge** du carnet : elle ne compte pas pour le carnet complet.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Non retenues, donc inchangées** : le pâlissement des pages trouvées non tenues (10 % par tour sous le voile, 50 %
au plus, sauf Abri) ; le carnet complet = toutes les pages actives (8, 8, 10, 10) ; le Marché garde annonces,
échange à deux et dons ; sceaux et badges restent sur l'écran d'équipe. Le voile reste à 3 / 4 / 5 / 6.

## 4. Choix par défaut (fais-les sans demander ; dis-le dans la PR)

| Sujet                                 | Choix                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| État « un seul dé »                   | Une colonne booléenne sur l'équipe en partie (par exemple `un_de_prochain_tour`), posée à l'arrêt sur une case Souffle, consommée au premier lancer du tour suivant. Effet de case : nouvelle clé `unDeAuProchainTour: true` dans `event_config_json` (cœur `glMarkerEventConfigCore`).                                    |
| Révélation licorne                    | Portée par la zone en partie (`revelee_par_team_id`, `revelee_round`). La zone révélée s'affiche pour toute la classe (contour), comme aujourd'hui une zone connue.                                                                                                                                                        |
| Plafond de difficulté                 | Un réglage objet `tenir_questions_difficulte_max_par_plateau` ; les `difficulteMax` portés par les cases question sont ignorés en mode « Tenir » et retirés des données par migration.                                                                                                                                     |
| Spirale                               | Un réglage `tenir_questions_spirale` (0 à 1, défaut 0,2), sans effet au plateau 1.                                                                                                                                                                                                                                         |
| Limite de veillée                     | Un réglage `tenir_pages_par_semaine` (défaut 4) remplace `pages_veillee_par_semaine` et `defis_pages_par_semaine` ; `pistes_par_semaine` reste (1). Un seul compteur par élève et par semaine ISO.                                                                                                                         |
| Escalier                              | Piloté par un réglage de partie `tenir_escalier` (défaut `true` au plateau 1, `false` ailleurs) et par le **nombre de tours clos** de la partie : séance n = tour n. Le prof peut avancer d'un pas d'un clic (« Ouvrir la suite »), jamais reculer.                                                                        |
| Lumière                               | `tenir_lumiere` à `true`, `tenir_lumiere_palier` à 100, `tenir_recul_lumiere` 5 ; `tenir_cartes_vers_cases` retiré.                                                                                                                                                                                                        |
| Réglages retirés                      | `fouilles_reparation_gnome`, `fouille_sous_voile`, option `ressource_peuple` de `cases_positives`, profil `prologue`, `pages_veillee_par_semaine`, `defis_pages_par_semaine`, `cartes_vers_cases`, `max_health_points` (PR 4). Une valeur en base hors registre ne doit pas faire planter : elle est ignorée et signalée.  |
| Codes des questions de zone réécrites | `GQCM9301` à `GQCM9305` (le plus grand code `GQCM` en base est `GQCM9258`) ; vérifie qu'ils sont libres.                                                                                                                                                                                                                   |
| Nouvelle fiche et nouveaux termes     | `SP0277` (le plus grand code est `SP0276`), `GL0279` et `GL0280` (le plus grand hors `GL9xxx` est `GL0278`) ; vérifie, décale si besoin et répercute dans `zones-m22.json`.                                                                                                                                                |
| Sorts retirés                         | `actif: false` (ou statut `propose`) plutôt que supprimés : aucun n'a été lancé en classe, mais des parties de test existent.                                                                                                                                                                                              |
| Nom des unités des défis              | `role:<biome>`, `adaptation:<biome>`, `pays:p<plateau>`.                                                                                                                                                                                                                                                                   |
| Longueur des choix                    | Test de contenu en avertissement (non bloquant) : dans un lot de questions, la bonne réponse ne doit pas être strictement la plus longue dans plus de 40 % des cas. Le lot 2 des questions vives est à 25 % ; le lot 1 (`VQCM0001` à `0040`) est à 35 sur 40 : **ne le réécris pas**, liste-le dans « à relire par Oliv ». |

Si un constat de ce prompt se révèle faux en lisant le code, **ne force pas** : écris-le dans la PR (« écarté :
constat faux ») et applique l'intention de la décision.

## 5. Données livrées (`data/gl/tenir/ensemble-unifie/`)

| Fichier                             | Contenu                                                                                                                                                                                                                                                                                                                          | Va où                                                                                              | PR                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| `cases-souffle.json`                | 13 cases Souffle : `marker_id`, plateau, rang, titre, description, libellé d'effet (5 titres changent)                                                                                                                                                                                                                           | migration sur `gl_chapter_markers`                                                                 | 1a                          |
| `zone-cz-p2-08.json`                | zone activée, feuillet `ep-I-06`, question de lecture et ses 4 retours                                                                                                                                                                                                                                                           | `chasse-zones.json`, `questions-lecture.json`                                                      | 1b                          |
| `zones-m22.json`                    | pour les 36 zones : `especes` (la première fiche donne la réponse), `glossaire` (termes qui la donnent), `question_code` s'il change ; 5 questions de zone réécrites (5 choix, retours « Pas encore ») ; 1 fiche d'espèce à créer (fourmi magnan), 2 termes de glossaire à créer, 2 à compléter ; 5 questions à sortir du tirage | `chasse-zones.json`, `gl_qcm_questions`, `gl_species`, `gl_glossary_terms` (migration idempotente) | 1b                          |
| `questions-vives-lot2.json`         | 40 questions vives `VQCM0041` à `VQCM0080` (10 par biome des plateaux 1 et 2), même format que le lot 1                                                                                                                                                                                                                          | à **fusionner** dans `questions-vives.json` (80 questions)                                         | 1a                          |
| `lettre-mentorat.json`              | amorces de la Lettre, consigne et critère du Mentorat, retours                                                                                                                                                                                                                                                                   | textes de l'écran et de la file du prof                                                            | 1b                          |
| `olu-premiere-fois.json`            | 23 lignes d'Olu « première fois » (moment `premiere_fois`, clé d'évènement, séance de l'escalier) et 6 révisions de lignes existantes                                                                                                                                                                                            | `olu-lignes.json`                                                                                  | révisions : 1a · lignes : 2 |
| `trame-ranger.json`                 | « Le bon rôle » (8 jeux, un par biome, 8 cartes) et « Le bon pays » (4 jeux, un par plateau, 8 à 10 cartes avec indice)                                                                                                                                                                                                          | nouveau catalogue                                                                                  | 2                           |
| `trame-adaptations.json`            | « Les fils de l'adaptation » (8 jeux, un par biome, 9 cartes, 6 ou 7 fils)                                                                                                                                                                                                                                                       | nouveau catalogue                                                                                  | 2                           |
| `test-avant-apres-ch1.json`, `.xml` | le test avant / après du chapitre 1, **déjà créé sur olution** : pour mémoire, rien à coder                                                                                                                                                                                                                                      | —                                                                                                  | —                           |
| `README.md`                         | ce tableau                                                                                                                                                                                                                                                                                                                       | —                                                                                                  | —                           |

Règles d'intégration : un JSON par catalogue dans `data/gl/tenir/`, chargeur tolérant et chargeur strict, empreinte,
carte d'administration, outil MCP `gl_tenir_catalogues`, test de contenu, README des données mis à jour (skill
`gl-tenir-catalogue`). Le contrôle « 5 questions vives par biome » de `lib/glTenirImport.js` devient « 15 pour les
biomes des plateaux 1 et 2, 5 pour les autres ». Passe tout texte par le crible des chaînes interdites ; « Silence
soudain » (plateau 3) est voulu : le nom de visage est sur son plateau.

---

## 6. PR 1 · Simplifier, en deux PR

La PR 1 se livre **en deux PR**, pour que chacune reste relisible et que le banc mesure le moteur seul.

| PR                                     | Titre                                                                   | Étapes                                                                         | Ce qu'elle change                     |
| -------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| **1a · Le moteur**                     | `feat(gl): ensemble unifié — règles du tour simplifiées`                | 1.1, 1.2, 1.3, 1.4, la partie « grimoire » de 1.5, 1.6, 1.7, puis le banc 1.12 | tout ce qui touche l'équilibre du jeu |
| **1b · Le prof, les mots, le contenu** | `feat(gl): ensemble unifié — charge du prof, lexique, zones, règles v3` | la partie « Mentorat, Lettre, voyageur » de 1.5, 1.8, 1.9, 1.10, 1.11          | rien qui change l'équilibre           |

- **1.5 se coupe en deux.** En 1a : `sorts.json` (sorts retirés, ouvertures par chapitre), la Cordée (fenêtre `jeu`,
  effet au prochain tour) et la Cordée offerte du plateau 4. En 1b : Mentorat, Lettre, retrait de la Plume, délai des
  fiches et grimoire du voyageur.
- **Docs.** La PR 1a met à jour `docs/API.md`, les docs de référence et le CHANGELOG pour ce qu'elle change ; la
  réécriture complète des règles en v3 (1.11) est faite en 1b, une fois tout le reste en place.
- **Banc.** Il tourne à la fin de la 1a (1.12). La 1b ne le relance que pour vérifier qu'elle ne bouge aucun chiffre.

Un commit par étape, tests verts à chaque commit.

**1.1 · Fouilles (M2).** Fichiers : `lib/glChasse.js › fouillesRestantes, isSousVoile, fouillerTx, repondreChasseTx,
buildCarnetClasse`, `lib/glSettings.js`, `lib/glTenir.js`, `data/gl/tenir/reglages-defaut.json`,
`src/gl/components/settings/GLTenirSettings.jsx`, `src/shared/glTenirPermissionsCore.js`. Constat : quotas par peuple
(`fouilles_par_tour {gnome: 1, unicorn: 2}`), fouille de réparation en plus (`fouilles_reparation_gnome`), trois modes
sous le voile (`fouille_sous_voile`). Attendu : `fouilles_par_tour` devient un entier (2), `fouilles_sous_voile` un
entier (1) ; zone pâlie réservée aux équipes gnomes (refus d'une licorne : « Cette zone a pâli : les Gnomes savent la
réparer. », sans consommer la fouille) ; révélation par la seule fouille licorne « pas encore » ; crédit de la
révélation au carnet de la classe, à la projection, au badge Trouveur et au sceau licorne. Tests : quotas, sous le
voile, refus sans perte, révélation licorne oui / gnome non. Acceptation : aucun couple équipe × séance sans fouille
possible.

**1.2 · Cases Souffle et cases positives (M3, L3, L4).** Fichiers : `src/shared/glTenirCaseEffetCore.js`,
`src/shared/glMarkerEventConfigCore.js`, `lib/glTour.js`, `lib/glMarkerEffects.js`, `lib/glMarkerVitalityEffects.js`,
`lib/glMarkerPromiseAudit.js`, `lib/glArriveeSuspendue.js`, `routes/gl/games/markers.js`,
`lib/glJournalPresentTenir.js`, `lib/mcp/tools/domains/glContentSnapshot.js`. Migration idempotente : les 13 cases de
`cases-souffle.json` reçoivent titre, description, effets identiques pour les deux peuples (`deltaMove` 0, `deltaPv`
0, `deltaGems` 0, `passTurn` false, `unDeAuProchainTour` true), `eventMeta.tonalite` inchangé. Règle de l'état :

- il se pose quand le pion **s'arrête** sur une case Souffle (après le jet, la relance ou le + 1 d'une question
  juste) ; Sentier l'empêche, comme aujourd'hui ;
- c'est un oui / non par équipe : deux cases Souffle avant le tour suivant ne se cumulent pas ;
- il se consomme au **premier lancer** du tour suivant : l'app tire un dé (ou une seule face est saisie en dés
  physiques) ; la relance gagnée par une question juste se joue à deux dés ;
- Relance (sort) relance ce seul dé ; Progression ne change pas ; Cordée : chaque équipe lance ses dés, les deux
  avancent du meilleur des deux jets ; le vent ne change pas ;
- il s'efface si l'équipe arrive au camp, et à la clôture de la partie ;
- il s'affiche aussitôt sur l'écran d'équipe et la projection : « Au prochain tour : un seul dé ».

`passTurn` et les reculs disparaissent du moteur « Tenir » et de la vérité des cases ; l'option `ressource_peuple` de
`cases_positives` est retirée (reste `neutre`). Tests : cœur de l'effet à 100 % des branches, chaque ligne de la
règle, contrôle `gl_marker_promises` vert sur les 4 plateaux.

**1.3 · Trois cases Défi (M7).** Migration sur `gl_chapter_markers` (chapitres 3 à 6 = plateaux 1 à 4 ; rang = ordre
des repères, départ = rang 0) : rangs 11 et 29 (30 au plateau 4) passent en case Défi ; l'ancienne case Défi du rang
41 (plateau 1) ou 40 (plateaux 2 à 4) redevient case question du biome de la fin de plateau. Le rang 20 reste. Vérifie
les rangs réels par requête avant d'écrire. Test de contenu : 3 cases Défi par plateau, aux bons rangs.

**1.4 · Questions de case (M9).** Fichiers : `lib/glMarkerQuestionPool.js` (`usageTenir`, `difficulteMax`),
`lib/glTour.js › noterQuestionDeCaseTx, questionDeCaseDue, solderQuestionDeCaseTx`, `lib/glTenirImport.js`
(`QUESTION_VIVE_CODE_RE`). Attendu, dans l'ordre : (1) une question vive (`VQCM…`) du biome de la case pas encore
posée dans la partie ; (2) sinon une question `usage_tenir = 1` du biome, difficulté ≤ plafond du plateau, pas encore
posée à cette équipe ; (3) à partir du plateau 2, avec la probabilité du réglage, le biome est tiré parmi ceux des
plateaux déjà traversés. Aucun tirage vide : on relâche d'abord « pas encore posée », puis le plafond. Fusionne le lot
2 des questions vives. Tests : ordre du tirage, plafond, spirale à graine fixée, repli.

**1.5 · Grimoire à 19 sorts (M6, M16, M23).** `data/gl/tenir/sorts.json` : sorts retirés, `ouverture_par_chapitre`
de la décision, Cordée en fenêtre `jeu` avec effet différé au prochain tour (retire `avant_jets_pacte` de
`lib/glSpellFenetres.js`, `src/shared/glSortMomentsCore.js`, `src/shared/glTenirPermissionsCore.js`,
`src/gl/components/spell-cast/GLSpellCastEffectParams.jsx`) ; au plateau 4, une Cordée gratuite par équipe et par
chapitre. Mentorat : coût 3, remboursement conditionnel retiré, un seul par séance et par classe (refus : « Un
Mentorat est déjà prévu aujourd'hui. », sans débit), un seul paiement jusqu'à validation. Lettre : coût 2, « pas
encore » → réécriture sans repayer, trois amorces (`lettre-mentorat.json`). Plume retirée du grimoire du voyageur
(`lib/glVoyageur.js`, `lib/glVoyageurPlume.js › proposerPlumeTx, validerPlumeTx`, `lib/glDemandes.js`) : la table
`gl_voyageur_plumes` et la source `lettre` restent. Vérifie qu'une Lettre validée **ne compte pas** pour le carnet
complet (`lib/glChasse.js › verifierCarnetCompletTx`) ; test dédié. Aligne le grimoire du voyageur des règles sur ce que l'app
fait vraiment. Constat vérifié : `lib/glVoyageur.js` (l. 87 et 696) pose un **délai d'attente après une mauvaise
réponse à une fiche**, que « Seconde chance » lève. Il contredit « une erreur ne coûte rien ». Choix par défaut :
nouveau réglage `tenir_delai_fiche_secondes`, **défaut 0** (plus de délai en mode « Tenir ») ; à 0, « Seconde
chance » n'a plus d'objet et sort du grimoire du voyageur (restent Loupe, Mémoire, Flair). Le réglage permet à Oliv de
revenir en arrière d'un clic : signale ce choix en tête de la PR.

**1.6 · Gain de la page tenue (M19, 1re partie).** `lib/glChasse.js › tenirPageTx` : + 1 gemme à chaque membre
présent de l'équipe qui fait tenir ; rien à l'équipe qui a trouvé ; en veillée, le gain va aux membres de l'équipe du
lecteur. Carnet complet inchangé. Révisions des lignes d'Olu (`olu-premiere-fois.json › revisions`).

**1.7 · Lumière simple (M17) et piste des défis (M20).** `lib/glTour.js` (Team Spirit, Lumière),
`routes/gl/games/tenir-tour.js`, `src/gl/components/mj/GLTeamSpiritPanel.jsx`, `lib/glTrameDefis.js`,
`lib/glChasse.js › pisteTx`. Jauge par partie, jamais décrémentée ; palier atteint → recul d'office, évènement au
journal, ligne d'Olu existante (`olu-38`), jauge à 0. Le choix au palier et le sort `SL050` disparaissent. Défi de la
Trame réussi → une piste dans la limite hebdomadaire commune ; en mode équipe + 10 à la Lumière. Tests : palier, pas
de double comptage d'un bilan (la garde ajoutée par la PR #658 reste), piste unique par semaine.

**1.8 · Charge du prof (M14).** Sorts du Travail débités au lancement, file unique « honorer / refuser et
rembourser » (`lib/glSpellCast.js`, `lib/glDemandes.js`) ; Retrait (`gl_game_retraits`, `lib/glTenir.js`) levé à la
clôture du tour ; présences sans confirmation (retire le refus 409 `PRESENCE_A_CONFIRMER` de `lib/glPresences.js` et
`lib/glSpellCast.js`) ; bilan Team Spirit prérempli à 6 ; « Copier la configuration » d'une partie à la création de
la suivante ; réinitialisation du mot de passe d'un élève en un appui depuis la console (mot de passe provisoire
affiché une fois, jamais journalisé).

**1.9 · Lexique et sceaux (L2).** `lib/glHonneurs.js` (`HONNEURS`, `SCEAUX`), `data/gl/tenir/titres.json`,
`badges.json`, `lib/glRewardsCatalog.js`, `routes/gl/games/tenir-honneurs.js`, `lib/glSeuil.js`, libellés d'écran.
Les **clés techniques peuvent rester** (`eclaireurs`, `seuil`…) si les renommer coûte une migration risquée : seuls
les libellés visibles changent obligatoirement. Sceau licorne : critère = pages trouvées + zones révélées. Le badge
« Révélateur » des trames altérées (`lib/glRewardsCatalog.js`) change de nom pour ne pas doubler le sceau : propose
« Voyant des fils », à confirmer par Oliv dans la PR.

**1.10 · Zones (M22, L5).** Applique `zones-m22.json` et `zone-cz-p2-08.json` : `especes` réordonnées, champ
facultatif `glossaire` (codes de termes) dans `chasse-zones.json` et sa table ; après un « pas encore » à une question
de zone, l'écran propose la piste : « La réponse se trouve dans la fiche … » ou « … au mot … du glossaire » (un lien,
pas la réponse). Migration idempotente : 5 questions `GQCM93xx`, fiche `SP0277`, termes `GL0279` et `GL0280`, phrases
ajoutées à `GL0038` et `GL0192` (sans doublon si déjà présentes), `usage_tenir = 0` pour les 5 anciennes questions.
Ajoute `scripts/gl-controle-reponses-sur-site.js` : pour chaque question de zone puis chaque question de case
`usage_tenir = 1`, cherche les mots de la bonne réponse dans les fiches et termes reliés ; sortie CSV « trouvée / en
partie / introuvable ». Joins le rapport à la PR : c'est la liste de travail du prochain lot de contenu.

**1.11 · Règles v3 et docs.** Réécris `docs/GL_TENIR_A_DEUX_REGLES.md` en v3 (même plan, § 8 « La monnaie » au
singulier dès maintenant en notant que le code suit en PR 4 ; Boussole sortie partout ; 5 rôles), `docs/GL_DEFIS.md`,
`docs/GL_TENIR_A_DEUX.md`, `docs/API.md`, `docs/reference/gl/*`, `data/gl/tenir/README.md`, skills `.claude/skills/gl-*`
devenus faux.

**1.12 · Banc.** Scénario `tools/gl-sim/scenarios/ensemble-unifie.js` (4 plateaux, classe moyenne et classe en
difficulté, graine fixée, réglages de l'ensemble contre les réglages d'avant). Le crible des mots interdits du banc
doit ignorer les champs `*Token` (faux positif connu sur les jetons en base64). Rapport dans la PR :

| Mesure                                                                                          | Avant (banc du 15/11)                  | Cible                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| Couples équipe × séance sans fouille possible, P3-P4                                            | 31 à 61 %                              | 0 %                     |
| Part des Licornes dans les gestes de chasse utiles (trouvées, révélations converties, réparées) | non mesurée (pages : Gnomes 43 à 71 %) | 40 à 60 %               |
| Carnet complet, P3-P4                                                                           | 0 à 13 %                               | à lire ; signale si 0 % |
| Gemmes créées par élève et par chapitre                                                         | 3,8 à 4,8                              | 1,6 à 2,4               |
| Tours à un seul dé par équipe et par chapitre                                                   | —                                      | ≈ 0,5                   |
| Défis de case reçus par chapitre (classe)                                                       | 1 à 2                                  | ≈ 2                     |
| Reculs de Lumière par chapitre                                                                  | —                                      | ≈ 1                     |
| Écart de position Licornes − Gnomes                                                             | jusqu'à − 2 cases                      | 0                       |

Ne règle rien pour atteindre une cible : mesure, et signale.

## 7. PR 2 · Apprendre en jouant (`feat(gl): escalier du chapitre 1, première fois, trois défis de la Trame`)

**2.1 · L'escalier (M8).** Au plateau 1, ce qui est ouvert dépend du nombre de tours clos :

| Séance | S'ouvre                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | avancer (dés, cases, question de case, péripéties) ; chercher (2 fouilles, chaud / tiède / froid, empreintes, oiseau témoin) ; défi de case ; défis de la Trame hors tour |
| 2      | tenir (la page trouvée attend un lecteur de l'autre peuple) ; l'erreur du jour d'Olu                                                                                      |
| 3      | le voile (premier dé gris) ; la page témoin ; 3 sorts : Progression et les deux du peuple (Lanterne, Bourrasque ou Sentier, Relais) ; la jauge de Lumière                 |
| 4      | le Marché (comptoir, annonces, échange, dons) ; 3 sorts : Relance, Farce, Question                                                                                        |
| 5 et 6 | rien de nouveau                                                                                                                                                           |

Une fonction pure `escalierPourTour(n)` (cœur partagé, 100 % des branches) rend la liste des modules ouverts ; le
serveur la rejoue dans les droits (`glTenirPermissionsCore`), l'écran masque ce qui n'est pas ouvert (pas de bouton
grisé). **Page témoin** : à l'ouverture de la séance 3, une zone encore endormie pâlit d'office (la plus proche du
départ) pour que les Gnomes vivent la réparation sans danger. Le profil `prologue` est supprimé (`lib/glTenir.js`,
`routes/gl/games/tenir.js`, `routes/gl/games.js`, `routes/gl/admin.js`, `routes/gl/market.js`, réglages) ; une partie
existante en `prologue` passe en `complet` avec `tenir_escalier` à `true`.

**2.2 · Olu « première fois ».** `olu-premiere-fois.json › lignes` dans `olu-lignes.json` ; `lib/glTenirOlu.js`
choisit la ligne `premiere_fois` de la clé quand l'évènement arrive pour la première fois dans la partie (ou pour
l'équipe quand la ligne porte `{equipe}`), une seule fois (mémoire en base, par partie). Clés : `avancer`,
`question_pas_encore`, `chercher`, `chaud_froid`, `peripetie`, `defi_case`, `trame`, `role`, `tenir`,
`erreur_du_jour`, `voile`, `sous_le_voile`, `page_temoin`, `palissement`, `sorts`, `lumiere`, `marche`,
`un_de_pose`, `un_de_joue`, `main`, `camp`, `cordee_offerte`, `lettre`.

**2.3 · Deux écrans.** « **Maintenant, vous pouvez…** » : en tête de l'écran d'équipe, le ou les gestes possibles à
cet instant, chacun avec l'appel du rôle (« Opératrice ou Opérateur : 2 fouilles », « Éclaireuse ou Éclaireur :
la question »), jamais bloquant. « **Ce qui change** » : au camp, trois lignes pour le chapitre suivant (ton peuple,
tes nouveaux sorts, la nouveauté du plateau), calculées depuis `sorts.json` et les réglages. Accroche de fin de
séance : la page du Passeur de la séance et l'indice d'une zone encore endormie, sur la projection.

**2.4 · Une seule limite de veillée.** Compteur unique `tenir_pages_par_semaine` (4, toutes sources : tenir en
veillée, défis de la Trame) et une piste ; l'écran dit « encore N pages cette semaine ». Fichiers :
`lib/glTrameDefis.js`, `lib/glChasse.js › countOuverturesGainSemaine, ouvrirPageTx, pisteTx`, `routes/gl/learning.js`,
`tools/gl-sim/veillee.js`.

**2.5 · Trois défis de la Trame (M21).** Sans nouvel écran : deux types de plus dans `src/gl/defis/trameCore.js`
(miroir `lib/shared/glTrameCore.js`), le plateau de cartes existant (`src/gl/components/defis/`).

- Type **`ranger`** (« Le bon rôle », « Le bon pays ») : le moteur de Réparer sans leçon ni mesures. Des cartes, des
  catégories ; une carte bien rangée reçoit son `pourquoi`, une autre « Pas encore. », sans la réponse ; fini quand
  tout est rangé ; le `bilan` s'affiche à la réussite. « Le bon pays » montre l'`indice` de chaque carte et tire ses
  catégories du registre des biomes. Catalogue `trame-ranger.json`, tables `gl_trame_ranger_*`.
- Type **`adaptation`** (« Les fils de l'adaptation ») : le moteur des fils cachés (cartes de texte, flèches du
  milieu vers l'espèce, raccourci classé « il manque une étape »). Catalogue `trame-adaptations.json`.
- Ouverts aux **deux peuples** (`defis_par_peuple` ne les filtre pas), sur les biomes du plateau de la partie ;
  « Le bon pays » : l'unité du plateau. Mêmes récompenses que les autres défis (page de veillée à la première
  réussite, regard, piste de M20), jamais de gemme. Solutions jamais servies au client. Badges : fais avancer
  « Gardien des fils » pour `adaptation` ; pour `ranger`, propose un badge « Bon rangeur » à confirmer par Oliv.
- Tests : cœur à 100 % des branches, import tolérant et strict, test de contenu (chaque espèce existe dans
  `gl_species` avec le bon biome ; cartes génériques `DEC-*` marquées `generique`), e2e d'un défi de chaque type.

## 8. PR 3 · Plusieurs appareils (`feat(gl): plusieurs écrans par équipe — la main et la version d'état`)

Constat (15/11) : le serveur évite les doublons (une action par équipe à la fois) mais rien n'organise le jeu à
plusieurs écrans ; une session d'équipe s'ouvre pour n'importe quelle équipe avec le code de la classe ; « Qui
agit ? » permet d'agir sur la bourse d'un camarade ; banc et e2e ne testent qu'une session par équipe. Fichiers :
`lib/glActeur.js`, `lib/glClassLink.js`, `lib/glTenirView.js`, `lib/glPresences.js`,
`routes/gl/games/tenir-tour.js`, `spell-casts.js`, `chasse.js`, `routes/gl/market.js`,
`src/gl/components/tenir/GLTeamSessionView.jsx`, `GLTenirEquipeView.jsx`, `GLMarcheTablette.jsx`,
`src/gl/services/apiGL.js`, `e2e/gl-tenir-tablettes.spec.js`, `tools/gl-sim/scenarios/tablette-parallele.js`.

1. **Version d'état** : chaque équipe en partie porte un compteur incrémenté à chaque geste ; tout geste envoie la
   version vue. Version périmée → 409 `ETAT_PERIME`, sans perte : « L'équipe a déjà joué ce geste. Voici où vous en
   êtes. », et l'écran se recharge.
2. **La main** : un geste décisif (répondre, fouiller, faire tenir, préparer un sort) prend la main pour 60 s au
   plus ; les autres écrans de l'équipe affichent « Lina répond… » (prénom seul) et refusent proprement
   (`MAIN_AILLEURS`). La main se rend à la fin du geste, à l'expiration, ou si l'appareil se déconnecte : aucun état
   d'attente sans sortie.
3. **Délai de débat** : sur une question de case, « Valider » s'allume après 8 s (réglage `tenir_delai_debat_secondes`).
4. **Sessions d'équipe protégées** : une nouvelle tablette ne rejoint une équipe que si un appareil déjà dans
   l'équipe, ou le prof, l'accepte (demande qui expire seule au bout de 2 min). La première tablette d'une équipe est
   acceptée par le prof depuis la console (« Tout accepter » en début de séance).
5. **Bourses au propriétaire** : une bourse ne bouge que depuis le compte de son propriétaire (ou le prof). « Qui
   agit ? » disparaît pendant le tour ; la tablette d'équipe ne fait que les gestes d'équipe (tour ouvert) et les
   défis de la Trame en mode équipe (tour fermé) ; Marché et Seuil passent par le compte de chacun. Test qui le fige.
6. **Absent spectateur** : un élève absent du tour (présences, Retrait) voit tout et ne peut rien jouer.
7. **Réseau** : les sessions d'équipe comptent dans le plafond de l'API par appareil et non par adresse IP (30
   appareils derrière une seule adresse) ; vérifie la boîte d'envoi hors ligne sur les gestes G&L (un geste rejoué
   après coupure ne s'applique pas deux fois).
8. **Tests** : e2e « trois appareils dans une équipe » (deux tablettes et un compte), banc multi-appareils
   (deux sessions par équipe, gestes concurrents : 0 doublon, 0 invariant), test de charge à 30 clients derrière une
   adresse (aucun 429 sur un tour normal).

Écartés volontairement : miroir en direct, demande de main, « qui a joué ». Ne les code pas.

## 9. PR 4 · Une monnaie (`feat(gl): une seule monnaie, les gemmes`)

Constat : `health_points` apparaît dans une quarantaine de fichiers G&L ; `sorts.json` porte les ressources
`coeurs`, `choix`, `pacte`, `peuple` ; `lib/glMarketPlace.js` échange gemmes et cœurs ; `lib/glSeuil.js ›
cloreTenirPartieTx` rend les parures au comptoir.

1. **Bourse unique** : en mode « Tenir », tout coût et tout gain passe par les gemmes. `sorts.json` : `ressource`
   toujours `gemmes` (Cordée : 4, payées par l'équipe qui lance) ; retire les types `coeurs`, `choix`, `pacte`,
   `peuple` du vocabulaire, des chargeurs et de l'écran. Réserve de la caravane : en gemmes. Plafond 8
   (`max_power_points`), départ à 3 à la création d'une partie du plateau 1.
2. **Cœurs hors de l'écran** : plus aucun cœur affiché ni nommé dans G&L « Tenir » (bourse, journal, Olu, Marché,
   projection, exports). La colonne `health_points` **reste en base** (mode classique, historique) : on ne la lit
   plus en « Tenir ». Migration de conversion, idempotente : pour chaque joueur d'une partie « Tenir » non close,
   gemmes = min(8, gemmes + cœurs), cœurs laissés tels quels mais ignorés ; journalisée, sans nom d'élève.
3. **Marché** : annonces, échange à deux (gemmes contre copies de pages) et dons restent ; les cœurs sortent de
   `gl_market_trades` côté « Tenir » (refus propre d'une ancienne annonce en cœurs, qui expire seule).
4. **Parures et garde-robe (M19)** : `parures.json` de 2 à 8 gemmes, deux ou trois rares (pelages néon et bestiaire) ;
   une parure achetée reste à l'élève toute l'année, se rééquipe sur la mascotte de sa nouvelle équipe (écran
   « Garde-robe » au Seuil) ; elle ne s'échange pas. Retire le retour des parures au camp de `cloreTenirPartieTx`.
5. **Consécration** : visible grisée dès le chapitre 1, avec son prix (8), comme but de l'année.
6. **Tests et banc** : grand livre des bourses sans cœurs ; scénario du banc sur 4 chapitres : élèves au plafond en
   fin d'année ≤ 25 %, bourses moyennes par chapitre ; signale si les bourses sont trop maigres pour lancer un sort
   au chapitre 1 (levier prêt : le prix des sorts, données seules, à ne pas toucher sans Oliv).

## 10. Hors périmètre

Le voile 3 / 4 / 5 / 6, le pâlissement, le carnet complet, le prix des sorts, `zones_par_plateau`, la Lanterne qui
fouille, la Consécration et les petites équipes, le pelage de la taïga, la Fresque du Climat. **Ne modifie aucun
défaut de réglage** autre que ceux nommés ici. N'écris rien en prod. Aucun contenu de lore nouveau : s'il manque un
texte visible d'un élève, mets un texte provisoire neutre et liste-le dans « à relire par Oliv ».

## 11. Vérifications, toutes vertes avant chaque PR

`npm run lint && npm run format:check` · `npm run test:ui` · `npm test` · `npm run test:content` ·
`npm run build && npm run check:runtime` · `npx playwright test --project=chromium e2e/gl-*.spec.js` ·
`npm run gl:import:tenir -- --fichier tous --strict` · `python3 -I scripts/check-tenir-data.py data/gl/tenir` ·
`npm run gl:sim` (scénarios utiles, graine fixée, base `_sim`). Tests G&L séquentiels. `dist` commité.

## 12. Description de PR attendue

1. Ce qui est livré, décision par décision (M…, L…), et ce qui est **écarté parce que le constat était faux**.
2. « Choix faits sans demander » (noms de colonnes, de réglages, de badges ; clés techniques gardées).
3. Ce qui est **retiré** (réglages, états, écrans, lignes de code) en face de ce qui est ajouté.
4. Captures des écrans touchés (équipe, projection, console, sorts par moment, défis).
5. Rapport du banc (tableau du § 6.12), avant / après.
6. « À relire par Oliv » : tout texte visible d'un élève que tu as écrit ou modifié.
7. Vérification manuelle en classe, en dix lignes.

## 13. Après chaque fusion, à faire par Oliv

- PR 1a : resynchroniser les catalogues (carte « Catalogues Tenir à deux »), relire les 13 cases Souffle à l'écran,
  lire le rapport du banc.
- PR 1b : resynchroniser les catalogues, relire les 5 questions de zone à l'écran, lire le rapport « réponses sur le
  site » et les règles v3.
- PR 2 : jouer une partie de test de 4 tours depuis le compte prof pour voir l'escalier ; relire les lignes d'Olu.
- PR 3 : essai à trois appareils sur une équipe de test.
- PR 4 : vérifier une bourse d'élève de test, le comptoir et la garde-robe.
- Puis, dans la console : créer les parties du chapitre 1 et les liens de classe pour `26#601-602` et `26#603`
  (surface `tableau` pour les deux premières séances), ranger les classes de test.
