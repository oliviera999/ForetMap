# Chantier G&L « décisions » : registre des décisions d'Oliv

Ce registre réunit les décisions que le chantier applique, prises du 19 au 24 novembre 2026, avec ce qui les fonde.
Les numéros d'origine sont gardés et toujours cités avec leur source, parce que deux séries se chevauchent : « décision
34 du prompt » et « décision 34 de l'addendum 4 », « décision 37 du prompt » et « décision 37 de l'addendum 4 ».
Chaque ligne reçoit en plus un identifiant unique pour le chantier, `DEC-001`, `DEC-002`…, dans l'ordre chronologique.
« Le prompt » et « l'addendum n » sont les anciens textes, gardés dans `sources/ancien/` : ils ne font plus foi.

**Lire le tableau**

- **Provenance.** `dite par Oliv` : Oliv l'a écrite lui-même. `validée par un « ok »` : Oliv a approuvé d'un mot une
  proposition de Claude. `réponse sur carte, rapportée` : Oliv a répondu à une carte de questions ; sa réponse ne se
  lit pas dans la conversation, Claude la rapporte. `choix de Claude, non relu` : aucun tour d'Oliv ne la porte, il
  peut la retirer. La note après le point-virgule dit ce qui, dans la ligne, n'est pas d'Oliv.
- **Mots d'Oliv.** Tels qu'il les a tapés, fautes comprises, et seulement s'ils se lisent mot pour mot dans les
  anciens textes ou dans la relecture des conversations. Seule exception : la phrase du 19/11, relue dans la
  conversation elle-même. « — » : aucun mot lisible.
- **Lot(s) et étape(s).** Une étape s'écrit `<lot>.<rang>`, le rang étant sa position dans `plan.json` ;
  `EQUIVALENCE.md` donne le passage des anciens noms aux nouveaux.
- **Statut.** `à coder` : un lot du plan la réalise ou l'applique (code, données, textes, docs, règle commune).
  `fait en prod` : déjà écrit en prod par le connecteur, à ne pas refaire. `hors chantier` : aucun lot ne la réalise
  (orchestration, geste d'Oliv, hors dépôt, ou reporté) ; la raison suit entre parenthèses. `écartée` : retirée ;
  aucune ligne du tableau n'a ce statut, les propositions écartées sont dans la dernière section.
- **Heures.** Heure de Casablanca, telle que les textes la citent. « avant 13 h 38 » : heure de la dernière activité
  de la conversation ; le tour lui-même n'est pas horodaté.

## Le registre

| Identifiant | Numéro d'origine et source | Date et heure | Ce qu'elle dit | Mots d'Oliv | Provenance | Lot(s) et étape(s) du plan | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DEC-001` | 1 du prompt | 19/11 | Un élève en Retrait reçoit la gemme d'une page tenue par son équipe. Le code le fait déjà : le texte des règles le dit, et un test le garde. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `fin-1.1`, `fin-1.3` (étape 1) | `à coder` |
| `DEC-002` | 2 du prompt | 19/11 | Au palier, la jauge de Lumière repart à 0 : plus de reste gardé. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `moteur-1.4` (étape 2) | `à coder` |
| `DEC-003` | 3 du prompt | 19/11 | Une piste de zone ne nomme jamais un mot de la bonne réponse. `pisteDeReponse` saute la ressource dont le nom figure dans la réponse, et un test de contenu le garde. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `contenu-2.1` (étape 3) | `à coder` |
| `DEC-004` | 4 du prompt | 19/11 | La ligne d'Olu `olu-pf-main` est branchée : elle se dit à la première main prise, quand une équipe a plusieurs écrans. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `moteur-5.4` (étape 4) | `à coder` |
| `DEC-005` | 5 du prompt | 19/11 | Une seule source pour les badges : `lib/glRewardsCatalog.js` ; `data/gl/tenir/badges.json` devient hérité. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` ; source unique validée ; le choix de `glRewardsCatalog.js` est de Claude | `contenu-2.2` (étape 5) | `à coder` |
| `DEC-006` | 6 du prompt | 19/11 | Les cartes des « fils » sont mélangées côté serveur, dans un ordre qui ne donne pas la solution. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `moteur-5.1` (étape 6) | `à coder` |
| `DEC-007` | 7 du prompt | 19/11 | La Trame apporte un palier de Lumière par chapitre au plus. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `moteur-5.3` (étape 7) ; migration `mig-lumiere-trame` | `à coder` |
| `DEC-008` | 8 du prompt | 19/11 | Plafond de la bourse : on ne touche à rien avant deux séances réelles. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | aucun (la case de l'audit est cochée à l'étape 9, `fin-1.2`) | `hors chantier` (reporté après deux séances) |
| `DEC-009` | 9 du prompt | 19/11 | Les choix de la PR 4 de l'ensemble unifié sont validés tels que fusionnés. Doc seulement : cases de l'audit du 18/11 et § 0 des règles. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `fin-1.2` (étape 9) | `à coder` |
| `DEC-010` | 10 du prompt | 19/11 | Les noms de badges passent en formes doubles (« Voyante / Voyant des fils »). | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` ; l'extension aux 13 titres masculins est de Claude, signalée | `contenu-2.2` (étape 5) | `à coder` |
| `DEC-011` | 11 du prompt | 19/11 | « Regarde la piste de ton professeur » est adouci dans les retours « pas encore » du Mentorat et de la Lettre : la piste reste facultative. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `contenu-2.3` (étape 8) | `à coder` |
| `DEC-012` | 12 du prompt | 19/11 | Le pseudo de l'auteur d'une Lettre n'est servi qu'à l'auteur, à son équipe et au prof. Il est caché en projection et aux autres équipes. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `contenu-2.6` (étape 10) | `à coder` |
| `DEC-013` | 13 du prompt | 19/11 | Message de version d'état périmée : « L'équipe vient de jouer. Voici où vous en êtes. » | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `ecrans-1.6` (étape 11) | `à coder` |
| `DEC-014` | 14 du prompt | 19/11 | Les questions remplacées par les zones restent hors tirage (`usage_tenir = 0`), même sur une installation neuve. | « Ok pour les 14 décisions, ensuite on verra. » | `validée par un « ok »` | `ecrans-1.3` (étape 12) | `à coder` |
| `DEC-015` | sans numéro (lot M du prompt, annexe A) | 23/11, avant 13 h 38 | Une mascotte qui se déplace saute de case en case, sur tous les écrans du jeu. Correctif d'animation : ni règle, ni route, ni schéma, ni texte. | « quand une mascotte se déplace, je veux qu'elle saute de case en case comme c'était le cas auparavant. » | `dite par Oliv` ; durées et comportements : choix de Claude | `ecrans-3.1` à `ecrans-3.5` (étapes M1 à M5) | `à coder` |
| `DEC-016` | 15 du prompt | 23/11, avant 13 h 48 | L'erreur du jour d'Olu se voit en projection et sur la tablette d'équipe. | « Oui vasy » | `validée par un « ok »` | `ecrans-2.1` (étape 13) | `à coder` |
| `DEC-017` | 16 du prompt | 23/11, avant 15 h 52 | « Tenir à deux » est le jeu de G&L : plus aucune porte vers le jeu classique depuis l'interface ou l'API de partie. Le code du classique reste, comme voie de repli. | « Franchement ne devrait-on pas considerer tenir à 2 comme base ? » ; « Ok » | `validée par un « ok »` ; Oliv dit « base » ; « seul jeu » est le mot de Claude | `ecrans-1.1` (étape 14) | `à coder` |
| `DEC-018` | 17 du prompt (repère D1 de l'audit de la partie 16) | 23/11, avant 16 h 01 | Question de case : une bonne réponse avance d'une case, sans relance du dé. Ajustée le 24/11 par `DEC-071`. | « D1 ok pour la proposition » | `validée par un « ok »` | `moteur-4.1` (étape 19) | `à coder` |
| `DEC-019` | 18 du prompt | 23/11, avant 16 h 01 | Correctifs de la partie 16 : horodatages des tours, erreur du jour d'Olu sans répétition, fin de l'ordre au tableau. Même audit, sans numéro : journal regroupé et tour resté ouvert (étape 25). | « Passe les corrections aussi » | `validée par un « ok »` ; Oliv demande au même tour de les verser au prompt | `moteur-1.1` à `moteur-1.3` (étapes 15 à 17-serveur) ; `ecrans-4.3` (étape 17-bouton) ; `moteur-3.4` (étape 25) | `à coder` |
| `DEC-020` | 19 du prompt (repère D3) | 23/11, avant 16 h 01 | L'escalier du chapitre 1 a cinq marches, une marche par jour au plus. Complétée le 24/11 par `DEC-092`. | « D3 également ok » | `validée par un « ok »` ; le seuil de 12 h est de Claude | `moteur-3.1` (étape 20) | `à coder` |
| `DEC-021` | 20 du prompt (repère D4) | 23/11, avant 16 h 01 | Page témoin : la zone endormie la plus avancée derrière la dernière équipe. | « D4 ok » | `validée par un « ok »` | `moteur-3.3` (étape 21) | `à coder` |
| `DEC-022` | 21 du prompt (repère D7) | 23/11, avant 16 h 01 | « Corbeau », nom commun, est permis dans les pages de Sélène ; l'interface et les catalogues ne l'écrivent pas. `ep-VI-02` sort du Passeur du plateau 1. | « D7corbeau ok » | `validée par un « ok »` ; la sortie d'`ep-VI-02`, déjà en prod, est une lecture de Claude | `contenu-2.4` (étape 23) | `à coder` |
| `DEC-023` | 22 du prompt (repère D8) | 23/11, avant 16 h 01 | Le suricate de la zone `cz-p1-07` est gardé : rien à faire. | « D8 ok » | `validée par un « ok »` | aucun | `hors chantier` (rien à changer) |
| `DEC-024` | D2 (audit de la partie 16, sans numéro au prompt) | 23/11, avant 16 h 01 | Résumé d'une case favorable neutre : « Belle rencontre : la caravane repart. », à la place de « Une case favorable : on repart, sans gain. » | — | `choix de Claude, non relu` ; proposé à Oliv, sans réponse | `contenu-2.5` (étape 22-textes) | `à coder` |
| `DEC-025` | D5 (audit de la partie 16, sans numéro au prompt) | 23/11, avant 16 h 01 | Défis de case rares : rien ne change avant deux séances (levier noté : `defi_declenchement = passage`). | — | `choix de Claude, non relu` ; proposé à Oliv, sans réponse | aucun | `hors chantier` (reporté après deux séances) |
| `DEC-026` | D6 (audit de la partie 16, sans numéro au prompt) | 23/11, avant 16 h 01 | Quand le vent pose une équipe sur une case dont l'effet ne joue pas, l'écran dit : « Porté par le vent : la case ne joue pas. » | — | `choix de Claude, non relu` ; proposé à Oliv, sans réponse | `ecrans-2.2` (étape 22-vent) | `à coder` |
| `DEC-027` | 25 du prompt (repère S2) | 23/11, 18 h 30 | Deux surfaces proposées, « Tablettes » et « Tableau ». « Hybride » sort des sélecteurs ; le moteur garde la valeur pour les anciennes parties, sans migration. | « s2 ok » | `validée par un « ok »` | `ecrans-1.2` (étape 27) ; `fin-1.3` (étape C-doc-1) | `à coder` |
| `DEC-028` | S4 (simplification du 23/11, sans numéro au prompt) | 23/11, 18 h 30 | Le Marché est fermé pendant le tour : réglage `gameplay.tenir_marche_pendant_tour` = `false`, posé en prod. Aucun défaut de réglage ne change dans le code. | « S4 oui d'accord » | `validée par un « ok »` | aucun code ; docs : `fin-1.4`, `fin-2.2`, `fin-2.3` | `fait en prod` (réglage non relisible par requête) |
| `DEC-029` | S5 (simplification du 23/11, sans numéro au prompt) | 23/11, 18 h 30 | L'oiseau chapardeur est coupé : `gameplay.tenir_chapardeur` = `false`, posé en prod pour toutes les parties. La proposition visait le chapitre 1 ; Oliv le rallume avant le plateau 2. | « s5 ok » | `validée par un « ok »` | aucun code ; docs : `fin-1.4`, `fin-2.2`, `fin-2.3` | `fait en prod` (réglage non relisible par requête) |
| `DEC-030` | 26 du prompt (réécriture de la documentation) | 23/11, 18 h 30 | Toute la documentation G&L est réécrite au présent, pour « Tenir à deux » seul : règles v4 et docs de référence. | « ajouter au prompt une réécriture de toute la doc » | `dite par Oliv` | `fin-1.4`, `fin-1.5` (étapes C-doc-2, C-doc-3) ; `fin-2.1`, `fin-2.3`, `fin-2.4` (étapes 28, C-doc-5, C-doc-6) | `à coder` |
| `DEC-031` | H1 du prompt | 23/11, 18 h 37 | Page Histoire : « Marquer comme lu » est soumis à une question. Chaque élève valide lui-même, depuis son compte, même si l'histoire a été lue en classe. | « L'élève valide l'histoire par lui-même même si lu en cours. » | `dite par Oliv` | `contenu-3.3` (étape H1) | `à coder` |
| `DEC-032` | H2 du prompt | 23/11, 18 h 37 | Le délai d'une heure avant de réessayer est gardé ; l'élève en est prévenu avant de répondre et après une erreur. Aucun réglage ne change. | « Si on garde l'heure avant réessaie et que ce soir cohérent pour l'élève, il doit être prévenu. » | `dite par Oliv` | `contenu-3.4` (étape H2) | `à coder` |
| `DEC-033` | H3 du prompt | 23/11, 18 h 37 | Des questions nouvelles, tirées du texte de l'Histoire : 12 questions, 3 par plateau, catégorie `histoire`, liées au type `chapter_story`. | « De nouvelles questions doivent être créés en lien avec le texte. » | `dite par Oliv` ; nombre et textes des questions : Claude | `contenu-3.1` (étape H3) ; migration `mig-histoire` | `à coder` |
| `DEC-034` | H4 du prompt | 23/11, 18 h 37 | Les illustrations de l'Histoire ont des légendes et sont mieux placées sur la page. | « les illustrations doivent avoir des légendes et être mieux agencés sur la page » | `dite par Oliv` | `contenu-3.1`, `contenu-3.2` (étapes H3, H4) | `à coder` |
| `DEC-035` | sans numéro (orchestration, 23/11) | 23/11, vers 18 h 40 | Le prompt des décisions devient un prompt orchestrateur : plusieurs sessions, des lots découpés selon la complexité et la charge. Modèle Opus, effort élevé. | « Le prompt en attente va devoir devenir un prompt orchestrateur, en lançant différentes sessions, avec différents lots » ; « Ce sera avec opus élevé » | `dite par Oliv` ; rien d'Oliv sur le nombre de sessions, les fusions ni la CI | orchestration | `hors chantier` (cadre : `ORCHESTRATION.md`) |
| `DEC-036` | 23 du prompt (repère S1) | 23/11, entre 18 h 30 et 18 h 50 | Un seul écran d'équipe partout : `GLTenirEquipeView` disparaît. En surface « Tableau », la console monte l'écran de l'équipe active, bourses masquées, et les tablettes disent « Le tour se joue au tableau. » | « Ok et mets à jour le grand prompt » | `validée par un « ok »` | `ecrans-4.1`, `ecrans-4.2`, `ecrans-4.3`, `ecrans-4.4`, `ecrans-4.7` (étape 18) | `à coder` |
| `DEC-037` | 24 du prompt (repère S3) | 23/11, entre 18 h 30 et 18 h 50 | Le sort Relance est retiré : `SL005` inactif et hors de l'escalier, `olu-41` inactive, grimoire à 18 sorts. | « Ok et mets à jour le grand prompt » | `validée par un « ok »` | `moteur-3.2` (étape 26) ; migration `mig-relance` seulement si l'import ne suffit pas | `à coder` |
| `DEC-038` | 26 du prompt (docs du prof au dépôt) | 23/11, vers 18 h 50 | Les deux docs du prof, « L'essentiel du maître du jeu » et « Déroulé d'une partie », entrent au dépôt, à jour du chantier. Oliv a commandé ces docs ; leur entrée au dépôt n'est connue que par une réponse sur carte. | « créer un ou des docs type l'essentiel à savoir pour le maitre du jeu et déroulé d'une partie classique » (commande des docs, pas de leur entrée au dépôt) | `réponse sur carte, rapportée` ; le titre sans « classique » est de Claude | `fin-2.2` (étape C-doc-4) | `à coder` |
| `DEC-039` | H5 du prompt | 23/11, 20 h | Les textes d'Histoire tiennent les garde-fous du récit, et l'épilogue n'est plus servi aux élèves. Le délai d'une heure reste, sans erreur tolérée (`allowed_wrong_attempts` = 0). | « N'efreinds pas les garde fou du recit. Je reste sur ma décision d'1h. » | `dite par Oliv` ; réécritures et épilogue réservé au prof : façon de faire de Claude, non relue | `contenu-3.3` à `contenu-3.1` (étapes H1 à H3) | `à coder` |
| `DEC-040` | sans numéro (revue du prompt du 23/11 à 20 h 30) | 23/11, 20 h 30 | Défauts trouvés en relisant le prompt et corrigés en route : le bilan Team Spirit relit ce qui est enregistré (étape 29), la migration crée la catégorie `histoire`, l'épilogue ne fuit plus par le journal. | « Si des bigs ou autres ameliorations sont trouvées en chemin, vas-y. » (mandat général) | `choix de Claude, non relu` ; chaque correction est de Claude, sous ce mandat | `ecrans-1.4` (étape 29) ; `contenu-3.3`, `contenu-3.1` (étapes H1, H3) | `à coder` |
| `DEC-041` | sans numéro (V1, V2, V3, V5, V6 de l'audit de validation) | 24/11, 9 h 39 | Données de validation passées en prod : taxonomie non bloquante (548 liens), 80 questions vives liées à leur biome, 36 pages de zone validées par leur question de lecture (`LQCM0370` à `LQCM0405`), 11 questions créées (`QCM0661` à `QCM0671`). | « Ok » | `validée par un « ok »` | aucun ; `contenu-3` en tient compte (plus haut code : `LQCM0405`) | `fait en prod` |
| `DEC-042` | 27 du prompt | 24/11, vers 9 h 45 | Une question ne se lit jamais avec sa réponse visible sur le plateau, derrière ou à côté. Correctif d'affichage : fond de la fenêtre presque opaque et flouté, plateau flouté tant qu'une question est ouverte. | « la réponse peut être visible par transparence… l'éléphant se voit bien » ; « Ajoute ça au prompt orchestrateur » | `dite par Oliv` ; valeurs du fond : Claude | `ecrans-2.3` (étape 30) ; `ecrans-4` pour la projection | `à coder` |
| `DEC-043` | B1 du prompt (décision des biomes) | 24/11, vers 9 h 45 | Sur un plateau à deux biomes, chaque onglet affiche le texte (biotope et biocénose) de son biome. Correctif d'affichage, aucune donnée changée. | « il y a 2 onglets, un par biome mais tout le texte des 2 est sur le premier » ; « Ajoute ça au prompt orchestrateur » | `dite par Oliv` ; règles de découpage des titres : Claude | `ecrans-1.5` (étape B1) | `à coder` |
| `DEC-044` | 33 de l'addendum 3 | 24/11, vers 10 h | Au plateau 2, Olu parle de l'oiseau sans le nommer quand le chapardeur passe : trois lignes au moment `oiseau`. `olu-06` quitte le moment `ouverture`. | « Olu devra aussi peut-être parler du corbeau au plateau 2. » | `dite par Oliv` ; idée dite avec « peut-être » ; les trois lignes sont de Claude, non relues | `contenu-1.4` (étape 24 quater) | `à coder` |
| `DEC-045` | 31 de l'addendum 3 | 24/11, 10 h 15 | Le copiste sort de l'intro et de la page d'ouverture : `GL2P-04` est réécrite à la voix de Sélène, et l'intro proposée le 24/11 devient le défaut du dépôt. Oliv a commandé la revue de l'intro ; il n'a pas validé ces textes. | « Corbeau imaginaire. Rzvois toute l'intro » (commande de la revue) | `choix de Claude, non relu` | `contenu-4.1`, `contenu-4.2` (étape C1) ; `contenu-6.5` (étape C6) | `à coder` |
| `DEC-046` | sans numéro (origine de l'addendum 2) | 24/11, vers 11 h | Les corrections de l'audit des écrans entrent dans le chantier : ce sont les lignes I1 à I10 de l'addendum 2. Constat d'Oliv : « plateau » et « classe » cassent l'immersion. | « Ok dès maintenant mets la plupart des choses qui doivent être changée dans le prompt. » ; « Les termes, plateau ou classe, casse l'immersion. » | `dite par Oliv` ; Oliv n'a coché aucune ligne une à une | `ecrans-2`, `ecrans-4`, `ecrans-5`, `ecrans-6`, `contenu-1`, `contenu-5`, `contenu-6` ; détail : `DEC-050` à `DEC-059` | `à coder` |
| `DEC-047` | 29 de l'addendum 3 | 24/11, 11 h 07 et 11 h 16 | Le copiste existe à part entière : chaque page de Sélène tenue par la caravane fait reparaître une de ses notes au crayon, lue dans « Les marges du copiste », avec deux compteurs. Le prof ouvre l'enveloppe d'un monde au camp et le double fond en juin ; l'app sert tout. | « Là ca le plait. » ; « L'app devra servir absolument tout le contenu qui lui est lié » ; « sur la page du seuil un compteur de feuillet trouvé pour selene et un autre pour le copiste » | `validée par un « ok »` ; les deux gestes du prof et les routes sont de Claude | `contenu-4.1`, `contenu-4.2`, `contenu-4.3` (étapes C1, C2) ; `contenu-6.1` à `contenu-6.4` (étapes C3 à C5) | `à coder` |
| `DEC-048` | 30 de l'addendum 3 | 24/11, 11 h 07 | Les 40 anciennes pages du copiste sont archivées (inactives, jamais effacées) et remplacées par 41 notes (7, 8, 8, 10, et 8 en juin) et 4 enveloppes. Sélène n'est jamais dite morte ; « elle m'a sauvé la vie » reste la dernière ligne du plateau 4. | « Garde en archives ses anciens textes, on verra en fin d'année » ; « Et effectivement on enlève morte, ce n'est quune hypothèse comme d'autres. » ; « Je suis ok » | `validée par un « ok »` ; répartition validée ; textes des notes et des enveloppes non relus | `contenu-4.1`, `contenu-4.2` (étape C1) ; migration `mig-copiste-carnet` | `à coder` |
| `DEC-049` | sans numéro (écritures en prod du matin) | 24/11, 11 h 10 à 11 h 20 | Posé en prod par le connecteur : pages `rules` et `world`, grimoires, zone « Savane africaine », cases 41 et 76, chapitres de test à 980 et 990, « moor » inactif, quatre thèmes. Réglages : `lore_spoiler_max_level` = `cle`, `tutorials_enabled` et `zone_music_enabled` à faux, couleurs de marque. | « Fais ce que tu peux avec le connecteur. » | `dite par Oliv` ; Oliv n'a pas relu les textes posés | `contenu-5` aligne une base neuve (`mig-pages-servies`) | `fait en prod` |
| `DEC-050` | I1 de l'addendum 2 | 24/11, vers 11 h 20 | En « Tenir », le plateau n'ouvre plus ses propres fenêtres de question et d'effet : tout passe par la carte du moment. | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `ecrans-4.5` (étape 31) | `à coder` |
| `DEC-051` | I2 de l'addendum 2 | 24/11, vers 11 h 20 | Sur la tablette d'équipe, la piste d'un « pas encore » s'ouvre en lecture seule (fiche ou mot), avec « Revenir au jeu ». | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `ecrans-4.6` (étape 32) | `à coder` |
| `DEC-052` | I3 de l'addendum 2 | 24/11, vers 11 h 20 | Pendant une question, rien n'est consultable : les puces du glossaire sous les choix sont masquées jusqu'à la réponse. | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `ecrans-2.4` (étape 33) | `à coder` |
| `DEC-053` | I4 de l'addendum 2 | 24/11, vers 11 h 20 | Le lexique du voyage ne montre à un élève que les termes de son monde ou des mondes déjà traversés (`chapitre_scope`) : aucun nom de visage avant son plateau. | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `contenu-5.1` (étape V2) | `à coder` |
| `DEC-054` | I5 de l'addendum 2 | 24/11, vers 11 h 20 | La visite d'Olu ne démarre jamais pendant un tour, se ferme au changement d'onglet, et se tient une fois par onglet principal. Ses textes décrivent « Tenir ». | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `ecrans-6.2` (étape V3) | `à coder` |
| `DEC-055` | I6 de l'addendum 2 | 24/11, 11 h 53 et vers 12 h 15 | Mots du voyage, à l'écran d'un élève après la connexion : le plateau devient « le monde », « le chemin » ou « le paysage » ; la classe devient « la caravane » (toute la classe, jamais une équipe). Jamais « joueur », « partie », « MJ », « feuillet », « statistiques ». | « Caravane est ok. Corrige. » ; « Non pas que la caravane. » | `dite par Oliv` | `contenu-1.3` (étape 24 ter) ; `ecrans-6.1` (étape V1) ; `contenu-6.4` (étape C5) | `à coder` |
| `DEC-056` | I7 de l'addendum 2 | 24/11, vers 11 h 20 | Les pages servies aux élèves disent le jeu d'aujourd'hui : « Les règles du jeu », trois phrases de l'« Introduction », cinq grimoires de chapitre, zone « Zone », cases de camp 41 et 76. Tout est déjà en prod (`DEC-049`). | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `contenu-5.3` (étape V4) | `à coder` (données : fait en prod ; reste `mig-pages-servies`, base neuve) |
| `DEC-057` | I8 de l'addendum 2 | 24/11, vers 11 h 20 | Vitrine des invités : premier monde, aucun message d'administration, image d'accueil à la connexion ; « moor » sort du glossaire. Les données sont en prod (`DEC-049`), l'écran reste à coder. | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `contenu-5.3`, `contenu-5.4` (étapes V4, V5) | `à coder` (données : fait en prod) |
| `DEC-058` | I9 de l'addendum 2 | 24/11, vers 11 h 20 | Le plateau n'est plus posé sur un rectangle bleu ciel : fond sombre de la couleur du monde, liseré doré. | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `ecrans-6.3` (étape V6) | `à coder` |
| `DEC-059` | I10 de l'addendum 2 | 24/11, vers 11 h 20 | La musique par biome joue (clés réparées), sur la projection seule. Plus de bouton de musique orphelin ; la musique d'intro ne prend plus une image pour un son. | — | `choix de Claude, non relu` ; case jamais cochée ; dite prise par `DEC-068` | `ecrans-5.1` à `ecrans-5.3` (étapes S1 à S3) | `à coder` |
| `DEC-060` | 32 de l'addendum 3 | 24/11, avant 11 h 40 | Trois pages du carnet sont corrigées (`sc-landes-course`, `ep-echo-02`, `ep-I-07` : cri de l'oiseau écrit, Silence en agent, « Il vient du sud »), avec l'accent de « Sélène » dans `message-boite`. Fautes trouvées par Claude ; `DEC-081` couvre ensuite tout le carnet. | — | `choix de Claude, non relu` | `contenu-4.1`, `contenu-4.2` (étape C1) | `à coder` |
| `DEC-061` | 28 de l'addendum 3 | 24/11, entre 11 h 20 et 11 h 31 | Le gel est levé : le chantier corrige, retire et ajoute ce que les décisions nommées demandent, rien d'autre. | « Pas de gel. On refait tout, regarde le prompt, c'est une refonte en profondeur. » | `dite par Oliv` | tous les lots (règle commune, `REGLES_COMMUNES.md` § 1) | `à coder` |
| `DEC-062` | QV1 de l'addendum 1 | 24/11, 11 h 31 | « Corbeau », nom commun, reste dans cinq questions de lore actives (`LQCM0038`, `LQCM0097`, `LQCM0157`, `LQCM0246`, `LQCM0247`) ; le nom propre et le cri restent interdits partout. Le code n'ajoute qu'un commentaire au filtre et une phrase aux règles. | « 1. On garde 2. Reecris les 3. Ok. » (point 1) | `dite par Oliv` | `contenu-2.4` (étape 23) | `à coder` (les cinq questions sont déjà en prod) |
| `DEC-063` | QV2 de l'addendum 1 | 24/11, 11 h 31 | Jamais de page vierge en récompense d'un défi de la Trame (position V8 de l'audit des questions de validation). | « 1. On garde 2. Reecris les 3. Ok. » (point 3) | `validée par un « ok »` | `moteur-5.2` (étape QV2) | `à coder` |
| `DEC-064` | QV3 de l'addendum 1 | 24/11, 11 h 31 | Les 23 questions de lore retirées le matin sont à réécrire : 11 sont réécrites et réactivées en prod. Claude en a laissé 12 éteintes (tiers secret, non-dit) : écart signalé, sans réponse d'Oliv. | « 1. On garde 2. Reecris les 3. Ok. » (point 2) | `dite par Oliv` | aucun | `fait en prod` |
| `DEC-065` | QV4 de l'addendum 1 | 24/11, sans heure | Ce n'est pas une décision : le numéro ne désigne qu'une étape. Un émoji de verdict en tête d'un retour de QCM est retiré à l'affichage, comme l'amorce « Non ». | — | `choix de Claude, non relu` ; application du garde-fou « Pas encore », sans décision nouvelle | `contenu-1.6` (étape QV4) | `à coder` |
| `DEC-066` | 34 de l'addendum 4 | 24/11, 11 h 41 | Direction artistique « un jeu de plateau qui s'anime » sur tout écran d'élève : tablette d'équipe, compte, espace personnel, projection, vitrine. La console du prof et les réglages ne changent pas. | « Suis le chemin de la direction artistique et creuse à fond de ce côté » | `dite par Oliv` ; le contenu des lots T, P, F, A est de Claude | `ecrans-7` à `ecrans-11` (étapes T, P, F, A, et l'étape S4 des sons du tour) | `à coder` |
| `DEC-067` | 39 de l'addendum 4 (plus de gel) | 24/11, 11 h 41 | Plus de gel : confirme `DEC-061`. | « On se fiche du gel. » | `dite par Oliv` | tous les lots (règle commune, `REGLES_COMMUNES.md` § 1) | `à coder` |
| `DEC-068` | 39 de l'addendum 4 (I1 à I10 « prises telles qu'écrites ») | 24/11, 11 h 41 | Les lignes I1 à I10 de l'addendum 2 sont déclarées prises telles qu'écrites, sur la foi de « plus de gel ». Oliv ne les a pas cochées ; seule I6 a ses mots. | — | `choix de Claude, non relu` | `ecrans-2`, `ecrans-4`, `ecrans-5`, `ecrans-6`, `contenu-1`, `contenu-5`, `contenu-6` ; détail : `DEC-050` à `DEC-059` | `à coder` |
| `DEC-069` | 39 de l'addendum 4 (cinq onglets, une surcouche à la fois) | 24/11, 11 h 41 | La navigation en cinq onglets et la règle « une surcouche à la fois » entrent dans le chantier. L'audit des écrans les notait « après deux séances ». | — | `choix de Claude, non relu` ; « choix de Claude, signalé », dit l'addendum | `ecrans-8.1`, `ecrans-8.3` (étapes T6, T8) | `à coder` |
| `DEC-070` | 37 de l'addendum 4 (l'oiseau se pose) | 24/11, 11 h 41 | L'oiseau témoin se pose à chaque fouille et y laisse une trace. Il n'a ni nom, ni cri, ni bulle. | « qui voent se poser sur les zones de fouilles tout ek y laissant une trace » | `dite par Oliv` | `ecrans-10.3` (étape F3) | `à coder` |
| `DEC-071` | 37 du prompt | 24/11, 11 h 47 | Question de case : une bonne réponse avance d'une case, de trois sous le voile, et donne une sonde (toucher un dessin pour lire « chaud », « tiède » ou « froid » ; ni question ni page ; perdue à la clôture du tour). Les fouilles ne changent pas : 2 par tour, 1 sous le voile. | « Je suis d'accord avec +1 et +3 sous le voile et la sonde. » ; « Je suis ton avis, mets à jour l'orchestrateur » | `validée par un « ok »` ; nombre de sondes précisé par `DEC-093` | `moteur-4.1`, `moteur-4.2`, `moteur-4.3` (étapes 19, 35) ; migrations `mig-cases-question` et `mig-sonde` | `à coder` |
| `DEC-072` | 35 de l'addendum 4 | 24/11, 11 h 50 | Les deux gestes du tour s'échangent : l'Éclaireuse ou l'Éclaireur fouille, l'Opératrice ou l'Opérateur répond à la question de case. À quatre, l'Assistante ou l'Assistant fait aussi l'Opératrice ou l'Opérateur. | — | `réponse sur carte, rapportée` ; réponse non visible ; confirmée de biais à 12 h 16 par « 1. Ok 2. Ok. » | `moteur-2.1`, `moteur-2.2`, `moteur-2.3` (étape 24 quinquies-R) ; migration `mig-regles-roles` | `à coder` |
| `DEC-073` | 36 de l'addendum 4 | 24/11, 11 h 50, confirmée à 12 h 16 | On ne refait pas les cartes : illustrations, cadres et cœurs restent. Seule la ligne « Au tour de jeu » de quatre cartouches est recomposée avant l'impression, hors dépôt. | « 1. Ok 2. Ok. » (point 1) | `validée par un « ok »` ; d'abord réponse sur carte, à 11 h 50 | aucun | `hors chantier` (impression, hors dépôt) |
| `DEC-074` | 37 de l'addendum 4 (forme de la trace) | 24/11, 11 h 50 | La trace est une plume : sa posture dit le verdict (couchée, penchée, droite), son ruban dit l'équipe, elle reste tout le chapitre. Quand une page tient, l'oiseau reprend les plumes autour d'elle et un fil doré prend leur place. | — | `choix de Claude, non relu` ; « laissé à Claude », d'après la réponse sur carte | `ecrans-10.3` (étape F3) ; `ecrans-9.5` (étape P5) | `à coder` |
| `DEC-075` | 38 de l'addendum 4 | 24/11, 11 h 50 | Les images « Table de jeu » sont générées le 24/11. Le code ne dépend d'aucune image : chaque visuel a un repli CSS ou SVG, et prend l'image de la médiathèque dès qu'elle existe sous sa clé. | — | `réponse sur carte, rapportée` ; la règle du repli est de Claude | `ecrans-7` à `ecrans-11` | `à coder` |
| `DEC-076` | 34 du prompt | 24/11, vers 11 h 55 | Une question ne se répond ni par son indice ni par le dessin du plateau : 28 questions de zone des plateaux 2 à 4 réécrites et dix questions de case sorties du tirage, en prod. Reste à aligner `qcm-feedbacks-zones.json`, à poser le test « la réponse n'est pas dans l'indice » et à garder les dix codes hors tirage à l'import. | « Vas-y et ensuite mets à jour le prompt orchestrateur » ; « Vas-y » | `validée par un « ok »` | `contenu-1.5` (étape 24 quinquies-Z) ; `ecrans-1.3` (étape 12) ; `contenu-2.1` (étape 3) | `à coder` (données : fait en prod) |
| `DEC-077` | 40 de l'addendum 4 | 24/11, vers 12 h | Un interrupteur unique, `modules.table_de_jeu_enabled` (défaut vrai), coupe l'habillage, les animations et les plumes et rend l'affichage d'avant, sans toucher aux règles ni aux données. Il ne coupe pas le nom « Mon sac ». | — | `choix de Claude, non relu` | `ecrans-7.1` (étape T1) | `à coder` |
| `DEC-078` | 41 de l'addendum 4 | 24/11, vers 12 h | Le pack publié « Oiseau noir » anime le témoin quand il se pose : réglage `gameplay.oiseau_temoin_pack_id`, vide par défaut. Ce pack n'est jamais proposé à une équipe (`DEC-096`). | — | `choix de Claude, non relu` | `ecrans-10.3` (étape F3) | `à coder` |
| `DEC-079` | QV5 de l'addendum 1 | 24/11, 12 h 01 et 12 h 14 | Le lexique lore est réécrit dans les garde-fous : 33 fiches réécrites en prod, « le corbeau de Sélène » garde son nom. Reste à coder : la fiche ne sert plus les notes d'auteur (`role_recit`, `correspondance_reelle`, `source`) à un élève. | « Reecris » ; « Ok et pas grave pour le corbeau. Et tu mettras à jour l'orchestrateur » | `validée par un « ok »` ; l'étape de code n'a pas de mot d'Oliv | `contenu-5.2` (étape QV5) | `à coder` (données : fait en prod) |
| `DEC-080` | sans numéro (priorité, § 00.8 du prompt) | 24/11, 12 h 12 | En cas de conflit entre les anciens textes, le prompt prévaut sur ses addenda, puis l'addendum le plus récent (4, 3, 2, 1). Sans objet pour les fiches du kit : elle ne sert qu'à lire `sources/ancien/`. | « Orchestrateur a la priorité. » | `dite par Oliv` | aucun | `hors chantier` (les anciens textes ne font plus foi) |
| `DEC-081` | 42 de l'addendum 3 | 24/11, entre 12 h 11 et 12 h 15 | Les coquilles et les fautes de garde-fou du carnet de Sélène sont corrigées, toutes les pages actives relues. Étendu par Claude, sans réponse d'Oliv : `ep-I-13` et `rep-II-05` inactives, questions de lore alignées ou éteintes, liasse de fin remise avec le double fond. | « Corrige les coquille des feuillets de selene. » ; « Rien à faire pour le mot de la boite. » | `dite par Oliv` | `contenu-4.2` (étape C1 ter) ; `contenu-6.3` (étape C4 bis) ; migration `mig-copiste-carnet` | `à coder` |
| `DEC-082` | sans numéro (zones du plateau 1) | 24/11, 12 h 16 | Oliv trace lui-même les 8 zones du plateau 1 à l'éditeur de zones, après la synchronisation des catalogues, puis les fait reporter dans `chasse-zones.json`. | « 1. Ok 2. Ok. » (point 2) | `validée par un « ok »` | aucun | `hors chantier` (geste d'Oliv, après le chantier) |
| `DEC-083` | sans numéro (rôle de la sonde, § 00.8 du prompt) | 24/11, 12 h 35 | La sonde est tenue par l'Opératrice ou l'Opérateur, l'élève qui vient de répondre à la question de case. Claude l'a déduit de « Orchestrateur a la priorité » ; Oliv n'a pas tranché. | — | `choix de Claude, non relu` | `moteur-4.2`, `moteur-4.3` (étape 35) | `à coder` |
| `DEC-084` | sans numéro (après-midi du 24/11 : kit) | 24/11, 13 h 35 | La session qui prépare le kit accède au dépôt et le fusionne elle-même sur `main`. | « il faut que fable accède à github pour merger tous les éléments nécessaire au chantier » | `dite par Oliv` | aucun | `hors chantier` (fait avant le lancement des lots) |
| `DEC-085` | sans numéro (après-midi du 24/11 : fusions et banc) | 24/11, 13 h 37 | Les fusions n'attendent pas la CI : seul le banc local fait foi. Remplace « attendre la CI verte ». | « les fusions ne doivent pas attendre, les outils de vérifications github ne fonctionneront pas. » ; « Il n'y a que le banc qui fera foi » | `dite par Oliv` | tous les lots (règle commune, `REGLES_COMMUNES.md` § 5) | `à coder` |
| `DEC-086` | sans numéro (après-midi du 24/11 : « +1 » du journal) | 24/11, 13 h 53 | Le « +1 » de « Mon journal » : à l'enregistrement d'un article, si le compte du journal monte, la réponse porte `voyageurGain: { loin: 1 }` ; la pastille et le son suivent. Règle existante de `lib/glVoyageur.js`, rendue visible dans `routes/gl/player-journal.js`, sans migration. | « ok » | `validée par un « ok »` | `contenu-5.5` (étape JOURNAL-1) | `à coder` |
| `DEC-087` | sans numéro (après-midi du 24/11 : traces de passage) | 24/11, 13 h 53 | Traces de passage : une fiche d'espèce ou une page dit combien de membres de la caravane sont déjà passés (comptage sur `gl_learning_acknowledgements`, limité à la classe, aucune table). Jamais de prénom ni de score, rien en projection, rien à zéro. | « ok » | `validée par un « ok »` | `contenu-5.6` (étape TRACES-1) | `à coder` |
| `DEC-088` | sans numéro (après-midi du 24/11 : « Mon sac », le nom) | 24/11, 14 h 16 | « Mon sac » remplace « Le Seuil » comme nom de l'espace personnel de l'élève : onglet « Mon sac », « ton sac » dans une phrase. Les identifiants du code ne se renomment pas ; un test de vocabulaire refuse « Seuil » comme nom d'écran. | « il faut renommer le module de l'app qui s'appelle le seuil. Cela est source de confusion et contredit le passage d'un plateau à un autre » ; « Je valide » | `validée par un « ok »` | `ecrans-6.4` (étape SAC-1) ; `contenu-5.7` (étape SAC-3) ; `contenu-6` (« dans ton sac »), `fin-1` et `fin-2` (docs) | `à coder` |
| `DEC-089` | sans numéro (après-midi du 24/11 : « Mon sac », deux états) | 24/11, 14 h 16 | « Mon sac » a deux états sur un seul écran : fermé pendant le tour (sort utilisable, bourse, rôle du jour, « Rejoindre le chemin »), ouvert à la veillée (« Ce soir, tu peux… », puis tout le contenu). Jamais de sac vide ; la lueur est celle du feu, pas la nuit du monde. | « Je valide » | `validée par un « ok »` | `ecrans-8.2` (étape SAC-2) ; remplace l'ancienne étape T7 | `à coder` |
| `DEC-090` | sans numéro (après-midi du 24/11 : vagues) | 24/11, vers 14 h 30 | Intégration par vagues : les lots fusionnent dans `claude/gl-decisions-integration`, qui part sur `main` trois fois. | « Par vagues » (libellé du choix sur carte) | `réponse sur carte, rapportée` | orchestration | `hors chantier` (cadre : `ORCHESTRATION.md`) |
| `DEC-091` | sans numéro (après-midi du 24/11 : un seul prompt) | 24/11, vers 14 h 30 | Un seul prompt orchestre tout le reste. | « tu lances un prompt qui orchestre absolument tout le reste. » | `dite par Oliv` | orchestration | `hors chantier` (cadre : `ORCHESTRATION.md`) |
| `DEC-092` | sans numéro (après-midi du 24/11 : escalier) | 24/11, vers 14 h 35 | Escalier : parties neuves seulement. Le nouvel escalier ne gère pas les parties déjà commencées (16 et 17 sont des tests) : aucun code de rattrapage, et la phrase « une partie au pas 4 garde son pas » est retirée. | « Parties neuves seulement » (libellé du choix sur carte) | `réponse sur carte, rapportée` | `moteur-3.1` (étape 20) | `à coder` |
| `DEC-093` | sans numéro (après-midi du 24/11 : nombre de sondes) | 24/11, vers 14 h 35 | Sonde : une par bonne réponse de case, à utiliser dans le tour ; deux bonnes réponses dans un tour, deux sondes. Corrige « une fois dans le tour » de l'ancienne étape 35. | — | `réponse sur carte, rapportée` | `moteur-4.2`, `moteur-4.3` (étape 35) | `à coder` |
| `DEC-094` | sans numéro (après-midi du 24/11 : mission `mis-13`) | 24/11, vers 14 h 35 | Mission `mis-13` : « Trouver une page et la laisser lire par la ou le Secrétaire d'une autre équipe. » | — | `réponse sur carte, rapportée` | `moteur-2.1`, `moteur-2.2`, `moteur-2.3` (étape 24 quinquies-R) | `à coder` |
| `DEC-095` | sans numéro (après-midi du 24/11 : test des notes du copiste) | 24/11, vers 14 h 35 | Notes du copiste : un test de contenu avec sa propre liste (nom et cri de l'oiseau, Souffle ou voile qui agit, visage de Sélène), pas `findForbiddenString` : « perdu » et « raté » y sont permis. Le test « pas de copiste dans l'intro » ne porte pas sur l'identifiant de scène `copiste`. | — | `réponse sur carte, rapportée` | `contenu-4.1`, `contenu-4.2` (étape C1) ; `contenu-6.5` (étape C6) | `à coder` |
| `DEC-096` | sans numéro (après-midi du 24/11 : pack de l'oiseau) | 24/11, vers 14 h 40 | Pack « Oiseau noir » : rien avant le lot de la fouille, qui l'exclut du choix des équipes de G&L. | — | `réponse sur carte, rapportée` | `ecrans-10.3` (étape F3) | `à coder` |
| `DEC-097` | sans numéro (après-midi du 24/11 : question d'Histoire) | 24/11, vers 14 h 40 | Histoire : la question tourne. Après le délai d'une heure, jamais deux fois la même question de suite (rotation, pas un tirage par graine). | — | `réponse sur carte, rapportée` | `contenu-3.3` (étape H1) | `à coder` |
| `DEC-098` | sans numéro (après-midi du 24/11 : icône du voile) | 24/11, 14 h 43 | `GL_icone_voile` est gardée : pictogramme fixe posé à côté des mots qui nomment le voile sur un écran d'élève (« sous le voile », « Le voile avance », légende). Elle ne remplace ni le texte ni la perte de couleur ; repli sans image : le texte seul. | « on garde l'image de voile » | `dite par Oliv` | `ecrans-7` (tablette, bandeau), `ecrans-8` (navigation, projection), `ecrans-9` (légende) | `à coder` |

## Choix par défaut posés par Claude

Oliv n'a tranché aucun de ces choix un à un. Ils sont appliqués par le lot cité, repris dans le rapport final, et Oliv
peut retirer chacun. Les lignes du registre marquées `choix de Claude, non relu` en font partie.

### Les 14 du prompt (son § 3)

1. Case favorable neutre : « Belle rencontre : la caravane repart. » (`DEC-024`). Lot `contenu-2`, étape `contenu-2.5`.
2. Vent de la caravane : « Porté par le vent : la case ne joue pas. » (`DEC-026`). Lot `ecrans-2`, étape `ecrans-2.2`.
3. Les deltas morts des cases (cœurs, gemmes neutralisées) restent en base : les anciennes parties les lisent encore.
   Lot `contenu-2`, étape `contenu-2.5`.
4. Au tableau : « Équipe suivante » paraît quand l'équipe active n'a plus de geste ouvert, ou par « Passer »
   (journalisé) ; « Passer la question » seulement s'il tient sans route nouvelle ; bourses masquées sur l'écran de
   l'équipe active. Lot `ecrans-4`, étape `ecrans-4.1`, `ecrans-4.2`, `ecrans-4.3`, `ecrans-4.4`, `ecrans-4.7`.
5. La page témoin n'est pas mise en évidence sur la projection. Lot `moteur-3`, étape `moteur-3.3`.
6. Le doc « Déroulé d'une partie » perd le mot « classique » de son titre. Lot `fin-2`, étape `fin-2.2`.
7. 12 h comme seuil de la « marche par jour » et du tour resté ouvert. Lot `moteur-3`, étapes `moteur-3.1` et `moteur-3.4`.
8. `tenir_enabled` gardé au registre mais retiré de l'écran ; valeur `hybride` gardée par le moteur, retirée des
   sélecteurs, sans migration ; code de `glArriveeSuspendue` gardé, inerte sans Relance. Lots `ecrans-1` (étapes
   `ecrans-1.1` et `ecrans-1.2`) et `moteur-3` (étape `moteur-3.2`).
9. Page Histoire : bouton réservé au compte d'élève (`gl_player`) ; aucune récompense ; textes d'avertissement
   communs à toutes les ressources conditionnées de G&L ; une question parmi trois par plateau ; verrou au ton
   « Pas encore » ; légendes écrites d'après les images ; épilogue réservé au prof ; scènes citées par leur nom ;
   galerie de fin seulement pour un texte sans scène citée. Lot `contenu-3`.
10. Documentation : plus de « Depuis le … », jeu classique réduit à un encadré, audit d'août déplacé, règles en v4.
    Lots `fin-1` et `fin-2`.
11. Revue du 23/11 à 20 h 30 (`DEC-040`) : texte d'`olu-pf-marche` (« Le Marché ouvre, hors du tour, depuis ton
    compte. Ce que tu y achètes, tu le gardes toute l'année. »), lot `moteur-3`, étape `moteur-3.2` ; une autre question
    des trois après le délai d'une heure, lot `contenu-3`, précisé depuis par `DEC-097` ; ancien bilan Team Spirit
    sans liste de cartes : retraits reconstitués dans l'ordre du panneau, marqués « à vérifier », lot `ecrans-1`,
    étape `ecrans-1.4` ; aucune fusion le jeudi de 8 h à 15 h, orchestration (voir plus bas).
12. Question sans sa réponse visible (`DEC-042`) : fond presque opaque, au vert pétrole du jeu, flouté ; plateau flouté
    tant qu'une question est ouverte, sur l'écran d'équipe puis en projection ; la fenêtre « Marquer comme lu » garde
    son fond ; pas de tri des questions. Lots `ecrans-2` (étape `ecrans-2.3`) et `ecrans-4`.
13. Question de case et sonde (`DEC-071`) : textes de la case, de la carte du moment, d'`olu-pf-sonde`, `olu-14` et
    `olu-18` ; « sous le voile » s'apprécie au moment de la réponse ; le bonus ne s'ajoute ni au vent ni à
    Progression ; la case d'arrivée du bonus joue, sauf une case question ; la sonde n'est pas une fouille ; l'oiseau
    témoin vole aussi vers une sonde. Lot `moteur-4`.
14. Onglets des biomes (`DEC-043`) : le titre qui redit le nom de l'onglet est retiré, les autres restent ; « La limite
    des arbres » reste dans l'onglet de la taïga ; « Le biotope — milieu de vie » et « La biocénose — communauté du
    vivant » sont recopiés dans chaque onglet. Lot `ecrans-1`, étape `ecrans-1.5`.

### Ceux de l'addendum 1 (son § 3)

- Les douze questions de lore restées éteintes ne sont pas réécrites sur un autre sujet (`DEC-064`). Fait en prod,
  aucun lot.
- Les questions réécrites sur un visage, le vieux cèdre et la garrigue passent au chapitre de leur monde. Fait en
  prod, aucun lot.
- L'émoji de verdict est retiré à l'affichage, pas en base. Lot `contenu-1`, étape `contenu-1.6`.
- La page vierge est écartée par le code, sans passer `inactif` en base. Lot `moteur-5`, étape `moteur-5.2`.
- Les notes d'auteur du lexique restent en base ; elles sortent seulement de la réponse et de l'écran d'un élève.
  Les variantes des termes ne sont pas touchées. Lot `contenu-5`, étape `contenu-5.2`.

### Ceux de l'addendum 2 (son § 4)

- Trois mots pour le plateau (monde, chemin, paysage) plutôt qu'un ; « caravane » réservée à toute la classe ;
  « séance », « niveau », « points », « case », « prof » gardés. Lots `contenu-1` (étape `contenu-1.3`) et `ecrans-6`
  (étape `ecrans-6.1`).
- Libellés d'onglets changés tout de suite. Lot `ecrans-6`, étape `ecrans-6.1`. Leur regroupement en cinq onglets, d'abord
  reporté, est entré dans le chantier par `DEC-069`.
- Piste sur la tablette : feuille en lecture seule, sans « Marquer comme étudié » ; repli sur le nom de la fiche.
  Lot `ecrans-4`, étape `ecrans-4.6`.
- Lexique du voyage : visibilité selon le plateau le plus avancé des parties de l'élève. Lot `contenu-5`, étape
  `contenu-5.1`.
- Visite d'Olu : fermée sans être marquée vue au changement d'onglet ; une par onglet principal. Lot `ecrans-6`,
  étape `ecrans-6.2`.
- Vitrine : chapitres de test rangés à 980 et 990, rien de supprimé ; « moor » inactif. Fait en prod ; lot
  `contenu-5`, étape `contenu-5.3`, pour une base neuve.
- Fond du plateau : dégradé de la couleur du monde vers `#04191b`, liseré doré à 40 %. Lot `ecrans-6`, étape `ecrans-6.3`.
- Son : la projection seule chante ; musique de zone sur la même règle ; volume × 0,4 pendant une question ; « (2) »
  pour la Méditerranée. Lot `ecrans-5`.

### Ceux de l'addendum 3 (son § 3) et du copiste

- Une note s'allume à chaque page tenue, dans l'ordre de l'arc, quelle que soit la page. Le reste d'un monde
  reparaît quand le prof ouvre l'enveloppe, juin quand il ouvre le double fond : un geste chacun, rien ne s'ouvre
  seul. Lot `contenu-6`, étapes `contenu-6.1` et `contenu-6.3`.
- Compteur « Pages de Sélène tenues par la caravane », et non « retrouvées ». Lot `contenu-6`, étape `contenu-6.4`.
- Les notes sont communes à toute la classe, et ne donnent rien en jeu : ni gemme, ni Lumière, ni badge. Lot
  `contenu-6`.
- Le bloc est caché tant qu'aucune note n'est allumée ; les notes éteintes ne sortent pas du serveur. Lots
  `contenu-4` (étape `contenu-4.3`) et `contenu-6` (étape `contenu-6.2`, `contenu-6.3`).
- La lecture en classe passe par le bouton de la console ; aucune note ne paraît d'elle-même en projection ni sur la
  tablette d'équipe. Lot `contenu-6`.
- Les anciennes pages restent en base, inactives ; `GL2P-04` est signée « — S. ». Lot `contenu-4`, étape `contenu-4.1`, `contenu-4.2`.
- Carnet de Sélène (`DEC-081`) : le cri de l'oiseau devient « un cri » ; les cœurs de l'ancien jeu deviennent « des
  forces » ; `ep-IV-06` cite les vrais sorts ; une gemme vient d'une page tenue. Les pages posent la question du
  renversement, elles ne donnent plus la réponse ; `ep-I-13` et `rep-II-05` passent inactives plutôt que réécrites.
  Incipits coupés à une fin de phrase. Les 25 questions de lore de l'ancien jeu sont éteintes, pas réécrites. Lot
  `contenu-4`, étape `contenu-4.2`.
- La liasse de fin de Sélène part avec le double fond. Lot `contenu-6`, étape `contenu-6.3`.
- Jamais relus par Oliv : le texte de la nouvelle intro, `GL2P-04` à la voix de Sélène (`DEC-045`), la voix des 41
  notes et des 4 enveloppes (`DEC-048`), les deux gestes du prof et leurs routes (`DEC-047`). Lots `contenu-4` et
  `contenu-6`.

### Ceux de l'addendum 4 (son § 3)

- La plume dit le verdict par sa posture, le ruban dit l'équipe ; l'oiseau reprend ses plumes autour d'une page
  tenue, à l'affichage seulement (`DEC-074`). Lots `ecrans-10` (étape `ecrans-10.3`) et `ecrans-9` (étape `ecrans-9.5`).
- Le pack « Oiseau noir » sert au témoin quand le réglage est posé ; jamais proposé à une équipe (`DEC-078`,
  `DEC-096`). Lot `ecrans-10`, étape `ecrans-10.3`.
- Cinq onglets et file des surcouches dans le chantier (`DEC-069`). Lot `ecrans-8`, étapes `ecrans-8.1` et `ecrans-8.3`.
- Un seul interrupteur, `modules.table_de_jeu_enabled`, pour tout l'habillage (`DEC-077`). Lot `ecrans-7`, étape
  `ecrans-7.1`.
- Le jeu classique garde ses emoji et son plateau ; la table ne s'applique qu'en « Tenir », au compte d'élève, à
  l'espace personnel, en projection et à la vitrine. Lots `ecrans-7` à `ecrans-11`.
- Le symbole du Souffle est une feuille qui s'efface : un effet, pas une chose. Lot `ecrans-9`, étape `ecrans-9.1`.
- Les péripéties sont réécrites en formes doubles et confient les dés à la ou au Gestionnaire. Lot `contenu-1`,
  étape `contenu-1.1`, `contenu-1.2`, `contenu-1.3`, `contenu-1.4`, `contenu-1.5`.
- La sonde reste à l'Opératrice ou l'Opérateur (`DEC-083`). Lot `moteur-4`, étape `moteur-4.2`, `moteur-4.3`.

### Ceux du 24/11 après-midi (préparation du kit)

- Le découpage en 24 lots, quatre couloirs et trois vagues (`plan.json`) : Oliv a choisi « par vagues »
  (`DEC-090`), pas le détail. Orchestration.
- La définition de « banc vert » et les seuils d'alerte (carnet complet au-dessus de 60 % aux plateaux 1 et 2 ;
  écart de 25 %) : `REGLES_COMMUNES.md` § 5. Tous les lots.
- Les étiquettes de migration `mig-…`, dont le numéro de fichier se prend au dernier moment. Lots à migration.

### Relevés par la relecture des conversations (absents des listes des anciens textes)

- Mascottes (`DEC-015`) : 550 ms par case ; 12 cases au plus ; recul case par case sans joie ; pas de saut au premier
  affichage, à la reconnexion ni au rechargement ; téléportation sous `prefers-reduced-motion`. Lot `ecrans-3`.
- Erreur d'Olu (`DEC-016`) : accroche « Une bêtise s'est glissée. Qui la trouve ? », effacement en phase `souffle`,
  correction affichée sur la tablette après désignation. Lot `ecrans-2`, étape `ecrans-2.1`.
- « Seul jeu » (`DEC-017`) : `PUT /tenir/profil` refuse `null` (400). Lot `ecrans-1`, étape `ecrans-1.1`.
- Étapes entières sans décision propre d'Oliv, nées d'un audit : catalogues du tour (étape `contenu-1.1`, `contenu-1.2`, `contenu-1.3`, `contenu-1.4`, `contenu-1.5`), questions de
  lecture du catalogue (étape `contenu-1.2`), émoji des retours (étape `contenu-1.6`), journal et tour resté ouvert (étape
  `moteur-3.4`), bilan Team Spirit (étape `ecrans-1.4`).
- « Aucune fusion sur `main` le jeudi de 8 h à 15 h » : écrit par Claude le 23/11, gardé par `ORCHESTRATION.md`.
  Oliv ne l'a jamais dit ; sa phrase de 13 h 37 dit que les fusions « ne doivent pas attendre », sans exception.
- « Première séance en décembre 2026 ou après » : aucune date n'a été donnée par Oliv. Aucune séance n'a encore
  été jouée en classe ; les parties 16 et 17 sont des tests.
- Trois sessions en parallèle, fusion dès la CI verte, aucune tâche planifiée, plafonds de sessions : choix du 23/11,
  remplacés par `ORCHESTRATION.md`.

## En attente d'une réponse d'Oliv (hors chantier tant qu'il ne dit rien)

Aucun lot n'y touche. Une session qui rencontre un de ces points l'écrit dans son rapport, section « À relire par
Oliv », et ne tranche pas.

1. **Notes d'auteur du lexique lore**, servies aux élèves tant que l'étape `contenu-5.2` n'est pas en prod : vider
   `role_recit` et `correspondance_reelle` des 38 fiches non secrètes après sauvegarde, ou couper
   `modules.lore_glossary_enabled`. Le correctif de code, lui, est dans le chantier (`DEC-079`).
2. **Photos de `QCM0009`, `QCM0037`, `QCM0152`** (des dromadaires pour une question sur le fennec, un lotus, un
   jaguar) : les remplacer ou les retirer, par le connecteur.
3. **Les 12 questions de lore restées éteintes** (`LQCM0168`, `LQCM0265`, `LQCM0271`, `LQCM0273`, `LQCM0277` à
   `LQCM0281`, `LQCM0283` à `LQCM0285`) alors qu'Oliv a dit « Reecris les » (`DEC-064`).
4. **Bilan Team Spirit aux cartes nommées et colorées** (proposition du 23/11). Oliv a seulement orienté : cartes
   visibles dans l'espace personnel, retournées quand le prof les retire. L'étape `ecrans-1.4` ne fait que relire le bilan
   enregistré.
5. **Titre « La page du Passeur, à lire à la classe »** dans la console (proposition du 23/11).
6. **Carnet de route de la caravane**, sans prénoms.
7. **Rôle qui tient la sonde** : Opératrice ou Opérateur par défaut (`DEC-083`), ou Éclaireuse ou Éclaireur.
8. **Exception du jeudi** pour les fusions sur `main` (voir plus haut).
9. **Textes du copiste** : voix des 41 notes et des 4 enveloppes, nouvelle intro, `GL2P-04`, lettre de juin et sa
   variante « surnom », image du copiste avec ou sans visage, main sur la plaque, livre de Sélène remis en juin.
10. **Carnet de Sélène, choix à valider ou à retirer** : fin de Sélène remise au double fond ; `ep-I-13` et
    `rep-II-05` inactives ; retraits dans `ep-IV-07`, `ep-I-12`, `rep-II-04` ; 49 questions de lore éteintes ;
    « à revoir, non touché » : `LQCM0018`, `LQCM0388`, `LQCM0005`, `LQCM0031`, texte accessible du mot de la boîte.
11. **Réglages à reprendre par Oliv, quand il le veut** : rallumer le chapardeur avant le plateau 2 (`DEC-029`) ;
    remettre `gameplay.lore_spoiler_max_level` à `recit` après le lot `contenu-5`.
12. **Petits textes laissés à Oliv** : deux phrases de la page « Introduction » ; `data/gl/tenir/titres.json`
    (« Passeur de Pages ») ; variantes du lexique (« le carnet mourant », « la boîte de l'Ancien ») ; phrase de fin
    de séance 1 pour « L'essentiel du maître du jeu » ; fiches de piste à relire contre les nouvelles réponses
    (castor, pavot, arganier).
13. **Date de la première séance en classe** : jamais donnée.

`GL_icone_voile` n'est plus en attente : Oliv a tranché à 14 h 43 (`DEC-098`).

## Écartées ou reportées

| Quoi | Sort | Raison |
| --- | --- | --- |
| Une erreur tolérée pour « Marquer comme lu » (position V4c de l'audit des questions de validation), ou un délai de réessai à 0 | écartés par Oliv, 23/11 à 20 h | « Je reste sur ma décision d'1h. » (`DEC-039`). Le libellé de V4c varie d'un doc à l'autre ; ses deux lectures sont écartées. |
| Variantes du texte d'Histoire du plateau 3 qui donnaient une direction au grondement | écartées par Oliv, 23/11 à 20 h | Garde-fous du récit (`DEC-039`). |
| Retrait du code du jeu classique | reporté après deux séances jouées | Voie de repli tant que le nouveau jeu n'a pas tourné en classe (`DEC-017`). PR à part. |
| Suppression du code inerte (`glArriveeSuspendue`, fenêtre de fouille hybride) | reportée après deux séances | Même prudence. |
| Renommer « Tenir à deux » en « le jeu » dans l'interface | reporté après deux séances | Couvert par le « Ok » de `DEC-017`, mais laissé par Claude à la PR de retrait du classique. |
| Plafond et prix de la bourse, des sorts, des parures | reportés après deux séances réelles | `DEC-008`. |
| Défis de case rares | reporté après deux séances | `DEC-025`. |
| « Zéro copiste dans l'app » ; oiseau porteur et plume noire dans la boîte | écartés par Oliv, 24/11 | « je trouve que son apport est précieux. » ; « Corbeau imaginaire. » (`DEC-047`, `DEC-045`). |
| Refaire les cartes (glands à la place des cœurs) | écarté | `DEC-073`. |
| Autres bonus d'une bonne réponse (« +2 », « +3 pour tous », moitié du jet, « ou dernière ») | écartés | Oliv ne retient que « +1 et +3 sous le voile et la sonde » (`DEC-071`). |
| Sonde tenue par l'Éclaireuse ou l'Éclaireur | écartée par le prompt, pas par Oliv | `DEC-083` ; reste en attente. |
| Options B et C des mots du voyage | écartées | `DEC-055` retient les trois mots et « la caravane ». |
| Ancienne étape T7, « le Seuil en carnet » | remplacée | `DEC-089`. |
| « Une partie au pas 4 garde son pas » (ancienne étape 20) | retirée | `DEC-092`. |
| « Une fois dans le tour » pour la sonde (ancienne étape 35) | corrigée | `DEC-093`. |
| Tirage par graine de la question d'Histoire après le délai | remplacé par une rotation | `DEC-097`. |
| Filtre commun `findForbiddenString` sur les notes du copiste | remplacé par une liste propre | `DEC-095`. |
| Ancienne migration `N+5` (pages servies) | sans objet en prod | Ses sept écritures y sont depuis le 24/11 à 11 h 15 ; remplacée par `mig-pages-servies`. |
| Attendre la CI verte avant de fusionner | remplacé | `DEC-085`. |
| Le gel « jusqu'à deux séances jouées » | levé | `DEC-061`, `DEC-067`. |
| Priorité des addenda sur le prompt (écrite dans les addenda 1 et 3) | renversée, puis sans objet | `DEC-080`. |
| Lot 0 de versement, trois sessions en parallèle, une PR par lot | remplacés | `DEC-090`, `DEC-091`. |
| Tutoiement des cases des plateaux 2 à 4, péripéties des autres plateaux, relecture scientifique des lignes d'Olu | hors chantier | Lot de contenu séparé. |
| Mise en évidence de la page témoin sur la projection | hors chantier | Choix par défaut 5 du prompt. |
| `time_zone` de la connexion MySQL | hors chantier | Chantier ForêtMap séparé. |
