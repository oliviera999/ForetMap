---
name: gl-contenu-science
description: Écrire ou relire un contenu scientifique de Gnomes & Licornes pour des élèves de 6e (questions de case, retours de QCM, indices de chasse, défis, réseaux trophiques de la Trame) — niveau de langue, exactitude, sens des flèches « est mangé par », rôles trophiques, contrôle contre gl_species. À lire avant de rédiger ou de corriger toute question, tout retour, tout indice, tout lien d'un réseau ou toute carte de défi.
---

# Contenu scientifique pour des 6e

Le public : des élèves de 11 ans, cycle 3. Le contenu doit être **vrai**, **court** et
**intéressant**. Garde-fous de ton : skill `gl-tenir-garde-fous`.

## Une question part d'une curiosité

Jamais d'un nom à réciter. Étalon : les 40 questions de `data/gl/tenir/questions-vives.json`.

| À faire                                                               | À éviter                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| Un record, une astuce, une idée reçue, un « pourquoi », un « tu es… » | Une famille, un nom latin, une date, une définition  |
| Une phrase, un seul fait, des mots de 6e                              | Deux questions en une, une négation dans l'énoncé    |
| Quatre choix plausibles, de longueur proche                           | Un choix farfelu, une bonne réponse deux fois longue |
| Une explication qui apprend quelque chose, même à qui a juste         | « Non », « c'est l'inverse » sans dire pourquoi      |

- Les questions de taxonomie (« À quelle famille appartient… », « nom scientifique ») sont
  hors du tirage des parties (`gl_qcm_questions.usage_tenir = 0`) : ne pas en écrire de nouvelles.
- Un retour de mauvais choix dit **ce qui est vrai** pour ce choix, sans « Non » : l'écran
  écrit « Pas encore. » devant. Le retour de la bonne lettre reste vide (`feedback_correct` sert).
- Un indice de chasse est une énigme (« Là où… ») sur un fait observable, sans nom d'espèce,
  120 caractères au plus.

## Écrire pour des 6e

- Phrases de 15 à 20 mots au plus, sujet-verbe-complément, présent de l'indicatif.
- Un mot savant = une explication dans la même phrase (« en dormance : la graine attend »).
- Des ordres de grandeur parlants (« aussi lourd que deux voitures »), des unités usuelles.
- Pas de finalisme : un animal n'a pas un organe « pour » ; il « lui sert à ». Une plante
  « n'a pas peur », elle « profite de la lumière ».
- Aucune peur gratuite, aucun jugement sur un animal (« nuisible », « méchant »).

## Le sens des flèches

Une flèche va **de celui qui est mangé vers celui qui mange** : elle se lit « est mangé par ».
C'est le sens de la matière et de l'énergie, celui du programme. `herbe → zèbre → lion`.
L'erreur classique est l'inverse (« le lion mange le zèbre » dessiné lion → zèbre) : le dire à
l'élève sans le gronder (« Regarde le sens : la flèche va de celui qui est mangé vers celui
qui mange »).

## Les rôles trophiques

- **Producteur** : une plante, une algue. Elle fabrique sa matière avec la lumière.
- **Consommateur** : tout animal qui mange du vivant ou du mort. Un herbivore, un carnivore,
  un omnivore… **et un charognard** (vautour, gypaète, hyène qui nettoie une carcasse) : c'est
  un consommateur au régime `charognard`, **pas un décomposeur**.
- **Décomposeur** : champignons, bactéries, et par extension les petites bêtes du sol
  (lombric) qui transforment la matière morte en éléments utiles aux plantes. Toute carte peut
  pointer vers un décomposeur. La carte générique `DEC` (« Décomposeurs du sol ») n'a pas
  d'espèce en base.
- Types de lien de `gl_species_interactions` : `herbivorie` si la ressource est un producteur,
  `predation` si c'est un consommateur, `decomposition` vers un décomposeur réel.
- Retirer un décomposeur ne fait rien « augmenter » : la matière morte s'accumule et les
  plantes manquent d'éléments.

## Contrôler contre la base

- Toute espèce citée existe dans `gl_species` (`species_code` `SP0xxx`) **et vit dans le biome
  nommé** (`biome_slug`). Régime et rôle se lisent dans `regime_alimentaire` et
  `role_ecologique` de la fiche : ne pas écrire un lien que la fiche contredit.
- Vérifier sur le corpus réel (base `_sim`, skill `gl-banc`) ou avec l'outil MCP
  `foretmap_get_species` / `gl_content_snapshot`. Un chiffre se vérifie à la source, pas de mémoire.
- Biomes joués : `jungle_afc`, `savane` (plateau 1) ; `sahara`, `foret_mediterraneenne` (2) ;
  `foret_caducifoliee`, `landes` (3) ; `taiga`, `toundra` (4).
- Après écriture : `findForbiddenString` (préfixes : « s'attaquer », « perdurer »,
  « poursuivre » sont refusés) et les tests `tests/content/gl-*.test.js`.

Relecture d'un contenu : sous-agent `gl-relecteur-science`.
