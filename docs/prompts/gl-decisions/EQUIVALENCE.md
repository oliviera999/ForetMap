# Chantier G&L « décisions » : table d'équivalence ancien → nouveau

Pour qui relit un ancien texte (`sources/ancien/` : le prompt orchestrateur du 23-24/11 et ses quatre addenda) et
cherche où une chose est passée. Ces textes ne font plus foi : le plan (`plan.json`) et les fiches de lot les
remplacent. « Prompt » désigne le prompt orchestrateur, « addendum n » ses addenda 1 à 4.

Une nouvelle étape s'écrit `<lot>.<n>` : c'est le numéro de l'étape dans la fiche du lot (`lots/<lot>.md`). Une ancienne
étape redécoupée par sa fiche renvoie à plusieurs nouvelles.

## 1. Lots

Les anciens lots sont donnés dans leur ancien ordre de priorité. Les nouveaux portent le nom de leur couloir :
`moteur`, `ecrans`, `contenu`, `fin`.

| Ancien lot | Titre | Nouveau(x) lot(s) et étapes reçues | Ce qui a été déplacé |
| --- | --- | --- | --- |
| 0 | Versement du prompt et du fichier d'état | aucun | remplacé par le kit `docs/prompts/gl-decisions/`, versé avant le lancement |
| 1 | Moteur du tour | `moteur-1` (15, 16, 17 côté serveur, 2) ; `ecrans-1` (11) | l'étape 11 part à `ecrans-1` |
| 2 | Catalogues et textes | `moteur-2` (24 quinquies-R) ; `contenu-1` (24, 24 bis, 24 ter, 24 quater, 24 quinquies, QV4) ; `contenu-2` (3, 5, 8, 23, 22 textes) | les catalogues du tour vont à `contenu-1`, le reste à `contenu-2`, qui reçoit aussi l'étape 10 ; l'étape 24 quinquies-R part à `moteur-2` |
| B | Onglets des biomes | `ecrans-1` (B1) | B1 rejoint `ecrans-1` |
| M | Mascottes case par case | `ecrans-3` (M1, M2, M3, M4, M5) | rien |
| 3 | Portes et surfaces, bilan Team Spirit | `ecrans-1` (14, 27, 12, 29) | `ecrans-1` reçoit aussi B1 et l'étape 11 |
| 6 | L'erreur d'Olu visible, question sans sa réponse visible | `ecrans-2` (13, 22 vent, 30, 33) | rien |
| 5 | Escalier et règles de séance | `moteur-3` (20, 26, 21, 25) | rien (l'étape 19 était déjà passée au lot Q) |
| Q | La question de case récompensée et la sonde | `moteur-4` (19, 35) | rien |
| 4 | Trame, Lumière, appareils, Lettre | `moteur-5` (6, QV2, 7, 4) ; `contenu-2` (10) | l'étape 10 part à `contenu-2` |
| 7 | Au tableau, un seul écran d'équipe | `ecrans-4` (17 bouton, 18, 31, 32) | rien |
| H | Page Histoire | `contenu-3` (H1, H2, H3, H4) | rien |
| S | Le son : la projection chante | `ecrans-5` (S1, S2, S3) ; `ecrans-11` (S4) | S4 part à `ecrans-11` |
| V | Les mots du voyage, la visite d'Olu, la vitrine, le fond du plateau | `ecrans-6` (V1, V3, V6) ; `contenu-5` (V2, QV5, V4, V5) | les écrans (V1, V3, V6) vont à `ecrans-6`, avec SAC-1 ; les données (V2, QV5, V4, V5) à `contenu-5`, avec JOURNAL-1, TRACES-1 et SAC-3 |
| C | Le copiste : ses notes, ses marges, ses enveloppes | `contenu-4` (C1, C1 ter, C2) ; `contenu-6` (C3, C4, C4 bis, C5, C6) | les données (C1, C1 ter, C2) vont à `contenu-4`, l'application (C3 à C6) à `contenu-6` |
| T | La table de jeu | `ecrans-7` (T1, T2, T3, T4, T5) ; `ecrans-8` (T6, T8, T9) | T1 à T5 vont à `ecrans-7`, T6, T8 et T9 à `ecrans-8` ; T7 est remplacée par SAC-2 |
| P | Le plateau | `ecrans-9` (P1, P2, P3, P4, P5) | rien |
| F | La fouille et l'oiseau | `ecrans-10` (F1, F2, F3, F4, F5, F6) | rien |
| A | Les moments forts | `ecrans-11` (A1, A2, A3, A4) | `ecrans-11` reçoit aussi S4 |
| 8 | Décisions consignées, vérifications complètes | `fin-1` (1, 9) | `fin-1` reçoit aussi les étapes 1 à 3 de l'annexe C |
| 9 | Réécriture de toute la documentation | `fin-1` (étapes 1 à 3 de l'annexe C) ; `fin-2` (28, étapes 4 à 6 de l'annexe C) | les étapes 1 à 3 de l'annexe C vont à `fin-1` ; l'étape 28 et les étapes 4 à 6 à `fin-2` |

## 2. Étapes

106 lignes pour les 106 étapes du plan. Une ancienne étape coupée en deux a deux lignes ; quatre étapes sont nouvelles.

| Ancienne étape | Texte d'origine | Ancien lot | Nouvelle étape | Nom dans le plan | Titre | Remarque |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | prompt | 8 | `fin-1.1`, `fin-1.3` | 1 | Retrait et gemme de la page tenue (texte) | — |
| 2 | prompt | 1 | `moteur-1.4` | 2 | Lumière : la jauge repart à 0 | — |
| 3 | prompt | 2 | `contenu-2.1` | 3 | Pistes de zone qui donnent la réponse | — |
| 4 | prompt | 4 | `moteur-5.4` | 4 | Brancher olu-pf-main | — |
| 5 | prompt | 2 | `contenu-2.2` | 5 | Badges : une seule source, noms en formes doubles | — |
| 6 | prompt | 4 | `moteur-5.1` | 6 | Mélanger les cartes des « fils » | — |
| 7 | prompt | 4 | `moteur-5.3` | 7 | Lumière venue de la Trame : un palier par chapitre au plus | — |
| 8 | prompt | 2 | `contenu-2.3` | 8 | Retours « pas encore » du Mentorat et de la Lettre | — |
| 9 | prompt | 8 | `fin-1.2` | 9 | Décisions consignées (doc) | — |
| 10 | prompt | 4 | `contenu-2.6` | 10 | Pseudo de l'auteur d'une Lettre | quitte le lot de la Trame |
| 11 | prompt | 1 | `ecrans-1.6` | 11 | Message de version d'état | quitte le lot du moteur |
| 12 | prompt | 3 | `ecrans-1.3` | 12 | Questions remplacées sur une installation neuve | — |
| 13 | prompt | 6 | `ecrans-2.1` | 13 | L'erreur du jour d'Olu, visible des élèves | — |
| 14 | prompt | 3 | `ecrans-1.1` | 14 | « Tenir à deux », seul jeu : fermer les portes vers le classique | — |
| 15 | prompt | 1 | `moteur-1.1` | 15 | Horodatages des tours | — |
| 16 | prompt | 1 | `moteur-1.2` | 16 | Erreur du jour sans répétition | — |
| 17 (côté serveur) | prompt | 1 | `moteur-1.3` | 17-serveur | Fin de l'ordre au tableau, côté serveur | ancienne étape 17, coupée en deux |
| 17 (bouton « Le voile avance ») | prompt | 7 | `ecrans-4.3` | 17-bouton | Fin de l'ordre au tableau, bouton de la dernière équipe | ancienne étape 17, coupée en deux |
| 18 | prompt | 7 | `ecrans-4.1`, `ecrans-4.2`, `ecrans-4.3`, `ecrans-4.4`, `ecrans-4.7` | 18 | Un seul écran d'équipe, partout | — |
| 19 | prompt | Q | `moteur-4.1` | 19 | Question de case : une case, trois sous le voile, sans relance | déplacée du lot 5 au lot Q le 24/11 |
| 20 | prompt | 5 | `moteur-3.1` | 20 | Escalier en cinq marches, une par jour | — |
| 21 | prompt | 5 | `moteur-3.3` | 21 | Page témoin derrière la dernière équipe | — |
| 22 (textes : vérité des cases) | prompt | 2 | `contenu-2.5` | 22-textes | Textes d'écran : vérité des cases | ancienne étape 22, coupée en deux |
| 22 (vent de la caravane) | prompt | 6 | `ecrans-2.2` | 22-vent | Textes d'écran : vent de la caravane | ancienne étape 22, coupée en deux |
| 23, avec son complément de l'addendum 1 | prompt et addendum 1 | 2 | `contenu-2.4` | 23 | Passeur du plateau 1 et « corbeau » | l'étape absorbe le complément (décision QV1) |
| 24 | prompt | 2 | `contenu-1.1`, `contenu-1.2`, `contenu-1.3`, `contenu-1.4`, `contenu-1.5` | 24 | Catalogues : erreurs d'Olu, péripéties, retours de zones | — |
| 24 quinquies | prompt | 2 | `contenu-1.5` | 24 quinquies-Z | Questions qui se lisent sur le plateau ou dans l'indice | nommée « 24 quinquies-Z » pour la distinguer de celle de l'addendum 4 |
| 25 | prompt | 5 | `moteur-3.4` | 25 | Journal et tour resté ouvert | — |
| 26 | prompt | 5 | `moteur-3.2` | 26 | Retirer le sort Relance | — |
| 27 | prompt | 3 | `ecrans-1.2` | 27 | Deux surfaces, pas trois | — |
| 29 | prompt | 3 | `ecrans-1.4` | 29 | Bilan Team Spirit : le formulaire relit ce qui est enregistré | — |
| 30 | prompt | 6 | `ecrans-2.3` | 30 | Une question ne se lit jamais avec sa réponse visible | — |
| 28 | prompt | 9 | `fin-2.1` | 28 | Docs du prof et réécriture de la documentation | simple renvoi vers l'annexe C |
| B1 | prompt | B | `ecrans-1.5` | B1 | Onglets des biomes : chaque texte dans son onglet | — |
| H1 | prompt | H | `contenu-3.3` | H1 | Page Histoire : « Marquer comme lu », soumis à une question | — |
| H2 | prompt | H | `contenu-3.4` | H2 | Le délai d'une heure, annoncé avant et après | — |
| H3 | prompt | H | `contenu-3.1` | H3 | Textes d'Histoire et questions, données | — |
| H4 | prompt | H | `contenu-3.2` | H4 | Illustrations de l'Histoire : légendes et agencement | — |
| 35 | prompt | Q | `moteur-4.2`, `moteur-4.3` | 35 | La sonde | — |
| M1 | prompt, annexe A | M | `ecrans-3.1` | M1 | Planificateur pur des sauts | — |
| M2 | prompt, annexe A | M | `ecrans-3.2` | M2 | La mascotte suit la case affichée et saute | — |
| M3 | prompt, annexe A | M | `ecrans-3.3` | M3 | Le popover de case attend la fin des sauts | — |
| M4 | prompt, annexe A | M | `ecrans-3.4` | M4 | Tests d'écran | — |
| M5 | prompt, annexe A | M | `ecrans-3.5` | M5 | Docs et captures du lot M | — |
| étape 1 de l'annexe C | prompt, annexe C | 9 | `fin-1.3` | C-doc-1 | Deux surfaces proposées | déjà faite par l'étape 27 : à vérifier, pas à refaire |
| étape 2 de l'annexe C | prompt, annexe C | 9 | `fin-1.4` | C-doc-2 | Règles v4 | — |
| étape 3 de l'annexe C | prompt, annexe C | 9 | `fin-1.5` | C-doc-3 | Docs techniques G&L à aligner | — |
| étape 4 de l'annexe C | prompt, annexe C | 9 | `fin-2.2` | C-doc-4 | Deux nouveaux documents pour le prof | — |
| étape 5 de l'annexe C | prompt, annexe C | 9 | `fin-2.3` | C-doc-5 | Réécriture de docs/reference/gl/ | — |
| étape 6 de l'annexe C | prompt, annexe C | 9 | `fin-2.4` | C-doc-6 | Skills et garde de vocabulaire | — |
| 24 bis | addendum 1 | 2 | `contenu-1.2` | 24 bis | Questions de lecture du catalogue | — |
| QV4 | addendum 1 | 2 | `contenu-1.6` | QV4 | Retours de QCM précédés d'un émoji | — |
| QV2 | addendum 1 | 4 | `moteur-5.2` | QV2 | Jamais de page vierge en récompense de la Trame | — |
| QV5 | addendum 1 | V | `contenu-5.2` | QV5 | Le lexique lore ne sert plus les notes d'auteur aux élèves | — |
| 24 ter | addendum 2 | 2 | `contenu-1.3` | 24 ter | Catalogues : les mots du voyage | — |
| 31 | addendum 2 | 7 | `ecrans-4.5` | 31 | Plus de fenêtre du plateau en « Tenir » | — |
| 32 | addendum 2 | 7 | `ecrans-4.6` | 32 | La piste s'ouvre sur la tablette d'équipe | — |
| 33 | addendum 2 | 6 | `ecrans-2.4` | 33 | Rien de consultable pendant une question | — |
| V1 | addendum 2 | V | `ecrans-6.1` | V1 | Les mots du voyage à l'écran d'un élève | — |
| V2 | addendum 2 | V | `contenu-5.1` | V2 | Le lexique du voyage filtré par monde | — |
| V3 | addendum 2 | V | `ecrans-6.2` | V3 | La visite d'Olu se tient | — |
| V4 | addendum 2 | V | `contenu-5.3` | V4 | Pages, grimoires, cases et vitrine en base | — |
| V5 | addendum 2 | V | `contenu-5.4` | V5 | La vitrine des invités et l'accueil | — |
| V6 | addendum 2 | V | `ecrans-6.3` | V6 | Le plateau sort de la nuit | — |
| S1 | addendum 2 | S | `ecrans-5.1` | S1 | La musique par biome joue | — |
| S2 | addendum 2 | S | `ecrans-5.2` | S2 | La projection chante, les autres écrans se taisent | — |
| S3 | addendum 2 | S | `ecrans-5.3` | S3 | La musique d'intro de l'app ne prend plus une image | — |
| 24 quater | addendum 3 | 2 | `contenu-1.4` | 24 quater | Olu et l'oiseau | — |
| C1 | addendum 3 | C | `contenu-4.1`, `contenu-4.2` | C1 | Les textes du copiste : fichier source et migration | — |
| C1 ter | addendum 3 | C | `contenu-4.2` | C1 ter | Coquilles et garde-fous du carnet de Sélène | — |
| C2 | addendum 3 | C | `contenu-4.3` | C2 | Les notes ne sortent par aucun autre chemin | — |
| C3 | addendum 3 | C | `contenu-6.1` | C3 | Quelles notes sont allumées | — |
| C4 | addendum 3 | C | `contenu-6.2`, `contenu-6.3` | C4 | La route des marges | — |
| C4 bis | addendum 3 | C | `contenu-6.3` | C4 bis | Ouvrir l'enveloppe, ouvrir le double fond | — |
| C5 | addendum 3 | C | `contenu-6.4` | C5 | « Les marges du copiste » au Seuil | — |
| C6 | addendum 3 | C | `contenu-6.5` | C6 | L'intro par défaut, les garde-fous écrits, les docs | — |
| 24 quinquies-R | addendum 4 | 2 | `moteur-2.1`, `moteur-2.2`, `moteur-2.3` | 24 quinquies-R | Les rôles du tour s'échangent | la « 24 quinquies » de l'addendum 4 |
| T1 | addendum 4 | T | `ecrans-7.1` | T1 | Les jetons de la table et l'interrupteur | — |
| T2 | addendum 4 | T | `ecrans-7.2` | T2 | La tablette d'équipe dans la matière de son peuple | — |
| T3 | addendum 4 | T | `ecrans-7.3` | T3 | Les gemmes en jetons de verre | — |
| T4 | addendum 4 | T | `ecrans-7.4` | T4 | La typographie | — |
| T5 | addendum 4 | T | `ecrans-7.5` | T5 | Une barre en une ligne | — |
| T6 | addendum 4 | T | `ecrans-8.1` | T6 | Cinq onglets, dans l'ordre du parcours | — |
| T7 | addendum 4 | T | `ecrans-8.2` | SAC-2 | Le Seuil en carnet | remplacée par SAC-2 (« Mon sac » en deux états) |
| T8 | addendum 4 | T | `ecrans-8.3` | T8 | Les surcouches : une à la fois | — |
| T9 | addendum 4 | T | `ecrans-8.4` | T9 | La projection, la vitrine et la connexion | — |
| P1 | addendum 4 | P | `ecrans-9.1` | P1 | Les cases gravées dans la pierre | — |
| P2 | addendum 4 | P | `ecrans-9.2` | P2 | Les équipes en figurines sur socle | — |
| P3 | addendum 4 | P | `ecrans-9.3` | P3 | Le tour sort du dessin | — |
| P4 | addendum 4 | P | `ecrans-9.4` | P4 | Le voile pâlit la peinture | — |
| P5 | addendum 4 | P | `ecrans-9.5` | P5 | Le fil doré de la Trame | — |
| F1 | addendum 4 | F | `ecrans-10.1` | F1 | Le rôle et l'invitation | — |
| F2 | addendum 4 | F | `ecrans-10.2` | F2 | La lanterne | — |
| F3 | addendum 4 | F | `ecrans-10.3` | F3 | L'oiseau se pose et laisse une plume | — |
| F4 | addendum 4 | F | `ecrans-10.4` | F4 | La page s'arrache du paysage | — |
| F5 | addendum 4 | F | `ecrans-10.5` | F5 | La loupe de précision | — |
| F6 | addendum 4 | F | `ecrans-10.6` | F6 | Ce que dit la projection | — |
| A1 | addendum 4 | A | `ecrans-11.1` | A1 | Quatre moments forts en projection | — |
| A2 | addendum 4 | A | `ecrans-11.2` | A2 | Olu en portrait | — |
| A3 | addendum 4 | A | `ecrans-11.3` | A3 | La couleur du monde, et la nuit polaire | — |
| A4 | addendum 4 | A | `ecrans-11.4` | A4 | La péripétie illustrée | — |
| S4 | addendum 4 | S | `ecrans-11.5` | S4 | Les sons du tour | quitte le lot du son |
| aucune | décisions du 24/11 après-midi | aucun | `ecrans-6.4` | SAC-1 | « Mon sac » : libellés et chaînes d'écran | étape nouvelle |
| aucune | décisions du 24/11 après-midi | aucun | `contenu-5.7` | SAC-3 | « Mon sac » : catalogues et page des règles | étape nouvelle |
| aucune | décisions du 24/11 après-midi | aucun | `contenu-5.5` | JOURNAL-1 | Le « +1 » de « Mon journal » | étape nouvelle |
| aucune | décisions du 24/11 après-midi | aucun | `contenu-5.6` | TRACES-1 | Les traces de passage | étape nouvelle |

## 3. Migrations

Les numéros `N+1` à `N+8` des anciens textes n'étaient que des étiquettes provisoires. Le plan les remplace par des
noms. Le numéro de fichier se prend au dernier moment, au-dessus de la plus haute migration de la branche
d'intégration (`REGLES_COMMUNES.md`, section 6).

| Ancienne étiquette | Ancien lot et étape | Étiquette du plan | Lot | État |
| --- | --- | --- | --- | --- |
| `N+1` | 4, étape 7 | `mig-lumiere-trame` | `moteur-5` | à écrire. Garde vérifiée en prod le 24/11 : la colonne `trame_total` n'existe pas encore |
| `N+2` | Q, étape 19 | `mig-cases-question` | `moteur-4` | à écrire. Garde vérifiée : 61 cases portent encore l'ancien texte |
| `N+3` | 5, étape 26 | `mig-relance` | `moteur-3` | conditionnelle : seulement si l'import du catalogue ne suffit pas. Sans doute inutile : `SL005` est lié à six chapitres, et l'import passe le sort en « proposé » |
| `N+4` | H, étape H3 | `mig-histoire` | `contenu-3` | à écrire. `LQCM0358` à `LQCM0369` sont libres ; le plus haut code en prod est `LQCM0405` |
| `N+5` | V, étape V4 | `mig-pages-servies` | `contenu-5` | sans objet en prod : ses sept écritures y sont depuis le 24/11 à 11 h 15. Remplacée par `mig-pages-servies` : aligner une base neuve sur la prod et renommer la section « Le Seuil » de la page des règles (colonne `body_markdown`) |
| `N+6` | C, étapes C1 et C1 ter | `mig-copiste-carnet` | `contenu-4` | à écrire. Gardes vérifiées : 9 sur 9, et 60 remplacements sur 60 |
| `N+7` | Q, étape 35 | `mig-sonde` | `moteur-4` | à écrire. Garde vérifiée : la colonne `sonde` n'existe pas encore |
| `N+8` | 2, étape 24 quinquies-R | `mig-regles-roles` | `moteur-2` | à écrire. Piège d'ordre : la page des règles posée en prod le 24/11 dit encore l'ancien rôle ; un texte reposé après elle annulerait l'échange des rôles |

## 4. Homonymes des anciens textes, pour mémoire

Les anciens textes ont été écrits par plusieurs sessions en parallèle : un même nom y désigne parfois deux choses.
Dans le kit, une décision se cite toujours avec sa source, ou par son identifiant `DEC-…` (`DECISIONS.md`).

| Nom | Premier sens | Autre sens |
| --- | --- | --- |
| « Annexe A » | Annexe A du prompt : le prompt complet du lot M (mascottes), sections A1 à A5, étapes M1 à M5. | Annexe A de l'annexe C : le texte de départ de « L'essentiel du maître du jeu ». |
| « Annexe B » | Annexe B du prompt : les retours des zones réécrites, pour `qcm-feedbacks-zones.json` (étape 24). | Annexe B de l'annexe C : le texte de départ de « Déroulé d'une partie classique ». |
| « B1 » | Décision B1 et étape B1 du prompt : les onglets des biomes (ancien lot B). | Repère B1 de l'audit de la partie 16 : les horodatages des tours (étape 15). Mêmes repères : B2 (étape 16), B3 (étape 17), B4 et B5 (étape 18), B11 (étape 25). |
| « S4 » | Simplification S4 du 23/11 : le Marché fermé pendant le tour, réglage posé en prod. | Décision « S4 » du fichier d'état des écrans de séance (`docs/prompts/GL_ECRANS_DE_SEANCE_ETAT.md`) : les tablettes en surface « tableau », réglée par la décision 23 du prompt. Et étape S4 de l'addendum 4 : les sons du tour, issue du repère S4 de l'audit d'ambiance. |
| « S1 », « S2 », « S3 » | Simplifications du 23/11 : décisions 23 (un seul écran d'équipe), 25 (deux surfaces) et 24 (Relance retiré) du prompt. | Étapes S1 à S3 de l'addendum 2 (ancien lot S, le son). L'audit d'ambiance a aussi ses repères S1 à S4. |
| « D1 » à « D8 » | Repères de l'audit de la partie 16, hors dépôt. D1 = décision 17 du prompt, D3 = 19, D4 = 20, D7 = 21, D8 = 22. | D2 et D6 sont des textes par défaut posés par Claude (étape 22) ; D5 est reporté. Aucune étape ne porte ces noms. |
| Décision 34 | Du prompt : une question ne se répond ni par son indice ni par le dessin du plateau. | De l'addendum 4 : la direction artistique « un jeu de plateau qui s'anime ». |
| Décision 37 | Du prompt : question de case, une case, trois sous le voile, et la sonde. | De l'addendum 4 : l'oiseau se pose à chaque fouille et laisse une plume. |
| « 24 quinquies » | Du prompt : questions de zone et test « la réponse n'est pas dans l'indice », dite « 24 quinquies-Z ». | De l'addendum 4 : les rôles du tour s'échangent, dite « 24 quinquies-R ». |
| Numéros 28 à 35 | Décisions : 28 à 33 dans l'addendum 3, 34 et 35 dans l'addendum 4 (et 34 dans le prompt). | Étapes : 28 à 30 et 35 dans le prompt, 31 à 33 dans l'addendum 2. Sans rapport : l'étape 28 (docs du prof) n'applique pas la décision 28 (gel levé), l'étape 35 (la sonde) n'applique pas la décision 35 (rôles). |
| Étapes « 1 » à « 6 » | Du prompt (§ 5) : étapes 1 à 6 des décisions du 19/11. | De l'annexe C (réécriture de la documentation) : devenues C-doc-1 à C-doc-6. |
| « H1 » à « H5 » | Décisions H1 à H5 du prompt (page Histoire). | Étapes H1 à H4 du prompt. H5 n'a pas d'étape : elle s'applique dans H1, H2 et H3. |
| « V1 » à « V8 » | Positions de l'audit des questions de validation (V4a, V4b, V4c, V8…). | Étapes V1 à V6 de l'addendum 2 (ancien lot V). Sans rapport. |
| « A1 » à « A5 », « F1 » à « F11 » | Sections A1 à A5 de l'annexe A ; repères A1 à A5 de l'audit d'ambiance ; constats F1 à F11 de l'audit des écrans, cités par l'addendum 2. | Étapes A1 à A4 (ancien lot A) et F1 à F6 (ancien lot F) de l'addendum 4. Sans rapport. |
| « C1 »… et « annexe C » | Étapes C1 à C6 de l'addendum 3 : le copiste (ancien lot C). | Annexe C du prompt : la réécriture de la documentation (ancien lot 9). |
| « I1 » à « I10 » et « annexe I » | Décisions I1 à I10 de l'addendum 2. | Annexe I de l'addendum 2 (I.1, I.2…) : les textes des pages servies. |
| Migration `N+7` | Dans le prompt et l'addendum 1 : la sonde (ancien lot Q, étape 35). | Dans une première version de l'addendum 4 : la page des règles (rôles échangés), renommée `N+8`. |
