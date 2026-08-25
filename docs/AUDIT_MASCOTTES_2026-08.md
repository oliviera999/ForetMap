# Audit — le système de mascottes : pourquoi il est abscons, et comment le simplifier

> **Signalement.** « La mascotte importée OLU n'est pas utilisable dans la carte ou les visites,
> j'ai une liste figée à la place ; elle est présente et éditable [au studio]. De manière
> générale, il y a toujours des incohérences dans le fonctionnement des packs mascottes. »
>
> **Portée.** Lecture du code (routes, `lib/`, `src/`, réglages). Aucune base de données n'a été
> interrogée : les conclusions ci-dessous se déduisent des chemins de code, et sont référencées
> ligne à ligne. Le comportement d'une installation donnée dépend en plus de la valeur de ses
> réglages, que je n'ai pas.

---

## 1. Le signalement a deux causes, indépendantes

### 1.1 L'import réécrit l'identifiant du pack — la mascotte livrée n'est jamais remplacée

`routes/visit/mascot.js`, import en mode `create` :

```js
packUuid = crypto.randomUUID();
catalogId = `srv-${packUuid}`;
...
serverPack.id = catalogId;          // l'identifiant du pack.json est écrasé
```

Le pack OLU déclare `id: 'olu-spritesheet'` — précisément l'identifiant de la mascotte livrée,
pour la **remplacer**. À l'import, cet identifiant est jeté et remplacé par un `srv-<uuid>`.

Conséquence : le pack importé n'est pas OLU, c'est **une mascotte de plus**, à côté d'un OLU
silhouette qui reste au catalogue.

**Ce n'est pas un cas particulier de l'import.** Les deux seuls `INSERT INTO visit_mascot_packs`
posent `catalog_id = 'srv-<uuid>'` (lignes 419 et 787), le `PUT` ne permet pas de le changer (il
ne touche que `label`, `is_published` et le JSON), et le studio ne l'expose nulle part.

> **Aucun chemin de code ne permet aujourd'hui de créer un pack dont le `catalog_id` reprend
> celui d'une mascotte livrée.** La fonctionnalité de remplacement existe côté lecture
> (`buildVisitMascotSelectionOptions` fait bien gagner le pack à identifiant égal), elle est
> documentée dans la doc de référence — et elle est **inatteignable**.

### 1.2 La liste d'autorisation fige le registre au premier décochage

`src/utils/visitMascotAdminSelection.js`, en toutes lettres dans son propre en-tête :

> « `allowedIds` **vide = aucune restriction** […] Dès que l'admin décoche une mascotte, la liste
> est matérialisée à partir du registre courant. »

Autrement dit : tant qu'on n'a jamais rien décoché, tout nouveau pack publié est proposé. **Au
premier décochage**, la liste des mascottes autorisées est gelée à l'instant T — et **tout pack
publié ensuite en est absent**, donc invisible pour les visiteurs, sans le moindre message.

C'est la « liste figée » du signalement. Et le piège s'est refermé d'autant plus vite que le lot
14 a rapproché cette case du studio : elle est désormais à un clic, alors que sa conséquence
— geler le registre — n'est écrite nulle part dans l'interface.

### 1.3 Ce qu'il faut faire tout de suite, sans livraison

1. **Paramètres → Mascottes de visite** : recocher **toutes** les mascottes. La liste redevient
   vide, donc « aucune restriction », et les packs publiés réapparaissent.
2. Le pack importé s'appelle **« OLU (planches d'animation) »** et vit à côté d'OLU. Le désigner
   comme mascotte par défaut, et masquer l'OLU silhouette si le doublon gêne.

C'est un contournement, pas une correction : le §1.1 reste entier.

> **Correction d'une affirmation que j'ai faite deux fois.** J'ai écrit que le pack, portant
> `id: 'olu-spritesheet'`, remplacerait la mascotte livrée. C'est vrai du format, faux du chemin
> d'import. Je n'avais pas vérifié la route.

---

## 2. Pourquoi c'est abscons : quatre portes, trois magasins, trois notions de « mascotte »

Le système n'est pas compliqué par accident : chaque pièce a été ajoutée pour une bonne raison
locale. C'est leur **cumul** qui devient illisible.

### 2.1 Quatre portes avant qu'une mascotte atteigne un visiteur

| #   | Porte                                                           | Où elle se règle             | Ce qu'on voit si elle est fermée |
| --- | --------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| 1   | Le pack **existe**                                              | Studio → Packs               | —                                |
| 2   | Il est **publié**                                               | Studio, bouton Publier       | rien, il n'apparaît pas          |
| 3   | Il est **autorisé** (`ui.visit.mascot.allowed_ids`)             | Paramètres, autre écran      | rien, il n'apparaît pas          |
| 4   | Il est **choisi** (défaut global, ou préférence de la personne) | Paramètres / profil / visite | une autre mascotte               |

Trois de ces quatre portes échouent **en silence**, et deux vivent dans des écrans différents.
« Pourquoi ma mascotte n'apparaît-elle pas ? » n'a aujourd'hui aucune réponse dans l'interface.

### 2.2 Trois notions de « mascotte » qui ne se parlent pas

| Notion                  | Où elle vit                              | Modifiable ? | Supprimable ?             |
| ----------------------- | ---------------------------------------- | ------------ | ------------------------- |
| Entrée **catalogue**    | `src/utils/visitMascotCatalog.js` (code) | non          | non (masquable seulement) |
| **Pack serveur** visite | table `visit_mascot_packs`               | oui          | oui                       |
| **Pack GL**             | tables `gl_mascot_*`                     | oui          | oui                       |

Un prof voit une seule liste au sélecteur, mais trois régimes de droits, de stockage et
d'outillage derrière. D'où l'impression d'arbitraire : certaines mascottes s'éditent, d'autres
non, sans que rien ne le dise.

### 2.3 Trois magasins d'images

- `public/assets/mascots/**` — versionné dans le dépôt, livré avec l'application ;
- `uploads/visit_mascot_packs/<uuid>/` — la médiathèque **propre à un pack** ;
- `uploads/visit_mascot_sprite_library/` — la bibliothèque **partagée** entre packs.

Trois préfixes d'URL, trois jeux de règles de validation (`mascotPackAllowedFramesPrefixes`), et
un bouton « importer les PNG du catalogue vers la médiathèque du pack » qui existe précisément
pour faire passer les images du premier magasin au deuxième.

### 2.4 Les conséquences observables

- **Douze des seize mascottes livrées n'ont aucune animation.** Dix pointent des fichiers `.riv`
  qui **n'existent pas dans le dépôt** (`public/assets/rive/` est absent) ; elles rendent une
  silhouette SVG. Le volet « Mascottes livrées » le signale depuis le lot 14, mais elles
  occupent toujours le sélecteur des visiteurs.
- **Cloner un modèle catalogue** donnait jusqu'au lot 13b un pack dont les vingt et un états
  pointaient la même image fixe.
- **`gnome1`** était constructible par l'API mais absent de la liste du studio (corrigé au lot 13b).
- **Le réglage de visibilité** est écrit depuis deux écrans, sous deux permissions différentes
  (`admin.settings.write` d'un côté, `visit.manage` de l'autre).

---

## 3. Pistes, de la plus chirurgicale à la plus radicale

### P1 — L'identité d'un pack devient une donnée d'auteur _(petit, débloque le §1.1)_

Exposer `catalog_id` à la création et à l'import, avec deux choix explicites :

- **« Nouvelle mascotte »** → identifiant engendré, comportement actuel ;
- **« Remplacer une mascotte livrée »** → liste déroulante des seize, le pack prend son
  identifiant et s'y substitue partout.

À l'import, si le `pack.json` porte un `id` qui correspond à une mascotte livrée, le proposer
par défaut plutôt que de l'écraser en silence. Refuser proprement si l'identifiant est déjà pris
par un autre pack.

**Effet** : la fonctionnalité déjà documentée devient atteignable, et le pack OLU fait ce qu'il
annonce.

### P2 — La visibilité passe en liste noire _(petit, ferme une classe de bugs)_

Remplacer `ui.visit.mascot.allowed_ids` (liste blanche, qui fige) par une liste de mascottes
**masquées**. Ce qui est ajouté ensuite est proposé par défaut — la promesse que fait déjà la
doc de référence, et que la liste blanche brise au premier décochage.

Migration : à la lecture, une `allowed_ids` non vide se convertit une fois en son complément.

**Effet** : le symptôme « liste figée » disparaît définitivement, y compris pour les packs
publiés dans six mois.

### P3 — Fusionner catalogue et packs en un seul registre _(gros, c'est la piste de fond)_

> **Retenue.** Arbitrage rendu : c'est cette piste qui est suivie. Elle se livre en trois étapes,
> parce que son cœur — une migration et un semis au démarrage — ne peut pas être exercé sans base
> de données, et qu'un semis qui rate vide le sélecteur.
>
> | Étape | Contenu                                                                           | État      |
> | ----- | --------------------------------------------------------------------------------- | --------- |
> | 1     | **Le format décrit les trois moteurs** (`sprite_cut`, `spritesheet`, `rive`)      | ✅ livrée |
> | 2     | Migration `origin`, semis des mascottes livrées, registre unique en lecture       | à faire   |
> | 3     | Studio : une seule liste, « réinitialiser depuis l'origine » remplace le masquage | à faire   |
>
> **Pourquoi l'étape 1 d'abord.** Onze mascottes livrées sont `rive` et quatre `spritesheet` ;
> tant que le format ne savait décrire que `sprite_cut`, elles ne _pouvaient pas_ devenir des
> packs. Aucune fusion n'était possible avant d'ouvrir le format. C'est fait, et c'est vérifiable
> sans base : `tests/mascot-pack-renderers.test.js`.

Aujourd'hui « mascotte livrée » et « pack » sont deux mondes parallèles. Proposition : au
démarrage, **semer** les seize mascottes livrées dans `visit_mascot_packs` avec
`origin = 'builtin'`. Ensuite, il n'existe plus qu'**une** liste, **un** éditeur, **un** export,
**une** suppression.

- Une mascotte livrée devient un pack comme un autre — éditable, exportable, supprimable.
- « Réinitialiser » = re-semer depuis le code, ce qui remplace le masquage par un geste
  réversible et compréhensible.
- Le catalogue en code cesse d'être un univers concurrent : il devient une **graine**.
- P1 devient sans objet : il n'y a plus de « remplacement », seulement une édition.

C'est le changement qui supprime le plus d'incohérences d'un coup, et le plus coûteux :
migration, réécriture du registre, et arbitrage sur ce qu'on fait des packs déjà publiés.

### P4 — Une seule médiathèque _(moyen)_

Supprimer la médiathèque par pack au profit de la bibliothèque partagée : un seul préfixe
d'URL, une seule règle de validation, et les images se réutilisent entre packs sans copie. Les
PNG livrés avec l'application y sont semés au premier démarrage.

### P5 — Le studio répond à « pourquoi je ne la vois pas ? » _(petit, fort effet)_

Sur chaque ligne de la liste, un état lisible — **brouillon · publié · masquée · par défaut** —
et, quand la mascotte n'atteint pas les visiteurs, **la porte qui bloque**, nommée sur place avec
le bouton pour l'ouvrir. Les quatre portes du §2.1 cessent d'échouer en silence.

Peut se faire sans rien changer au modèle de données. C'est probablement le meilleur rapport
effort / soulagement.

### P6 — Trancher le sort des douze mascottes sans animation _(décision, pas code)_

Elles occupent le sélecteur et ne rendent qu'une silhouette. Trois issues : les masquer, leur
fabriquer de vraies planches (la chaîne OLU est générique — `scripts/olu-sheets-cut.cjs` ne
connaît qu'une table de planches), ou retrouver les fichiers `.riv` s'ils existent hors dépôt.

---

## 4. Ce que je recommande

**P5 + P2 d'abord.** Ensemble, ils suppriment le silence et la classe de bugs « liste figée »,
pour un coût modeste et sans migration lourde. C'est ce qui rendrait le système _compréhensible_
sans encore le refondre.

**P1 ensuite**, qui débloque le cas concret du pack OLU.

**P3 comme cap.** À décider séparément : c'est une refonte, elle mérite son propre arbitrage et
sa propre livraison. Mais tant qu'elle n'est pas faite, chaque nouvelle fonctionnalité devra
continuer d'être écrite deux fois — une pour le catalogue, une pour les packs.
