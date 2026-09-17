# Audits datés — index et convention

Les fichiers `docs/AUDIT_*.md` sont des **instantanés** (constats à une date, décisions,
pistes). Ils ne remplacent **pas** la documentation vivante :

| Vérité opérationnelle                         | Emplacement                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Contrat HTTP / réglages                       | [`docs/API.md`](../API.md)                                                  |
| Exploitation / secrets / cron                 | [`docs/EXPLOITATION.md`](../EXPLOITATION.md), [`CRONTAB.md`](../CRONTAB.md) |
| Développement local                           | [`docs/LOCAL_DEV.md`](../LOCAL_DEV.md)                                      |
| Feuille de route évolutive                    | [`docs/EVOLUTION.md`](../EVOLUTION.md)                                      |
| Référence fonctionnelle (admins / profs / MJ) | [`docs/reference/`](../reference/README.md)                                 |

Les audits **restent dans** `docs/` (chemins historiques stables). Ce dossier
`docs/audits/` ne contient que l’**index** : on ne déplace pas les fichiers, pour ne pas
casser les liens existants.

## Convention (à respecter)

1. **Ne pas réécrire** un audit daté pour le faire coller au code d’aujourd’hui — on fausse
   l’histoire.
2. **Chantier encore ouvert** (spécification + code en cours) : uniquement un **bandeau /
   tableau de statut** en tête, et les sections « terrain » à remplir après mesure.
3. **Constat traité** : marquer « Traité » (correctif + tests) **sans** effacer le constat
   d’origine.
4. **Audit remplacé** : garder le fichier ; le **point d’entrée** est le consolidé (voir
   ci-dessous).
5. **Alignement doc ↔ code** d’un lot : mettre à jour `API.md` / `EXPLOITATION` /
   `docs/reference/` / `CHANGELOG` — **pas** les vieux audits hors chantier ouvert.
6. **Pas de suppression** sans décision explicite : les audits documentent des arbitrages.

## Points d’entrée (à ouvrir en premier)

| Document                                                                                          | Rôle                                                                                                                                                | Statut                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`AUDIT_STABILITE_PERF_2026-09.md`](../AUDIT_STABILITE_PERF_2026-09.md)                           | Charge / stabilité serveur (ForetMap + GL) — **consolidé**                                                                                          | Entrée pour charge / perf                                                                                                                            |
| [`AUDIT_MOODLE_IDENTITES_2026-09.md`](../AUDIT_MOODLE_IDENTITES_2026-09.md)                       | Lien Moodle : **spécification de chantier** (annuaire + LTI) + bandeau d’état dépôt                                                                 | Chantier ouvert (M4 terrain, 21.7)                                                                                                                   |
| [`AUDIT_COMPTES_2026-09.md`](../AUDIT_COMPTES_2026-09.md)                                         | Identités unifiées ForetMap × GL (préalable Moodle)                                                                                                 | Référence comptes                                                                                                                                    |
| [`AUDIT_CHARGE_BIODIVERSITE_2026-09.md`](../AUDIT_CHARGE_BIODIVERSITE_2026-09.md)                 | Pic d’ouverture listes / biodiversité — complète la stabilité                                                                                       | Constats encore signalés ouverts                                                                                                                     |
| [`AUDIT_BRANCHES_2026-09.md`](../AUDIT_BRANCHES_2026-09.md)                                       | Passe de fusion / triage des branches (`moodle-sync` + `cursor/*`)                                                                                  | Instantané 8 sept. 2026                                                                                                                              |
| [`AUDIT_EVOLUTION_V1_V2_2026-09.md`](../AUDIT_EVOLUTION_V1_V2_2026-09.md)                         | Évolution v1.0.0 → v1.151.3 et arbitrage « poser une V2 ? »                                                                                         | Instantané 9 sept. 2026                                                                                                                              |
| [`AUDIT_CODE_2026-09-13.md`](../AUDIT_CODE_2026-09-13.md)                                         | Audit du code (bugs, incohérences, doublons mesurés, perf / charge) — base réelle                                                                   | À traiter (13 sept. 2026)                                                                                                                            |
| [`AUDIT_NAVIGATION_IPHONE_2026-09.md`](../AUDIT_NAVIGATION_IPHONE_2026-09.md)                     | Navigation iPhone / Apple (ForetMap, GL, Plan) — safe-area, bottom-nav, filet e2e                                                                   | Instantané 14 sept. 2026                                                                                                                             |
| [`AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md`](../AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md)             | UI/UX de la navigation sur `planlyautey.olution.info` — recherche neutralisée, carte gelée, entrées absentes                                        | 15 constats traités + N16 (16 sept. 2026)                                                                                                            |
| [`AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md`](../AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md)           | Deuxième passe navigation Plan Lyautey : recouvrements (commandes de carte, lieu ouvert, barre de parcours, guidage) mesurés sur le bundle déployé  | 16 sept. 2026 — 3 bloquants + B4/B5 + G1/G3 **traités** (§9), G2/G4/G5 ouverts                                                                       |
| [`AUDIT_UX_GESTION_UTILISATEURS_2026-09.md`](../AUDIT_UX_GESTION_UTILISATEURS_2026-09.md)         | UI/UX de l'onglet « Profils & utilisateurs » et de la fiche utilisateur admin                                                                       | Instantané 16 sept. 2026 — **entièrement traité** (5 constats + P1–P18)                                                                              |
| [`AUDIT_RESEAU_TROPHIQUE_DENSITE_2026-09-16.md`](../AUDIT_RESEAU_TROPHIQUE_DENSITE_2026-09-16.md) | Réseau trophique : densité d'affichage mesurée, options d'isolement, sélection multiple, niveaux de consommateurs, disposition par défaut           | Instantané 16 sept. 2026 — **arbitrages proposés**, lots F1–F5 à ouvrir                                                                              |
| [`AUDIT_UI_2026-09-16.md`](../AUDIT_UI_2026-09-16.md)                                             | UI transverse : bugs d'accessibilité des surcouches, association des champs, tokenisation de la couleur                                             | Instantané 16 sept. 2026 — lot A traité, lots B/C/D ouverts                                                                                          |
| [`AUDIT_UI_FORMULAIRES_ONGLETS_2026-09.md`](../AUDIT_UI_FORMULAIRES_ONGLETS_2026-09.md)           | UI : apparence des champs, des listes déroulantes et des barres d'onglets (six rendus de `<select>`, quatre barres d'onglets, classes CSS fantômes) | Instantané 17 sept. 2026 — **champs et onglets traités**, surfaces / tableaux / libellés ouverts                                                     |
| [`AUDIT_ENVIRONNEMENT_TESTS_2026-09-16.md`](../AUDIT_ENVIRONNEMENT_TESTS_2026-09-16.md)           | Environnement d'exécution des sessions Claude Code & CI GitHub — ce qui est testable, à quel coût, et l'état réel de la suite e2e                   | Instantané 16 sept. 2026 — amorçage et anonymisation livrés, P1–P3 ouverts                                                                           |
| [`AUDIT_CHARGE_VOLUMETRIE_REELLE_2026-09-17.md`](../AUDIT_CHARGE_VOLUMETRIE_REELLE_2026-09-17.md) | Charge des listes rejouée sur la volumétrie de production (fixture anonymisé) — poids réels, N+1, campagne Artillery                                | Instantané 17 sept. 2026 — **infirme** l'alerte « 912 Ko », confirme le correctif de septembre ; § 7 **traité** (e2e en configuration de production) |
| [`AUDIT_STRATEGIE_PLATEFORME_2026-09.md`](../AUDIT_STRATEGIE_PLATEFORME_2026-09.md)               | Arbitrage construire / déléguer / remplacer : part générique du code, briques délégables à Moodle, charte du non-développement                      | Instantané 16 sept. 2026 — **cadrage**, N1–N4 à ouvrir                                                                                               |
| [`AUDIT_PARCOURS_2026-09-17.md`](../AUDIT_PARCOURS_2026-09-17.md)                                 | Deuxième passe « parcours » : garde par surface (`staff` / `map`), reprise d'un parcours quitté, rang d'affichage, mode parcours en double          | Instantané 17 sept. 2026 — **entièrement traité** (7 constats : garde par surface, reprise, slug, rang, unification du mode, détails, affichage)     |

## Chantiers / specs encore utiles comme consigne

Ces documents mélangent parfois audit et spécification ; on y touche seulement pour le
**statut** ou les sections « à mesurer ».

| Document                                                                    | Sujet                            |
| --------------------------------------------------------------------------- | -------------------------------- |
| [`AUDIT_MOODLE_IDENTITES_2026-09.md`](../AUDIT_MOODLE_IDENTITES_2026-09.md) | Sync Moodle + LTI 1.3            |
| [`AUDIT_CONVERGENCE_APPS_2026-09.md`](../AUDIT_CONVERGENCE_APPS_2026-09.md) | Convergence multi-produits       |
| [`AUDIT_PLAN_LYAUTEY_2026-09.md`](../AUDIT_PLAN_LYAUTEY_2026-09.md)         | Cadrage Plan Lyautey             |
| [`AUDIT_VALIDATION_QUIZ_2026-09.md`](../AUDIT_VALIDATION_QUIZ_2026-09.md)   | Validation ressources par quiz   |
| [`AUDIT_FEUILLETS_ACCES.md`](../AUDIT_FEUILLETS_ACCES.md)                   | Feuillets GL — accès / obtention |
| [`AUDIT_SORTILEGES.md`](../AUDIT_SORTILEGES.md)                             | Sortilèges GL — chaîne d’effet   |

## Historique (figé — consultation seulement)

Ne pas les « corriger » pour l’état actuel du code. Les lire pour le contexte d’une
décision passée.

### Charge / stabilité (sous le consolidé)

| Document                                                                | Note                             |
| ----------------------------------------------------------------------- | -------------------------------- |
| [`AUDIT_CHARGE_SERVEUR_2026-08.md`](../AUDIT_CHARGE_SERVEUR_2026-08.md) | Régime nominal — pistes traitées |
| [`AUDIT_CHARGE_ET_BUGS_2026-08.md`](../AUDIT_CHARGE_ET_BUGS_2026-08.md) | Cas dégradés — constats traités  |

### Transversaux / code / BDD

| Document                                                                  |
| ------------------------------------------------------------------------- |
| [`AUDIT_GENERAL_2026-06.md`](../AUDIT_GENERAL_2026-06.md)                 |
| [`AUDIT_GENERAL_2026-08.md`](../AUDIT_GENERAL_2026-08.md)                 |
| [`AUDIT_GENERAL_2026-08-26.md`](../AUDIT_GENERAL_2026-08-26.md)           |
| [`AUDIT_CODE_2026-07.md`](../AUDIT_CODE_2026-07.md)                       |
| [`AUDIT_OPTIMISATION.md`](../AUDIT_OPTIMISATION.md)                       |
| [`AUDIT_BDD_2026-08.md`](../AUDIT_BDD_2026-08.md)                         |
| [`AUDIT_BUGS_2026-07.md`](../AUDIT_BUGS_2026-07.md)                       |
| [`AUDIT_BUGS_INCOHERENCES.md`](../AUDIT_BUGS_INCOHERENCES.md)             |
| [`AUDIT_REFACTORING_APP_2026-08.md`](../AUDIT_REFACTORING_APP_2026-08.md) |
| [`AUDIT_APP_ET_JEU_2026-08.md`](../AUDIT_APP_ET_JEU_2026-08.md)           |

### ForetMap — domaines

| Document                                                                                        |
| ----------------------------------------------------------------------------------------------- |
| [`AUDIT_ARCHIVAGE_TACHES_2026-08.md`](../AUDIT_ARCHIVAGE_TACHES_2026-08.md)                     |
| [`AUDIT_ECHEANCES_2026-09.md`](../AUDIT_ECHEANCES_2026-09.md)                                   |
| [`AUDIT_GATING_2026-08.md`](../AUDIT_GATING_2026-08.md)                                         |
| [`AUDIT_GLOSSAIRE_FORETMAP_2026-08.md`](../AUDIT_GLOSSAIRE_FORETMAP_2026-08.md)                 |
| [`AUDIT_GEOLOCALISATION_2026-09.md`](../AUDIT_GEOLOCALISATION_2026-09.md)                       |
| [`AUDIT_ICONES_FLOTTANTES_2026-08.md`](../AUDIT_ICONES_FLOTTANTES_2026-08.md)                   |
| [`AUDIT_MASCOTTES_2026-08.md`](../AUDIT_MASCOTTES_2026-08.md)                                   |
| [`AUDIT_PARCOURS_2026-09.md`](../AUDIT_PARCOURS_2026-09.md)                                     |
| [`AUDIT_PARCOURS_2026-09-17.md`](../AUDIT_PARCOURS_2026-09-17.md)                               |
| [`AUDIT_PHOTOS_BIODIVERSITE.md`](../AUDIT_PHOTOS_BIODIVERSITE.md)                               |
| [`AUDIT_PLAN_AFFICHAGE_2026-09.md`](../AUDIT_PLAN_AFFICHAGE_2026-09.md)                         |
| [`AUDIT_PLAN_AFFICHAGE_2026-09-13.md`](../AUDIT_PLAN_AFFICHAGE_2026-09-13.md)                   |
| [`AUDIT_RESEAU_TROPHIQUE_2026-09.md`](../AUDIT_RESEAU_TROPHIQUE_2026-09.md)                     |
| [`AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md`](../AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md) |
| [`PLAN_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md`](../PLAN_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md)   |
| [`AUDIT_ROLE_PROFESSEUR_2026-09.md`](../AUDIT_ROLE_PROFESSEUR_2026-09.md)                       |
| [`AUDIT_UI_HOMOGENEITE_2026-09.md`](../AUDIT_UI_HOMOGENEITE_2026-09.md)                         |
| [`AUDIT_UX_ELEVE.md`](../AUDIT_UX_ELEVE.md)                                                     |
| [`AUDIT_VISITE_UI_UX_2026-09.md`](../AUDIT_VISITE_UI_UX_2026-09.md)                             |

### Gnomes & Licornes

| Document                                                                            |
| ----------------------------------------------------------------------------------- |
| [`AUDIT_GATING_QCM_FEUILLETS_2026-08.md`](../AUDIT_GATING_QCM_FEUILLETS_2026-08.md) |
| [`AUDIT_UI_BOUTONS_GL_2026-08.md`](../AUDIT_UI_BOUTONS_GL_2026-08.md)               |

## Archivage physique (optionnel, plus tard)

Un déplacement vers `docs/audits/archive/` n’est **pas** fait ici : trop de liens internes
(`CLAUDE.md`, `EVOLUTION.md`, audits entre eux). Si un jour on archive physiquement :
déplacer + mettre à jour les liens en **un seul lot**, sans réécriture du contenu.
