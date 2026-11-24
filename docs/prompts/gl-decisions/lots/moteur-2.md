# Lot moteur-2 — Les rôles du tour s'échangent

> Chantier G&L « décisions » · vague 1 · couloir moteur · charge moyenne · banc : seuils
> Branche : `claude/gl-decisions-moteur-2` · Attend : moteur-1, contenu-1, contenu-2 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Sur l'écran d'équipe, le rôle écrit au-dessus de « Fouiller » devient « Éclaireuse ou Éclaireur » ; celui écrit
  au-dessus de « Répondre à la question » devient « Opératrice ou Opérateur ».
- Les péripéties, deux missions et le critère d'un badge disent les rôles en formes doubles, et laissent les dés à
  la ou au Gestionnaire.
- La page « Les règles du jeu » dit que l'Éclaireuse ou l'Éclaireur montre l'endroit.

Aucune règle ne change : les rôles restent un conseil, le serveur ne lit jamais un rôle.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 35 de l'addendum 4 | 24/11, 11 h 50 | Les deux gestes du tour s'échangent : l'Éclaireuse ou l'Éclaireur fouille (montre où chercher) ; l'Opératrice ou l'Opérateur répond à la question de case. Dans une équipe de quatre, l'Assistante ou l'Assistant fait aussi l'Opératrice ou l'Opérateur (le geste reste « répondre »). | — |
| Décision du 24/11 après-midi (mission `mis-13`) | 24/11, vers 14 h 35 | `mis-13` : « Trouver une page et la laisser lire par la ou le Secrétaire d'une autre équipe. » | (choix sur carte) |

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- Toutes les péripéties qui nomment un rôle passent en formes doubles, et les dés reviennent à la ou au Gestionnaire
  (les anciens textes les confiaient à l'Opérateur). C'est plus large que le seul échange décidé.
- Les clés techniques ne sont pas renommées (`operateurs_json`, route `…/tenir/tour/operateurs`, rôle
  `'operateur'`, source de badge `pages_trouvees_operateur`) : un commentaire « historique » à la place, aucune
  migration de schéma.

## 3. Fichiers

**À toi**

- `src/shared/glSortMomentsCore.js`
- `lib/glTour.js` (seulement un commentaire d'une ligne dans `setOperateurTx`, l. 798-806)
- `lib/glTenirBadges.js` (commentaire l. 37), `lib/glRewardsCatalog.js` (commentaire l. 23, si tu le juges faux)
- `tests/gl-ensemble-unifie-deux-ecrans.test.js`, `tests-ui/gl/GLTenirMoment.test.jsx`,
  `tests-ui/gl/glTenirMoment.test.js`, `tests-ui/gl/GLDeuxEcrans.test.jsx`

**Nouveaux**

- `migrations/<numéro pris à la fin>_gl_regles_roles_echanges.sql` (étiquette `mig-regles-roles`)
- `tests/gl-migration-regles-roles.test.js` (modèle : `tests/gl-migration-343-mascots.test.js`)
- `tests/content/gl-roles-catalogues.test.js` (ou un bloc dans `tests/content/gl-tenir-donnees.test.js`)
- `changelog.d/gl-decisions-moteur-2.md`, `docs/prompts/gl-decisions/rapports/moteur-2.md`

**D'un autre couloir, modification minimale permise**

| Fichier | Ce que tu y fais exactement |
| --- | --- |
| `data/gl/tenir/peripeties.json` | Le champ `texte` des péripéties du tableau de l'étape moteur-2.2. Rien d'autre. |
| `data/gl/tenir/missions.json` | Le champ `texte` de `mis-09` et de `mis-13`. |
| `data/gl/tenir/badges.json` et `data/gl/tenir/exemple/badges.json` | Le champ `critere` du badge `trouveur`. Pas son `nom` (lot contenu-2). |
| `routes/gl/games/tenir-tour.js` | Un commentaire d'une ligne au-dessus de `PUT /games/:id/tenir/tour/operateurs` (l. 452). |
| `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0) | § 2, l. 68 : la phrase des cinq rôles. |
| `docs/reference/gl/guide-du-mj.md` | l. 590-593 : la phrase des rôles, seulement elle. |

**Ne touche pas**

| Fichier ou symbole | Lot qui le modifie |
| --- | --- |
| `lib/shared/glSortMomentsCore.js` | miroir, régénéré par le build |
| `data/gl/tenir/olu-lignes.json` (dont `olu-18`) | moteur-3, moteur-4 |
| `src/gl/utils/glTenirMoment.js`, `src/gl/components/tenir/*` | couloir écrans (ecrans-2, ecrans-4) |
| `src/shared/fresque/` (niveau « Éclaireur ») | non concerné |
| Page des règles en base, autres phrases ; section « Le Seuil » | contenu-5 (`mig-pages-servies`) |
| `sql/schema_foretmap.sql` | personne : aucune migration de schéma ici |

## 4. Étapes (un commit par étape, dans cet ordre)

Toutes viennent de l'ex-étape « 24 quinquies-R » de l'addendum 4, découpée en trois commits.

**Banc d'abord** : passe « avant » (section 7).

### moteur-2.1 — Le code des rôles (ex-étape 24 quinquies-R, point 1)

- **Constat vérifié** (`src/shared/glSortMomentsCore.js`) :

  | Symbole | Ligne | État sur `main` |
  | --- | --- | --- |
  | Commentaire d'en-tête des rôles | 57-64 | « Éclaireuse ou Éclaireur : répond à la question de case · Opératrice ou Opérateur : fouille · … (à quatre, fait aussi l'Éclaireur) » |
  | `ROLES_TENIR` | 65-71 | `repondre: 'Éclaireuse ou Éclaireur'`, `fouiller: 'Opératrice ou Opérateur'` |
  | `ROLES_EN_CONSEIL` | 74-81 | phrases du moment, avec l'apostrophe typographique « ’ » |
  | `roleDuGeste(geste, effectif)` | 84-89 | à quatre ou moins, `repondre` rend `ROLES_TENIR.jeter` (« Assistante ou Assistant ») |

  La constante `ROLE_DU_GESTE` que citaient les anciens textes **n'existe pas** : le code a `ROLES_TENIR`,
  `ROLES_EN_CONSEIL` et `roleDuGeste()`.

- **Changement attendu** :

  | Clé | Avant | Après |
  | --- | --- | --- |
  | `ROLES_TENIR.repondre` | `'Éclaireuse ou Éclaireur'` | `'Opératrice ou Opérateur'` |
  | `ROLES_TENIR.fouiller` | `'Opératrice ou Opérateur'` | `'Éclaireuse ou Éclaireur'` |
  | `ROLES_EN_CONSEIL.repondre` | « C’est le moment de l’Éclaireuse ou de l’Éclaireur. » | « C’est le moment de l’Opératrice ou de l’Opérateur. » |
  | `ROLES_EN_CONSEIL.fouiller` | « C’est le moment de l’Opératrice ou de l’Opérateur. » | « C’est le moment de l’Éclaireuse ou de l’Éclaireur. » |
  | commentaire d'en-tête | (voir constat) | « Éclaireuse ou Éclaireur : fouille (montre où chercher) · Opératrice ou Opérateur : répond à la question de case · … (à quatre, l'Assistante ou l'Assistant fait aussi l'Opératrice ou l'Opérateur) » |

  1. `roleDuGeste()` ne change pas de comportement : à quatre, `repondre` rend toujours « Assistante ou
     Assistant ». Aligne seulement son commentaire.
  2. Les clés techniques ne changent pas : `operateurs_json` (table `gl_game_rounds`), la route
     `PUT /games/:id/tenir/tour/operateurs`, le rôle `'operateur'` par défaut (`lib/glTour.js › setOperateurTx`,
     l. 806) et la source de badge `pages_trouvees_operateur` (`lib/glTenirBadges.js`, l. 36) désignent désormais
     **l'élève qui fouille**. Ajoute à chacun un commentaire d'une ligne : « historique : désigne l'élève qui
     fouille, l'Éclaireuse ou l'Éclaireur depuis le 24/11 ». Ne renomme rien.
  3. Cherche tout autre libellé visible qui associe un rôle à un geste
     (`git grep -n "Opérat\|Éclaireu" -- src/gl src/shared lib routes`) et aligne-le. Sur `main`, il n'y en a pas
     d'autre que ceux de `glSortMomentsCore.js` ; les commentaires de `lib/glTenirBadges.js` l. 37 et
     `lib/glRewardsCatalog.js` l. 23 parlent de l'« Opérateur » au sens ancien.
- **Textes** : les quatre du tableau, mot pour mot, apostrophe typographique comprise.
- **Tests à changer** (quatre tests affirment les anciens rôles : inverse-les) :

  | Test | Lignes | Ce qui s'inverse |
  | --- | --- | --- |
  | `tests/gl-ensemble-unifie-deux-ecrans.test.js` | 29-49, 63-64, 71, 83, 98 | `ROLES_TENIR`, `roleDuGeste('fouiller')`, `roleDuGeste('repondre', 5)` et `(…, 0)`, `ROLES_EN_CONSEIL.fouiller`, les lignes « … : la question de la case » et « … : 2 fouilles », le titre et le commentaire l. 38 |
  | `tests-ui/gl/GLTenirMoment.test.jsx` | 112 | pendant la fouille, la carte porte « Éclaireuse ou Éclaireur » |
  | `tests-ui/gl/glTenirMoment.test.js` | 154, 223 | `role` du geste `repondre` et du geste `fouiller` |
  | `tests-ui/gl/GLDeuxEcrans.test.jsx` | 117, 122, 154 | rôle du gros bouton « Répondre à la question » et de la puce `fouiller` |

  `roleDuGeste('repondre', 4)` reste « Assistante ou Assistant ». `tests/gl-tenir-ecran-equipe.test.js` (l. 82)
  parcourt `ROLES_EN_CONSEIL` : relis-le, il ne devrait pas changer.
- **Critère d'acceptation** : `ROLES_TENIR.fouiller === 'Éclaireuse ou Éclaireur'`,
  `ROLES_TENIR.repondre === 'Opératrice ou Opérateur'` ; l'écran d'équipe affiche le bon rôle au-dessus de chaque
  geste ; `npm run build` régénère le miroir `lib/shared/`.

### moteur-2.2 — Les catalogues (ex-étape 24 quinquies-R, point 2)

- **Constat vérifié** :

  | Fichier | Constat sur `main` |
  | --- | --- |
  | `data/gl/tenir/peripeties.json` | 17 péripéties nomment un rôle, au masculin seul ; sept font lancer les dés par « l'Opérateur » (`per-01`, `per-06`, `per-12`, `per-19`, `per-21`, `per-28`, `per-32`). |
  | `data/gl/tenir/missions.json` | `mis-09` (« … que l'Éclaireur a choisi… ») et `mis-13` (« … par le Secrétaire d'une autre équipe. ») |
  | `data/gl/tenir/badges.json`, l. 40, et `exemple/badges.json`, l. 40 | `trouveur.critere` : « Trois pages trouvées pendant un tour où l'élève était saisi comme Opérateur. » |
  | `data/gl/tenir/exemple/peripeties.json`, `exemple/missions.json` | aucun nom de rôle : rien à changer |

- **Après le lot contenu-1** : `per-01`, `per-02`, `per-04`, `per-06` et `per-07` portent déjà le texte ci-dessous
  (même texte) et `tests/gl-tenir-import.test.js` (l. 33) est aligné. Vérifie-les, ne les réécris pas. **Après le
  lot contenu-2** : le `nom` du badge `trouveur` est « Trouveuse / Trouveur » ; n'y touche pas.
- **Changement attendu** : dans `data/gl/tenir/` (et dans `exemple/` quand un test y lit le texte), écris les
  textes ci-dessous. Chaque catalogue se charge par son import habituel (`lib/glTenirImport.js`) : aucune migration.
- **Textes** (mot pour mot) :

  | Fichier | id | Nouveau texte |
  | --- | --- | --- |
  | `peripeties.json` | `per-01` | « Une mangouste a volé le dé. La ou le Gestionnaire relance de la main qui n'écrit pas. » |
  | | `per-02` | « Pluie de mousson sur la caravane : l'équipe répond à la prochaine question en chuchotant, et l'Opératrice ou l'Opérateur tranche en mimant. » |
  | | `per-04` | « Un calao s'est posé sur la carte. L'Éclaireuse ou l'Éclaireur désigne la fouille sans parler, du bout du nez. » |
  | | `per-06` | « Le baobab a soif : chaque membre dit un mot qui contient la lettre O avant que la ou le Gestionnaire ne lance. » |
  | | `per-07` | « Nuit dans la savane : l'équipe répond à la prochaine question les yeux fermés, en écoutant la ou le Secrétaire lire deux fois. » |
  | | `per-09` | « Tempête de sable : l'Opératrice ou l'Opérateur tranche la prochaine réponse les yeux fermés, sur la seule voix de son équipe. » |
  | | `per-11` | « Mirage : l'Éclaireuse ou l'Éclaireur désigne deux endroits à fouiller, l'équipe vote à main levée pour le bon. » |
  | | `per-12` | « Les chèvres sont montées dans l'arganier : la ou le Gestionnaire lance les dés debout sur une seule jambe. » |
  | | `per-13` | « Le vent chaud a séché les gorges : l'équipe répond à la prochaine question sans aucun mot, seulement par gestes, et la ou le Secrétaire traduit. » |
  | | `per-14` | « Cigales : pendant que l'Éclaireuse ou l'Éclaireur cherche l'endroit, l'équipe fait « tssss » à voix basse sans s'arrêter, et se tait dès que la fouille est faite. » |
  | | `per-16` | « Le fennec entend tout : l'équipe doit répondre à la prochaine question avant que l'Éclaireuse ou l'Éclaireur ait compté jusqu'à vingt, en silence. Sinon, on répond quand même. » |
  | | `per-18` | « Brume sur la lande : l'Éclaireuse ou l'Éclaireur désigne la fouille avec le dos de la main, sans un mot. » |
  | | `per-19` | « Le geai a caché un gland : avant de lancer, la ou le Gestionnaire doit retrouver, dans la trousse d'un membre de l'équipe, un objet que l'équipe a choisi en secret. » |
  | | `per-21` | « Le blaireau creuse : la ou le Gestionnaire lance les dés en les faisant rouler sous la main, sans les soulever. » |
  | | `per-24` | « Chouette de minuit : l'équipe fait son choix de réponse en se parlant seulement à l'oreille, en chaîne, jusqu'à l'Opératrice ou l'Opérateur. » |
  | | `per-28` | « Les lemmings passent sous la table : la ou le Gestionnaire lance les dés à genoux. » |
  | | `per-32` | « Le loup chante : la ou le Gestionnaire hurle une fois, doucement, à la lune, avant de lancer. Si elle ou il ne veut pas, la ou le Secrétaire le fait. » |
  | `missions.json` | `mis-09` | « L'Éclaireuse ou l'Éclaireur fouille les yeux bandés : l'équipe la ou le guide de la voix jusqu'à l'endroit. » |
  | | `mis-13` | « Trouver une page et la laisser lire par la ou le Secrétaire d'une autre équipe. » |
  | `badges.json` | `trouveur`, `critere` | « Trois pages trouvées pendant un tour où l'élève fouillait pour son équipe. » |

- **Tests** (données : `tests/content/`) :
  1. aucune péripétie ne fait lancer les dés par un autre rôle que la ou le Gestionnaire ;
  2. aucun nom de rôle au masculin seul (« l'Opérateur », « l'Éclaireur », « le Gestionnaire », « le Secrétaire »
     sans sa forme double) dans `peripeties.json` et `missions.json`. **Ces deux fichiers seulement** :
     `olu-lignes.json` garde `olu-18` au masculin jusqu'au lot moteur-4.
- **Critère d'acceptation** : `npm run test:content` vert ;
  `DB_NAME=<ta base de banc> npm run gl:import:tenir -- --fichier tous --strict --dry-run` sans erreur.

### moteur-2.3 — La phrase des règles en base (ex-étape 24 quinquies-R, point 3)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | Prod, `gl_content_pages`, `slug = 'rules'`, colonne `body_markdown` | La phrase « Une énigme dit quoi chercher, et l'Opératrice ou l'Opérateur montre l'endroit. » y est, d'un seul tenant, apostrophes droites (position 1438 d'une page de 2 471 caractères, relue le 24/11). |
  | Dépôt | Cette phrase n'existe **nulle part** : elle a été posée en prod à la main. Sur une base neuve, la page `rules` est le texte d'amorce de `migrations/080_gl_foundations.sql` (« ## Règles essentielles… »), sans aucun rôle. |

- **Changement attendu** : la migration `mig-regles-roles` (section 5). Un seul `UPDATE` avec `REPLACE`, gardé par
  la présence de l'ancienne phrase exacte. La colonne s'appelle `body_markdown` (pas `content`).
- **Textes** :
  - ancienne phrase : « Une énigme dit quoi chercher, et l'Opératrice ou l'Opérateur montre l'endroit. »
  - nouvelle phrase : « Une énigme dit quoi chercher, et l'Éclaireuse ou l'Éclaireur montre l'endroit. »
- **Tests** (`tests/gl-migration-regles-roles.test.js`) :
  1. le test **sème lui-même** l'ancienne phrase dans la page `rules`, joue la migration **deux fois** : la page
     contient « l'Éclaireuse ou l'Éclaireur montre l'endroit », une seule fois, et plus l'ancienne phrase ;
  2. **base neuve** (page `rules` sans la phrase) : la migration n'écrit rien (`body_markdown` inchangé).
- **Critère d'acceptation** : les deux cas verts ; ton rapport dit ce que la migration a trouvé sur ta base locale
  (rien, c'est attendu).

## 5. Migration

| Point | Valeur |
| --- | --- |
| Étiquette | `mig-regles-roles` (numéro de fichier pris à la fin, voir les règles communes) |
| Table | `gl_content_pages`, ligne `slug = 'rules'`, colonne `body_markdown` |
| Garde exacte | `WHERE slug = 'rules' AND body_markdown LIKE '%Une énigme dit quoi chercher, et l''Opératrice ou l''Opérateur montre l''endroit.%'` |
| Écriture | `REPLACE` de la phrase ancienne par la nouvelle (section 4, étape moteur-2.3). Rien d'autre dans la page. |
| Prod au 24/11 | La garde **tient** : l'ancienne phrase est présente, la nouvelle absente. La migration y écrira une fois. |
| Base neuve | La phrase n'existe pas : la migration **ne fait rien**. C'est le lot contenu-5 (`mig-pages-servies`) qui aligne plus tard une base neuve sur la prod, avec la phrase déjà corrigée. |
| Rejeu | Idempotente : au second passage, la garde ne trouve plus rien. |

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire : tous les textes sont dans cette fiche.

## 7. Vérifications propres au lot

- **Banc, régime « seuils »** (ce lot touche aux gestes du tour) : une passe **avant** toute modification, une
  passe **après** l'étape moteur-2.3, avec les trois commandes des règles communes. Les anciens textes ne donnaient
  aucune mesure pour cette étape : note les quatre mesures communes (carnet complet aux plateaux 1 et 2, écart de
  cases au camp, dépense de gemmes par élève et par chapitre, reculs de voile dus à la Lumière). **Attendu : aucune
  différence**, ce lot ne change que des libellés et des textes. Une différence est une alerte inexpliquée.
- Le badge `trouveur` garde son calcul (élève saisi dans `operateurs_json`) : vérifie qu'un test existant le couvre
  encore après ton commentaire.
- `npm run test:content` et l'import strict à blanc (étape moteur-2.2).
- e2e (sous le verrou) : `e2e/gl-tenir-tablettes.spec.js`.
- Captures (`docs/captures/gl-decisions/moteur-2/`) : la carte du moment pendant une question de case et pendant
  une fouille, tablette 1024 × 768, avant et après.

## 8. Contrats de test changés

| Contrat | Avant | Après |
| --- | --- | --- |
| `ROLES_TENIR.repondre`, `roleDuGeste('repondre', 5)` | « Éclaireuse ou Éclaireur » | « Opératrice ou Opérateur » |
| `ROLES_TENIR.fouiller`, `roleDuGeste('fouiller')` | « Opératrice ou Opérateur » | « Éclaireuse ou Éclaireur » |
| `ROLES_EN_CONSEIL.repondre` / `.fouiller` | phrases de l'ancien rôle | phrases échangées |
| « Maintenant, vous pouvez… » | « Éclaireuse ou Éclaireur : la question de la case », « Opératrice ou Opérateur : 2 fouilles » | « Opératrice ou Opérateur : la question de la case », « Éclaireuse ou Éclaireur : 2 fouilles » |
| Textes de 17 péripéties, de `mis-09`, de `mis-13`, critère du badge `trouveur` | rôles au masculin seul | formes doubles (section 4) |

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TENIR_A_DEUX_REGLES.md`, § 2, l. 68 : « Éclaireuse / Éclaireur (fouille) », « Opératrice / Opérateur
  (répond à la question de case) », « à quatre, l'Assistante ou l'Assistant fait aussi l'Opératrice ou
  l'Opérateur ».
- `docs/reference/gl/guide-du-mj.md`, l. 590-593 : la même phrase, et elle seule.
- `docs/API.md` : sous `PUT …/tenir/tour/operateurs`, une ligne : la clé désigne l'élève qui fouille.
- Pour le § 0 des règles (dans ton rapport) : « 24/11 : les deux gestes du tour s'échangent. L'Éclaireuse ou
  l'Éclaireur fouille ; l'Opératrice ou l'Opérateur répond à la question de case. »

## 10. Hors périmètre

| Ce que ce lot ne fait pas | Lot qui le fait |
| --- | --- |
| Le test « la sonde porte le rôle Opératrice ou Opérateur » (que l'ancien texte rangeait ici) | moteur-4 |
| `olu-18` et les autres lignes d'Olu | moteur-4 (texte), voir « À relire » |
| Le `nom` des badges en formes doubles | contenu-2 |
| Le reste de la page des règles, « Mon sac » | contenu-5 |
| Les repères de la visite d'Olu et les pages servies qui nomment un rôle | ecrans-6, contenu-5 |
| Les docs du prof (« L'essentiel du maître du jeu », « Déroulé d'une partie ») | fin-2 |
| Les cartes Job en papier | hors dépôt (voir « Pour Oliv ») |

## 11. Pour Oliv

**À relire**

- **`olu-18` contredit l'échange.** Cette ligne d'Olu se dit au moment d'une question. Elle dit aujourd'hui « Le
  Gestionnaire a tranché. Je respecte un Gestionnaire qui tranche. », et le texte prévu au lot moteur-4 est « La ou
  le Gestionnaire a tranché. Une équipe qui tranche, j'aime ça. ». Or depuis l'échange, c'est l'Opératrice ou
  l'Opérateur qui répond (`per-02` : « l'Opératrice ou l'Opérateur tranche en mimant »). Ce lot ne la réécrit pas :
  à toi de dire qui « tranche ».
- Les 17 péripéties, `mis-09`, `mis-13` et le critère du badge « Trouveuse / Trouveur » (section 4).
- À quatre, le rôle écrit au-dessus de « Répondre à la question » reste « Assistante ou Assistant ».

**À faire après la vague**

- Les catalogues `peripeties`, `missions` et `badges` se rechargent seuls au démarrage (empreinte changée) ;
  vérifie-le dans Contenus → Chapitres, sinon synchronise-les.
- Ouvre la page « Les règles du jeu » : la phrase dit « l'Éclaireuse ou l'Éclaireur montre l'endroit ».
- Cartes Job en papier (décision 36 de l'addendum 4 : on ne refait pas les cartes) : seule la ligne « Au tour de
  jeu » des quatre cartouches concernés est à recomposer avant l'impression. C'est hors dépôt.
