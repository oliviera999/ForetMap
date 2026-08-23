# Audit des mécaniques de jeu et options de finition — Gnomes & Licornes

> **Public de ce document : Oliv (conception), professeurs, MJ.**
> Il fait l'état certifié des mécaniques au 23 août 2026, corrige les écarts constatés
> entre le rapport de refonte et le code réel, et propose des **options chiffrées** pour
> terminer le développement — pensées pour une classe de **6ème**.
> Retour au sommaire : [../README.md](../README.md)

**Sources de la certification :** dump de production du 23/08/2026 (133 tables) confronté
au code de la branche courante. Les chiffres de ce document sont recomptés, pas repris.

---

## 1. Le constat qui change tout : le jeu n'est pas déséquilibré, il est **inerte**

Le rapport de refonte diagnostique une économie _inflationniste_ (« ~46 gemmes
thésaurisées sur l'année, pointes à 78 ») et bâtit toute sa refonte là-dessus. **Ce
diagnostic est faux d'un ordre de grandeur**, et il faut le corriger avant de décider
quoi que ce soit.

Voici ce que le moteur applique réellement, plateau par plateau, en additionnant **tous**
les effets machine câblés :

| Plateau  | Gemmes (branche neutre) | Cœurs (branche neutre) | Cases à effet gemme | Cases à effet cœur |
| -------- | ----------------------- | ---------------------- | ------------------- | ------------------ |
| P1 (ch3) | +4                      | +4                     | 6                   | 7                  |
| P2 (ch4) | +3                      | +4                     | 5                   | 9                  |
| P3 (ch5) | +5                      | +4                     | 7                   | 8                  |
| P4 (ch6) | +4                      | +5                     | 7                   | 12                 |
| P5 (ch7) | +4                      | **−1**                 | 7                   | 8                  |

Et encore : ces totaux supposent qu'une équipe s'arrête sur **toutes** les cases. Au dé,
une équipe s'arrête sur une case sur quatre environ. **Le revenu réel est de l'ordre
d'une à deux gemmes par plateau**, pas de sept à dix.

**La preuve est dans les parties réelles de juin 2026** (26 joueurs, 9 équipes, 4 parties,
483 événements journalisés) :

- **12 événements `marker_effect`** au total, et **tous** portent `healthDelta: 0`,
  `powerDelta: 0` — uniquement du déplacement.
- **15 réponses de QCM**, **0 gemme créditée**.
- Les seuls mouvements de vitalité de tout le corpus sont **7 ajustements manuels du MJ**.

> **Aucun élève n'a jamais gagné un cœur ni une gemme en jouant.** Les compteurs de
> vitalité sont, à ce jour, décoratifs. Toute la réflexion sur « la tension de gestion du
> capital » porte sur un capital qui ne bouge pas.

Ce qui **reste vrai** du rapport : l'absence de plafond, l'absence de concurrence entre
les deux monnaies, la porte dérobée du Sacrifice, le prix de course mal calibré, et le
danger des sorts à impact scolaire réel. Ce qui **tombe** : l'effet Matthieu par le QCM
(le QCM ne donne rien), et la thésaurisation (rien à thésauriser).

---

## 2. La cause : le plateau annonce des règles que le moteur n'applique pas

Chaque case porte deux champs **indépendants** : un **texte d'effet**, que l'élève lit, et
une **configuration machine**, seule exécutée. Rien ne les relie, et aucune erreur n'est
levée quand ils divergent.

Un contrôle automatique a été ajouté (voir §4) et passé sur les 217 cases des 7 chapitres :

| Verdict      | Cases   | Part     |
| ------------ | ------- | -------- |
| Cohérentes   | 114     | 53 %     |
| **En écart** | **103** | **47 %** |

Le détail des 103 écarts :

- **96 promesses conditionnelles non câblées.** Ce sont les cases qui affichent
  « Bonne réponse : +1 gemme » (40 cases), « Bonne réponse : +2 gemmes » (41 cases),
  « Si réussi : +1 gemme. Sinon : −1 cœur » (10 cases), « la première équipe arrivée gagne
  3 gemmes » (5 cases). **Le moteur ne sait pas exprimer une condition sur l'issue** : ses
  branches sont _neutre / gnome / licorne_, jamais _bonne réponse / mauvaise réponse_.
  Ces promesses ne peuvent pas être tenues, aujourd'hui, par construction.
- **7 promesses simples non tenues** — 7 cases affichent « Passe ton tour », le moteur ne
  fait rien (2 d'entre elles appliquent bien le −1 cœur annoncé à côté, mais pas le
  passe-tour).

**C'est le problème n°1 pour une classe de 6ème.** Un élève de 11 ans lit la case, lit son
compteur, et constate que la règle affichée ne s'applique pas. Il n'en conclut pas « le
moteur manque d'une branche conditionnelle » : il en conclut que le jeu n'est pas fiable,
ou qu'il a mal compris. C'est plus coûteux qu'une case sans règle du tout.

---

## 3. Les autres écarts entre le rapport et la réalité du code

| Point                | Ce que dit le rapport                                               | Ce que montre la certification                                                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sorts à impact réel  | « tous en `auto` — risque n°1 »                                     | **Confirmé et pire** : le réglage global vaut `per_spell`, donc chaque sort suit son propre mode, et les 31 sont en `auto`. **Consécration (« vert + » au bulletin) était lançable sans aucune validation adulte, en production.** → corrigé, §4                                                                              |
| QCM                  | « 521 questions + 35 lore »                                         | **914 questions biomes + 357 lore.** Mais **254 questions (28 %) n'ont ni niveau ni difficulté renseignés** — elles peuvent tomber sur n'importe quelle case                                                                                                                                                                  |
| Difficulté ressentie | non mesurée                                                         | **2 bonnes réponses sur 15** en séance réelle (13 %). Sur un échantillon minuscule, mais c'est le seul signal terrain existant — à surveiller de près                                                                                                                                                                         |
| Feuillets → zones    | « `kingdom_zone_id` = 0/205, maillon manquant »                     | **Confirmé**, mais **`zone_label` est renseigné sur 143/205** : l'information d'ancrage existe déjà en texte. C'est un travail de **rattachement**, pas de rédaction. **Attention cependant : il n'existe que 13 zones pour 7 chapitres** (2 par chapitre) — la « chasse spatiale » n'a aujourd'hui presque aucune résolution |
| Journal              | « feature construite, jamais utilisée, il lui faut une motivation » | **Confirmé, et rien ne le bride** : module actif, limites à 0 (= illimité). Il est vide parce qu'aucune mécanique n'y écrit et que rien n'y renvoie                                                                                                                                                                           |
| Économie feuillet    | « 65 payants / 58 donnant des cœurs »                               | **Confirmé**, et **les deux réglages sont actifs en production** (`lore_gemme_costs_enabled`, `lore_heart_rewards_enabled`). Lire certains feuillets coûte donc réellement des gemmes — dans une économie où l'on n'en gagne aucune                                                                                           |
| Glossaire            | « 17 termes »                                                       | **278 termes** de glossaire biomes + **49** de glossaire lore                                                                                                                                                                                                                                                                 |
| Plafond de cœurs     | « aucun max »                                                       | **Confirmé** (limite technique 99). Un joueur de test est à 9 cœurs, 4 sont au-dessus du départ                                                                                                                                                                                                                               |
| Images de plateau    | « manquantes pour ch3-7 »                                           | **Confirmé** : les 5 vrais plateaux n'ont aucun fond de carte                                                                                                                                                                                                                                                                 |

---

## 4. Ce qui a été corrigé dans ce lot

Trois corrections, choisies pour être **sûres** : aucune ne tranche une question de
conception encore ouverte.

### 4.1 Les sortilèges à effet scolaire réel exigent une validation du MJ

Cinq sortilèges ne produisent pas un effet de jeu mais un effet dans la scolarité de
l'élève : **Esquive** (reporter un rendu, 3 💎), **Révélation** (le professeur donne la
réponse, 4 💎), **Mentorat** (« vert + » à l'oral, 4 💎), **Annulation** (dispense d'une
activité évaluée, 8 💎), **Consécration** (« vert + » au bulletin, 8 💎).

Tous passent en **validation MJ obligatoire**. Les coûts ne changent pas, aucun sort n'est
supprimé : un élève ne peut simplement plus s'offrir un avantage scolaire au comptant
parce qu'il a réuni les gemmes. Les sortilèges fictionnels restent en lancement libre.

### 4.2 Un plafond de vitalité réglable

Deux nouveaux réglages, **« Cœurs maximum »** et **« Gemmes maximum »** (0 à 99). **La
valeur par défaut est 0 = pas de plafond** : rien ne change tant que vous n'y touchez pas.

Deux règles de conception, pensées pour des élèves de 6ème :

- **Le plafond bloque les gains, il ne confisque rien.** Un élève à 9 cœurs le jour où
  vous fixez le plafond à 5 ne perd pas 4 cœurs — il ne peut plus monter, voilà tout. Une
  reprise rétroactive et invisible serait incompréhensible à cet âge.
- **Il s'applique au jeu, pas au MJ.** Cases, feuillets et Marché le respectent (sans quoi
  le Marché serait le contournement évident). Un ajustement manuel du MJ reste souverain.

### 4.3 Un contrôle de cohérence des plateaux

Un diagnostic compare, case par case, ce que le texte annonce et ce que le moteur
applique, et liste les écarts par chapitre. **Il ne corrige rien** — il rend visible un
problème qui était jusqu'ici totalement silencieux, et laisse le choix : câbler l'effet,
ou retirer la promesse du texte.

---

## 5. Les options pour finir les mécaniques

Cinq décisions à prendre. Chacune est présentée avec ce qu'elle coûte, ce qu'elle apporte,
et **ce qu'elle donne à vivre à un élève de 6ème** — le seul critère qui tranche vraiment.

### Décision A — Que fait le QCM ? _(la plus urgente : 96 cases en dépendent)_

Le rapport laisse cette fourche ouverte. Elle ne peut plus l'être : 96 cases affichent une
promesse liée à la réponse, et aucune n'est tenue.

**Option A1 — Le QCM ne donne rien, et on retire la promesse des cases.**
Le QCM ne pilote que la progression (valider une fiche, avancer). Les textes des 96 cases
sont réécrits pour ne plus promettre de gemmes.
→ _Coût : faible_ (une passe de réécriture des textes, aucun code).
→ _Effet Matthieu : nul._ Aligné avec le principe « gemmes = magie, pas niveau scolaire ».
→ _Pour un 6ème :_ honnête, mais **la case quiz n'a plus aucun enjeu visible**. Répondre
juste ne produit rien d'observable. C'est le risque principal de cette option.

**Option A2 — Le QCM donne des gemmes, et on câble la condition.**
On ajoute au moteur des branches _bonne réponse / mauvaise réponse_, et les 81 cases quiz
tiennent enfin ce qu'elles affichent (+1 ou +2 gemmes, jamais de perte).
→ _Coût : moyen_ (une évolution du moteur d'effets + éditeur + tests ; ~1 lot).
→ _Effet Matthieu : réel_ — c'est exactement ce que le rapport veut éviter. **Atténuation
forte et peu coûteuse : créditer l'ÉQUIPE, pas le joueur.** Le pion appartient déjà à
l'équipe et les effets s'appliquent déjà à tous ses membres : un bon élève fait gagner son
équipe, il ne se constitue pas un magot.
→ _Pour un 6ème :_ la boucle est immédiate et lisible — je réponds, le compteur bouge, mon
équipe gagne. C'est la mécanique la plus facile à comprendre de tout le jeu.

**Option A3 — La condition est câblée, mais les gains sont réglables et partent à 0.**
Même travail moteur que A2, mais la valeur du gain est un réglage. On démarre à 0 (donc
comportement A1), on observe une séance, on monte à 1 si la case quiz paraît trop plate.
→ _Coût : moyen_ (identique à A2, plus un réglage).
→ _Pour un 6ème :_ permet de trancher **sur le terrain** plutôt que sur le papier.

> **Recommandation : A3, avec crédit à l'équipe.** C'est la seule option qui ne referme
> aucune porte. A1 seul risque de vider la case la plus fréquente du plateau (46 % des
> cases) de tout enjeu, ce qui est un prix élevé pour un principe.

### Décision B — D'où viennent les gemmes, si ce n'est du QCM ?

C'est la « fourche pivot » du rapport (Team Spirit → gemmes). Elle reste entière, mais
elle change de nature : il ne s'agit plus de _remplacer_ un robinet trop généreux, mais
d'en **créer un premier**.

**Option B1 — Les cartes Team Spirit alimentent les gemmes.**
En fin d'activité, les cartes gardées par l'équipe se convertissent en gemmes.
→ _Coût : élevé_ — **tout est à construire** (aucune table, système 100 % papier
aujourd'hui) : modèle de données, saisie MJ en fin d'activité, barème, conversion.
→ _Pour un 6ème :_ excellent — le pouvoir magique vient du travail d'équipe, tout le monde
y contribue, et c'est un geste collectif visible.
→ ⚠️ **Le point à vérifier avant de s'engager :** ce système demande-t-il au professeur une
veille continue pendant l'activité ? Si oui, le principe de gérabilité (2.5 du rapport)
saute par cet autre bout, et il faut alléger le système de cartes d'abord.

**Option B2 — Les gemmes restent une ressource de plateau, et on recâble les cases.**
On enrichit les effets machine des cases existantes (Trame Licorne, cases événement,
arrivée) pour qu'elles produisent un revenu réel de 3-5 gemmes par plateau.
→ _Coût : faible_ — c'est de la saisie de contenu dans l'éditeur existant, zéro code.
→ _Pour un 6ème :_ le hasard du dé distribue les gemmes, donc **tout le monde a sa chance
mécaniquement**. Moins riche pédagogiquement que B1, mais immédiat et parfaitement
équitable.

**Option B3 — B2 maintenant, B1 à la rentrée suivante.**
Débloquer l'économie tout de suite avec ce qui existe ; construire le pont Team Spirit
quand le système de cartes aura été observé une année.

> **Recommandation : B3.** B1 est la bonne idée de fond, mais c'est le plus gros chantier
> du projet et il repose sur un système papier dont les détails ne sont pas encore posés.
> B2 ne coûte presque rien et rend les compteurs vivants dès la première séance — sans
> quoi aucune autre mécanique (sorts, marché, plafonds) n'a de prise.

### Décision C — Les cœurs et la tension

**Option C1 — Statu quo.** Pas de plafond, pas de perte. Les cœurs restent décoratifs.
→ _Pour un 6ème :_ rien à gérer, rien à craindre — et rien à ressentir.

**Option C2 — Plafond à 5, pression du Souffle, perte réparable.**
Plafond 5 (réglage déjà disponible), pression nette ramenée à ~0 par plateau et durcie sur
le dernier (le plateau 5 est **déjà** à −1 : la donnée est en place), perte de cœur
possible sur écart de conduite, toujours regagnable par une action positive du jeu.
→ _Pour un 6ème :_ c'est là que naît la tension du vivant. **Deux garde-fous
indispensables** : la perte doit venir _du monde_ (le Souffle), jamais d'une mauvaise
réponse ; et le chemin du retour doit être **toujours ouvert et automatique**, pour qu'un
élève déjà fragile ne se retrouve pas exposé publiquement par un compteur au plus bas.

**Option C3 — C2 sans le volet conduite.** Le plafond et la pression du Souffle, mais les
cœurs ne portent aucune signification comportementale.
→ _Pour un 6ème :_ toute la tension de jeu, aucun risque de stigmatisation. C'est
l'option prudente si le lien cœurs ↔ conduite vous semble délicat à tenir devant la classe.

> **Recommandation : C3 la première année, C2 ensuite si le groupe le supporte.**
> Le lien cœurs ↔ conduite est la mécanique la plus puissante du dispositif et la plus
> risquée. La tester une fois que l'économie fonctionne, pas en même temps.

### Décision D — La chasse aux feuillets

**Un obstacle non identifié dans le rapport : il n'existe que 13 zones du royaume pour
7 chapitres** (2 par chapitre). Une chasse spatiale avec 2 cachettes par plateau et
~35 feuillets à trouver n'est pas une enquête, c'est une liste.

**Option D1 — Rattacher les feuillets aux zones existantes.**
Le `zone_label` textuel est déjà renseigné sur 143/205 feuillets : le rattachement est
largement automatisable.
→ _Coût : faible._ → _Mais la chasse reste grossière_ (17 feuillets par zone en moyenne).

**Option D2 — D1 + découper les plateaux en 6-8 zones chacun.**
→ _Coût : moyen_ (travail de tracé dans l'éditeur, ~40 zones à dessiner).
→ _Pour un 6ème :_ c'est là que la chasse devient un vrai jeu de recherche — une
compétence totalement indépendante du niveau en SVT, donc le meilleur antidote à l'effet
Matthieu de tout le projet.

**Option D3 — Renoncer à l'ancrage spatial** et faire de la chasse une liste d'indices
textuels sans lien avec la carte.
→ _Coût : nul._ → Perd l'essentiel de l'intérêt de la mécanique.

> **Recommandation : D2, mais après A et B.** La chasse n'a de saveur que si trouver un
> feuillet produit quelque chose — et cela suppose une économie qui fonctionne.
> ⚠️ **À trancher en même temps :** 65 feuillets coûtent aujourd'hui des gemmes à la
> lecture, dans une économie où l'on n'en gagne aucune. Soit on désactive le réglage
> `lore_gemme_costs_enabled` (lecture gratuite, conforme au principe « la récompense c'est
> la rencontre »), soit on l'assume une fois que les gemmes coulent.

### Décision E — Le tri des sortilèges

31 sortilèges pour des élèves de 6ème, c'est beaucoup : un enfant de 11 ans en tient trois
ou quatre en tête, pas trente.

**Option E1 — Statu quo.** 31 sorts, dont 13 encore en statut `proposé`.
**Option E2 — Élaguer à ~20** en suivant le rapport (couper Question, Bonus, Empreinte,
Invisibilité, Transfert, Silence ; fusionner Brouillon/Mémo/Tablette en un seul « Répit »).
**Option E3 — E2 + ouvrir les sorts progressivement**, chapitre par chapitre : 5 sorts au
plateau 1, puis 3 nouveaux à chaque plateau.
→ _Pour un 6ème :_ E3 est nettement le meilleur. La progressivité est la façon naturelle
d'apprendre un système, et chaque nouveau sort devient un petit événement de chapitre.

> **Recommandation : E3.** Peu coûteux (les sorts sont déjà rattachables aux chapitres),
> fort effet pédagogique et narratif.
>
> **Un point à trancher au passage : le sortilège Sacrifice** (1 cœur → 1 gemme, illimité,
> gratuit en gemmes). Tant que les cœurs sont abondants et les gemmes rares, ce n'est pas
> un dilemme mais un distributeur : c'est la source de gemmes la plus rentable du jeu, et
> elle contourne tout ce que les décisions A et B mettront en place. À limiter (une fois
> par séance) ou à retirer.

---

## 6. Ordre des opérations proposé

L'ordre compte, parce que chaque étape rend la suivante mesurable.

1. **Rendre les compteurs vivants** — décision B (option B2 : recâbler les cases
   existantes). Sans revenu, rien d'autre ne se teste.
2. **Trancher le QCM** — décision A (option A3 : condition câblée, gain réglable à 0).
   Résorbe les 96 cases incohérentes.
3. **Réparer les 7 « passe ton tour »** et repasser le contrôle de cohérence jusqu'à zéro
   écart.
4. **Fixer les plafonds** — décision C (option C3 : plafond 5, sans volet conduite).
5. **Générer les 5 fonds de carte** manquants, puis **découper les zones** — décision D.
6. **Élaguer et échelonner les sortilèges** — décision E.
7. **Rejouer une séance test** et recompter les événements de vitalité. C'est le seul
   verdict qui compte : si `marker_effect` porte enfin des deltas non nuls, l'économie
   existe.

**Le journal** (décision non listée : il n'a pas de fourche technique, seulement un
manque) se branche naturellement à l'étape 5 : il se remplit tout seul des espèces
rencontrées et des feuillets sauvés, et sa complétion est sa propre récompense. Aucune
gemme ne doit y être attachée.

---

## Pour aller plus loin

[L'économie du jeu](economie-marche-sorts.md) · [La carte du royaume](carte-du-royaume.md) ·
[QCM et pédagogie](qcm-et-pedagogie.md) · [Guide du MJ](guide-du-mj.md) · [Sommaire](../README.md)
