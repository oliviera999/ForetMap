# Documentation de référence — ForetMap, Plan Lyautey & Gnomes & Licornes

> **Public visé : administrateurs, professeurs et maîtres du jeu (MJ).**
> Aucune connaissance en programmation n'est nécessaire pour lire ces documents.

## À quoi sert ce dossier ?

Ce dossier est la **référence fonctionnelle** des applications du projet :

- **ForetMap** — l'application de gestion de la forêt comestible du Lycée Lyautey ;
- **Gnomes & Licornes (GL)** — le jeu pédagogique qui vit à côté de ForetMap ;
- **Plan Lyautey** — le plan d'établissement consultable sur téléphone (avec ses variantes :
  plan des personnels, plan e-nov des innovations).

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

> Les audits techniques datés (`docs/AUDIT_*.md`) sont un autre public (historique /
> consignes de chantier). Index et convention : [`../audits/README.md`](../audits/README.md).

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

### Transverse

| Document                                                                         | Contenu                                                                                                                                        | Statut    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [INCOHERENCES.md](INCOHERENCES.md)                                               | Registre d'arbitrage : incohérences relevées, options de correction                                                                            | ✅ Rédigé |
| [exploitation/marque-et-domaines.md](exploitation/marque-et-domaines.md)         | Installer l'application pour un autre établissement : nom du logiciel, nom de l'établissement, ce qui reste attaché à Lyautey, droits d'usage  | ✅ Rédigé |
| [exploitation/modele-de-securite.md](exploitation/modele-de-securite.md)         | Qui voit quoi, sur quelle adresse : les six publics, les trois règles invariantes, ce que vous réglez vous-même                                | ✅ Rédigé |
| [exploitation/vos-donnees.md](exploitation/vos-donnees.md)                       | Page « Vos données » (information RGPD) des cinq applications : contenu, liens, contact DPO à renseigner, limites                              | ✅ Rédigé |
| [exploitation/durees-de-conservation.md](exploitation/durees-de-conservation.md) | Durées de conservation (comptes, journaux, adresses IP), départ d'un élève ou d'un personnel, purge planifiée : simulation, activation, alerte | ✅ Rédigé |

### ForetMap

| Document                                                                                       | Contenu                                                                                                                                                            | Statut    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| [foretmap/presentation.md](foretmap/presentation.md)                                           | Vue d'ensemble : but, publics, tour des fonctionnalités, rôles                                                                                                     | ✅ Rédigé |
| [foretmap/guide-du-prof.md](foretmap/guide-du-prof.md)                                         | **Guide pratique du n3boss** : avant / pendant / après la séance, gestes courants, problèmes fréquents — lisible par les n3boss dans l'application (page À propos) | ✅ Rédigé |
| [foretmap/carte-et-zones.md](foretmap/carte-et-zones.md)                                       | Les plans, les zones, les repères, leur cycle de vie                                                                                                               | ✅ Rédigé |
| [foretmap/plantes-et-biodiversite.md](foretmap/plantes-et-biodiversite.md)                     | Fiches plantes, pré-remplissage des espèces, identification par photo, observations signalées et validées                                                          | ✅ Rédigé |
| [foretmap/niveaux-pedagogiques-biodiversite.md](foretmap/niveaux-pedagogiques-biodiversite.md) | Niveaux Collège / Lycée / Université ; onglet Séances (A/B/C/D, séance libre, QR code, suivi par élève, prérequis, badges)                                         | ✅        |
| [foretmap/taches-tutoriels-et-validation.md](foretmap/taches-tutoriels-et-validation.md)       | Tâches, tutoriels, prise en charge par les élèves, validation profs                                                                                                | ✅ Rédigé |
| [foretmap/comptes-roles-et-groupes.md](foretmap/comptes-roles-et-groupes.md)                   | Inscription (code de classe), rôles et paliers (dont **Prof de classe**), groupes, gestion profs                                                                   | ✅ Rédigé |
| [foretmap/visite-et-mascottes.md](foretmap/visite-et-mascottes.md)                             | Parcours de visite grand public, mascottes                                                                                                                         | ✅ Rédigé |
| [foretmap/pedagogie-quiz-glossaire-reseau.md](foretmap/pedagogie-quiz-glossaire-reseau.md)     | Quiz, glossaire, réseau trophique, carnet d'observation                                                                                                            | ✅ Rédigé |
| [foretmap/stats-forum-et-suivi.md](foretmap/stats-forum-et-suivi.md)                           | Statistiques, classement, forum, notifications ciblées et liens directs, audit                                                                                     | ✅ Rédigé |
| [foretmap/rentree-moodle.md](foretmap/rentree-moodle.md)                                       | La rentrée avec Moodle : cohortes → groupes et classes G&L, simulation, conflits, entrée depuis un cours (déjà connecté)                                           | ✅ Rédigé |

### Plan Lyautey

| Document                                                   | Contenu                                                                                                                | Statut    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| [plan/presentation.md](plan/presentation.md)               | Le plan d'établissement sur téléphone : usage, surfaces d'affichage, alias, réglages                                   | ✅ Rédigé |
| [plan/plan-des-personnels.md](plan/plan-des-personnels.md) | Le plan réservé aux personnels (proflyautey / stafflyautey) : accès, lieux et compléments réservés, revue des surfaces | ✅ Rédigé |
| [plan/plan-enov.md](plan/plan-enov.md)                     | Le plan e-nov (enov) : lieux innovants mis en avant, catégorie-label « e-nov », texte e-nov, réglages et code d'accès  | ✅ Rédigé |

### Gnomes & Licornes (GL)

| Document                                                         | Contenu                                                                                                                    | Statut    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| [gl/presentation.md](gl/presentation.md)                         | Vue d'ensemble : concept du jeu, rôles, tour des modules                                                                   | ✅ Rédigé |
| [gl/lore-deux-peuples.md](gl/lore-deux-peuples.md)               | Socle narratif « Les deux peuples du seuil » : textes prêts à coller (page monde, feuillets, QCM lore)                     | ✅ Rédigé |
| [gl/roles-et-connexion.md](gl/roles-et-connexion.md)             | Joueur, invité, MJ, admin : qui peut faire quoi                                                                            | ✅ Rédigé |
| [gl/chapitres-et-progression.md](gl/chapitres-et-progression.md) | Chapitres, déroulement d'une partie, progression                                                                           | ✅ Rédigé |
| [gl/carte-du-royaume.md](gl/carte-du-royaume.md)                 | La carte du royaume, zones, repères et effets gnome/licorne                                                                | ✅ Rédigé |
| [gl/economie-marche-sorts.md](gl/economie-marche-sorts.md)       | Cœurs et gemmes, schéma des flux, marché, sortilèges                                                                       | ✅ Rédigé |
| [gl/qcm-et-pedagogie.md](gl/qcm-et-pedagogie.md)                 | QCM biomes et lore, conditionnement du « marquer appris »                                                                  | ✅ Rédigé |
| [gl/guide-du-mj.md](gl/guide-du-mj.md)                           | Guide pratique du MJ : avant/pendant/après + incidents courants                                                            | ✅ Rédigé |
| [gl/audit-mecaniques-2026-08.md](gl/audit-mecaniques-2026-08.md) | **Audit des mécaniques de jeu (23/08/2026) et options de finition** : état certifié, écarts corrigés, décisions à trancher | ✅ Rédigé |

_Le sommaire est complet ; il peut évoluer (fusion, découpage, ajout) selon les
besoins. Vos éditions directes dans ces documents (marqueur `🔧 À implémenter`)
valent demandes de changement._

> **Les documents GL se lisent et se modifient aussi depuis le jeu**, sans passer par les
> fichiers : onglet **Contenus → Doc de référence** (MJ et administrateurs). Le texte livré
> avec l'application sert de base ; une modification faite là s'applique pour tout le monde
> et peut être annulée (« Réinitialiser depuis le dépôt ») ou téléchargée en `.md`. Détail :
> [gl/guide-du-mj.md](gl/guide-du-mj.md).

> **Les documents ForetMap se lisent aussi depuis l'application**, en **lecture seule** :
> **Réglages → Aide & découverte → Doc de référence** (ou page **À propos**). Cet onglet est
> réservé aux comptes qui ont le droit de consulter les réglages (les administrateurs). Les
> **n3boss** ont, eux, accès au seul **Guide du prof**, depuis la page **À propos**. On ne peut pas y modifier un
> document : le texte livré avec l'application fait foi. Seuls les documents de la partie
> ForetMap y figurent : les documents du Plan Lyautey, ceux d'exploitation, le registre des
> incohérences et ce sommaire ne sont pas lisibles dans l'application.

## Comment lire ces documents

- Chaque application a un **document de présentation générale** qui donne la vue
  d'ensemble et renvoie vers les documents spécifiques.
- Les encadrés **⚠️ Points d'attention** signalent l'existant problématique
  (incohérences, zones confuses, fonctions inachevées) — c'est volontaire, cela fait
  partie de l'état des lieux.
- Les marqueurs **🔧 À implémenter** signalent un comportement souhaité mais pas
  encore réalisé dans le code.
