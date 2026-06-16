# Profils de gameplay GL

Les réglages de partie Gnomes & Licornes sont des **toggles indépendants** dans `gl_settings` (clés `gameplay.*`). L’admin peut les activer un par un dans **Réglages → Gameplay**, ou appliquer un **profil de séance** en un clic.

Référence technique : [GL_ARCHITECTURE.md](GL_ARCHITECTURE.md), [API.md](API.md) (`GET /api/gl/gameplay-settings`).

## Rappel : tours ≠ actions joueurs

| Toggle                            | Effet                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `gameplay.turns_enabled`          | Rotation cyclique des équipes (`POST /api/gl/games/:id/turn/next`), toast joueurs, restriction QCM / actions / sorts à l’équipe du tour |
| `gameplay.player_actions_enabled` | Modale « proposer une action » sur la carte, file d’attente MJ                                                                          |

Ces deux réglages sont **orthogonaux** : on peut avoir les tours sans actions joueurs (MJ seul), ou les actions sans tours (jeu libre).

## Profils prédéfinis (UI Réglages)

Les profils ne modifient **pas** les modules (`modules.*`) ni `gameplay.marker_question_retrigger` / `gameplay.zone_content_retrigger`. Activez séparément sortilèges, vitalité, forum, etc.

## Toggle `gameplay.zone_content_retrigger`

Contrôle l’affichage du popover texte/images quand une équipe entre ou traverse une zone royaume ayant du contenu (`popoverMarkdown` / `popoverImages`). Valeurs : `every_arrival`, `once_per_team`, `once_per_game` (défaut global). Une partie peut surcharger via `gl_games.zone_content_retrigger` (console MJ → édition de partie).

| Profil                    | Tours | Narration | Actions joueurs | Score | QCM MJ only | Sorts MJ only |
| ------------------------- | :---: | :-------: | :-------------: | :---: | :---------: | :-----------: |
| **Minimal**               |  off  |    off    |       off       |  off  |     off     |      off      |
| **MJ + tours**            |  on   |    on     |       off       |  off  |   **on**    |    **on**     |
| **MJ + tours interactif** |  on   |    on     |       off       |  off  |     off     |      off      |
| **Complet avec tours**    |  on   |    on     |       on        |  on   |     off     |      off      |
| **Complet libre**         |  off  |    off    |       on        |  on   |     off     |      off      |

### Cas d’usage

- **Minimal** — découverte de la carte : le MJ déplace les mascottes, pas d’alternance ni de flux collaboratif.
- **MJ + tours** — séance animée par le MJ : alternance visible, narration, joueurs **spectateurs** (pas de popover QCM ni d’assistant de sorts côté joueur).
- **MJ + tours interactif** — comme ci-dessus, mais l’équipe du tour répond aux QCM quand le MJ la place sur un repère question.
- **Complet avec tours** — jeu structuré : une équipe à la fois peut proposer des actions (validées par le MJ).
- **Complet libre** — toutes les équipes proposent en parallèle, sans rotation.

## Toggle `gameplay.qcm_mj_only`

Quand `true` :

- Les **joueurs** ne déclenchent plus le popover QCM à l’arrivée sur un repère.
- `POST .../present-question` et `POST .../qcm/answer` renvoient **403** pour un acteur joueur.
- Le **MJ** présente et valide depuis la carte (équipe sélectionnée + `teamId` dans le corps des requêtes).

## Console MJ (tours)

Avec `gameplay.turns_enabled=true` :

1. Onglet **Jeu en direct** → bloc **Tour de jeu** → **Tour suivant**.
2. L’équipe courante est indiquée sur les puces d’équipe (badge « Tour »).
3. Le MJ peut toujours déplacer **n’importe quelle** équipe via le sélecteur « Équipe active » (indépendant du tour).

## Fichiers source

- Profils UI : `src/gl/constants/gameplayPresets.js`
- Réglages admin : `src/gl/components/GLSettingsView.jsx`
- Lecture serveur : `lib/glSettings.js`
