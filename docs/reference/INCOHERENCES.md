# Incohérences et points à assainir — registre d'arbitrage

> **Public : administrateurs, professeurs, MJ.**
> Ce registre liste les incohérences, confusions et fonctions inachevées relevées dans
> les deux applications, avec des **options de correction** à arbitrer. C'est le
> préalable à l'extension de la documentation de référence : on assainit la base avant
> de documenter.
>
> **Comment l'utiliser** : pour chaque point, choisir une option en éditant la ligne
> « **Décision :** » (ou en répondant en discussion). Une décision actée devient une
> demande de changement ; une fois le correctif livré, le point passe en ✅ avec la date.
> Retour au sommaire : [README.md](README.md)

Légende gravité : 🔴 à traiter en priorité · 🟠 gênant au quotidien · 🟡 nettoyage /
clarification.

---

## ForetMap

### F1 — 🔴 Sécurité : des actions élèves se fient à l'identité déclarée par le navigateur

**Constat.** Plusieurs actions (prendre/rendre une tâche, gérer le carnet
d'observation) croient sur parole l'identité d'élève envoyée par le navigateur, sans
vérification stricte côté serveur. Conséquences possibles : agir au nom d'un autre
élève, lire le carnet d'observation d'un camarade en devinant son numéro, supprimer
une observation qui n'est pas la sienne. L'audit technique interne
(`docs/AUDIT_BUGS_INCOHERENCES.md`, constats B1, B2, B3) le documente déjà, avec
d'autres points voisins sur les images (suppression, accès).

**Options.**

- **A (recommandée)** — Vérifier l'identité côté serveur partout : chaque action
  élève est faite « en tant que » l'utilisateur connecté, jamais « au nom d'un numéro
  transmis ». Lecture du carnet réservée à son propriétaire et aux professeurs.
  Effort modéré, aucun changement visible pour un utilisateur honnête.
- **B** — Assumer un « réseau de confiance » (usage encadré en classe) et le
  documenter noir sur blanc. Aucun effort, mais le risque demeure et grandit avec
  l'ouverture de l'application (visite publique, inscription libre).

**Décision :** ✅ **Livré** (2026-07-08, option A) — vérification faite : la quasi-totalité des actions élèves étaient déjà corrigées depuis l'audit ; la dernière route ouverte (proposition de tâche) exige désormais le jeton de session, rejette toute identité divergente et journalise l'acteur réel. Les points images (R1-R3 de l'audit technique) restent ouverts, à traiter séparément.

### F2 — 🔴 Parcours du nouvel inscrit : un compte auto-créé reste « visiteur » sans explication

**Constat.** Un élève qui crée son compte en autonomie reçoit le rôle **visiteur** :
ni carte, ni tâches, et aucun message ne lui explique pourquoi ni quoi faire. Il faut
qu'un professeur le rattache à un groupe ou le promeuve. Confusion garantie à la
rentrée.

**Options.**

- **A** — À l'inscription, l'élève saisit un **code de classe** (fourni par le prof) :
  il rejoint directement son groupe et reçoit le rôle d'élève. Le compte sans code
  reste visiteur. Le plus sûr et le plus clair, effort modéré.
- **B (recommandée en complément de A, ou seule à court terme)** — Garder le
  fonctionnement actuel mais **l'expliquer à l'écran** : après inscription, un message
  d'accueil indique « votre compte doit être rattaché à une classe par un professeur »
  et le professeur voit une liste « comptes en attente de rattachement ». Effort
  faible.
- **C** — Donner d'office le rôle d'élève débutant à toute inscription. Simple, mais
  n'importe qui peut alors s'inscrire et interagir avec les tâches : déconseillé tant
  que F1 n'est pas réglé.

**Décision :** ⏸️ **Reportée** (2026-07-08) — options à détailler lors du prochain arbitrage.

### F3 — 🟠 Navigation à géométrie variable (Tâches/Tuto/Carte)

**Constat.** Selon les réglages et la taille d'écran, « Tâches » et « Tuto » sont
tantôt fusionnés, tantôt séparés, et un onglet combiné « Cartes & tâches » apparaît
sur grand écran. Difficile d'assister un utilisateur (« clique sur l'onglet X » ne
marche pas pour tout le monde) et difficile à documenter.

**Options.**

- **A (recommandée)** — Choisir UNE organisation de référence (à arbitrer : fusion ou
  séparation) et supprimer le réglage correspondant ; ne garder que l'adaptation
  automatique grand écran / téléphone, documentée.
- **B** — Statu quo, mais la documentation de référence décrit chaque variante.
  Aucun effort de code, complexité documentaire durable.

**Décision :** ⏸️ **Reportée** (2026-07-08) — options à détailler lors du prochain arbitrage.

### F4 — 🟡 Visite : deux générations de contenus coexistent en interne

**Constat.** Le mode Visite conserve son ancien format de contenus « pour
rétrocompatibilité » en parallèle du nouveau. Aucun effet visible, mais l'ambiguïté
sur « où est la vérité » complique chaque évolution de la Visite.

**Options.**

- **A (recommandée)** — Migrer ce qui doit l'être vers le nouveau format puis
  supprimer l'ancien (avec sauvegarde préalable). Nettoyage ponctuel, sans changement
  visible.
- **B** — Statu quo documenté (« le nouveau format fait foi, l'ancien est gelé »).

**Décision :** ✅ **Livré** (2026-07-08, option A) — l'ancien format a été copié une dernière fois par filet de sécurité puis supprimé (migration destructive documentée) ; le nouveau format est l'unique source, une garde automatique l'atteste.

### F5 — 🟡 Tâches : double lien interne vers zones et repères

**Constat.** Une tâche mémorise sa zone de deux façons en parallèle (un lien simple
historique + un lien multiple moderne). Même chose pour les repères. Risque de
désaccord silencieux entre les deux.

**Options.**

- **A (recommandée)** — Déclarer le lien multiple comme unique source de vérité ; le
  lien historique devient une simple copie automatique (ou disparaît à terme).
- **B** — Statu quo documenté.

**Décision :** ✅ **Livré** (2026-07-08, option A) — le lien multiple fait foi partout ; le lien historique n'est plus qu'une copie automatique (un seul point d'écriture, plus aucun repli en lecture), conservée pour la compatibilité des exports.

### F6 — 🟡 Vestiges de l'ancien « mode prof par PIN »

**Constat.** Le système de PIN a été supprimé (les droits viennent du rôle à la
connexion), mais il reste des traces : anciennes structures conservées « pour
compatibilité », mentions dans des documents internes. La mémoire projet principale a
déjà été corrigée dans le lot précédent.

**Option unique (recommandée).** Balayage de nettoyage : purger les mentions restantes
dans les documents internes et planifier la suppression des structures obsolètes.
Aucun impact utilisateur.

**Décision :** ✅ **Livré** (2026-07-08) — plus aucune mention du PIN comme mécanisme actuel (libellés d'écran, aide, docs internes, variable morte de la chaîne d'intégration). Les structures historiques du schéma restent volontairement (nécessaires aux migrations anciennes).

### F7 — 🟡 Scories structurelles internes

**Constat.** Sans effet visible : deux numéros de migration en double (tolérés
explicitement), quelques documents internes (skills/règles) en retard sur le code.

**Option unique (recommandée).** Lot de nettoyage documentaire interne ; ne pas
renuméroter les migrations (risqué pour rien), juste documenter la tolérance.

**Décision :** ✅ **Livré** (2026-07-08) — règle de numérotation des migrations documentée là où on la cherche ; documents internes contradictoires corrigés.

---

## Gnomes & Licornes

### G1 — 🟠 Le nom du jeu ne correspond pas à son contenu

**Constat.** Aucun récit de gnomes, de licornes ou de royaume dans le contenu actuel :
l'univers réel est celui de Sélène, des biomes et de l'effacement des noms du vivant.
Les mascottes « gnomes/licornes » sont le seul ancrage du titre.

**Options.**

- **A (recommandée)** — **Assumer l'habillage** : une page « pourquoi ce nom ? » dans
  le monde G&L (les gnomes et licornes sont les compagnons/mascottes des équipes qui
  aident Sélène), quelques feuillets de lore qui les mettent en scène. Effort
  éditorial, pas de code.
- **B** — Enrichir réellement le lore (chapitres, feuillets, intro) pour donner un
  rôle narratif aux gnomes et licornes. Beau projet pédagogique, effort important.
- **C** — Renommer le jeu pour coller au contenu. Impact fort (habitudes, adresse,
  supports imprimés) : déconseillé.

**Décision :** ⏸️ **Reportée** (2026-07-08) — options à détailler lors du prochain arbitrage.

### G2 — 🟠 Le Marché n'apparaît que si deux réglages distincts sont actifs

**Constat.** Activer le module « Marché » ne suffit pas : il faut aussi activer la
« vitalité » (cœurs/gemmes). Un admin qui n'active que le Marché ne voit rien
apparaître, sans aucun message.

**Options.**

- **A (recommandée)** — Dans l'écran de réglages, afficher l'avertissement « Le Marché
  nécessite la vitalité » directement sur l'interrupteur du Marché (et proposer
  d'activer les deux d'un clic). Effort faible.
- **B** — Activer automatiquement la vitalité quand on active le Marché. Simple mais
  magique : l'admin ne comprend pas pourquoi la vitalité s'est allumée.
- **C** — Statu quo + documentation seule.

**Décision :** ⏸️ **Reportée** (2026-07-08) — options à détailler lors du prochain arbitrage.

### G3 — 🟠 Le conditionnement « appris seulement après QCM réussi » n'a pas d'écran d'administration

**Constat.** La mécanique existe et fonctionne (empêcher de marquer « appris » tant
qu'un QCM n'est pas réussi), mais aucun écran ne permet à un professeur de la
configurer : manipulation technique obligatoire. Fonction inachevée côté admin.

**Options.**

- **A (recommandée)** — Construire l'écran d'administration (relier une ressource à un
  QCM, choisir le mode, le délai de nouvelle tentative). Effort modéré, débloque une
  vraie fonction pédagogique.
- **B** — Geler la fonction (invisible tant que non configurée) et le documenter ;
  écran admin plus tard.
- **C** — Retirer la mécanique. Déconseillé : elle est saine et déjà testée.

**Décision :** ✅ **Livré** (2026-07-08, option A) — deux écrans : « Contenus → Conditionnement QCM » (liens ressource ↔ question : liste filtrable, ajout, bascule bloquant, statut, suppression) et « Réglages plateforme → Conditionnement par QCM » (interrupteur global, mode, granularité, seuil, délai de nouvelle tentative).

### G4 — 🟠 Deux glossaires et deux jeux de questions : vocabulaire à clarifier partout

**Constat.** Coexistent volontairement : le **glossaire scientifique** et le **lexique
du lore**, les **QCM d'écologie** et les **QCM narratifs**. Un MJ non averti s'y perd,
d'autant que les libellés ne rappellent pas toujours la distinction.

**Option unique (recommandée).** Passe de nommage cohérente dans toute l'interface et
les écrans d'édition : toujours « Glossaire scientifique » / « Lexique du lore » et
« QCM écologie » / « QCM histoire », y compris dans les imports/exports. Puis
documentation claire de la distinction. Effort faible.

**Décision :** ✅ **Livré** (2026-07-08) — nommage désambiguïsé partout : « Glossaire scientifique » vs « Lexique lore », « QCM biomes » vs « QCM lore », y compris écrans d'édition, imports/exports, statistiques et aide.

### G5 — 🟡 Vestiges « PIN » côté GL

**Constat.** L'ancien vocabulaire subsiste : le mot de passe est encore accepté sous
le nom « PIN » à la connexion, et il existe deux commandes de réinitialisation
redondantes pour les joueurs (l'une « mot de passe », l'autre « PIN », identiques).

**Option unique (recommandée).** Unifier sur « mot de passe » : conserver l'ancienne
appellation quelque temps en compatibilité silencieuse, la retirer ensuite ; supprimer
la commande en double. Aucun impact utilisateur visible.

**Décision :** ✅ **Livré** (2026-07-08) — la commande en double a été supprimée, l'écran de gestion des joueurs utilise la commande « mot de passe » ; l'ancienne appellation reste acceptée en coulisses quelque temps (compatibilité silencieuse), à retirer à terme.

### G6 — 🟡 Vocabulaire « biotope / biocénose » vs « écosystèmes / biodiversité »

**Constat.** Les onglets ont été renommés « Écosystèmes » et « Biodiversité », mais
les anciens termes (biotope, biocénose) peuvent subsister ailleurs (textes, aides,
documents). Risque d'incohérence de vocabulaire face aux élèves — d'autant que les
termes ne sont pas synonymes scientifiquement.

**Options.**

- **A (recommandée)** — Balayage complet + règle éditoriale : les onglets gardent
  leurs noms grand public, et les termes scientifiques exacts (biotope, biocénose)
  restent utilisés **dans les contenus pédagogiques**, où ils sont définis au
  glossaire. On documente ce choix.
- **B** — Tout uniformiser sur un seul couple de termes. Plus simple, mais on perd la
  nuance pédagogique.

**Décision :** ✅ **Livré** (2026-07-08, option A) — libellés d'interface harmonisés (Biodiversité/Écosystèmes) ; les termes scientifiques biotope/biocénose restent dans les contenus pédagogiques où ils sont définis ; règle éditoriale actée.

### G7 — 🟠 Mots de passe : 4 caractères minimum, y compris pour MJ et admins

**Constat.** La longueur minimale d'un mot de passe est de 4 caractères pour tout le
monde. Acceptable pour des joueurs de cycle 3, trop faible pour des comptes qui
peuvent tout administrer.

**Options.**

- **A (recommandée)** — Exigence différenciée : 4+ pour les joueurs, **8+ pour le
  staff** (MJ/admin), appliquée au prochain changement de mot de passe. Effort faible.
- **B** — 8+ pour tout le monde. Plus sûr mais pénible pour les plus jeunes.
- **C** — Statu quo documenté.

**Décision :** ✅ **Livré** (2026-07-08, option A) — 8 caractères minimum pour les comptes MJ/Admin (changement et réinitialisation), les joueurs restent à 4.

### G8 — 🟡 Sorts : qui lance, en temps normal ?

**Constat.** Par défaut, **les joueurs** peuvent lancer les sorts, alors que la
documentation interne décrivait le lancement par le MJ comme le flux principal. Les
deux modes existent (réglage), mais le « mode normal » n'est pas tranché.

**Options.**

- **A** — Défaut = joueurs lancent (avec approbation MJ activable) ; corriger la
  documentation interne. Aucun changement de comportement.
- **B** — Défaut = MJ seul ; les profils de séance ouvrent le lancement aux joueurs
  quand on le souhaite. Changement de défaut, plus prudent en classe.

**Décision :** ⏸️ **Reportée** (2026-07-08) — options à détailler lors du prochain arbitrage.

### G9 — 🟡 Cœurs et gemmes jouent trois rôles à la fois

**Constat.** Les mêmes points servent de jauge de vie/pouvoir, de monnaie d'échange au
marché et de coût/récompense des contenus. Cohérent techniquement, mais dense à
expliquer — ce n'est pas un bug, c'est un choix de conception à assumer et vulgariser.

**Options.**

- **A (recommandée)** — Assumer et **documenter** : un futur document « économie du
  jeu » avec schéma simple (d'où viennent les points, où ils vont), plus un encart
  dans les règles du jeu côté élèves. Pas de code.
- **B** — Séparer les usages (une monnaie d'échange distincte des jauges). Gros
  chantier de gameplay : à n'envisager que si l'expérience en classe montre une vraie
  confusion.

**Décision :** ⏸️ **Reportée** (2026-07-08) — options à détailler lors du prochain arbitrage.

### G10 — 🟡 Scories internes GL

**Constat.** Sans effet visible : un réglage de gameplay déclaré en double dans les
coulisses, une table de correspondance de réglages incomplète, la liste des modules
désynchronisée dans un document interne.

**Option unique (recommandée).** Lot de nettoyage technique groupé, sans changement
de comportement, couvert par les tests existants.

**Décision :** ✅ **Livré** (2026-07-08) — réglage en double supprimé, table de correspondance désormais dérivée automatiquement (plus de liste manuelle), liste des modules resynchronisée.

---

## Arbitrage du 2026-07-08

- **✅ Livrés (2026-07-08)** : F1, F4, F5, F6, F7 · G3, G4, G5, G6, G7, G10.
- **Reportés (options à détailler au prochain arbitrage)** : F2, F3 · G1, G2, G8, G9.

Ordre de traitement des points actés :

| Lot                            | Contenu                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| **1 — Nettoyages sans risque** | F6, F7, G5, G10 (vestiges PIN, scories, docs internes) + G4/G6 (vocabulaire) |
| **2 — Sécurité**               | F1 (identité vérifiée côté serveur) + G7 (mots de passe staff 8+)            |
| **3 — Dette interne**          | F4 (visite V1/V2), F5 (double lien tâches)                                   |
| **4 — Fonction inachevée**     | G3 (écran admin du conditionnement par QCM)                                  |
