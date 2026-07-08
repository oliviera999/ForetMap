# Documentation de référence — ForetMap & Gnomes & Licornes

> **Public visé : administrateurs, professeurs et maîtres du jeu (MJ).**
> Aucune connaissance en programmation n'est nécessaire pour lire ces documents.

## À quoi sert ce dossier ?

Ce dossier est la **référence fonctionnelle** des deux applications du projet :

- **ForetMap** — l'application de gestion de la forêt comestible du Lycée Lyautey ;
- **Gnomes & Licornes (GL)** — le jeu pédagogique qui vit à côté de ForetMap.

Il poursuit trois objectifs, dans l'ordre :

1. **Faire l'état de l'existant** : décrire ce que les applications font _réellement_
   aujourd'hui, en français simple, sans jargon technique. Quand quelque chose est
   incohérent, confus ou inachevé, c'est signalé honnêtement (encadrés « ⚠️ Points
   d'attention »).
2. **Servir de base d'évolution** : ces documents sont le support de discussion pour
   améliorer les applications. **Toute modification apportée dans ces documents
   (par un professeur, un admin, un MJ) peut valoir demande de changement** : elle
   décrit le fonctionnement _souhaité_, que le code devra ensuite rejoindre.
3. **Devenir la documentation finale de référence** pour toute personne non codeuse
   qui veut comprendre et piloter le fonctionnel, le pédagogique et le ludique.

## Règle d'or : cette documentation est perpétuellement à jour

- Chaque évolution du code qui change ce que voit ou fait un utilisateur (élève,
  prof, joueur, MJ, admin) **doit être répercutée ici dans le même lot de travail**.
- Inversement, si un document décrit un comportement que le code ne fait pas (ou
  plus), c'est soit un bug à corriger, soit une évolution à implémenter — jamais un
  écart à laisser vivre.
- Convention d'écriture des écarts volontaires : marquer le passage avec
  **`🔧 À implémenter :`** suivi de la description du comportement souhaité. L'agent
  de développement traite ces marqueurs comme des demandes de changement.

## Sommaire

### ForetMap

| Document                                             | Contenu                                                               | Statut       |
| ---------------------------------------------------- | --------------------------------------------------------------------- | ------------ |
| [foretmap/presentation.md](foretmap/presentation.md) | Vue d'ensemble : but, publics, tour des fonctionnalités, rôles        | ✅ Rédigé    |
| foretmap/carte-et-zones.md                           | La carte, les zones, leur cycle de vie                                | 🔜 À rédiger |
| foretmap/plantes-et-biodiversite.md                  | Fiches plantes, pré-remplissage des espèces, identification par photo | 🔜 À rédiger |
| foretmap/taches-et-validation.md                     | Tâches, prise en charge par les élèves, validation par les profs      | 🔜 À rédiger |
| foretmap/eleves-et-comptes.md                        | Inscription, comptes élèves, gestion par les profs                    | 🔜 À rédiger |
| foretmap/visites-et-mascottes.md                     | Parcours de visite, mascottes                                         | 🔜 À rédiger |
| foretmap/stats-et-suivi.md                           | Statistiques, tableaux de bord, forum                                 | 🔜 À rédiger |

### Gnomes & Licornes (GL)

| Document                                 | Contenu                                                  | Statut       |
| ---------------------------------------- | -------------------------------------------------------- | ------------ |
| [gl/presentation.md](gl/presentation.md) | Vue d'ensemble : concept du jeu, rôles, tour des modules | ✅ Rédigé    |
| gl/roles-et-connexion.md                 | Joueur, invité, MJ, admin : qui peut faire quoi          | 🔜 À rédiger |
| gl/chapitres-et-progression.md           | Chapitres, déroulement d'une partie, progression         | 🔜 À rédiger |
| gl/carte-du-royaume.md                   | La carte du royaume et ses zones                         | 🔜 À rédiger |
| gl/economie-marche-sorts.md              | Monnaie, marché, sorts, récompenses                      | 🔜 À rédiger |
| gl/qcm-et-pedagogie.md                   | Les QCM, le lien avec le programme scolaire              | 🔜 À rédiger |
| gl/guide-du-mj.md                        | Guide pratique du maître du jeu (animation d'une séance) | 🔜 À rédiger |

_Les documents « à rédiger » sont produits au fur et à mesure ; le sommaire ci-dessus
peut évoluer (fusion, découpage, ajout) selon les besoins._

## Comment lire ces documents

- Chaque application a un **document de présentation générale** qui donne la vue
  d'ensemble et renvoie vers les documents spécifiques.
- Les encadrés **⚠️ Points d'attention** signalent l'existant problématique
  (incohérences, zones confuses, fonctions inachevées) — c'est volontaire, cela fait
  partie de l'état des lieux.
- Les marqueurs **🔧 À implémenter** signalent un comportement souhaité mais pas
  encore réalisé dans le code.
