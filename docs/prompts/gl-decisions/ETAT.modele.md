# Chantier G&L « décisions » : état

Mémoire de l'orchestratrice. Écrit sur la branche `claude/gl-decisions-integration`, mis à jour après chaque fusion.
Ce fichier est le modèle : l'orchestratrice le copie en `ETAT.md` au départ (voir `ORCHESTRATION.md`, section 3).

## Départ

- Commit de `main` au départ : …
- Date et heure (Casablanca) : …
- Écarts avec le calage du kit (`d65dca4`, v1.263.7) : …
- Outils constatés : pousser une branche (oui / non) ; API REST (oui / non) ; MariaDB (oui / non) ; sous-agent
  `gl-decisions-lot` (oui / non, sinon repli employé).

## Lots

États : `à faire`, `en cours (lancé à …)`, `faite`, `fusionné (<commit>)`, `partielle`, `bloquée`.

| Lot | Couloir | Vague | Titre | Étapes | Attend | Banc | Migration | Charge | État |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `moteur-1` | moteur | 1 | Moteur du tour | 4 | — | seuils | — | moyenne | à faire |
| `moteur-2` | moteur | 1 | Les rôles du tour s'échangent | 3 | `moteur-1`, `contenu-1`, `contenu-2` | seuils | mig-regles-roles (ex N+8) | moyenne | à faire |
| `moteur-3` | moteur | 1 | Escalier et règles de séance | 4 | `moteur-2`, `contenu-2`, `ecrans-1` | seuils | mig-relance (ex N+3, seulement si l'import ne suffit pas) | forte | à faire |
| `moteur-4` | moteur | 1 | La question de case récompensée et la sonde | 3 | `moteur-3`, `ecrans-2` | seuils | mig-cases-question (ex N+2) ; mig-sonde (ex N+7) | forte | à faire |
| `moteur-5` | moteur | 1 | Trame, Lumière, appareils | 4 | `moteur-4` | seuils | mig-lumiere-trame (ex N+1) | moyenne | à faire |
| `ecrans-1` | ecrans | 1 | Portes et surfaces, bilan Team Spirit, onglets des biomes, message d'état | 6 | — | fumée | — | moyenne | à faire |
| `ecrans-2` | ecrans | 1 | L'erreur d'Olu visible, la question sans sa réponse visible | 4 | `ecrans-1`, `moteur-1` | fumée | — | moyenne | à faire |
| `ecrans-3` | ecrans | 1 | Les mascottes sautent de case en case | 5 | `ecrans-2` | fumée | — | moyenne | à faire |
| `ecrans-4` | ecrans | 1 | Au tableau, un seul écran d'équipe | 7 | `ecrans-3`, `moteur-4` | seuils | — | forte, reprise prévue | à faire |
| `ecrans-5` | ecrans | 2 | Le son : la projection chante | 3 | `ecrans-4` | fumée | — | légère | à faire |
| `ecrans-6` | ecrans | 2 | Les mots du voyage à l'écran, « Mon sac », la visite d'Olu, le fond du plateau | 4 | `ecrans-5`, `contenu-2` | fumée | — | moyenne | à faire |
| `ecrans-7` | ecrans | 2 | La table de jeu I : matières, tablette d'équipe, gemmes, typographie, barre | 5 | `ecrans-6`, `contenu-6` | fumée | — | forte | à faire |
| `ecrans-8` | ecrans | 2 | La table de jeu II : cinq onglets, « Mon sac » en deux états, surcouches, projection | 4 | `ecrans-7`, `contenu-6` | fumée | — | forte, reprise prévue | à faire |
| `ecrans-9` | ecrans | 2 | Le plateau : symboles gravés, figurines, voile qui pâlit, fil doré | 5 | `ecrans-8` | fumée | — | moyenne | à faire |
| `ecrans-10` | ecrans | 2 | La fouille et l'oiseau | 6 | `ecrans-9` | fumée | — | moyenne | à faire |
| `ecrans-11` | ecrans | 2 | Les moments forts et les sons du tour | 5 | `ecrans-10` | fumée | — | moyenne | à faire |
| `contenu-1` | contenu | 1 | Catalogues du tour : erreurs d'Olu, péripéties, retours, questions de lecture, mots du voyage | 6 | — | fumée | — | forte | à faire |
| `contenu-2` | contenu | 1 | Pistes de zone, badges, Passeur, textes d'écran, pseudo de la Lettre | 6 | `contenu-1` | fumée | — | moyenne | à faire |
| `contenu-3` | contenu | 1 | Page Histoire : lue par une question, délai annoncé, textes, illustrations | 4 | `contenu-2` | fumée | mig-histoire (ex N+4) | forte, reprise prévue | à faire |
| `contenu-4` | contenu | 1 | Carnet de Sélène et notes du copiste : les données | 3 | `contenu-3` | fumée | mig-copiste-carnet (ex N+6) | forte | à faire |
| `contenu-5` | contenu | 2 | Lexique du voyage, pages servies, vitrine, « +1 » du journal, traces de passage | 7 | `contenu-4`, `ecrans-4`, `ecrans-6` | fumée | mig-pages-servies (remplace N+5 : base neuve et « Mon sac ») | forte | à faire |
| `contenu-6` | contenu | 2 | Les marges du copiste | 5 | `contenu-5` | fumée | — | forte | à faire |
| `fin-1` | fin | 3 | Décisions consignées et règles v4 | 5 | tous les lots des vagues 1 et 2 | complet | — | moyenne | à faire |
| `fin-2` | fin | 3 | Docs de référence, docs du prof, skills, vérifications complètes | 4 | `fin-1` | complet | — | forte, reprise prévue | à faire |

Sessions de lot lancées : 0 sur 24. Reprises lancées : 0 sur 8.

## Vagues

| Vague | Lots fusionnés | PR vers `main` | Commit de fusion | Version de `main` après | Version servie en prod |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 / 13 | — | — | — | — |
| 2 | 0 / 9 | — | — | — | — |
| 3 | 0 / 2 | — | — | — | — |

## Migrations (étiquette → fichier)

| Étiquette | Lot | Fichier dans l'intégration | Fichier sur `main` |
| --- | --- | --- | --- |

## Mesures de départ du banc

(tableau rendu par le sous-agent de la section 3 de `ORCHESTRATION.md`)

## Journal des fusions

| Heure | Lot | Commit | Banc | Remarque |
| --- | --- | --- | --- | --- |

## Pour Oliv (rassemblé depuis les rapports de lot)

### À relire

### À faire entre deux vagues

### Alertes de banc et lots bloqués
