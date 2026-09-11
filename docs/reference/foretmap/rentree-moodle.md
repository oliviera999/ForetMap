# La rentrée avec Moodle — ForetMap et Gnomes & Licornes

> **Public de ce document : administrateurs, et professeurs pour la partie « ce que ça change
> pour ma classe ».** Il décrit ce que l'application fait aujourd'hui, sans jargon technique.
> Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Chaque rentrée, les classes du lycée existent déjà dans **Moodle** (la plateforme de cours de
l'établissement) sous forme de **cohortes** : une par classe (« 26#603 » pour la 6e 3 de
l'année 26), une pour les n3beurs (« 26#n3 »), une par niveau. Plutôt que de ressaisir les
élèves à la main ou de distribuer des codes de classe, ForetMap **lit ces cohortes** et
s'aligne dessus :

- les élèves nouveaux reçoivent un compte ;
- les élèves déjà connus sont **reconnus** (jamais dupliqués) ;
- chaque cohorte devient un **groupe** ForetMap (classe, niveau, club…) avec le bon rôle ;
- pour les sixièmes, une **classe Gnomes & Licornes** est créée avec un joueur par élève ;
- les élèves qui ont quitté l'établissement sont **désactivés** (jamais supprimés : leurs
  contributions restent).

Moodle est la **source de vérité** pour « qui est dans quelle classe ». ForetMap reste maître
de tout le reste : rôles fins, sous-groupes faits par les profs, équipes de jeu, tâches,
observations.

## Les trois principes à connaître

1. **Rien ne se fait sans regarder d'abord.** Toute synchronisation commence par une
   **simulation** qui liste ce qui se passerait. L'application réelle n'est possible qu'après
   une simulation réussie de moins de 24 heures **sur le même périmètre**.
2. **Rien n'est irréversible.** Une exécution réelle peut être **annulée** : les comptes créés
   sont désactivés, les groupes et classes créés retirés. Un compte n'est jamais supprimé par
   la synchronisation.
3. **Ce que les profs ont fait à la main est respecté.** Un élève ajouté dans un groupe par un
   professeur y reste, même si Moodle ne le connaît pas là ; l'application le **signale**
   comme divergence à trancher, elle ne le retire pas d'elle-même. Un compte ou un groupe peut
   être marqué **hors synchronisation** : plus rien ne le touche.

## Où ça se passe

Dans **Paramètres administrateur → onglet Moodle**. L'onglet s'ouvre sur l'**état du lien** :

- **Configuré** / **Non configuré** : le lien technique avec Moodle est-il en place ? (C'est un
  réglage de serveur, pas un bouton ; voir l'encadré « Pour les curieux ».)
- **Synchronisation activée** : case à cocher. Décochée, les simulations restent possibles mais
  aucune exécution réelle n'est acceptée.
- **Contrôler la connexion** : vérifie en quelques secondes que Moodle répond, que les
  autorisations nécessaires sont là, et liste les cohortes de l'année avec la politique qui
  s'applique à chacune.
- Dernier contrôle, dernière exécution, nombre de **conflits ouverts** et de **rapprochements
  en attente**.
- Si Moodle ne répond pas (site coupé, jeton invalide, ou limite de l'hébergeur), un **bandeau
  d'erreur** remplace la liste des cohortes. Le bandeau indique aussi, sous le message, **le geste
  à faire** côté Moodle (par exemple : autoriser une fonction manquante dans le service, ou
  vérifier le compte de service). Les réglages locaux (politiques, seuils, table chapitre → cours)
  restent éditables.

Puis, en sections repliables : **Synchroniser**, **Rapprochements en attente**, **Conflits à
trancher**, **Historique**, **Politiques par cohorte**, **Chapitres → cours**, **Seuils de
sécurité**, **Entrée depuis le cours**, **Outils**.

## Synchroniser, pas à pas

1. **Cocher les cohortes** à traiter dans le tableau (cohorte, nom, politique, effectif, groupe
   ForetMap lié, dernière synchronisation). Une cohorte **sans politique** est grisée : elle
   sera ignorée tant qu'aucune politique ne la reconnaît.
2. **Simuler.** Le rapport s'affiche : d'abord les **totaux** (membres traités, comptes à
   créer, rapprochés par e-mail, par le nom, en attente, désactivations, ajouts et retraits de
   groupe, conflits, alertes), puis les **listes qui comptent** :
   - _Comptes à créer_ — les nouveaux élèves ;
   - _Rapprochés par le nom (à relire)_ — reconnus sans e-mail commun, par prénom + nom dans la
     même classe : à parcourir des yeux ;
   - _Doublons probables_ — deux comptes qui semblent être la même personne (voir « Fusionner
     deux comptes ») ;
   - _Désactivations_ — les comptes qui ne sont plus dans aucune cohorte ;
   - _Rapprochements en attente_, _Conflits d'e-mail_, _Conflits de comparaison_, _Alertes_,
     _Cohortes sans politique_.
3. **Appliquer.** Le bouton se libère quand la simulation a réussi sur exactement ces cohortes.
   S'il reste grisé, la raison est écrite à côté (périmètre changé, seuil dépassé, simulation
   échouée, synchronisation désactivée). Une confirmation est demandée.
4. **Relire** le rapport d'application (même forme), puis traiter ce qui reste : attentes,
   conflits. Si « Inclure les miroirs d'équipes » était coché, le rapport affiche aussi, pour
   chaque partie concernée, les équipes à créer dans Moodle et les joueurs sans compte Moodle
   (miroir incomplet).

Un **seuil de sécurité** dépassé (trop de créations, trop de désactivations, trop de
rapprochements par le nom, trop de retraits vers Moodle) **arrête tout avant la moindre
écriture** : le rapport dit lequel. C'est le filet contre une cohorte vidée par erreur côté
Moodle ou une mauvaise année dans les réglages. Seul « Forcer », avec un **motif écrit** qui
est conservé, passe outre.

## Les rapprochements en attente

Quand un membre Moodle a plusieurs **homonymes** côté ForetMap (deux « Léa Martin »), ou qu'un
prénom + nom correspond mais dans une autre classe, l'application ne choisit pas : elle met le
cas **en attente**. Dans la section dédiée, pour chaque cas : le membre Moodle, sa cohorte, la
liste des comptes candidats (avec e-mail, état actif/inactif, mode de connexion). Trois
décisions : **Rapprocher** au compte choisi, **Créer un compte** neuf, **Ignorer**. La décision
est appliquée à la synchronisation suivante.

## Les conflits à trancher

L'application compare trois états : Moodle, ForetMap, et **le dernier état commun** (ce qu'elle
avait aligné la dernière fois). Ainsi elle sait _qui a bougé_ :

- Moodle a bougé (élève arrivé ou parti) → propagé sans question ;
- ForetMap a bougé (un prof a retiré ou ajouté quelqu'un à la main dans un groupe synchronisé,
  ou renommé le groupe) → **conflit**, la décision revient à un humain.

Pour chaque conflit : le groupe, sa nature (« retiré côté ForetMap, toujours dans Moodle »,
« ajouté côté ForetMap, absent de Moodle », « nom modifié des deux côtés »), la personne, l'état
de chaque côté. Trois issues :

- **Garder Moodle** : ForetMap se réaligne sur la cohorte (l'élève est remis, le nom Moodle
  rétabli) ;
- **Appliquer le côté ForetMap** : l'ajout fait à la main est **poussé vers Moodle** (uniquement
  quand la politique de cette cohorte l'autorise — c'est le cas des n3beurs — et que la personne
  est connue de Moodle) ;
- **Ignorer** : la divergence devient le nouvel état commun ; elle ne sera plus signalée.

Un conflit n'est ouvert **qu'une fois** : le même écart, d'une exécution à l'autre, ne crée pas
de doublon.

## Annuler une exécution

Depuis le rapport d'une exécution réelle : **Annuler cette exécution**. Les comptes qu'elle a
créés sont désactivés (pas supprimés), les appartenances qu'elle a posées retirées, les
groupes / classes de jeu / joueurs qu'elle a créés retirés, les reconnaissances défaites. On ne
peut pas annuler une simulation, ni une exécution déjà annulée, ni une exécution recouverte par
une exécution réelle plus récente (annuler d'abord la plus récente). Une **fusion de comptes**
ne s'annule pas.

## Les réglages

- **Politiques par cohorte** : une ligne par famille de cohortes, dans l'ordre — **la première
  qui correspond gagne**. Chaque ligne dit : la clé (un nom court), le motif qui reconnaît les
  cohortes (`{year}` y désigne le préfixe d'année), le **genre de groupe** créé (classe, niveau,
  club, équipe), le **rôle** donné aux membres, et quatre options : accès n3beur, création
  d'une **classe G&L**, création des comptes manquants, **pousser vers Moodle** les ajouts faits
  dans ForetMap. Les réglages livrés couvrent : les niveaux (pas de création de compte), les
  n3beurs (rôle élève, poussée vers Moodle), les sixièmes (visiteur + classe G&L), les autres
  classes (visiteur).
- **Préfixe d'année** (« 26 ») : à changer chaque rentrée ; tout ce qui ne commence pas par ce
  préfixe est ignoré.
- **Domaines d'e-mail acceptés** : vide = tous ; sinon un membre Moodle dont l'e-mail n'est pas
  dans ces domaines bloque la synchronisation (contrôle amont).
- **Chapitres → cours** : quel cours Moodle porte quel chapitre de Gnomes & Licornes. Le **nom
  du cours** s'affiche à côté de son identifiant pour éviter une erreur d'année. Sert aux miroirs
  d'équipes et à l'entrée depuis le cours.
- **Seuils de sécurité** : les cinq garde-fous décrits plus haut, en pourcentage ou en nombre.

## Outils

- **Hors synchronisation** : marquer un compte ou un groupe pour que la synchronisation ne le
  touche plus jamais (ni écriture, ni désactivation). Un groupe marqué fait ignorer toute sa
  cohorte, avec une alerte dans le rapport. « Rétablir » annule le marquage.
- **Fusionner deux comptes** : quand un élève existe deux fois (un vieux compte à mot de passe
  et un compte reconnu par Moodle, par exemple). On indique le compte **source** (le doublon) et
  le compte **cible** ; la **simulation** liste ce qui sera versé (groupes, tâches, observations,
  messages, joueur de jeu, reconnaissances) et les champs vides de la cible qui seront complétés
  (e-mail, mot de passe…). Puis **Fusionner définitivement**, après confirmation : le doublon
  disparaît. **Cette opération ne s'annule pas.** Elle est refusée si les deux comptes ne sont
  pas du même type ou si chacun a déjà un joueur de jeu.

## Entrée depuis un cours Moodle

Une activité du cours peut ouvrir **un nouvel onglet** directement dans ForetMap ou dans
Gnomes & Licornes, **déjà connecté**, sans mot de passe supplémentaire. Cela ne crée jamais
de compte : l'élève doit déjà exister dans l'annuaire (la synchronisation ci-dessus). Un
inconnu voit un refus clair.

L'administrateur règle, dans **Entrée depuis le cours** :

- l'activation ;
- ce qui arrive à une personne inconnue (**refus** : seule option active ; une file
  d'attente est prévue plus tard) ;
- pour chaque cours Moodle : ForetMap, Gnomes & Licornes, ou les deux, l'écran d'arrivée, le
  chapitre de jeu s'il y a lieu ;
- les boutons proposés à un **enseignant** (ForetMap prof / Gnomes & Licornes MJ) à chaque
  clic — le rôle dans l'application ne vient pas du rôle Moodle « enseignant ».

Un n3beur qui clique dans un cours de chapitre Gnomes & Licornes voit les **deux**
applications (carte ForetMap et jeu). Un élève de 6e non n3beur suit l'écran réglé pour ce
cours. Le professeur pose l'activité à la main dans Moodle (pas d'insertion automatique).

## Ce que ça change pour un professeur

- Les groupes-classes apparaissent **tout seuls** à la rentrée, avec les bons élèves ; plus
  besoin de codes de classe pour ces élèves-là (le code reste utile pour un club ou un visiteur).
- Un élève **ajouté à la main** dans un groupe synchronisé n'est jamais retiré par la
  synchronisation ; l'administrateur verra une divergence à trancher, c'est tout.
- Les **sous-groupes** (équipes, ateliers) créés par un professeur ne sont pas concernés : ils
  ne viennent pas de Moodle et Moodle ne les touche pas.
- Pour les **sixièmes**, la classe Gnomes & Licornes et les joueurs existent avant le premier
  cours ; le MJ n'a plus qu'à ouvrir une partie (voir le [guide du MJ](../gl/guide-du-mj.md)).
  Côté ForetMap, ces élèves restent en pratique des **visiteurs** (Visite et Biodiversité,
  pas de tâches) — cas d'usage du profil **Prof de classe** (tuteur de la classe, sans
  gestion des tâches) ; détail dans
  [Comptes, rôles et groupes](comptes-roles-et-groupes.md).
- La **création manuelle** de comptes par un prof de classe n'est pas obligatoire si Moodle
  peupple déjà les classes : ce droit reste **paramétrable** pour ce profil.

## Procédure de rentrée (administrateur)

1. **Une seule fois, avant la toute première synchronisation** : compléter les adresses e-mail
   des élèves existants (export, complétion par les profs, réimport) — l'e-mail est la clé de
   reconnaissance la plus sûre.
2. Mettre à jour le **préfixe d'année** et relire les **politiques**.
3. Mettre à jour la table **Chapitres → cours** (les cours changent d'identifiant chaque année)
   et vérifier les **noms affichés**.
4. Demander une **sauvegarde** de la base (geste technique, voir l'encadré).
5. **Contrôler la connexion**.
6. **Simuler** l'ensemble ; lire les désactivations prévues, les créations, les rapprochés par
   le nom, les conflits.
7. **Appliquer sur une seule cohorte**, la plus petite ; vérifier les effectifs et tester une
   connexion d'élève.
8. Appliquer l'ensemble ; contrôler les effectifs ; vérifier la réconciliation Gnomes & Licornes.
9. Traiter les **rapprochements en attente** et les **conflits**.
10. Activer la **simulation automatique** des matins de classe (geste technique) : elle prévient
    par e-mail dès qu'il y a quelque chose à relire, sans jamais rien appliquer.

> **Pour les curieux (optionnel).** Le lien technique avec Moodle repose sur un jeton de
> service conservé dans la configuration du serveur, jamais dans l'écran : c'est pour cela que
> « Configuré / Non configuré » n'est pas un bouton. Les gestes techniques (jeton, sauvegarde,
> simulation automatique) sont décrits dans les documents d'exploitation destinés à la personne
> qui administre le serveur.

## ⚠️ Points d'attention

- **Le lien n'est pas encore branché sur le vrai Moodle** : tout ce qui précède a été validé sur
  un Moodle de test. La première mise en service demandera le jeton de service (geste
  technique) et une passe de « Contrôler la connexion ».
- **Miroirs d'équipes vers les cours Moodle** : l'option « Inclure les miroirs d'équipes » lors
  d'une synchronisation, et les boutons **Simuler le miroir Moodle** / **Pousser vers Moodle**
  dans la console MJ (onglet Équipes), recopient les équipes de jeu comme groupes du cours du
  chapitre. Seuls ces groupes-miroir sont créés ou retirés ; un joueur sans compte Moodle
  reconnu est signalé, pas inventé. Le premier passage sur le vrai Moodle reste à valider.
- **Entrée depuis le cours** : le clic Moodle est en place côté application ; le premier
  lancement réel depuis olution.info reste à mesurer (réglage de l'outil dans Moodle, geste
  technique).
- **Un conflit ignoré ne revient pas** : « Ignorer » est définitif pour cet écart-là. Si l'on
  change d'avis, il faut refaire le geste dans le groupe (remettre ou retirer l'élève) puis
  laisser la synchronisation suivante le constater.
