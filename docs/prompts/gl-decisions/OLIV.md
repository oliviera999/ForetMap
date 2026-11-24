# Chantier G&L « décisions » : ce qu'Oliv fait, et quand

Le chantier tourne seul : un prompt, trois vagues, sans t'attendre. Rien de ce qui suit ne le bloque, sauf ce qui est
marqué **nécessaire**.

## Avant de lancer

1. **Nécessaire** : ouvrir une session Claude Code sur le dépôt `oliviera999/ForetMap`, avec le droit de pousser, modèle
   Opus, effort élevé, et y coller le prompt d'orchestration (projet Claude, `claude/PROMPT_Opus_orchestration_GL_decisions.md`).
2. Les instructions du projet Claude disent encore « Gel jusqu'à deux séances jouées en classe : on corrige, on n'ajoute
   pas. » Les remplacer par : « Plus de gel depuis le 24/11 : le chantier « décisions » corrige, retire et ajoute ce que
   les décisions nommées demandent, rien d'autre. »
3. Rien à faire en prod avant le lancement.

## Si la session s'arrête

Relancer une session Claude Code avec **le même prompt** : elle repart de `ETAT.md` (branche
`claude/gl-decisions-integration`) sans rien refaire. Si elle écrit « relais manuel » en tête de `ETAT.md`, elle y a
laissé les messages à coller, un par lot, dans autant de sessions.

## Après la vague 1 (la séance jouable et juste)

La vague 1 arrive sur `main` et se déploie. À ce moment :

1. Vérifier la version servie (`foretmap_health` par le connecteur) : elle doit être celle que `ETAT.md` note pour la
   vague 1. Si elle ne bouge pas en vingt minutes, GitHub Actions n'a pas publié : le dire à Claude.
2. Vérifier les migrations : par le connecteur (`foretmap_db_status`), ou sur le serveur, dans un terminal,
   `node scripts/db-migration-status.js`. Aucune migration « en retard ».
3. Vérifier les catalogues : `gl_tenir_catalogues`, action `status`. Le serveur les synchronise **seul** à chaque
   déploiement (par empreinte ; ce n'est pas désactivé en prod au 24/11) : il ne doit rester aucun écart. S'il en
   reste un, synchronise à la main (`sync`, d'abord en `dry_run`, puis avec le code à six chiffres) : tant qu'un
   écart demeure, la prod garde l'ancien texte, et le sort Relance reste lançable.
4. Créer une **partie neuve** pour la séance 1, **la veille** : l'escalier monte d'une marche par jour, et la création
   de la partie compte comme une montée ; une partie créée le matin même ne monterait pas à la clôture du premier
   tour. Les parties 16 et 17 sont des tests.
5. Faire le tour d'essai du point 9 de la liste « Après le chantier » (les lignes qui parlent de la table de jeu, de
   « Mon sac » et de l'oiseau attendent la vague 2).
6. Lire dans `ETAT.md` la section « Pour Oliv » : les textes à relire et les alertes du banc. Le fichier vit sur la
   branche d'intégration : sur GitHub, choisir la branche `claude/gl-decisions-integration`, puis
   `docs/prompts/gl-decisions/ETAT.md`.

Tu peux jouer en classe après la vague 1. La vague 2 continue pendant ce temps ; elle n'arrive pas sur `main` un jeudi
entre 8 h et 15 h.

## Avant ou pendant la vague 2 (l'immersion)

- Téléverser les images dans la médiathèque, sous leur clé (point 4 de la liste) : les 35 « Table de jeu » et les 6
  « Mon sac ». Sans elles, tout marche sur des replis sobres ; avec elles, la table de jeu prend ses matières.

## Après le chantier

1. **Migrations.** Après le dernier déploiement : `foretmap_db_status` par le connecteur, ou sur le serveur, dans un
   terminal, `node scripts/db-migration-status.js`. Attendu :
   aucune migration « en retard ». S'il y en a une : ne synchronise rien et dis-le à Claude.
2. **Catalogues.** Le serveur les synchronise seul à chaque déploiement. Vérifier par le connecteur
   (`gl_tenir_catalogues`, action `status`) qu'il ne reste aucun écart ; s'il en reste un : action `sync`, d'abord en
   `dry_run`, puis pour de bon avec le code à six chiffres reçu par e-mail. Catalogues changés par le chantier : `chasse-zones`,
   `badges`, `sorts`, `olu-lignes`, `peripeties`, `passeur-plateau4`, `qcm-feedbacks-zones`, `questions-lecture`,
   `missions`, `parures`, `defis-cases`, et tout autre catalogue qu'un rapport de lot signale. Les questions de zone
   des plateaux 2 à 4 sont déjà réécrites en prod (24/11) : cette synchro n'écrase aucun retour d'auteur.
3. **Zones du plateau 1.** Ensuite seulement : tracer les huit zones du plateau 1 sur le dessin (éditeur de zones),
   puis demander à Claude de les reporter dans `data/gl/tenir/chasse-zones.json`, pour qu'une future synchro ne les
   écrase pas. Tant qu'elles restent des gabarits, la fouille est une loterie.
4. **Médiathèque.** Téléverser, sous leurs clés (nom du fichier = clé) : les 35 images « Table de jeu »
   (`GL_table_de_jeu_2026-11-24_v3.zip`) et les 6 images « Mon sac » (`GL_icone_sac`, `GL_sac_gnome_ferme`,
   `GL_sac_gnome_ouvert`, `GL_sac_licorne_ferme`, `GL_sac_licorne_ouvert`, `GL_veillee_toile`). Sans elles tout
   marche, en replis. `GL_table_bois` se pose en couverture, pas en motif répété. L'icône « plume » est
   `GL_plume_chaud`. `GL_icone_voile` est le repère fixe du voile, là où un écran le nomme (décision du 24/11, 14 h 43). `GL_icone_oiseau` et `GL_icone_seuil` ne sont appelées nulle part.
5. **Oiseau témoin.** Poser `gameplay.oiseau_temoin_pack_id` = l'identifiant de catalogue du pack « Oiseau noir »
   (`srv-c45f4983-ae08-4607-8e75-dd5659bc2793` en prod le 24/11). Ses fichiers s'appellent `kraavoleur_*.png` : un
   élève ne peut le voir que dans les outils de développement du navigateur ; les renommer au studio pour zéro risque.
   Le pack n'est plus proposé aux équipes depuis le lot ecrans-10.
6. **Intro.** Poser `docs/prompts/gl-decisions/sources/content-intro.json` dans le réglage `content.intro` (par le
   connecteur, sur demande, ou par le panneau « Intro » de l'admin), puis « Revoir l'intro ».
7. **Lexique.** Remettre `gameplay.lore_spoiler_max_level` à `recit` : les fiches de récit sont propres et ne
   s'affichent qu'à partir de leur monde (lot contenu-5).
8. **Parties.** Créer une **partie neuve** pour la séance 1 : l'escalier à cinq marches ne vaut que pour les parties
   neuves, les parties 16 et 17 sont des tests. Ranger la « Partie découverte test » (id 16) et clore la partie 10
   (« Partie découverte 2 », dernière partie de l'ancien jeu en cours).
9. **Un tour d'essai**, sur une partie neuve de la classe de démonstration, projection ouverte :
   - au tableau : un tour complet depuis le bloc « Équipe active » (question, fouille, lecture), « Le voile avance »
     après la dernière équipe ; une tablette affiche « Le tour se joue au tableau. » ;
   - en tablettes : la mascotte saute de case en case ; la phrase d'Olu est en projection et sur la tablette ; la
     désigner trouvée : la correction s'affiche ; deux écrans pour une équipe : la ligne d'Olu de la main ;
   - une question de case et une question de zone : le plateau est flouté derrière et à côté, plus rien ne s'y lit ;
     il redevient net après la réponse ;
   - deux tours clos le même jour : une seule marche ; Relance n'apparaît nulle part ;
   - une bonne réponse à une question de case : la caravane avance d'une case (de trois si l'équipe est sous le
     voile), puis « Sondez le plateau » (une sonde par bonne réponse) ; une sonde dans une zone dit « chaud », n'ouvre
     rien, et laisse les deux fouilles intactes ;
   - une fouille : l'écran appelle l'Éclaireuse ou l'Éclaireur ; l'oiseau se pose et laisse une plume ;
   - réglages « Tenir à deux » : plus de case pour couper la mouture, plus d'« Hybride » ; seules « Tablettes » et
     « Tableau » sont proposées ;
   - « Mon sac » d'un compte d'élève : fermé pendant le tour, ouvert hors du tour (« Ce soir, tu peux… ») ;
   - « Mon journal » : un article qui fait monter le compte montre le « +1 » ; une fiche d'espèce déjà étudiée par
     d'autres dit combien de la caravane y sont passés, sans prénom ;
   - au premier lancement de la projection, toucher « Activer le son » ; aucune tablette ne joue de musique ;
   - regarder la projection du fond de la salle : symboles gravés, plumes, fanions lisibles à 8 m ?
10. **Les marges du copiste**, sur la partie de démonstration : tenir une page → le bloc « Les marges du copiste »
    apparaît dans « Mon sac » d'un compte d'élève, avec « Le café » ; clore la partie → rien de plus ; « Marges du
    copiste », puis « Ouvrir l'enveloppe « baobab » » → tout le premier monde et l'enveloppe, aussi sur le compte de
    l'élève.
11. **Biomes** (aucune synchro) : ouvrir les biomes des plateaux 1 à 4 ; chaque onglet montre son biotope puis sa
    biocénose, sous « Le biotope — milieu de vie » et « La biocénose — communauté du vivant » ; au plateau 4, la
    limite des arbres est dans la taïga. Vérifier qu'une image n'apparaît pas deux fois dans un onglet.
12. **Histoire** (aucune synchro : la migration suffit) : ouvrir l'Histoire du plateau 1 avec un compte d'élève de la
    classe de démonstration ; images et légendes, avertissement, une mauvaise réponse (« Pas encore », l'heure), puis
    une bonne réponse une heure plus tard (la question a tourné : ce n'est pas la même) ; la même page depuis la
    tablette d'équipe. Relire les textes des quatre plateaux dans l'éditeur.
13. **Bilan Team Spirit** : enregistrer un bilan avec une carte retirée, le rouvrir : la carte est toujours retirée.
14. **Vitrine** : ouvrir `?demo=parents` dans un navigateur privé : « La nature » montre les Tropiques africains,
    aucun message d'administration, une seule visite d'Olu par onglet.
15. **Lexique et pages servies** : avec un compte d'élève de démonstration au plateau 1, le lexique du voyage ne nomme
    aucun visage ; relire « Les règles du jeu » et les grimoires dans l'app (rôles échangés, « Mon sac »).
16. **Carnet de Sélène** : relire dans l'éditeur `ep-IV-03` à `ep-IV-07` (la boîte de la séance 1) et `ep-VI-04` ;
    vérifier que `ep-I-13` et `rep-II-05` sont inactives.
17. **Documentation dans l'application** (onglet « Contenus ») : les deux nouveaux documents en tête, aucune surcouche
    ancienne qui masquerait un fichier (« Réinitialiser » sinon). Relire « L'essentiel du maître du jeu » et « Déroulé
    d'une partie » avant la répétition générale ; les imprimer si utile.
18. **Ne plus réimporter les tableurs de juin** : ni les chapitres avec une colonne « histoire » remplie
    (`lib/glChaptersImport.js` réécrit `story_markdown` ; les textes font foi dans `data/gl/histoire/`) ; ni le corpus
    QCM des biomes (`lib/glQcmImport.js` remettrait l'ancienne version des 36 questions de zone réécrites les 23 et
    24/11 ; la base fait foi) ; ni le lexique lore (`lib/glLoreGlossaryImport.js` : repartir de l'export de l'app) ;
    ni les feuillets, ni les questions de lore. S'il faut un jour importer des questions de lore : demander ensuite à
    Claude de revérifier qu'aucune question active ne cite le tiers `secret`.
19. **Avant le plateau 2** : rallumer le chapardeur, si tu le veux (`gameplay.tenir_chapardeur` → `true`) ; il est
    coupé pour le chapitre 1, et c'est lui qui fait parler Olu de l'oiseau, sans le nommer.
20. **Cartes à imprimer** : les planches de `Cartes_GL_24nov.zip` (26 cartes, deux PDF A4 recto verso ; la ligne « Au
    tour de jeu » des cartes Éclaireuse, Éclaireur, Opératrice et Opérateur y est recomposée pour l'échange des
    rôles).
21. **La boîte** : le mot de Sélène avec un rond de café au dos ; la grande main grasse sur la plaque (à essayer à la
    buée avant) ; les quatre enveloppes, à la main (textes dans `docs/prompts/gl-decisions/sources/copiste-notes.md`) ;
    la lettre sous le double fond.
