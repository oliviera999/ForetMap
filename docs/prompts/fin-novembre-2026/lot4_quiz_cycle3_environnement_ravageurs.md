# Lot 4 — Nouvelles questions cycle 3 : environnement et ravageurs-auxiliaires (22/11/2026)

*Demande d'Oliv du 22/11 (point ouvert 2 de l'audit des restrictions cycle 3) : les catégories `environnement_durable` (0 question sur 10 au cycle 3) et `ravageurs_auxiliaires` (3 sur 25) reçoivent de nouvelles questions de cycle 3, plutôt qu'un retri des questions existantes.*

**20 questions, QF9934 à QF9953** (codes libres en prod au 22/11, toutes valeurs de `statut` confondues ; à revérifier avant la migration). Niveau `college`, palier d'entrée 1 obtenu par une notion cycle 3 en **ajout** (C3-ENV pour la plupart, C3-MATORG ou C3-ALIM selon le sujet) et les notions de lycée héritées de la catégorie en **exclusion** (convention du projet). Notions de cycle 4 héritées conservées : une question de 6e reste jouable en 3e.

Typographie : les espaces avant `; : ! ?` et dans « » sont des espaces ordinaires ici ; le script de génération de la migration les convertit en espaces insécables, comme le reste du corpus.

Contrôles faits par script : bonne réponse ≤ 110 % du plus long distracteur ; un retour par distracteur qui nomme l'erreur ; créneau `feedback_<lettre>` de la bonne réponse à `NULL` ; bonnes réponses réparties A 3, B 5, C 6, D 6 (le corpus penche vers A) ; aucun verbe d'invitation à toucher, cueillir ou capturer. Les caractères « n³ » ne sont pas NFKC : sans effet sur une migration, mais `foretmap_sql_execute` les refuserait.

Faits propres au site, tous tirés de la base : réserve d'eau de pluie de 1 000 L qui sert aussi l'aquaponie (zone n3) ; goutte-à-goutte sur minuteur (repère n3) ; cuves d'eau de pluie et hôtel à insectes (repères foret) ; jardinières en rondins issus du bois coupé au lycée (zone foret) ; ruches (repère foret) ; bilan d'eau de la daya (séance `6e-eau-de-nos-lieux`) ; présences au registre (argiope, bulime, limace, faucheux, mouche soldat noire, martinet noir sur n3 ; coccinelles, seps sur foret) ; liens de prédation de la base (coccinelles, faucheux, martinet noir → pucerons ; bulime tronqué → escargot petit-gris). Le reste relève de la science établie.

À l'étude : QF9944 et QF9945 complètent QF9251 (coccinelle) sans la répéter ; QF9951 précise QF0073 (alternatives aux pesticides) ; QF9939 complète QF0144 et QF0340 (compost). Beaucoup de questions collège existantes de `ravageurs_auxiliaires` (coccinelle, syrphe, carabe, crapaud, hérisson…) relèvent aussi du cycle 3 : leur ajouter C3-ENV reste possible plus tard.

Liens vers les fiches (`fiches_liees`) : non bloquants (`is_gating = 0`), posés par la migration seulement si la table et la convention du dépôt le permettent, sinon par `POST /api/learning-links` après déploiement.

---

## Relecture

### QF9934 — environnement_durable (difficulté 1, bonne réponse B)

**À n³, une cuve recueille l'eau de pluie du toit. À quoi sert-elle, en plus d'arroser les plantes ?**

- A. À fournir l'eau à boire des élèves
- B. À compléter l'eau de l'aquaponie ✔
- C. À remplir la mare de la forêt comestible
- D. À laver les vitres du bâtiment chaque jour

- Bonne réponse : Exact : la cuve, qui peut stocker jusqu'à 1 000 litres, sert aussi à garder un bon niveau d'eau dans l'aquaponie.
- Si A : L'eau de pluie de la cuve n'est pas traitée : elle n'est pas potable, mais elle convient aux plantes.
- Si C : La cuve de n³ alimente n³ : arrosage et aquaponie, pas la mare de la forêt comestible.
- Si D : Laver des vitres n'est pas son rôle : elle garde l'eau pour les êtres vivants de n³.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : —.
- Source : zone « Réserve d'eau de pluie » (carte n3).

### QF9935 — environnement_durable (difficulté 1, bonne réponse C)

**Le potager de n³ est arrosé au goutte-à-goutte. Quel est le principal avantage de ce système ?**

- A. Il arrose aussi les allées pour les rafraîchir
- B. Il remplace l'eau par de l'engrais liquide
- C. L'eau arrive au pied des plantes, sans gaspillage ✔
- D. Il fonctionne grâce à l'humidité de l'air seule

- Bonne réponse : Exact : l'eau tombe goutte à goutte au pied de chaque plante ; elle s'évapore peu et ne mouille pas les allées.
- Si A : C'est l'inverse : arroser les allées gaspillerait l'eau, que le goutte-à-goutte réserve aux plantes.
- Si B : Le goutte-à-goutte apporte de l'eau ; un engrais est autre chose.
- Si D : Il est branché sur un robinet et un minuteur : il faut de l'eau, l'air humide ne suffit pas.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : —.
- Source : repère « Robinet du goutte à goutte » et zone « Entrée n3 » (carte n3).

### QF9936 — environnement_durable (difficulté 1, bonne réponse D)

**À Casablanca, il pleut surtout en hiver. Pourquoi le lycée stocke-t-il l'eau de pluie dans des cuves ?**

- A. Pour éviter que la pluie abîme les plantes l'hiver
- B. Parce que l'eau de pluie est plus salée qu'au robinet
- C. Pour que l'eau se change en engrais dans la cuve
- D. Pour arroser en été, quand il ne pleut presque plus ✔

- Bonne réponse : Exact : l'eau recueillie pendant la saison des pluies sert pendant l'été sec, et on puise moins d'eau au robinet.
- Si A : La pluie n'abîme pas les plantes : on la garde pour plus tard, pas pour les en protéger.
- Si B : C'est faux : l'eau de pluie n'est pas salée ; elle contient même moins de sels que l'eau du robinet.
- Si C : L'eau reste de l'eau dans la cuve : elle ne devient pas un engrais.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : —.
- Sources : repères « Cuve à eau » (carte foret) et zone « Réserve d'eau de pluie » (carte n3) ; climat méditerranéen à pluies d'hiver.

### QF9937 — environnement_durable (difficulté 1, bonne réponse B)

**Dans la forêt comestible, un hôtel à insectes est fait de matériaux naturels. À quoi sert-il ?**

- A. À élever des insectes pour les vendre au marché
- B. À offrir un abri aux petits animaux du jardin ✔
- C. À piéger les insectes qui abîment le potager
- D. À empêcher les insectes d'entrer dans les ruches

- Bonne réponse : Exact : insectes, araignées et même petits lézards viennent s'y cacher ; beaucoup aident ensuite le jardin.
- Si A : On n'y élève rien : les animaux viennent et repartent librement.
- Si C : Ce n'est pas un piège : il accueille les petits animaux au lieu de les capturer.
- Si D : Il n'a aucun lien avec les ruches : il sert d'abri à toutes sortes de petites bêtes.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : —.
- Source : repère « Hôtel à insectes » (carte foret).

### QF9938 — environnement_durable (difficulté 2, bonne réponse D)

**Les jardinières de la forêt comestible sont bordées de rondins coupés au lycée. Quel avantage y a-t-il à réutiliser ce bois sur place ?**

- A. Le bois coupé devient plus solide que le bois neuf
- B. Il évite d'avoir à arroser les jardinières
- C. Il chasse les insectes et les champignons du sol
- D. Moins de déchets, et pas de bois neuf à transporter ✔

- Bonne réponse : Exact : le bois coupé ne part pas à la benne, et on n'achète ni ne transporte de bois neuf.
- Si A : Le bois ne se renforce pas en vieillissant : il finit au contraire par se décomposer.
- Si B : Les rondins bordent les jardinières : il faut toujours arroser les plantes.
- Si C : C'est l'inverse : le bois qui vieillit abrite des insectes et des champignons qui le décomposent.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : —.
- Source : zone « Jardinières » (carte foret).

### QF9939 — environnement_durable (difficulté 1, bonne réponse C)

**Lequel de ces déchets ne doit pas être mis au compost ?**

- A. Des épluchures de carottes
- B. Des feuilles mortes du jardin
- C. Un pot de yaourt en plastique ✔
- D. Du marc de café refroidi

- Bonne réponse : Exact : les êtres vivants du compost ne décomposent pas le plastique ; il va au tri.
- Si A : Les épluchures sont des restes végétaux : les petites bêtes, les champignons et les bactéries du compost les décomposent.
- Si B : Les feuilles mortes sont très utiles au compost : elles se décomposent et l'aèrent.
- Si D : Le marc de café se décompose bien : il a sa place au compost.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : —.
- Source : Science établie ; complète QF0144 et QF0340 sans les répéter.

### QF9940 — environnement_durable (difficulté 2, bonne réponse D)

**Pourquoi laisser, au bord d'un potager, une bande d'herbes et de fleurs sauvages sans la tondre ?**

- A. Pour cacher le potager aux promeneurs
- B. Pour empêcher la pluie de tomber sur les légumes
- C. Pour que les mauvaises herbes envahissent le potager
- D. Pour nourrir et abriter pollinisateurs et auxiliaires ✔

- Bonne réponse : Exact : ces fleurs nourrissent les insectes pollinisateurs et abritent des auxiliaires qui mangent les ravageurs.
- Si A : La bande fleurie n'est pas une cachette : elle accueille des êtres vivants utiles.
- Si B : Une bande d'herbes au bord n'arrête pas la pluie, qui reste utile au potager.
- Si C : On la laisse au bord, justement pour les petites bêtes utiles, pas pour envahir les planches cultivées.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : —.
- Source : Science établie (bandes fleuries) ; distincte de QF9269 (plantes compagnes).

### QF9941 — environnement_durable (difficulté 2, bonne réponse B)

**Dès le mois de mai, le plan d'eau de la daya de Dar Bouazza recule. Quelle cause liée aux êtres humains aggrave ce recul ?**

- A. Les sources alimentées par une nappe souterraine
- B. Les pompages qui prélèvent une partie de son eau ✔
- C. Le ruissellement de la pluie sur les terrains voisins
- D. L'arrivée des oiseaux d'eau qui passent l'hiver

- Bonne réponse : Exact : avec l'évaporation et un petit canal, les pompages retirent plus d'eau qu'il n'en arrive au printemps.
- Si A : Les sources apportent de l'eau à la daya : elles ne la font pas reculer.
- Si C : Le ruissellement apporte de l'eau en hiver ; ce n'est pas lui qui vide la daya.
- Si D : Les oiseaux ne vident pas la daya, et ce n'est pas une action humaine.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : —.
- Source : séance « 6e-eau-de-nos-lieux », étape w2 (bilan d'eau de la daya).

### QF9942 — environnement_durable (difficulté 1, bonne réponse C)

**La forêt comestible accueille des ruches. Quel service les abeilles rendent-elles aux plantes du jardin ?**

- A. Elles chassent les pucerons qui piquent les feuilles
- B. Elles arrosent les fleurs avec leur nectar
- C. Elles transportent le pollen, et des fruits se forment ✔
- D. Elles mangent les feuilles malades des arbres fruitiers

- Bonne réponse : Exact : en butinant, les abeilles déposent du pollen d'une fleur à l'autre ; c'est la pollinisation, qui permet aux fruits de se former.
- Si A : Les abeilles ne chassent pas les pucerons : ce sont par exemple les coccinelles qui les mangent.
- Si B : Le nectar est leur nourriture : elles le récoltent, elles n'arrosent rien.
- Si D : Les abeilles se nourrissent de nectar et de pollen, pas de feuilles.
- Notions : ajout C3-ENV ; exclusion 1-ECO. Fiches liées : 28.
- Source : repère « Ruches » (carte foret).

### QF9943 — environnement_durable (difficulté 2, bonne réponse A)

**Pourquoi laisser les feuilles mortes au pied des arbres de la forêt comestible ?**

- A. En se décomposant, elles nourrissent le sol et le gardent humide ✔
- B. Elles empêchent les racines des arbres de respirer et de grandir
- C. Elles servent de nourriture aux oiseaux pendant tout l'hiver
- D. Elles repoussent toutes les petites bêtes loin des arbres fruitiers

- Bonne réponse : Exact : décomposées par les petites bêtes, les champignons et les bactéries, elles enrichissent le sol ; en couche, elles le protègent du dessèchement.
- Si B : C'est l'inverse : la litière garde un sol aéré et vivant autour des racines.
- Si C : Les oiseaux ne mangent pas les feuilles mortes ; ils y trouvent plutôt de petites bêtes.
- Si D : La litière attire au contraire les petites bêtes, qui la décomposent.
- Notions : ajout C3-MATORG ; exclusion 1-ECO. Fiches liées : —.
- Source : Science établie ; notion cycle 3 « devenir de la matière organique ».

### QF9944 — ravageurs_auxiliaires (difficulté 2, bonne réponse B)

**Les coccinelles mangent les pucerons. Si un insecticide tue toutes les coccinelles d'un potager, que risque-t-il d'arriver aux pucerons ?**

- A. Ils disparaissent aussi, faute de nourriture
- B. Ils deviennent plus nombreux, faute de prédateurs ✔
- C. Ils ne changent pas, car rien d'autre ne les mange
- D. Ils se mettent à manger les coccinelles mortes

- Bonne réponse : Exact : sans leurs prédateurs, les pucerons se multiplient. Tuer les auxiliaires peut aggraver les dégâts.
- Si A : Les pucerons se nourrissent de la sève des plantes, pas des coccinelles : leur nourriture ne manque pas.
- Si C : Les coccinelles régulent les pucerons : leur disparition change beaucoup de choses.
- Si D : Les pucerons piquent les plantes pour boire leur sève ; ils ne mangent pas d'animaux.
- Notions : ajout C3-ENV ; exclusion 1-ECO, 2-AGRO. Fiches liées : 59, 82.
- Source : Raisonnement sur une chaîne alimentaire ; liens de prédation de la base (coccinelles → pucerons).

### QF9945 — ravageurs_auxiliaires (difficulté 2, bonne réponse D)

**Au milieu des pucerons, on voit une petite bête allongée, noire tachée d'orange, à six pattes. Qu'est-ce que c'est, le plus souvent ?**

- A. Un puceron adulte qui a perdu ses ailes
- B. Une jeune araignée qui prépare sa toile
- C. Une chenille qui va pondre dans les feuilles
- D. Une larve de coccinelle, qui mange les pucerons ✔

- Bonne réponse : Exact : la larve de coccinelle ne ressemble pas à l'adulte, mais elle mange déjà beaucoup de pucerons. Mieux vaut la reconnaître pour la laisser faire.
- Si A : Un puceron est petit, rond et mou, souvent vert ou noir, sans taches orange.
- Si B : Une araignée a huit pattes, pas six.
- Si C : Une chenille est une larve de papillon : elle ne pond pas, seul le papillon adulte pond.
- Notions : ajout C3-ENV ; exclusion 1-ECO, 2-AGRO. Fiches liées : 82, 773, 59.
- Source : Science établie (larves de coccinelles aphidiphages) ; coccinelle des friches présente sur n3, coccinelle à sept points sur foret.

### QF9946 — ravageurs_auxiliaires (difficulté 1, bonne réponse C)

**L'argiope à bandes tend sa grande toile dans les herbes de n³. Est-elle utile au potager ?**

- A. Non : elle mange les feuilles des légumes
- B. Non : elle pond ses œufs dans les fruits mûrs
- C. Oui : elle capture beaucoup d'insectes dans sa toile ✔
- D. Oui : elle transporte le pollen d'une fleur à l'autre

- Bonne réponse : Exact : comme les autres araignées, l'argiope est un prédateur ; elle capture de nombreux insectes, dont des ravageurs.
- Si A : Les araignées ne mangent jamais de plantes : elles se nourrissent d'animaux.
- Si B : L'argiope pond dans un cocon de soie accroché aux herbes, pas dans les fruits.
- Si D : Elle reste sur sa toile et ne butine pas : ce sont les insectes qui pollinisent.
- Notions : ajout C3-ENV ; exclusion 1-ECO, 2-AGRO. Fiches liées : 804.
- Source : Espèce présente sur n3 (registre).

### QF9947 — ravageurs_auxiliaires (difficulté 2, bonne réponse A)

**Le bulime tronqué est un escargot qui vit à n³. Pourquoi peut-il être un allié inattendu du potager ?**

- A. Il mange d'autres escargots et leurs œufs ✔
- B. Il mange les racines des jeunes salades
- C. Il ne se nourrit que de fruits tombés au sol
- D. Il chasse les pucerons le long des tiges

- Bonne réponse : Exact : le bulime tronqué est un escargot carnivore ; il s'attaque à d'autres escargots, comme le petit-gris, qui abîment les cultures.
- Si B : Ce sont d'autres escargots et des limaces qui abîment les jeunes salades ; le bulime, lui, les mange.
- Si C : Le bulime ne se contente pas de fruits tombés : il chasse d'autres escargots.
- Si D : Il ne mange pas de pucerons : ses proies sont d'autres escargots.
- Notions : ajout C3-ENV ; exclusion 1-ECO, 2-AGRO. Fiches liées : 824, 89.
- Source : Lien de prédation de la base (bulime tronqué → escargot petit-gris) ; espèce présente sur n3.

### QF9948 — ravageurs_auxiliaires (difficulté 1, bonne réponse B)

**Le matin, des feuilles de salade sont trouées, avec des traces brillantes autour. Qui est passé pendant la nuit ?**

- A. Une coccinelle en chasse
- B. Un escargot ou une limace ✔
- C. Une abeille venue butiner
- D. Un ver de terre sorti du sol

- Bonne réponse : Exact : escargots et limaces mangent les feuilles la nuit et laissent derrière eux une trace de mucus qui brille.
- Si A : La coccinelle mange des pucerons ; elle ne troue pas les feuilles et ne laisse pas de trace brillante.
- Si C : L'abeille butine les fleurs ; elle ne mange pas de feuilles.
- Si D : Le ver de terre mange des débris dans le sol, pas les feuilles vivantes des salades.
- Notions : ajout C3-ENV ; exclusion 1-ECO, 2-AGRO. Fiches liées : 826, 89.
- Source : Science établie ; limace présente sur n3.

### QF9949 — ravageurs_auxiliaires (difficulté 2, bonne réponse D)

**Le faucheux, aux pattes très longues, vit à n³. Pour le potager, c'est plutôt…**

- A. un ravageur, qui perce les tomates mûres pour boire
- B. un danger, car sa morsure serait venimeuse pour nous
- C. un parasite, qui pond ses œufs à l'intérieur des escargots
- D. un allié, qui mange de petits insectes comme les pucerons ✔

- Bonne réponse : Exact : le faucheux mange de petites bêtes, dont des pucerons. Il n'a pas de venin et ne fait pas de soie.
- Si A : Le faucheux ne perce pas les fruits : il se nourrit de petits animaux et de débris.
- Si B : Le faucheux n'a pas de glandes à venin : il est sans danger.
- Si C : Il ne pond pas dans les escargots : ses œufs sont déposés dans le sol.
- Notions : ajout C3-ENV ; exclusion 1-ECO, 2-AGRO. Fiches liées : 662, 59.
- Source : Lien de prédation de la base (faucheux → pucerons) ; espèce présente sur n3 ; voir la séance « 6e-sosies ».

### QF9950 — ravageurs_auxiliaires (difficulté 1, bonne réponse C)

**Des larves de mouche soldat noire grouillent dans le compost de n³. Faut-il s'en débarrasser ?**

- A. Oui : elles vont manger les racines des légumes du potager
- B. Oui : elles donnent des maladies aux plantes
- C. Non : elles mangent les déchets et aident le compost ✔
- D. Non : elles fabriquent le miel des ruches voisines

- Bonne réponse : Exact : ces larves dévorent les restes de cuisine et accélèrent le compostage. Toutes les petites bêtes ne sont pas des ravageurs.
- Si A : Elles se nourrissent des déchets du compost, pas des racines des plantes vivantes.
- Si B : Elles ne rendent pas les plantes malades : elles décomposent les déchets.
- Si D : Seules les abeilles fabriquent du miel ; ces larves recyclent les déchets.
- Notions : ajout C3-MATORG ; exclusion 1-ECO, 2-AGRO. Fiches liées : 783.
- Source : Lien de détritivorie de la base ; espèce phare de n3.

### QF9951 — ravageurs_auxiliaires (difficulté 2, bonne réponse D)

**Comment protéger des choux de la piéride, un papillon dont les chenilles mangent leurs feuilles, sans produit chimique ?**

- A. Arroser les choux tous les soirs
- B. Planter les choux à l'ombre d'un mur
- C. Couper les fleurs autour du potager
- D. Poser un filet fin au-dessus des choux ✔

- Bonne réponse : Exact : un filet à mailles fines empêche le papillon de venir pondre sur les feuilles ; il n'y a donc pas de chenilles.
- Si A : L'arrosage n'empêche pas le papillon de pondre sur les feuilles.
- Si B : L'ombre n'arrête pas le papillon, et le chou pousse moins bien sans soleil.
- Si C : Couper les fleurs priverait les pollinisateurs et les auxiliaires de nourriture, sans gêner la piéride.
- Notions : ajout C3-ALIM ; exclusion 1-ECO, 2-AGRO. Fiches liées : 57, 74.
- Source : Science établie (filet anti-insectes) ; distincte de QF0073 (alternatives générales) et QF7005.

### QF9952 — ravageurs_auxiliaires (difficulté 1, bonne réponse A)

**Le seps, un lézard aux pattes minuscules, vit dans la forêt comestible. De quoi se nourrit-il ?**

- A. De petits insectes et d'autres petites bêtes ✔
- B. Des feuilles tendres des jeunes salades
- C. Des fruits mûrs tombés au pied des arbres
- D. Des graines semées dans les planches

- Bonne réponse : Exact : le seps chasse de petits insectes, des araignées et d'autres petites bêtes ; c'est un allié du jardin.
- Si B : Le seps ne mange pas de plantes : c'est un prédateur.
- Si C : Il ne mange pas de fruits : il chasse de petites bêtes.
- Si D : Les graines attirent plutôt des oiseaux ou des fourmis ; le seps mange des animaux.
- Notions : ajout C3-ENV ; exclusion 1-ECO, 2-AGRO. Fiches liées : 837.
- Source : Espèce présente sur foret (registre) ; régime insectivore (science établie).

### QF9953 — ravageurs_auxiliaires (difficulté 1, bonne réponse C)

**Le martinet noir passe presque toute sa vie en vol au-dessus de n³. Que chasse-t-il ?**

- A. Les graines des herbes du potager, au sol
- B. Les petits poissons du bassin de l'aquaponie
- C. De petits insectes volants, dont des pucerons ✔
- D. Les fruits mûrs des arbres fruitiers du lycée

- Bonne réponse : Exact : le martinet capture en vol de petits insectes, dont des pucerons ailés emportés par le vent.
- Si A : Le martinet ne se pose presque jamais au sol : il ne mange pas de graines.
- Si B : Il ne pêche pas : il chasse des insectes dans l'air.
- Si D : Il ne mange pas de fruits ; son bec large s'ouvre en vol pour capturer des insectes.
- Notions : ajout C3-ENV ; exclusion 1-ECO, 2-AGRO. Fiches liées : 310, 59.
- Source : Lien de prédation de la base (martinet noir → pucerons) ; espèce présente sur n3.

---

## Données pour la migration (source unique)

```json
[
 {
  "question_code": "QF9934",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "À n³, une cuve recueille l'eau de pluie du toit. À quoi sert-elle, en plus d'arroser les plantes ?",
  "choix_a": "À fournir l'eau à boire des élèves",
  "choix_b": "À compléter l'eau de l'aquaponie",
  "choix_c": "À remplir la mare de la forêt comestible",
  "choix_d": "À laver les vitres du bâtiment chaque jour",
  "reponse_correcte": "B",
  "feedback_correct": "Exact : la cuve, qui peut stocker jusqu'à 1 000 litres, sert aussi à garder un bon niveau d'eau dans l'aquaponie.",
  "feedback_a": "L'eau de pluie de la cuve n'est pas traitée : elle n'est pas potable, mais elle convient aux plantes.",
  "feedback_b": null,
  "feedback_c": "La cuve de n³ alimente n³ : arrosage et aquaponie, pas la mare de la forêt comestible.",
  "feedback_d": "Laver des vitres n'est pas son rôle : elle garde l'eau pour les êtres vivants de n³.",
  "tags": "eau de pluie, cuve, aquaponie, n³",
  "notes_pedagogiques": "Source : zone « Réserve d'eau de pluie » (carte n3).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9935",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "Le potager de n³ est arrosé au goutte-à-goutte. Quel est le principal avantage de ce système ?",
  "choix_a": "Il arrose aussi les allées pour les rafraîchir",
  "choix_b": "Il remplace l'eau par de l'engrais liquide",
  "choix_c": "L'eau arrive au pied des plantes, sans gaspillage",
  "choix_d": "Il fonctionne grâce à l'humidité de l'air seule",
  "reponse_correcte": "C",
  "feedback_correct": "Exact : l'eau tombe goutte à goutte au pied de chaque plante ; elle s'évapore peu et ne mouille pas les allées.",
  "feedback_a": "C'est l'inverse : arroser les allées gaspillerait l'eau, que le goutte-à-goutte réserve aux plantes.",
  "feedback_b": "Le goutte-à-goutte apporte de l'eau ; un engrais est autre chose.",
  "feedback_c": null,
  "feedback_d": "Il est branché sur un robinet et un minuteur : il faut de l'eau, l'air humide ne suffit pas.",
  "tags": "goutte-à-goutte, arrosage, économie d'eau, n³",
  "notes_pedagogiques": "Source : repère « Robinet du goutte à goutte » et zone « Entrée n3 » (carte n3).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9936",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "À Casablanca, il pleut surtout en hiver. Pourquoi le lycée stocke-t-il l'eau de pluie dans des cuves ?",
  "choix_a": "Pour éviter que la pluie abîme les plantes l'hiver",
  "choix_b": "Parce que l'eau de pluie est plus salée qu'au robinet",
  "choix_c": "Pour que l'eau se change en engrais dans la cuve",
  "choix_d": "Pour arroser en été, quand il ne pleut presque plus",
  "reponse_correcte": "D",
  "feedback_correct": "Exact : l'eau recueillie pendant la saison des pluies sert pendant l'été sec, et on puise moins d'eau au robinet.",
  "feedback_a": "La pluie n'abîme pas les plantes : on la garde pour plus tard, pas pour les en protéger.",
  "feedback_b": "C'est faux : l'eau de pluie n'est pas salée ; elle contient même moins de sels que l'eau du robinet.",
  "feedback_c": "L'eau reste de l'eau dans la cuve : elle ne devient pas un engrais.",
  "feedback_d": null,
  "tags": "eau de pluie, saisons, climat, économie d'eau",
  "notes_pedagogiques": "Sources : repères « Cuve à eau » (carte foret) et zone « Réserve d'eau de pluie » (carte n3) ; climat méditerranéen à pluies d'hiver.",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9937",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "Dans la forêt comestible, un hôtel à insectes est fait de matériaux naturels. À quoi sert-il ?",
  "choix_a": "À élever des insectes pour les vendre au marché",
  "choix_b": "À offrir un abri aux petits animaux du jardin",
  "choix_c": "À piéger les insectes qui abîment le potager",
  "choix_d": "À empêcher les insectes d'entrer dans les ruches",
  "reponse_correcte": "B",
  "feedback_correct": "Exact : insectes, araignées et même petits lézards viennent s'y cacher ; beaucoup aident ensuite le jardin.",
  "feedback_a": "On n'y élève rien : les animaux viennent et repartent librement.",
  "feedback_b": null,
  "feedback_c": "Ce n'est pas un piège : il accueille les petits animaux au lieu de les capturer.",
  "feedback_d": "Il n'a aucun lien avec les ruches : il sert d'abri à toutes sortes de petites bêtes.",
  "tags": "hôtel à insectes, biodiversité, abri, forêt comestible",
  "notes_pedagogiques": "Source : repère « Hôtel à insectes » (carte foret).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9938",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Les jardinières de la forêt comestible sont bordées de rondins coupés au lycée. Quel avantage y a-t-il à réutiliser ce bois sur place ?",
  "choix_a": "Le bois coupé devient plus solide que le bois neuf",
  "choix_b": "Il évite d'avoir à arroser les jardinières",
  "choix_c": "Il chasse les insectes et les champignons du sol",
  "choix_d": "Moins de déchets, et pas de bois neuf à transporter",
  "reponse_correcte": "D",
  "feedback_correct": "Exact : le bois coupé ne part pas à la benne, et on n'achète ni ne transporte de bois neuf.",
  "feedback_a": "Le bois ne se renforce pas en vieillissant : il finit au contraire par se décomposer.",
  "feedback_b": "Les rondins bordent les jardinières : il faut toujours arroser les plantes.",
  "feedback_c": "C'est l'inverse : le bois qui vieillit abrite des insectes et des champignons qui le décomposent.",
  "feedback_d": null,
  "tags": "réemploi, déchets, bois, forêt comestible",
  "notes_pedagogiques": "Source : zone « Jardinières » (carte foret).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9939",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "Lequel de ces déchets ne doit pas être mis au compost ?",
  "choix_a": "Des épluchures de carottes",
  "choix_b": "Des feuilles mortes du jardin",
  "choix_c": "Un pot de yaourt en plastique",
  "choix_d": "Du marc de café refroidi",
  "reponse_correcte": "C",
  "feedback_correct": "Exact : les êtres vivants du compost ne décomposent pas le plastique ; il va au tri.",
  "feedback_a": "Les épluchures sont des restes végétaux : les petites bêtes, les champignons et les bactéries du compost les décomposent.",
  "feedback_b": "Les feuilles mortes sont très utiles au compost : elles se décomposent et l'aèrent.",
  "feedback_c": null,
  "feedback_d": "Le marc de café se décompose bien : il a sa place au compost.",
  "tags": "compost, déchets, tri, décomposition",
  "notes_pedagogiques": "Science établie ; complète QF0144 et QF0340 sans les répéter.",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9940",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Pourquoi laisser, au bord d'un potager, une bande d'herbes et de fleurs sauvages sans la tondre ?",
  "choix_a": "Pour cacher le potager aux promeneurs",
  "choix_b": "Pour empêcher la pluie de tomber sur les légumes",
  "choix_c": "Pour que les mauvaises herbes envahissent le potager",
  "choix_d": "Pour nourrir et abriter pollinisateurs et auxiliaires",
  "reponse_correcte": "D",
  "feedback_correct": "Exact : ces fleurs nourrissent les insectes pollinisateurs et abritent des auxiliaires qui mangent les ravageurs.",
  "feedback_a": "La bande fleurie n'est pas une cachette : elle accueille des êtres vivants utiles.",
  "feedback_b": "Une bande d'herbes au bord n'arrête pas la pluie, qui reste utile au potager.",
  "feedback_c": "On la laisse au bord, justement pour les petites bêtes utiles, pas pour envahir les planches cultivées.",
  "feedback_d": null,
  "tags": "biodiversité, fleurs sauvages, pollinisateurs, auxiliaires",
  "notes_pedagogiques": "Science établie (bandes fleuries) ; distincte de QF9269 (plantes compagnes).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9941",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Dès le mois de mai, le plan d'eau de la daya de Dar Bouazza recule. Quelle cause liée aux êtres humains aggrave ce recul ?",
  "choix_a": "Les sources alimentées par une nappe souterraine",
  "choix_b": "Les pompages qui prélèvent une partie de son eau",
  "choix_c": "Le ruissellement de la pluie sur les terrains voisins",
  "choix_d": "L'arrivée des oiseaux d'eau qui passent l'hiver",
  "reponse_correcte": "B",
  "feedback_correct": "Exact : avec l'évaporation et un petit canal, les pompages retirent plus d'eau qu'il n'en arrive au printemps.",
  "feedback_a": "Les sources apportent de l'eau à la daya : elles ne la font pas reculer.",
  "feedback_b": null,
  "feedback_c": "Le ruissellement apporte de l'eau en hiver ; ce n'est pas lui qui vide la daya.",
  "feedback_d": "Les oiseaux ne vident pas la daya, et ce n'est pas une action humaine.",
  "tags": "daya, eau, pompage, activités humaines",
  "notes_pedagogiques": "Source : séance « 6e-eau-de-nos-lieux », étape w2 (bilan d'eau de la daya).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9942",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "La forêt comestible accueille des ruches. Quel service les abeilles rendent-elles aux plantes du jardin ?",
  "choix_a": "Elles chassent les pucerons qui piquent les feuilles",
  "choix_b": "Elles arrosent les fleurs avec leur nectar",
  "choix_c": "Elles transportent le pollen, et des fruits se forment",
  "choix_d": "Elles mangent les feuilles malades des arbres fruitiers",
  "reponse_correcte": "C",
  "feedback_correct": "Exact : en butinant, les abeilles déposent du pollen d'une fleur à l'autre ; c'est la pollinisation, qui permet aux fruits de se former.",
  "feedback_a": "Les abeilles ne chassent pas les pucerons : ce sont par exemple les coccinelles qui les mangent.",
  "feedback_b": "Le nectar est leur nourriture : elles le récoltent, elles n'arrosent rien.",
  "feedback_c": null,
  "feedback_d": "Les abeilles se nourrissent de nectar et de pollen, pas de feuilles.",
  "tags": "abeilles, ruches, pollinisation, service rendu",
  "notes_pedagogiques": "Source : repère « Ruches » (carte foret).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": [
   28
  ]
 },
 {
  "question_code": "QF9943",
  "categorie_slug": "environnement_durable",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Pourquoi laisser les feuilles mortes au pied des arbres de la forêt comestible ?",
  "choix_a": "En se décomposant, elles nourrissent le sol et le gardent humide",
  "choix_b": "Elles empêchent les racines des arbres de respirer et de grandir",
  "choix_c": "Elles servent de nourriture aux oiseaux pendant tout l'hiver",
  "choix_d": "Elles repoussent toutes les petites bêtes loin des arbres fruitiers",
  "reponse_correcte": "A",
  "feedback_correct": "Exact : décomposées par les petites bêtes, les champignons et les bactéries, elles enrichissent le sol ; en couche, elles le protègent du dessèchement.",
  "feedback_a": null,
  "feedback_b": "C'est l'inverse : la litière garde un sol aéré et vivant autour des racines.",
  "feedback_c": "Les oiseaux ne mangent pas les feuilles mortes ; ils y trouvent plutôt de petites bêtes.",
  "feedback_d": "La litière attire au contraire les petites bêtes, qui la décomposent.",
  "tags": "litière, feuilles mortes, décomposition, sol",
  "notes_pedagogiques": "Science établie ; notion cycle 3 « devenir de la matière organique ».",
  "notions_ajout": [
   "C3-MATORG"
  ],
  "notions_exclusion": [
   "1-ECO"
  ],
  "fiches_liees": []
 },
 {
  "question_code": "QF9944",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Les coccinelles mangent les pucerons. Si un insecticide tue toutes les coccinelles d'un potager, que risque-t-il d'arriver aux pucerons ?",
  "choix_a": "Ils disparaissent aussi, faute de nourriture",
  "choix_b": "Ils deviennent plus nombreux, faute de prédateurs",
  "choix_c": "Ils ne changent pas, car rien d'autre ne les mange",
  "choix_d": "Ils se mettent à manger les coccinelles mortes",
  "reponse_correcte": "B",
  "feedback_correct": "Exact : sans leurs prédateurs, les pucerons se multiplient. Tuer les auxiliaires peut aggraver les dégâts.",
  "feedback_a": "Les pucerons se nourrissent de la sève des plantes, pas des coccinelles : leur nourriture ne manque pas.",
  "feedback_b": null,
  "feedback_c": "Les coccinelles régulent les pucerons : leur disparition change beaucoup de choses.",
  "feedback_d": "Les pucerons piquent les plantes pour boire leur sève ; ils ne mangent pas d'animaux.",
  "tags": "chaîne alimentaire, coccinelle, pucerons, insecticide",
  "notes_pedagogiques": "Raisonnement sur une chaîne alimentaire ; liens de prédation de la base (coccinelles → pucerons).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   59,
   82
  ]
 },
 {
  "question_code": "QF9945",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Au milieu des pucerons, on voit une petite bête allongée, noire tachée d'orange, à six pattes. Qu'est-ce que c'est, le plus souvent ?",
  "choix_a": "Un puceron adulte qui a perdu ses ailes",
  "choix_b": "Une jeune araignée qui prépare sa toile",
  "choix_c": "Une chenille qui va pondre dans les feuilles",
  "choix_d": "Une larve de coccinelle, qui mange les pucerons",
  "reponse_correcte": "D",
  "feedback_correct": "Exact : la larve de coccinelle ne ressemble pas à l'adulte, mais elle mange déjà beaucoup de pucerons. Mieux vaut la reconnaître pour la laisser faire.",
  "feedback_a": "Un puceron est petit, rond et mou, souvent vert ou noir, sans taches orange.",
  "feedback_b": "Une araignée a huit pattes, pas six.",
  "feedback_c": "Une chenille est une larve de papillon : elle ne pond pas, seul le papillon adulte pond.",
  "feedback_d": null,
  "tags": "larve, coccinelle, auxiliaire, reconnaître",
  "notes_pedagogiques": "Science établie (larves de coccinelles aphidiphages) ; coccinelle des friches présente sur n3, coccinelle à sept points sur foret.",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   82,
   773,
   59
  ]
 },
 {
  "question_code": "QF9946",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "L'argiope à bandes tend sa grande toile dans les herbes de n³. Est-elle utile au potager ?",
  "choix_a": "Non : elle mange les feuilles des légumes",
  "choix_b": "Non : elle pond ses œufs dans les fruits mûrs",
  "choix_c": "Oui : elle capture beaucoup d'insectes dans sa toile",
  "choix_d": "Oui : elle transporte le pollen d'une fleur à l'autre",
  "reponse_correcte": "C",
  "feedback_correct": "Exact : comme les autres araignées, l'argiope est un prédateur ; elle capture de nombreux insectes, dont des ravageurs.",
  "feedback_a": "Les araignées ne mangent jamais de plantes : elles se nourrissent d'animaux.",
  "feedback_b": "L'argiope pond dans un cocon de soie accroché aux herbes, pas dans les fruits.",
  "feedback_c": null,
  "feedback_d": "Elle reste sur sa toile et ne butine pas : ce sont les insectes qui pollinisent.",
  "tags": "araignée, argiope, prédateur, auxiliaire",
  "notes_pedagogiques": "Espèce présente sur n3 (registre).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   804
  ]
 },
 {
  "question_code": "QF9947",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Le bulime tronqué est un escargot qui vit à n³. Pourquoi peut-il être un allié inattendu du potager ?",
  "choix_a": "Il mange d'autres escargots et leurs œufs",
  "choix_b": "Il mange les racines des jeunes salades",
  "choix_c": "Il ne se nourrit que de fruits tombés au sol",
  "choix_d": "Il chasse les pucerons le long des tiges",
  "reponse_correcte": "A",
  "feedback_correct": "Exact : le bulime tronqué est un escargot carnivore ; il s'attaque à d'autres escargots, comme le petit-gris, qui abîment les cultures.",
  "feedback_a": null,
  "feedback_b": "Ce sont d'autres escargots et des limaces qui abîment les jeunes salades ; le bulime, lui, les mange.",
  "feedback_c": "Le bulime ne se contente pas de fruits tombés : il chasse d'autres escargots.",
  "feedback_d": "Il ne mange pas de pucerons : ses proies sont d'autres escargots.",
  "tags": "escargot, bulime, prédateur, auxiliaire",
  "notes_pedagogiques": "Lien de prédation de la base (bulime tronqué → escargot petit-gris) ; espèce présente sur n3.",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   824,
   89
  ]
 },
 {
  "question_code": "QF9948",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "Le matin, des feuilles de salade sont trouées, avec des traces brillantes autour. Qui est passé pendant la nuit ?",
  "choix_a": "Une coccinelle en chasse",
  "choix_b": "Un escargot ou une limace",
  "choix_c": "Une abeille venue butiner",
  "choix_d": "Un ver de terre sorti du sol",
  "reponse_correcte": "B",
  "feedback_correct": "Exact : escargots et limaces mangent les feuilles la nuit et laissent derrière eux une trace de mucus qui brille.",
  "feedback_a": "La coccinelle mange des pucerons ; elle ne troue pas les feuilles et ne laisse pas de trace brillante.",
  "feedback_b": null,
  "feedback_c": "L'abeille butine les fleurs ; elle ne mange pas de feuilles.",
  "feedback_d": "Le ver de terre mange des débris dans le sol, pas les feuilles vivantes des salades.",
  "tags": "escargot, limace, dégâts, indices",
  "notes_pedagogiques": "Science établie ; limace présente sur n3.",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   826,
   89
  ]
 },
 {
  "question_code": "QF9949",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Le faucheux, aux pattes très longues, vit à n³. Pour le potager, c'est plutôt…",
  "choix_a": "un ravageur, qui perce les tomates mûres pour boire",
  "choix_b": "un danger, car sa morsure serait venimeuse pour nous",
  "choix_c": "un parasite, qui pond ses œufs à l'intérieur des escargots",
  "choix_d": "un allié, qui mange de petits insectes comme les pucerons",
  "reponse_correcte": "D",
  "feedback_correct": "Exact : le faucheux mange de petites bêtes, dont des pucerons. Il n'a pas de venin et ne fait pas de soie.",
  "feedback_a": "Le faucheux ne perce pas les fruits : il se nourrit de petits animaux et de débris.",
  "feedback_b": "Le faucheux n'a pas de glandes à venin : il est sans danger.",
  "feedback_c": "Il ne pond pas dans les escargots : ses œufs sont déposés dans le sol.",
  "feedback_d": null,
  "tags": "faucheux, auxiliaire, pucerons, sosie d'araignée",
  "notes_pedagogiques": "Lien de prédation de la base (faucheux → pucerons) ; espèce présente sur n3 ; voir la séance « 6e-sosies ».",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   662,
   59
  ]
 },
 {
  "question_code": "QF9950",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "Des larves de mouche soldat noire grouillent dans le compost de n³. Faut-il s'en débarrasser ?",
  "choix_a": "Oui : elles vont manger les racines des légumes du potager",
  "choix_b": "Oui : elles donnent des maladies aux plantes",
  "choix_c": "Non : elles mangent les déchets et aident le compost",
  "choix_d": "Non : elles fabriquent le miel des ruches voisines",
  "reponse_correcte": "C",
  "feedback_correct": "Exact : ces larves dévorent les restes de cuisine et accélèrent le compostage. Toutes les petites bêtes ne sont pas des ravageurs.",
  "feedback_a": "Elles se nourrissent des déchets du compost, pas des racines des plantes vivantes.",
  "feedback_b": "Elles ne rendent pas les plantes malades : elles décomposent les déchets.",
  "feedback_c": null,
  "feedback_d": "Seules les abeilles fabriquent du miel ; ces larves recyclent les déchets.",
  "tags": "mouche soldat noire, compost, décomposeur, utile",
  "notes_pedagogiques": "Lien de détritivorie de la base ; espèce phare de n3.",
  "notions_ajout": [
   "C3-MATORG"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   783
  ]
 },
 {
  "question_code": "QF9951",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 2,
  "difficulte_label": "⭐⭐ Moyen",
  "question": "Comment protéger des choux de la piéride, un papillon dont les chenilles mangent leurs feuilles, sans produit chimique ?",
  "choix_a": "Arroser les choux tous les soirs",
  "choix_b": "Planter les choux à l'ombre d'un mur",
  "choix_c": "Couper les fleurs autour du potager",
  "choix_d": "Poser un filet fin au-dessus des choux",
  "reponse_correcte": "D",
  "feedback_correct": "Exact : un filet à mailles fines empêche le papillon de venir pondre sur les feuilles ; il n'y a donc pas de chenilles.",
  "feedback_a": "L'arrosage n'empêche pas le papillon de pondre sur les feuilles.",
  "feedback_b": "L'ombre n'arrête pas le papillon, et le chou pousse moins bien sans soleil.",
  "feedback_c": "Couper les fleurs priverait les pollinisateurs et les auxiliaires de nourriture, sans gêner la piéride.",
  "feedback_d": null,
  "tags": "piéride, chou, filet, protection sans produit",
  "notes_pedagogiques": "Science établie (filet anti-insectes) ; distincte de QF0073 (alternatives générales) et QF7005.",
  "notions_ajout": [
   "C3-ALIM"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   57,
   74
  ]
 },
 {
  "question_code": "QF9952",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "Le seps, un lézard aux pattes minuscules, vit dans la forêt comestible. De quoi se nourrit-il ?",
  "choix_a": "De petits insectes et d'autres petites bêtes",
  "choix_b": "Des feuilles tendres des jeunes salades",
  "choix_c": "Des fruits mûrs tombés au pied des arbres",
  "choix_d": "Des graines semées dans les planches",
  "reponse_correcte": "A",
  "feedback_correct": "Exact : le seps chasse de petits insectes, des araignées et d'autres petites bêtes ; c'est un allié du jardin.",
  "feedback_a": null,
  "feedback_b": "Le seps ne mange pas de plantes : c'est un prédateur.",
  "feedback_c": "Il ne mange pas de fruits : il chasse de petites bêtes.",
  "feedback_d": "Les graines attirent plutôt des oiseaux ou des fourmis ; le seps mange des animaux.",
  "tags": "seps, lézard, prédateur, auxiliaire",
  "notes_pedagogiques": "Espèce présente sur foret (registre) ; régime insectivore (science établie).",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   837
  ]
 },
 {
  "question_code": "QF9953",
  "categorie_slug": "ravageurs_auxiliaires",
  "niveau": "college",
  "difficulte": 1,
  "difficulte_label": "⭐ Facile",
  "question": "Le martinet noir passe presque toute sa vie en vol au-dessus de n³. Que chasse-t-il ?",
  "choix_a": "Les graines des herbes du potager, au sol",
  "choix_b": "Les petits poissons du bassin de l'aquaponie",
  "choix_c": "De petits insectes volants, dont des pucerons",
  "choix_d": "Les fruits mûrs des arbres fruitiers du lycée",
  "reponse_correcte": "C",
  "feedback_correct": "Exact : le martinet capture en vol de petits insectes, dont des pucerons ailés emportés par le vent.",
  "feedback_a": "Le martinet ne se pose presque jamais au sol : il ne mange pas de graines.",
  "feedback_b": "Il ne pêche pas : il chasse des insectes dans l'air.",
  "feedback_c": null,
  "feedback_d": "Il ne mange pas de fruits ; son bec large s'ouvre en vol pour capturer des insectes.",
  "tags": "martinet, oiseau insectivore, pucerons, n³",
  "notes_pedagogiques": "Lien de prédation de la base (martinet noir → pucerons) ; espèce présente sur n3.",
  "notions_ajout": [
   "C3-ENV"
  ],
  "notions_exclusion": [
   "1-ECO",
   "2-AGRO"
  ],
  "fiches_liees": [
   310,
   59
  ]
 }
]
```
