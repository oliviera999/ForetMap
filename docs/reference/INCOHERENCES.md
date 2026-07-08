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

**Options détaillées.**

- **A — Code de classe à l'inscription.** Le professeur génère (et affiche/imprime) un
  code par groupe ; l'élève le saisit dans un champ optionnel du formulaire
  d'inscription. Bon code → rattachement immédiat au groupe et rôle d'élève ; pas de
  code → compte visiteur avec message d'explication. À prévoir : génération/rotation du
  code côté prof, limitation des essais (anti-devinette). _Vérifié : aucun mécanisme de
  code n'existe aujourd'hui — c'est une vraie nouveauté._ Effort moyen ; c'est le
  standard des outils de classe.
- **B — Expliquer l'attente + rattachement en un clic.** Le fonctionnement ne change
  pas, mais : après inscription, un écran d'accueil dit clairement « votre compte doit
  être rattaché à une classe par un professeur » ; côté prof, une liste « comptes en
  attente de rattachement » permet d'affecter en un clic au bon groupe. Effort faible,
  livrable rapidement.
- **C — Rôle d'élève d'office à l'inscription.** Un compte auto-créé devient
  directement « n3beur novice ». Effort minime, mais n'importe quel visiteur du site
  peut alors prendre des tâches : à éviter tant que l'inscription est publique.
- **D — Fermer l'inscription libre.** Seuls les comptes créés/importés par un prof
  existent (le réglage de désactivation existe déjà). Simple et sûr, mais toute la
  charge de la rentrée retombe sur les professeurs.

**Avis de l'agent.** **B tout de suite, A comme cible.** B supprime la confusion en un
petit lot sans rien changer au modèle de sécurité. A est la vraie bonne réponse à la
rentrée (l'élève devient autonome, le prof ne fait que distribuer un code) et rend B
encore utile pour les retardataires sans code. C est déconseillé, D trop rigide.

**Décision :** ✅ **Livré** (2026-07-08, options A + B) — B : bandeau d'explication pour le compte en attente + liste « comptes en attente de rattachement » côté prof avec rattachement en un clic (promotion automatique). A : code de classe par groupe (génération/rotation/suppression côté prof), champ optionnel à l'inscription — bon code = rattachement immédiat, code invalide = refus clair sans création de compte (tracé en sécurité).

### F3 — 🟠 Navigation à géométrie variable (Tâches/Tuto/Carte)

**Constat.** Selon les réglages et la taille d'écran, « Tâches » et « Tuto » sont
tantôt fusionnés, tantôt séparés, et un onglet combiné « Cartes & tâches » apparaît
sur grand écran. Difficile d'assister un utilisateur (« clique sur l'onglet X » ne
marche pas pour tout le monde) et difficile à documenter.

**Précision (vérifiée dans le code).** Il ne s'agit pas d'un réglage admin : la fusion
Tâches/Tuto est **automatique et contextuelle** (elle se déclenche quand l'élève a un
« lieu en focus » depuis la carte), l'onglet combiné « Cartes & tâches » est une
adaptation **grand écran**, et l'onglet Tuto disparaît si le module tutoriels est
désactivé. Trois causes de variation indépendantes, dont une invisible.

**Options détaillées.**

- **A — Figer : Tâches et Tuto toujours séparés.** Supprimer la fusion contextuelle ;
  conserver uniquement l'adaptation grand écran (compréhensible et documentable) et le
  masquage par module. La navigation devient prévisible : « clique sur l'onglet X »
  vaut pour tout le monde. Perte : un petit raffinement contextuel.
- **B — Statu quo documenté.** Aucune modification ; la documentation de référence
  décrit les trois variantes. Coût de support durable (c'est la variante contextuelle
  qui déroute).
- **C — En faire un vrai réglage admin.** Un interrupteur « fusionner Tâches et
  Tuto » dans les Paramètres remplace la logique cachée. Prévisible et flexible, mais
  un réglage de plus à comprendre… et deux configurations à documenter quand même.

**Avis de l'agent.** **A.** La fusion contextuelle est le genre de finesse qui coûte
plus en accompagnement qu'elle ne rapporte en confort — surtout avec un public élève.
Garder l'adaptation grand écran (naturelle), figer le reste. C n'est justifié que si
la fusion a de vrais adeptes en classe.

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

**Options détaillées.**

- **A — Assumer l'habillage (éditorial léger).** Une page « Pourquoi Gnomes &
  Licornes ? » dans Le monde G&L : les gnomes et les licornes sont les
  compagnons-mascottes des équipes, envoyés pour aider Sélène à restaurer le carnet.
  Deux ou trois feuillets de lore les mettent en scène (leur arrivée, leur rôle).
  Zéro code — uniquement de l'écriture dans les écrans d'édition existants. Atout :
  les mascottes gnomes/licornes existent déjà, l'histoire n'a qu'à les « adopter ».
- **B — Enrichir réellement le lore (chantier éditorial).** Donner un vrai rôle
  narratif aux deux peuples (par exemple : les gnomes gardiens des savoirs concrets,
  les licornes de l'imaginaire, réunis par la quête de Sélène), décliné dans l'intro,
  les chapitres et les feuillets. Beau projet pédagogique (écriture possible AVEC les
  élèves), mais effort important et validation d'un fil narratif complet.
- **C — Renommer le jeu** (ex. « Le Carnet de Sélène »). Cohérence maximale, coût
  maximal : habitudes des élèves, adresse du site, supports imprimés, docs.

**Avis de l'agent.** **A maintenant, B en horizon.** A se fait en une séance d'écriture
et supprime le malaise « le titre ne correspond à rien ». B est la belle version — et
se prête à un projet d'écriture avec les classes — mais ne doit pas bloquer A.
C est à réserver à une éventuelle refonte globale.

**Décision :** ⏸️ **Reportée** (2026-07-08) — options à détailler lors du prochain arbitrage.

### G2 — 🟠 Le Marché n'apparaît que si deux réglages distincts sont actifs

**Constat.** Activer le module « Marché » ne suffit pas : il faut aussi activer la
« vitalité » (cœurs/gemmes). Un admin qui n'active que le Marché ne voit rien
apparaître, sans aucun message.

**Options détaillées.**

- **A — Avertir au bon endroit (Réglages).** Sur l'interrupteur du module Marché, un
  message permanent « Le Marché nécessite la vitalité (cœurs/gemmes) » ; si on
  l'active alors que la vitalité est inactive, proposer « Activer les deux » en un
  clic. L'admin comprend la dépendance au moment exact où il configure. Effort faible.
- **B — Activation automatique en cascade.** Activer le Marché active la vitalité
  (avec une notification). Moins de clics, mais un réglage qui en change un autre
  « dans le dos » est le genre de magie qui désoriente — surtout que la vitalité a
  d'autres effets (sorts, feuillets).
- **C — Griser l'onglet côté joueur** avec un message « vitalité désactivée ».
  Déconseillé : c'est de la configuration admin exposée aux élèves.
- **D — Statu quo documenté** dans le futur doc « économie du jeu ». Gratuit mais le
  piège reste entier.

**Avis de l'agent.** **A**, complétée par une phrase dans le futur doc économie (G9).
C'est la correction proportionnée : le problème est un défaut d'information au moment
de la configuration, pas un défaut de conception.

**Décision :** ✅ **Livré** (2026-07-08, option A) — dans Réglages plateforme, un avertissement s'affiche dès que le Marché est activé sans la vitalité, avec un bouton « Activer la vitalité » en un clic.

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

**Précisions (vérifiées dans le code).** Le module Sortilèges est **désactivé par
défaut** : le réglage « qui lance » ne s'exprime que si un admin a déjà activé les
sorts consciemment. Et les **profils de séance** pilotent déjà ce réglage : le profil
« MJ + tours » passe les sorts en « MJ seul », les profils interactifs les ouvrent aux
joueurs. Le défaut brut compte donc peu en pratique ; c'est la doc interne qui était
en décalage.

**Options détaillées.**

- **A — Garder « joueurs par défaut » et corriger la doc interne.** Aucun changement
  de comportement ; cohérent avec le défaut du QCM (également ouvert aux joueurs) et
  avec les profils de séance qui font le vrai travail.
- **B — Passer à « MJ seul par défaut ».** Plus prudent dans l'absolu, mais change le
  comportement des installations existantes qui n'ont pas touché ce réglage, et crée
  une incohérence avec le QCM (ouvert par défaut).

**Avis de l'agent.** **A.** Le défaut n'est presque jamais vu (module off par défaut,
profils de séance par-dessus) ; changer un comportement en production pour aligner une
phrase de doc serait la mauvaise direction. Corriger la doc interne, et considérer que
le « mode normal » d'une séance est celui du profil choisi.

**Décision :** ✅ **Option A actée** (2026-07-08) — défaut « joueurs » conservé, documentation interne corrigée (livré dans ce lot).

### G9 — 🟡 Cœurs et gemmes jouent trois rôles à la fois

**Constat.** Les mêmes points servent de jauge de vie/pouvoir, de monnaie d'échange au
marché et de coût/récompense des contenus. Cohérent techniquement, mais dense à
expliquer — ce n'est pas un bug, c'est un choix de conception à assumer et vulgariser.

**Options détaillées.**

- **A — Assumer et documenter.** Rédiger le doc de référence « économie du jeu »
  (prévu au sommaire : `gl/economie-marche-sorts.md`) avec un schéma simple des flux —
  d'où viennent les cœurs/gemmes (MJ, récompenses de feuillets), où ils partent
  (sorts, coûts de feuillets, échanges au marché) — plus un encart dans les Règles du
  jeu côté élèves. Aucun code.
- **B — Séparer les usages.** Créer une monnaie d'échange distincte des jauges de
  vie/pouvoir. Conceptuellement plus propre, mais gros chantier (base, écrans, marché,
  sorts, équilibrage) pour un problème non encore observé en classe.
- **C — Clarifier dans le jeu + garde-fou (intermédiaire).** Garder le système, mais :
  libellés explicites au marché et dans l'assistant de sorts (« tu dépenses tes
  cœurs ❤️ — il t'en restera N »), et éventuellement un **plancher** configurable
  (interdire de descendre sous X cœurs via le marché ou un sort) pour éviter qu'un
  élève se « ruine ». Effort modéré, très pédagogique.

**Avis de l'agent.** **A tout de suite, C en deuxième pas.** La densité du système est
d'abord un problème d'explication : le doc économie est de toute façon prévu. Le
plancher de C est une jolie protection pour le cycle 3 — à trancher après une ou deux
séances d'observation. B seulement si la confusion résiste à A + C.

**Décision :** ✅ **Livré (volet libellés)** (2026-07-08, option C) — au Marché et dans l'assistant de sorts, chaque champ de dépense affiche « tu dépenses tes cœurs/gemmes — il te restera N ». Le plancher configurable reste à trancher après observation en classe ; le doc « économie du jeu » (option A) reste prévu au sommaire.

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

## Arbitrage du 2026-07-08 (second tour)

- **✅ Livrés** : F2 (A+B), G2 (A), G8 (A), G9 (C — volet libellés).
- **En discussion** : F3 (questions posées : rôle du module tutoriels, devenir du
  vis-à-vis carte/tâches grand écran) et G1 (option B retenue dans son principe —
  propositions narratives soumises, solution à choisir).

Ordre de traitement des points actés :

| Lot                            | Contenu                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| **1 — Nettoyages sans risque** | F6, F7, G5, G10 (vestiges PIN, scories, docs internes) + G4/G6 (vocabulaire) |
| **2 — Sécurité**               | F1 (identité vérifiée côté serveur) + G7 (mots de passe staff 8+)            |
| **3 — Dette interne**          | F4 (visite V1/V2), F5 (double lien tâches)                                   |
| **4 — Fonction inachevée**     | G3 (écran admin du conditionnement par QCM)                                  |
