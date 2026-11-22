# ForêtMap — audit des restrictions du profil cycle 3 (22/11/2026)

*État vérifié : prod v1.263.0, schéma 387 (chantier collège 378 → 387 déployé). Méthode : lecture du code au commit `ed203b6` (dépôt cloné), mesures sur la base de prod par le connecteur, rejeu des 15 séances collège publiées sous le profil « cycle 3 ». Rien n'a été modifié.*

---

## 1. Verdict

Le ressenti est fondé. Le chantier collège a empilé **quatre filtres durs** dans le réseau trophique (espèces hors carte, types hors palier, cadrage « Réseau alimentaire » par défaut, réseau borné autour d'une espèce) et **masqué des rubriques de fiche dont les séances 6e ont besoin**. Aucun de ces filtres n'a d'issue « Pour aller plus loin », contrairement à la décision 2 (barrière **douce**) appliquée au glossaire et aux groupes. Les trous de données (présences manquantes, ressources rattachées à aucune carte) deviennent ainsi des blocages visibles.

**10 des 15 séances collège publiées** sont cassées ou dégradées en cycle 3 (§ 3).

La cause n° 1 est le filtre « espèces hors carte » ; il défait une décision antérieure, documentée dans `routes/food-web.js` : *« Une relation est retenue dès qu'une de ses extrémités est dans le périmètre… pour qu'elle la marque au lieu de la masquer »*.

---

## 2. Les causes, mesurées

### 2.1 Réseau trophique : le filtre « hors carte » retire environ 65 % des liens

`foodweb_offmap_species = hide` au collège (`pedagoVisibilityCore.js`) → `filterItemsForProfile` ne garde que les liens dont **les deux** extrémités sont sur la carte.

| Carte | Liens reçus | Deux extrémités sur la carte | + types cycle 3 | + cadrage par défaut « Réseau alimentaire » |
|---|---|---|---|---|
| foret | 791 | 262 | 233 | **156 (20 %)** |
| n3 | 476 | 154 | 111 | **104 (22 %)** |
| lyautey | 540 | 125 | 114 | 98 |
| dayat | 790 | 391 | 377 | 254 |
| melah | 725 | 231 | 218 | 200 |
| sablettes | 282 | 124 | 111 | 109 |
| beaulieu | 16 | **0** | 0 | 0 |

Espèces d'une carte **sans aucun lien visible** en cycle 3 (donc absentes de la liste « espèce de départ » et annoncées « relations non montrées » depuis leur fiche) : n3 29/116 (25 %), lyautey 32/121, foret 13/171, melah 14/147, sablettes 8/93, dayat 9/280, beaulieu 4/4.

**Espèces phares** (mises en tête au collège) sans lien visible : 13 sur 100 ; 22 absentes du cadrage par défaut. Exemples : ver de compost (foret), mouche soldat noire, éristale gluant, laiteron maraîcher, pourpier (n3).

### 2.2 Ressources et fiches sans carte : la décomposition disparaît

Les 6 fiches `ressource` (compost et épluchures, litière, fruits tombés, crottes, bois mort, carton) et le biofilm ne sont rattachés à **aucune carte**. Le filtre hors carte coupe donc tous les liens de détritivorie et de décomposition qui y mènent : 46 coupures pour « Compost et épluchures », 36 pour « Litière de feuilles », 18 pour « Fruits tombés », 18 pour « Crottes », 15 pour « Bois mort », 14 pour le biofilm. C'est précisément la notion C3-MAT / C3-MATORG (devenir de la matière organique, décomposeurs).

S'y ajoutent **71 taxons et 2 consortiums sans carte** (fenouil, citronnier, abricotier, lierre, plumbago, libellules…) : jamais visibles dans un réseau collège.

### 2.3 Trous de présence dans le registre

Le filtre révèle des présences manquantes que l'ancien affichage tolérait :
- **abeille domestique** absente de n3 → la courgette n'a plus aucun pollinisateur visible ;
- **pucerons** et **mineuse de la tomate** absents de n3 → la tomate perd ses ravageurs ;
- **escargot petit-gris** et **escargot espagnol** absents de n3, alors que la clé `compost-petites-betes` y mène ;
- chat, chevêche, hérisson d'Algérie, tarente, criquet marocain : chacun coupe 20 à 27 liens sur 4 à 6 cartes.

À confirmer par Oliv ou sur le terrain avant toute écriture (aucune présence inventée).

### 2.4 Types d'interaction et cadrage

- Types montrés en cycle 3 : 9 sur 19. Masqués : compétition (32 liens), assimilation (25), symbiose (16), facilitation (15), commensalisme (11), mutualisme (10), excrétion (9), **mycophagie (8)**, nitrification (3), allélopathie (1), soit 130 liens (10 %). Effet secondaire, sauf deux incohérences : la **mycophagie** (« mange des champignons ») fait partie du cadrage « Réseau alimentaire » mais est absente de `COLLEGE_INTERACTION_TYPE_ENUM` ; le **mutualisme** est masqué alors que la pollinisation, qui en est un cas, est montrée.
- Le cadrage par défaut « Réseau alimentaire » exclut **pollinisation** et **plante hôte**. La liste des espèces de départ est calculée **après** ce cadrage : pollinisateurs et fleurs n'y figurent pas tant que l'élève n'a pas changé de cadrage, et la séance ne peut pas l'imposer (`open_foodweb` n'a pas de paramètre de cadrage).

### 2.5 Aucune issue dans le réseau

Au collège : pas de réseau complet, pas d'espèces hors carte, pas d'autres types, profondeur 2 au plus. Le message affiché (« des relations existent, mais aucune n'est montrée ici… Choisis une autre espèce ou un autre cadrage ») ne propose rien. Seule échappatoire, involontaire : choisir « Toutes les cartes », qui neutralise le filtre hors carte (pas de colonnes `in_scope`), mais avec ~650 espèces dans la liste de départ.

### 2.6 Fiche espèce : rubriques masquées dont les séances ont besoin

`meta_sections = hide` retire au collège les sections **Identité** et **Écologie et usages** entières : cycle de vie (annuelle / vivace), taille, reproduction, habitat, milieu, **rôle trophique** (producteur / consommateur / décomposeur, termes `base` du glossaire), origine, autres noms. `accepted_name_gbif_latin = hide` masque **aussi le nom scientifique d'usage** (le composant cache tout le bloc latin).

Pour les espèces phares, `description_college` (35 mots) **remplace** la description, sans accès à la version complète.

Seule la description reste : 82 à 92 caractères pour tomate, courgette, romarin, ail, Nitrosomonas, cloporte.

### 2.7 Groupes emboîtés : la boîte « quatre membres » a disparu

`tetrapodes.visible_college = 0` (de même amniotes, hexapodes). Arbre collège : Vertébrés → Mammifères / Oiseaux / Lézards et serpents… Or la séance `6e-grands-groupes` attend qu'on range pipistrelle, rougequeue et hémidactyle dans une boîte « quatre membres », puis le tilapia dans une plus grande. Cette boîte n'existe plus ; « Pour aller plus loin » ouvre l'arbre complet (jusqu'à 10 niveaux), trop savant. La boîte « quatre membres » est pourtant un classique de la classification en 6e. (Glossaire : « tétrapode » est en `approfondissement`.)

### 2.8 Quiz

Après le retri D3 : 330 questions collège actives sur 482 accessibles en cycle 3 (68 %). Mais des catégories entières sont muettes, faute de notion cycle 3 sur la **catégorie**, pas pour une raison de contenu :
- `environnement_durable` : 0/10 (notions 1-ECO, C4-RESS, C4-TERRE ; pas de C3-ENV, qui traite pourtant des enjeux environnementaux) ;
- `ravageurs_auxiliaires` : 3/25 (1-ECO, 2-AGRO, C4-TERRE ; les auxiliaires du potager relèvent aussi de C3-ALIM / C3-ENV) ;
- `microbes_sante`, `demarche_mesure`, `populations_equilibres` : 3 chacune.

**QF9877**, mini-quiz de la séance `6e-eau-de-nos-lieux` (étiquetée cycle 3), est désormais de palier 2. Comportement à vérifier.

Le référentiel cycle 3 ne compte que 5 notions distinctes (7 avec les doublons C3-DEV / C3-DEVREPRO et C3-MAT / C3-MATORG) : la déduction du palier par les notions est aussi bonne que ce référentiel, donc grossière.

### 2.9 Qui tombe en cycle 3 par défaut

- Visite sans compte (parents, institutionnels compris) ;
- **45 élèves sur 479** dont aucun groupe actif n'a de `curriculum_niveau` (33 groupes sans niveau) : profil collège, palier cycle 3, **lycéens compris** ;
- comptes personnels sans groupe ni choix de niveau (migration 387 : défaut cycle 3).

### 2.10 Incohérences d'interface

- La fiche liste **toutes** les interactions (`/api/plants/:id/interactions`, non filtrées, avec les codes bruts `plante_hote`, `assimilation`…), puis « Voir le réseau trophique » annonce qu'aucune relation n'est montrée. C'est le cas exact du ver de compost.
- « Voir le réseau trophique » depuis une fiche ne transmet pas de carte : il ouvre la carte active, où l'espèce peut ne pas être → profil « hidden » d'office.
- Textes de séances écrits pour l'ancien réseau : « tape le nom… puis clique sur isoler » (`6e-sol-de-n3`), « Affiche ensuite tout le réseau » (`6e-biodiversite-deux-lieux`, deux fois) : impossible au collège.

---

## 3. Séances collège rejouées en cycle 3

| Séance | Étape | Constat |
|---|---|---|
| `6e-sol-de-n3` | réseau du ver de compost (49) | **0 lien visible sur 8** (tout va vers des ressources hors carte ; mutualisme et compétition masqués). Espèce absente de la liste de départ. Séance vidée de son objet. |
| `6e-pollinisation` | « quel insecte transporte le pollen ? » (courgette 6) | **Aucun lien de pollinisation visible** : abeille domestique hors n3, et cadrage par défaut sans pollinisation. Xylocope (cité pour la tomate) hors carte aussi. |
| `6e-regimes-alimentaires` | tilapia 22, caragouille 822, ténébrion 769, pipistrelle 320 | Tilapia 1/4 (biofilm et élodée coupés, alors que le texte les cite) ; caragouille 1/6 ; ténébrion 1/3 ; pipistrelle 4/7. Les régimes deviennent indéductibles. |
| `6e-biodiversite-deux-lieux` | « Affiche ensuite tout le réseau » (×2) | Impossible au collège. |
| `6e-aquaponie-n3` | tomate (3) : « animaux qui s'en nourrissent » | 5/11 ; pucerons et mineuse hors carte. |
| `6e-grands-groupes` | boîtes emboîtées | Pas de boîte « quatre membres » : la consigne et l'exemple de l'étape g4 ne correspondent plus à l'arbre. |
| `6e-mauvaise-saison` | annuelle / vivace, bulbe | Cycle de vie masqué ; descriptions de 87 à 92 caractères. Réponse introuvable sur la fiche. |
| `6e-pas-la-par-hasard` | « Que dit sa fiche de son milieu de vie ? » | Habitat masqué ; partiellement sauvé par `description_college` (massette, patelle, talitre), pas pour le lentisque. |
| `6e-sosies` | noms scientifiques | Masqués sur les fiches (le texte de l'étape les donne, la fiche non). |
| `6e-eau-de-nos-lieux` | QF9877 | Question de palier 2 dans une séance cycle 3. |
| `6e-estran-ecosysteme`, `6e-expedition-lyautey`, `6e-retour-sejour`, `college-qui-mange-qui`, `college-reconaitre-sans-toucher` | — | Fonctionnent (patelle 3/3, crabe vert 7/8 ; clés non filtrées par niveau). |

---

## 4. Recommandations

Principe proposé : **simplifier la présentation, pas l'accès**. Au collège, on ordonne, on étiquette simplement, on replie ; on ne retire que ce qui est vraiment hors programme, et toujours avec une issue.

### A. Code (prompt Claude Code à rédiger)

1. **Hors carte : marquer au lieu de masquer.** Au collège, garder les liens franchissant la limite de la carte, l'extrémité extérieure grisée avec la mention « ailleurs » (non choisissable comme espèce de départ). Variante plus prudente : masquées par défaut, avec une case « Montrer les espèces d'autres lieux ».
2. **Ressources, consortiums et groupes fonctionnels toujours dans le périmètre**, comme l'extrémité « environnement » (`to_id` nul) : côté serveur (`scopedFoodWebQuery`) ou dans `inScope`.
3. **Cadrage par défaut « Tout » au collège** (types du palier), et paramètre `preset` pour l'étape `open_foodweb` ; liste des espèces de départ calculée avant le cadrage.
4. **Barrière douce dans le réseau** : bouton « Pour aller plus loin » qui lève les filtres (réseau complet, autres types), comme dans le glossaire et les groupes.
5. **Fiche collège** : une section simple « Comment il vit » (cycle de vie, taille, milieu, habitat, rôle trophique en mots `base`) au lieu de masquer Identité et Écologie ; nom scientifique **replié** (pas supprimé) ; description complète repliable sous `description_college`.
6. **Liste des interactions de la fiche** : libellés du profil (`typeLabel`), mêmes types que le réseau, ou mention « N relations visibles au lycée ».
7. **« Voir le réseau » depuis une fiche** : ouvrir une carte où l'espèce est présente (carte active si elle y est, sinon la première trouvée).
8. **Énumérations** : `mycophagie` dans `COLLEGE_INTERACTION_TYPE_ENUM` (libellé « mange des champignons ») ; statuer sur le mutualisme.
9. Refacto du périmètre : `filterItemsForProfile` / `seedLinkStatus` / `startSpeciesCandidates` sur une seule notion de « périmètre » partagée serveur / client ; tests de non-régression ForêtMap et G&L (`FoodWebGraph` est partagé).

### B. Données et contenu (migrations)

10. **Clade `tetrapodes` visible au collège**, libellé « Animaux à quatre membres », attribut « Squelette interne et quatre membres (pattes, ailes ou nageoires charnues) ». Profondeur portée à 5 depuis la racine : écart à la règle « 4 niveaux au plus » de D2, à arbitrer.
11. **Présences** : abeille domestique, pucerons, mineuse de la tomate, escargot petit-gris et escargot espagnol sur n3 ; liste des 73 fiches sans carte à trier (rattacher ou assumer). Validation d'Oliv requise.
12. **Quiz** : C3-ENV sur `environnement_durable` (et revue question par question), C3-ALIM / C3-ENV sur une partie de `ravageurs_auxiliaires` ; QF9877 : notion cycle 3 en ajout, ou autre question dans la séance.
13. **Glossaire** : « matière organique » → `base` (C3-MAT) ; à discuter : « réseau trophique » (nom de l'onglet), « détritivore », « nom scientifique », « tétrapode ».
14. **Textes de séances** : `6e-sol-de-n3` (consigne « isoler »), `6e-biodiversite-deux-lieux` (« tout le réseau »), à réécrire si A4 n'est pas retenu.
15. **Niveau des groupes** : renseigner `curriculum_niveau` des 33 groupes qui n'en ont pas (45 élèves concernés).

### C. Décisions à prendre par Oliv

1. Hors carte : marquer (A1) ou case à cocher ?
2. Fiche collège : section simple (A5) ou retour aux sections complètes repliées ?
3. Boîte « quatre membres » malgré la règle des 4 niveaux ?
4. Visite sans compte : profil cycle 3 maintenu, ou cycle 4 (parents et institutionnels) ?
5. Les présences du § 2.3 sont-elles réelles ?

### D. Dette signalée hors périmètre

- 368 interactions « hypothèse » montrées aux élèves sans distinction ; 0 `observe_site`.
- Doublons de notions C3-DEV / C3-DEVREPRO et C3-MAT / C3-MATORG.
- `PlantPedagoFetchedSections` affiche des codes d'interaction bruts à tous les profils.
