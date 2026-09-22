# Périmètre de ForêtMap — description factuelle

> **Date d'établissement : 22 septembre 2026.** Document descriptif, destiné à être réutilisé
> hors du dépôt. Rédigé pour un lecteur non développeur.
>
> **Sources et méthode.** Tout ce qui suit a été établi en lisant le code, la configuration, la
> documentation du dépôt et l'historique Git complet (3 391 commits depuis le 18 mars 2026). Les
> chiffres d'usage proviennent d'une **copie anonymisée de la base de production** versionnée dans
> le dépôt (`sql/fixtures/foretmap-anonymise.sql.gz`, exportée vers le **17-20 septembre 2026**) :
> les volumes sont ceux de la production réelle à cette date, mais les contenus textuels (noms de
> personnes, libellés de zones) y sont remplacés, et le journal d'audit y est vidé.
> Les rares déductions non vérifiables sont signalées par la mention **_(hypothèse)_**.

---

## 1. En une phrase

ForêtMap est une plateforme web de gestion et de cartographie d'un jardin-forêt comestible
pédagogique, développée pour le Lycée Lyautey (Casablanca), qui regroupe sous un même socle
technique quatre applications distinctes : l'application de travail élèves/professeurs, un mode
visite grand public, un jeu pédagogique d'écologie pour le cycle 3, et un plan d'établissement
consultable sur téléphone.

---

## 2. Surfaces

Le dépôt sert **quatre applications publiques** plus un outil interne. Chacune est reconnue par
l'adresse web utilisée et possède ses propres pages, ses propres icônes d'installation sur
téléphone et, pour certaines, sa propre famille d'adresses techniques.

| Surface                      | Adresse                                                                      | Public visé                                                               | Mode d'accès                                                                                                                                                                 | État vérifié                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **ForêtMap**                 | `foretmap.olution.info` (adresse principale)                                 | Élèves, professeurs, personnels, visiteurs                                | Compte (identifiant ou e-mail + mot de passe, ou compte Google si un administrateur l'a autorisé — désactivé par défaut) ; entrée « Visiter en invité » possible sans compte | En service, c'est la surface la plus utilisée                    |
| **Gnomes & Licornes (G&L)**  | `gl.olution.info`                                                            | Élèves de cycle 3 (~9-12 ans) et leurs enseignants, qui animent la partie | Comptes joueurs propres au jeu ; les comptes enseignants de ForêtMap servent de comptes maître du jeu / administrateur ; mode invité activable                               | En service, mais usage encore très faible sur la période mesurée |
| **Plan Lyautey**             | `planlyautey.olution.info`                                                   | Élèves, familles, visiteurs, nouveaux personnels                          | Aucun compte, aucune donnée personnelle ; un mode « code d'accès » existe mais n'est pas activé                                                                              | En service                                                       |
| **Plan des personnels**      | `proflyautey.olution.info` et `stafflyautey.olution.info` (même application) | Personnels du lycée (enseignants, vie scolaire, intendance, agents)       | Connexion avec un compte portant l'un des profils autorisés ; un code partagé peut être ouvert en complément (désactivé par défaut)                                          | En service, mise en place la plus récente (17 septembre 2026)    |
| **Outil « packs mascotte »** | page technique du même serveur                                               | Personne chargée de préparer les mascottes                                | Outil de mise au point, non destiné aux utilisateurs finaux                                                                                                                  | Outil interne                                                    |

Les quatre applications publiques partagent le même serveur, la même base de données et une
bibliothèque d'affichage commune (le moteur de carte, les champs de formulaire, les encadrés).
Elles sont en revanche **cloisonnées** : une session ouverte sur le jeu ne donne accès à rien
dans ForêtMap, et réciproquement.

Le texte « À propos » affiché dans l'application la présente elle-même comme **une version bêta**,
avec une invitation à signaler les anomalies.

---

## 3. Cartes et espaces couverts

Sept fonds de plan sont enregistrés. Six sont publiés, un est retiré de la publication. Tous sauf
un sont **calés sur des coordonnées GPS**, ce qui permet à l'utilisateur de se situer sur le plan
et d'orienter la carte selon la boussole.

| Carte                                       | Ce qu'elle représente                                                                                         | Zones | Repères | Publiée                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----- | ------- | ----------------------------------- |
| **N³**                                      | L'espace du club / de la « salle aérée n³ », affiché par défaut aux élèves, aux professeurs et en mode visite | 14    | 9       | Oui (seule carte non calée GPS)     |
| **Forêt comestible**                        | Le jardin-forêt lui-même : le cœur historique du projet                                                       | 24    | 21      | Oui                                 |
| **Lycée Lyautey**                           | Le plan de l'établissement ; c'est la carte servie par le Plan Lyautey et le plan des personnels              | 36    | 44      | Oui                                 |
| **Complexe Nawal El Moutawakel (Beaulieu)** | Complexe sportif voisin                                                                                       | 15    | 12      | Oui                                 |
| **Plage des Sablettes**                     | Littoral et estran rocheux de Mohammedia                                                                      | 8     | 3       | Oui                                 |
| **Daya de Dar Bouazza**                     | Zone humide (daya) étudiée en sortie                                                                          | 13    | 4       | **Non** (retirée de la publication) |
| **Vallée Oued Melah (vers Dream Village)**  | Vallée fluviale                                                                                               | 8     | 2       | Oui                                 |

Soit **118 zones et 95 repères** au total. Chaque zone porte une description, des photos, une
plante en cours et son stade, un historique et des espèces associées ; chaque repère porte un
emoji, une note et des photos.

Un même lieu peut être affiché — ou masqué — indépendamment sur **quatre « surfaces » d'affichage** :
la carte de travail, la visite, le plan public et le plan des personnels. C'est ce mécanisme qui
permet au plan des personnels de montrer des lieux et des consignes que le plan public ne montre
pas.

Les quatre dernières cartes correspondent à des sites de sortie de terrain hors du lycée : le dépôt
contient des dossiers documentaires correspondants (études hydrologiques sur la daya de Dar
Bouazza, inventaire du littoral des Sablettes, panorama de l'Oued Mellah) _(hypothèse quant au
rattachement pédagogique exact : les libellés de zones sont anonymisés dans la copie consultée)_.

---

## 4. Modules fonctionnels

Sauf mention contraire, **tous les modules listés ci-dessous sont actifs** : la base de production
ne contient aucun réglage désactivant un module, tous les interrupteurs sont restés à leur valeur
par défaut (activée).

### ForêtMap

| Module                           | Ce qu'il permet                                                                                                                                                                                                                                                                                                                                                                                                      | Qui l'utilise                                                               | État                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Carte et zones**               | Consulter les plans, ouvrir la fiche d'une zone ou d'un repère ; côté professeur, dessiner les zones, placer les repères, gérer photos et historique                                                                                                                                                                                                                                                                 | Tous                                                                        | En service, cœur de l'application                                                 |
| **Tâches et projets**            | Le professeur crée des chantiers (arroser, désherber, pailler…) rattachés à une zone, avec niveau de danger, difficulté, échéances, tutoriels et référent ; l'élève s'y inscrit lui-même, réalise, puis marque « fait » avec commentaire et photo de preuve ; le professeur valide. Tâches récurrentes générées automatiquement les jours ouvrés scolaires ; import en masse ; propositions de tâches par les élèves | Élèves et professeurs                                                       | En service, le module le plus utilisé                                             |
| **Biodiversité / espèces**       | Catalogue de fiches plantes détaillées (noms, famille, habitat, cycle, comestibilité, besoins, photos, conseils). Deux aides à la saisie : pré-remplissage automatique depuis des bases naturalistes, et identification par photo                                                                                                                                                                                    | Professeurs (création), élèves (consultation, marquage « observé »)         | En service                                                                        |
| **Observations et carnet**       | L'élève marque une espèce comme observée et tient un carnet personnel (articles texte et photos, imports d'espèces, de termes de glossaire et de tutoriels appris)                                                                                                                                                                                                                                                   | Tout compte connecté ; consultable par les professeurs selon leur périmètre | En service, usage encore faible                                                   |
| **Tutoriels**                    | Fiches pratiques (arrosage, compostage…) liées aux tâches et aux zones, avec accusé de lecture                                                                                                                                                                                                                                                                                                                       | Élèves, professeurs                                                         | En service                                                                        |
| **Quiz**                         | Questions à choix multiples, catégorisées, rattachables aux espèces et aux tutoriels                                                                                                                                                                                                                                                                                                                                 | Élèves, professeurs                                                         | En service                                                                        |
| **Glossaire**                    | Vocabulaire du jardin, relié aux plantes, aux tutoriels et aux quiz                                                                                                                                                                                                                                                                                                                                                  | Élèves, professeurs                                                         | En service                                                                        |
| **Réseau trophique**             | Graphe interactif « qui mange qui / qui aide qui » entre les espèces                                                                                                                                                                                                                                                                                                                                                 | Élèves (consultation), professeurs (édition)                                | En service                                                                        |
| **Conditionnement pédagogique**  | Exiger la réussite d'un quiz avant de pouvoir marquer une ressource « apprise », avec seuils et délais de nouvelle tentative réglables                                                                                                                                                                                                                                                                               | Professeurs                                                                 | En service (activé, seuil : 3 bonnes réponses, 2 erreurs tolérées, 1 h d'attente) |
| **Visite**                       | Parcours de découverte grand public, distinct de la carte de travail : textes éditoriaux, médias, parcours fléchés, guidage « Y aller », mémorisation de ce qui a déjà été vu, mascottes animées                                                                                                                                                                                                                     | Visiteurs (même sans compte), élèves, familles                              | En service (104 lieux et 88 repères de visite publiés)                            |
| **Forum**                        | Fils de discussion avec réactions, images, signalements et modération, cloisonnables par groupe. Des commentaires contextuels peuvent aussi être attachés à une tâche, un projet ou une zone                                                                                                                                                                                                                         | Élèves, professeurs                                                         | Activé, mais **très peu utilisé**                                                 |
| **Statistiques**                 | Tableau de bord par élève et par statut de tâche, classement, progression, export tableur                                                                                                                                                                                                                                                                                                                            | Professeurs surtout ; l'accès des élèves est réglable                       | En service                                                                        |
| **Présence**                     | Indicateur « en ligne / vu récemment / hors ligne » affiché au personnel dans les écrans de suivi. **Ce n'est pas un appel ni un pointage**                                                                                                                                                                                                                                                                          | Professeurs et administrateurs                                              | En service                                                                        |
| **Groupes**                      | Classes, équipes, clubs, avec sous-groupes, responsables, périmètre et code de classe à saisir à l'inscription                                                                                                                                                                                                                                                                                                       | Professeurs, administrateurs                                                | En service (32 groupes, 520 rattachements)                                        |
| **Comptes et rôles**             | Rôles configurables avec permissions fines ; paliers d'élèves qui montent automatiquement avec le nombre de tâches validées ; import en masse ; prise en main temporaire d'un compte pour dépannage                                                                                                                                                                                                                  | Administrateurs, professeurs                                                | En service (16 rôles, 45 permissions élémentaires)                                |
| **Médiathèque, réglages, audit** | Bibliothèque d'images réutilisables, console de réglages par thème, journal des actions sensibles                                                                                                                                                                                                                                                                                                                    | Administrateurs                                                             | En service                                                                        |
| **Temps réel et notifications**  | Les validations, observations et messages apparaissent sans recharger la page ; rattrapage automatique si la connexion est coupée ; bandeau de nouvelle version non bloquant                                                                                                                                                                                                                                         | Tous                                                                        | En service                                                                        |

### Gnomes & Licornes

Jeu d'écologie pour le cycle 3, animé en classe par un maître du jeu. Il est construit autour du
« carnet de Sélène », une exploratrice dont les relevés d'espèces s'effacent : les élèves les
restaurent en apprenant à nommer le vivant. Un chapitre correspond à un biome.

Modules : carte du royaume (plateau de jeu avec zones, repères et mascottes d'équipe), écosystèmes
et biodiversité, glossaire scientifique, QCM (biomes et lore), feuillets narratifs à débloquer,
sortilèges, marché d'échange entre joueurs, forum, journal de partie, carnet personnel imprimable,
statistiques, habillage (mascottes, cadres d'image, marque). Presque chaque brique peut être
activée ou désactivée par l'administrateur ; des « profils de séance » appliquent une configuration
cohérente en un clic.

État : **en service, mais peu utilisé sur la période mesurée** (8 ouvertures d'application
comptabilisées en septembre 2026, contre 661 pour ForêtMap). Le contenu, lui, est substantiel :
7 chapitres, 276 fiches espèces, 931 questions de QCM biomes, 357 questions de QCM lore,
205 feuillets narratifs, 288 termes de glossaire, 31 sortilèges. Le socle narratif « les deux
peuples du seuil » est rédigé mais **reste à intégrer dans les contenus du jeu** — la documentation
du projet le signale explicitement.

### Les deux plans

Le Plan Lyautey ne comporte ni compte, ni tâche, ni progression : on ouvre, on cherche un lieu, on
s'y rend. Le plan des personnels est la même carte servie à un lecteur identifié, avec des lieux
supplémentaires et des compléments réservés sur les fiches. Les deux permettent la recherche
(insensible aux accents, avec synonymes), les parcours fléchés, la géolocalisation, l'orientation
boussole et l'installation sur l'écran d'accueil.

---

## 5. Briques liées

- **Gnomes & Licornes — dans ce dépôt.** Ce n'est pas un logiciel séparé : le jeu vit dans le même
  dépôt et la même base, mais il est isolé par trois moyens (une adresse propre, une famille
  d'adresses techniques propre, et un marquage des sessions qui empêche un jeton du jeu de servir
  ailleurs). Il représente aujourd'hui environ la moitié de la surface technique du dépôt. Les
  passerelles voulues : les comptes enseignants de ForêtMap servent de comptes maître du jeu, et un
  élève peut relier ses deux comptes.

- **Moodle (`olution.info`) — deux liens distincts, de maturité différente.**
  1. **L'annuaire des classes (en service).** ForêtMap lit les cohortes Moodle (une par classe,
     une par niveau, une pour le club) et s'aligne dessus : création des comptes nouveaux,
     reconnaissance des comptes existants sans doublon, création d'un groupe par cohorte,
     création d'une classe de jeu pour les sixièmes, désactivation (jamais suppression) des élèves
     partis. Toute synchronisation commence par une simulation obligatoire et peut être annulée ;
     ce que les professeurs ont fait à la main est signalé comme divergence, jamais écrasé. Ce lien
     est **activé** dans la base de production.
  2. **L'entrée depuis un cours par LTI 1.3 (présente, non activée).** Le code existe depuis le
     8 septembre 2026 et permet à un élève déjà connecté à Moodle d'arriver directement dans
     l'application depuis son cours. Le réglage correspondant est **désactivé par défaut et absent
     de la base consultée** : à la date de la copie, cette entrée n'était donc pas ouverte. Le code
     indique par ailleurs explicitement qu'il ne fait **ni remontée de notes vers Moodle, ni
     création de liens depuis Moodle** ; la documentation interne identifie ces deux mécanismes
     comme le principal chantier restant.

- **`yo.olution.info` — site WordPress d'origine des contenus du jeu.** Un outil d'import récupère
  les pages et l'identité visuelle de ce site pour alimenter Gnomes & Licornes. C'est une opération
  ponctuelle d'alimentation en contenu, pas une intégration permanente.

- **Mascottes.** Personnages animés qui accompagnent le visiteur (mode Visite) et représentent les
  équipes (jeu). Ce ne sont pas des images figées : chaque mascotte est un « pack » décrivant ses
  états d'animation, ses réactions aux actions de l'utilisateur et ses bulles de dialogue. Les
  professeurs les créent dans un studio intégré ; un outil de mise au point séparé existe.
  Comptage : 6 packs pour la visite, 3 pour le jeu. Un narrateur nommé « Olu », avec des portraits
  par expression, accompagne la visite guidée de prise en main.

- **IoT n³ — aucune trace.** Aucun capteur, aucune sonde, aucune télémétrie, aucun protocole de
  ce type n'existe dans le dépôt, ni dans la documentation, ni dans l'historique Git complet. Dans
  ce projet, « n³ » désigne le club et son espace : c'est le nom d'une carte, le nom du cours
  Moodle associé (« La salle aérée n³ »), le vocabulaire des rôles d'élèves (« n3beur », « n3boss »)
  et le logo (un arbre stylisé). La seule donnée capteur réellement utilisée est le **GPS du
  téléphone de l'utilisateur**, pour se situer sur les plans.

- **Farmflow — aucune trace.** Le mot n'apparaît nulle part : ni dans le code, ni dans la
  documentation, ni dans les 3 391 commits de l'historique. S'il s'agit d'un outil réellement
  utilisé par ailleurs, il est **entièrement extérieur** à cette plateforme et n'a aucun lien
  technique avec elle.

---

## 6. Paramétrage et transférabilité

**Ce qui est déjà configurable sans toucher au code :**

- **Les noms affichés.** Six réglages d'installation portent le nom du logiciel, le nom de
  l'établissement, le nom du jeu et leurs versions courtes. Un exemple figure dans la documentation
  du projet : installer pour un « Collège Jean Moulin » sous le nom « EdenMap » ne demande que
  trois lignes de configuration. Une installation **sans établissement** est prévue et valide.
- **L'identité visuelle** : huit couleurs, deux polices, un logo et un favicon, réglables depuis
  l'application. Par sécurité, un logo doit désigner un fichier déjà déposé dans l'application (une
  adresse extérieure est refusée).
- **Les modules** : chaque brique fonctionnelle s'active ou se désactive depuis les réglages.
- **Les rôles et permissions** : entièrement configurables, y compris les libellés des profils.
- **Les contenus** : cartes, zones, espèces, tutoriels, quiz, glossaire, chapitres du jeu — tout
  se saisit et s'importe depuis l'application.

**Ce qui reste attaché au Lycée Lyautey et demanderait une intervention :**

| Point                           | Nature de l'obstacle                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adresses des plans et du jeu    | Les deux plans et le jeu ne se déclenchent que sur des adresses commençant par `planlyautey.`, `proflyautey.`, `stafflyautey.` et `gl.` — c'est une modification technique courte, mais une modification |
| Carte du Plan                   | Le plan cherche une carte portant l'identifiant `lyautey` ; c'est un réglage à pointer sur la carte du nouvel établissement                                                                              |
| Icônes d'installation           | Les fichiers d'icônes livrés portent l'identité actuelle et sont à remplacer                                                                                                                             |
| Contenus semés                  | Zones, espèces, tutoriels et chapitres décrivent la forêt du Lycée Lyautey : il faut partir d'une installation vierge, pas d'une copie                                                                   |
| Données d'élèves                | Une base existante contient des données personnelles : elle ne doit jamais être recopiée d'un établissement à l'autre                                                                                    |
| Un seul établissement à la fois | L'application ne sait pas héberger plusieurs établissements dans une même installation ; un second établissement suppose une **installation séparée** (serveur et base propres)                          |
| Droits                          | Le dépôt est **propriétaire** (tous droits réservés à son auteur). Une installation pour un autre établissement suppose un **accord écrit**                                                              |

**En pratique, pour déployer ailleurs :** un serveur Node.js avec une base MySQL/MariaDB, les
adresses web correspondantes, les six réglages de marque, une reconstruction de l'application, le
remplacement des icônes, la saisie des contenus propres à l'établissement — et, si les plans et le
jeu sont souhaités, une courte adaptation du code de reconnaissance des adresses. Le lien Moodle et
la connexion Google sont optionnels et se configurent par réglages.

---

## 7. Historique

- **Premier commit : 18 mars 2026** (« Initial commit: ForetMap - Application de gestion de la
  forêt comestible »).
- **3 391 commits** au 22 septembre 2026, répartis sur six mois — activité continue, avec deux
  pics marqués en juin (940 commits) et en septembre (1 055).
- **346 numéros de version** enregistrés ; la version en cours est la **1.172.0**. Le rythme est
  celui de plusieurs livraisons par jour.

Jalons vérifiés :

| Date              | Jalon                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18 mars 2026      | Création du projet                                                                                                                                  |
| 20-21 mars 2026   | Abandon du prototype initial : passage à MySQL (contrainte de l'hébergement), puis à une véritable application React, et mises à jour en temps réel |
| 25-26 mars 2026   | Mode Visite, puis forum                                                                                                                             |
| 19 mai 2026       | Ajout de Gnomes & Licornes comme second produit du dépôt — la rupture la plus importante du projet                                                  |
| 17 juin 2026      | Quiz et réseau trophique                                                                                                                            |
| 3 septembre 2026  | Plan Lyautey (troisième produit)                                                                                                                    |
| 8 septembre 2026  | Raccordement à Moodle : annuaire des classes, puis entrée depuis un cours (LTI)                                                                     |
| 11 septembre 2026 | Clôture officielle du cycle 1.x : 537 notes de version figées, couvrant cinq mois et demi                                                           |
| 17 septembre 2026 | Plan des personnels (quatrième produit) et extraction des noms de marque hors du code, pour rendre l'installation transférable                      |

Deux évolutions de fond, lisibles dans l'historique : la sécurité est passée d'un « code
professeur » vérifié côté navigateur à un système de rôles et permissions relus en base à chaque
requête (l'ancien mécanisme est **supprimé**) ; et l'application a cessé d'être autonome pour se
raccorder à l'annuaire de l'établissement.

**Échelle technique actuelle :** environ 278 000 lignes de code applicatif réparties sur
1 520 fichiers, 671 adresses d'API, 171 tables de base de données, 257 scripts de migration, et
environ 890 fichiers de tests automatisés (serveur, interface, parcours de bout en bout).

---

## 8. Chiffres d'usage agrégés

Relevés sur la copie anonymisée de la production (état au 17-20 septembre 2026). **Aucune donnée
nominative.**

**Comptes — 483 au total, tous actifs :** 463 comptes élèves et 20 comptes personnels.
Répartition par profil principal :

| Profil                                                                                 | Nombre |
| -------------------------------------------------------------------------------------- | ------ |
| Visiteur (compte non encore rattaché à une classe)                                     | 431    |
| Élèves à un palier de progression (« n3beur » bébé, novice, avancé, chevronné, expert) | 33     |
| Prof de classe                                                                         | 14     |
| Responsable pédagogique forêt (« n3boss »)                                             | 2      |
| Administrateur                                                                         | 2      |
| Autres profils                                                                         | 1      |

La proportion écrasante de « visiteurs » s'explique par la date du relevé : **420 comptes sur 483
ont été créés en septembre 2026**, à la rentrée, et attendaient leur rattachement à une classe.
386 comptes avaient été vus dans les trente jours précédant le relevé.

**Contenus :**

| Élément                                      | Nombre         |
| -------------------------------------------- | -------------- |
| Cartes                                       | 7 (6 publiées) |
| Zones / repères                              | 118 / 95       |
| Photos de zones                              | 50             |
| Fiches plantes et espèces (ForêtMap)         | 534            |
| Relations du réseau trophique                | 323            |
| Termes de glossaire / relations entre termes | 324 / 655      |
| Questions de quiz                            | 650            |
| Tutoriels                                    | 20             |
| Lieux de visite publiés (zones / repères)    | 104 / 88       |
| Groupes / rattachements d'élèves à un groupe | 32 / 520       |
| Catégories de lieux                          | 24             |
| Packs mascotte (visite / jeu)                | 6 / 3          |

**Activité :**

| Indicateur                                   | Valeur                                                           |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Tâches créées                                | 94, dont **79 validées**, 13 disponibles, 1 en cours, 1 en pause |
| Affectations d'élèves à une tâche            | 110                                                              |
| Espèces marquées comme observées             | 38                                                               |
| Lectures de tutoriels enregistrées           | 17                                                               |
| Tentatives de quiz                           | 69                                                               |
| Articles de carnet personnel                 | 2                                                                |
| Fils de forum / messages                     | 2 / 4                                                            |
| Joueurs du jeu / classes / équipes / parties | 66 / 8 / 9 / 4                                                   |

**Fréquentation mesurée** (le compteur d'usage anonyme n'existe que depuis le 4 septembre 2026 ;
période couverte : 4 → 17 septembre) : 661 ouvertures de ForêtMap et 1 186 ouvertures d'onglet ;
63 ouvertures du Plan, 57 fiches de lieu consultées, 42 guidages « Y aller » ; 8 ouvertures du jeu.

**Lecture de ces chiffres.** Le module tâches est celui qui vit réellement (79 validations). La
biodiversité et la pédagogie sont richement **alimentées** mais encore peu **consommées** par les
élèves. Le forum et le carnet d'observation sont installés mais quasiment inutilisés. Le jeu est
prêt côté contenu et n'a pas encore été joué à l'échelle. Ces valeurs sont un instantané de
rentrée : la période mesurée précède immédiatement le démarrage des activités de l'année.

---

## 9. Limites connues

Ce qui n'existe pas encore, ou pas complètement, au 22 septembre 2026 :

1. **Le lien Moodle n'est pas complet.** L'entrée depuis un cours existe mais n'est pas activée ;
   surtout, il n'y a **ni remontée des résultats vers Moodle**, ni création de liens depuis un
   cours Moodle. Résultat : quiz, forum, glossaire, tutoriels et calendrier sont réimplémentés
   dans l'application alors que Moodle les propose nativement. La documentation interne chiffre
   cette duplication à environ **20 % du code** et identifie sa réduction comme le principal
   chantier restant.
2. **Une seule installation par établissement.** Aucun cloisonnement multi-établissements ; servir
   un second lycée suppose une installation entièrement séparée.
3. **Les adresses des plans et du jeu sont figées dans le code.** Elles doivent être reconnues par
   leur préfixe exact — dernier point matériel bloquant un déploiement ailleurs.
4. **Un seul mainteneur.** La documentation du projet nomme ce risque comme dominant : la surface
   fonctionnelle croît plus vite que la capacité de maintenance, et personne ne reprendrait
   l'ensemble en l'état.
5. **Hébergement contraint.** Une seule instance serveur sur un hébergement mutualisé ; le temps
   réel fonctionne en mode dégradé (interrogation périodique plutôt que connexion permanente).
   L'application est conçue pour encaisser l'indisponibilité du serveur sans perdre l'écran affiché,
   ce qui est un aveu de la contrainte.
6. **Le récit du jeu n'est pas déployé dans les contenus.** Le socle narratif est écrit, mais le
   travail de mise en scène dans les chapitres, feuillets et questions reste à faire.
7. **Plusieurs modules sont installés mais pas adoptés** : forum, carnet d'observation, commentaires
   contextuels, marché du jeu (aucun échange enregistré).
8. **Pas d'application mobile native** : les quatre applications sont des sites web installables sur
   l'écran d'accueil, avec un mode hors ligne limité à une page d'attente.
9. **Pas de fonctions de vie scolaire** : le module « présence » n'est qu'un indicateur de connexion,
   et l'application ne gère ni appel, ni absences, ni notes, ni bulletins.
10. **Pas de capteurs ni de mesures automatisées** dans le jardin (température, humidité, pluviométrie,
    arrosage) : toute donnée de terrain est saisie à la main ou photographiée.
11. **Des points de sécurité restent ouverts** sur la gestion des images (suppression et contrôle
    d'accès), explicitement suivis dans le registre interne d'arbitrage.
