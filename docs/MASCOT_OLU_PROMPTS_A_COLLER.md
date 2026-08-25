# OLU — les seize prompts, prêts à coller

> Compagnon de [`MASCOT_OLU_PLANCHES_SPRITES.md`](./MASCOT_OLU_PLANCHES_SPRITES.md), qui explique
> la démarche. Ce document-ci ne contient **que les prompts finaux**, déjà complétés : rien à
> substituer, rien à adapter. On copie un bloc, on le colle, on génère.

## Avant de coller

**Joindre le retournement d'OLU** (les quatre vues sur fond magenta) **à chaque génération**,
sans exception. C'est lui qui empêche le personnage de dériver d'une planche à l'autre ; un prompt
collé sans l'image de référence produira un autre renard.

Dès que la planche `idle` est validée, la joindre **en seconde référence** pour les quinze
suivantes : la ressemblance en sort nettement plus stable.

Ce qu'il faut regarder à la sortie de chaque planche — et qui impose de relancer :

- la **taille du personnage varie** d'une case à l'autre ;
- un **accessoire disparaît** (sac, tapis, boussole) sur une partie des cases ;
- deux personnages **se touchent ou se chevauchent**.

Ce qu'il ne faut **pas** relancer pour autant : des cases mal alignées ou inégalement espacées.
Le découpage se fait par contenu, pas par grille — c'est rattrapé automatiquement.

---

## 1 — `idle` · 4 cases · 4 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 4 cases côte à côte, de gauche à droite, représentant les 4 étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 4 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 4 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : boucle de repos, très sobre. Le personnage est debout, de trois quarts face, tourné vers le spectateur, bras le long du corps, calme et attentif. Case 1 : posture neutre. Case 2 : respiration, la poitrine et les épaules montent d'un cheveu, la queue s'écarte légèrement. Case 3 : point haut de la respiration, une oreille pivote très légèrement. Case 4 : retour vers la posture neutre, la queue revient. Le déplacement total est minuscule : les pieds ne bougent pas, la tête ne se déplace pas latéralement.
```

---

## 2 — `walking` · 6 cases · 10 fps (et `running` à 14 fps)

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 6 cases côte à côte, de gauche à droite, représentant les 6 étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de profil droit. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 6 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 6 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : cycle de marche complet vu de profil, le personnage avançant vers la droite du cadre. Case 1 : contact, jambe droite en avant talon posé, jambe gauche en arrière. Case 2 : écrasement, poids sur la jambe droite, corps au plus bas. Case 3 : passage, jambe gauche remontée sous le corps, corps au plus haut. Case 4 : contact inversé, jambe gauche en avant, jambe droite en arrière. Case 5 : écrasement sur la jambe gauche, corps au plus bas. Case 6 : passage inversé, jambe droite remontée sous le corps. Les bras balancent en opposition aux jambes, la queue ondule avec un temps de retard, le sac à dos rebondit légèrement. La ligne de pieds reste au même niveau dans les 6 cases : c'est le corps qui monte et descend, pas le cadrage.
```

---

## 3 — `talk` · 4 cases · 8 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 4 cases côte à côte, de gauche à droite, représentant les 4 étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de trois quarts face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 4 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 4 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : boucle de parole tranquille. Le personnage est debout de trois quarts face, une main ouverte remontée près de la poitrine dans un geste d'explication. Case 1 : bouche fermée, début de phrase. Case 2 : bouche entrouverte, la main s'ouvre vers l'extérieur. Case 3 : bouche grande ouverte sur une syllabe, sourcils légèrement levés, tête un rien inclinée sur le côté. Case 4 : bouche à demi refermée, la main revient vers la poitrine. Le corps reste stable et les pieds ne bougent pas : seuls la mâchoire, les sourcils et l'avant-bras travaillent.
```

---

## 4 — `point` · 4 cases · 6 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 4 cases côte à côte, de gauche à droite, représentant les 4 étapes successives d'une même animation de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de trois quarts face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 4 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 4 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage, et surtout aucun objet désigné dans le cadre. Un seul personnage par case.

ANIMATION : le personnage désigne quelque chose situé hors du cadre, vers la droite. Case 1 : posture neutre, bras le long du corps, regard vers le spectateur. Case 2 : le bras droit commence à se lever, coude plié, le regard part vers la droite. Case 3 : bras tendu vers la droite, index clairement pointé, main bien visible et bien dessinée, le regard suit la direction indiquée, expression concentrée et engageante. Case 4 : maintien de la pose, avec un très léger appui du buste vers l'avant. Les pieds restent au même endroit dans les 4 cases.
```

---

## 5 — `happy` · 5 cases · 10 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 5 cases côte à côte, de gauche à droite, représentant les 5 étapes successives d'une même animation de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 5 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 5 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : joie contenue, sans exubérance. Case 1 : posture neutre, léger sourire. Case 2 : le sourire s'élargit, les yeux commencent à se plisser, les épaules montent. Case 3 : franc sourire chaleureux, yeux plissés de contentement, oreilles légèrement rejetées en arrière, tête redressée, les deux mains remontées à hauteur de poitrine. Case 4 : la pose se relâche d'un cran, les mains commencent à redescendre. Case 5 : retour vers la posture neutre en gardant le sourire. Les pieds ne quittent jamais le sol : c'est une satisfaction paisible, pas un triomphe.
```

---

## 6 — `happy_jump` · 5 cases · 10 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 5 cases côte à côte, de gauche à droite, représentant les 5 étapes successives d'une même animation de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de trois quarts face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 5 cases. La ligne de sol invisible est au MÊME NIVEAU dans les 5 cases : quand le personnage saute, c'est lui qui monte dans sa case, jamais le cadrage qui suit. Il est centré horizontalement dans sa case. Les 5 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de nuage de poussière, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : petit bond de joie. Case 1 : accroupissement d'appel, genoux pliés, bras en arrière, corps au plus bas, pieds au sol. Case 2 : détente, les pieds quittent tout juste le sol, les bras montent, le corps s'étire vers le haut. Case 3 : point haut du saut, les deux pieds nettement décollés du sol, bras levés, grand sourire, oreilles rejetées en arrière par l'élan, queue relevée. Case 4 : descente, les jambes se déplient pour préparer la réception. Case 5 : réception, pieds au sol, genoux fléchis, bras qui redescendent.
```

---

## 7 — `celebrate` · 6 cases · 12 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 6 cases côte à côte, de gauche à droite, représentant les 6 étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 6 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 6 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de confettis, pas de serpentins, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : célébration franche, en boucle. Case 1 : posture neutre, bras le long du corps. Case 2 : les bras commencent à monter, le buste se redresse, le sourire s'ouvre. Case 3 : les deux bras sont levés en V au-dessus de la tête, gueule ouverte sur un cri de joie, yeux fermés de contentement, queue relevée. Case 4 : maintien de la pose bras levés, léger balancement du buste vers la gauche. Case 5 : balancement du buste vers la droite, bras toujours levés. Case 6 : les bras redescendent à mi-hauteur, le sourire reste large.
```

---

## 8 — `spin` · 6 cases · 12 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 6 cases côte à côte, de gauche à droite, représentant les 6 étapes successives d'une rotation complète de CE MÊME personnage sur lui-même.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit changer de forme ou de taille d'une case à l'autre ; seule la boussole, portée sur la poitrine, est logiquement masquée sur la vue de dos.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 6 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 6 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : rotation complète du personnage sur lui-même, sur place, en six étapes régulières de soixante degrés. Case 1 : vue de face. Case 2 : trois quarts face, tourné vers la droite. Case 3 : profil droit. Case 4 : vue de dos, sac à dos et tapis roulé bien visibles. Case 5 : trois quarts dos, tourné vers la gauche. Case 6 : profil gauche. Le personnage garde exactement la même posture debout dans les six cases, bras légèrement écartés du corps, expression neutre et souriante ; seule son orientation change. Le sac à dos, ses sangles et le tapis roulé doivent rester cohérents à chaque angle.
```

---

## 9 — `inspect` · 4 cases · 3 fps (`map_read` réutilise ces trames)

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 4 cases côte à côte, de gauche à droite, représentant les 4 étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de trois quarts face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 4 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 4 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane — y compris sur la carte, qui ne porte que des tracés et des taches de couleur, jamais d'écriture. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor. Le seul objet autorisé en plus des accessoires du personnage est la carte décrite ci-dessous. Un seul personnage par case.

ANIMATION : le personnage examine une carte. Il tient à deux mains, devant lui à hauteur de poitrine et légèrement inclinée vers lui, une carte dépliée en papier vieilli portant des tracés et des taches de couleur. Case 1 : il regarde la carte, sourcils froncés par la concentration. Case 2 : il approche la carte de son museau, tête penchée sur le côté. Case 3 : il relève les yeux de la carte et regarde au loin vers la droite du cadre, comme pour comparer. Case 4 : son regard revient sur la carte. La carte garde exactement la même forme, la même taille et les mêmes tracés dans les quatre cases.
```

---

## 10 — `search` · 5 cases · 6 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 5 cases côte à côte, de gauche à droite, représentant les 5 étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de trois quarts. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 5 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 5 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de loupe, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : le personnage cherche du regard. Case 1 : posture neutre, il commence à lever la main droite. Case 2 : main droite en visière au-dessus des yeux, regard porté au loin vers la gauche du cadre, oreilles pivotées vers l'avant. Case 3 : le buste et la tête pivotent, le regard balaie vers le centre, main toujours en visière. Case 4 : regard porté au loin vers la droite du cadre, buste légèrement penché en avant, main toujours en visière. Case 5 : la main redescend, retour vers la posture neutre. Les sourcils sont froncés par la curiosité, jamais par l'inquiétude, et le sourire reste présent.
```

---

## 11 — `wave` · 5 cases · 8 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 5 cases côte à côte, de gauche à droite, représentant les 5 étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 5 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 5 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : salut de la main. Case 1 : posture neutre de face, bras le long du corps, sourire léger. Case 2 : le bras droit se lève, coude plié, main ouverte à hauteur d'épaule. Case 3 : la main est inclinée vers la gauche, doigts écartés, franc sourire. Case 4 : la main est inclinée vers la droite, même sourire — c'est le va-et-vient du salut. Case 5 : la main est de nouveau inclinée vers la gauche. Le reste du corps ne bouge pas et les pieds restent au même endroit : seuls l'avant-bras et le poignet travaillent.
```

---

## 12 — `alert` + `surprise` · 2 rangées de 3 cases · 11 et 9 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image organisée en DEUX RANGÉES de 3 cases chacune, soit 6 cases au total. Chaque rangée se lit de gauche à droite et représente les 3 étapes successives d'une animation de CE MÊME personnage. Les deux rangées montrent deux animations DIFFÉRENTES, décrites plus bas.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 6 cases, y compris d'une rangée à l'autre. Dans chaque rangée, ses pieds reposent sur une même ligne horizontale invisible située au même niveau. Il est centré horizontalement dans sa case. Les 6 cases ont la même largeur et la même hauteur, et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases ni entre les rangées, aucune grille visible. Aucun emoji ni pictogramme flottant : pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de gouttes de sueur, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION — RANGÉE DU HAUT, mise en garde, 3 cases. Case 1 : posture neutre, bras le long du corps. Case 2 : le personnage se redresse, une main ouverte commence à se lever paume vers l'avant. Case 3 : main levée bien visible en signe de « attention », regard direct et soutenu vers le spectateur, sourcils abaissés, bouche fermée et ferme. Sérieux et posé, jamais apeuré ni menaçant.

ANIMATION — RANGÉE DU BAS, surprise, 3 cases. Case 1 : posture neutre, bras le long du corps. Case 2 : sursaut, le corps se raidit et se redresse, les oreilles se dressent d'un coup, les yeux s'agrandissent. Case 3 : surprise pleine, yeux très écarquillés, gueule ouverte en rond, les deux mains remontées devant la poitrine, queue gonflée et relevée.
```

---

## 13 — `sad` + `love` · 2 rangées de 4 cases · 4 et 6 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image organisée en DEUX RANGÉES de 4 cases chacune, soit 8 cases au total. Chaque rangée se lit de gauche à droite et représente les 4 étapes successives d'une animation de CE MÊME personnage. Les deux rangées montrent deux animations DIFFÉRENTES, décrites plus bas.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de trois quarts face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 8 cases, y compris d'une rangée à l'autre. Dans chaque rangée, ses pieds reposent sur une même ligne horizontale invisible située au même niveau. Il est centré horizontalement dans sa case. Les 8 cases ont la même largeur et la même hauteur, et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases ni entre les rangées, aucune grille visible. Aucun emoji ni pictogramme flottant : pas de cœur, pas d'étoile, pas de larme qui gicle, pas de goutte de sueur, pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION — RANGÉE DU HAUT, gravité, 4 cases. Case 1 : posture neutre, bras le long du corps. Case 2 : les épaules s'affaissent, la tête commence à descendre, les oreilles retombent. Case 3 : regard baissé et lointain, bouche en ligne neutre, oreilles retombantes, épaules abaissées, queue basse. Case 4 : maintien de la pose, la tête se redresse d'un cheveu. Recueilli et lucide, jamais larmoyant : aucune larme.

ANIMATION — RANGÉE DU BAS, affection, 4 cases. Case 1 : posture neutre, bras le long du corps. Case 2 : les deux mains remontent et se joignent devant la poitrine, la tête s'incline sur le côté. Case 3 : mains jointes sur la poitrine, yeux fermés en deux arcs souriants, museau relevé, expression attendrie. Case 4 : léger balancement du buste vers l'autre côté, même expression.
```

---

## 14 — `angry` + `sleep` · 2 rangées de 4 cases · 8 et 3 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image organisée en DEUX RANGÉES de 4 cases chacune, soit 8 cases au total. Chaque rangée se lit de gauche à droite et représente les 4 étapes successives d'une animation de CE MÊME personnage. Les deux rangées montrent deux animations DIFFÉRENTES, décrites plus bas : debout en haut, assis en bas.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, vu de trois quarts face. Le personnage a exactement la MÊME ÉCHELLE et la MÊME TAILLE DE TÊTE dans les 8 cases, y compris d'une rangée à l'autre — il est simplement debout dans la rangée du haut et assis dans celle du bas. Dans chaque rangée, le bas de son corps repose sur une même ligne horizontale invisible située au même niveau. Il est centré horizontalement dans sa case. Les 8 cases ont la même largeur et la même hauteur, et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane, et surtout aucune lettre Z pour le sommeil. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases ni entre les rangées, aucune grille visible. Aucun emoji ni pictogramme flottant : pas de bulle de sommeil, pas de veine de colère, pas de nuage de vapeur, pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas d'étoiles, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION — RANGÉE DU HAUT, contrariété, 4 cases, personnage debout. Case 1 : posture neutre, bras le long du corps. Case 2 : les sourcils s'abaissent, les poings se ferment le long du corps. Case 3 : buste penché en avant, poings serrés remontés à hauteur de taille, babines légèrement retroussées, oreilles rabattues en arrière. Case 4 : même pose, le buste se redresse d'un cran en soufflant. Contrarié et boudeur, jamais menaçant ni effrayant : c'est une mascotte destinée à des élèves.

ANIMATION — RANGÉE DU BAS, sommeil, 4 cases, personnage assis en tailleur au sol, dos rond, tête penchée en avant, yeux fermés en deux traits paisibles, queue enroulée autour de lui. Case 1 : tête basse, respiration au plus bas. Case 2 : la tête et les épaules remontent d'un cheveu. Case 3 : point haut de la respiration, la tête glisse un peu sur le côté. Case 4 : la tête retombe doucement vers l'avant.
```

---

## 15 — `eat` · 5 cases · 6 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 5 cases côte à côte, de gauche à droite, représentant les 5 étapes successives d'une même animation de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de trois quarts face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 5 cases. Ses pieds reposent sur une même ligne horizontale invisible, située au même niveau dans chaque case. Il est centré horizontalement dans sa case. Les 5 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas de cœur, pas d'étoile, pas de miettes volantes, pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor. Le seul objet autorisé en plus des accessoires du personnage est la baie décrite ci-dessous. Un seul personnage par case.

ANIMATION : le personnage mange une petite baie rouge sombre qu'il tient entre deux doigts. Case 1 : il tient la baie devant lui, à hauteur de poitrine, et la regarde. Case 2 : il l'approche de son museau, gueule entrouverte. Case 3 : la baie est dans la gueule, joues gonflées, la main est redescendue et vide. Case 4 : mastication, gueule fermée, une joue gonflée, yeux plissés de contentement. Case 5 : déglutition, gueule fermée, sourire satisfait, bras revenus le long du corps. La baie a exactement la même taille et la même couleur dans les cases 1 et 2, et n'est plus visible à partir de la case 3.
```

---

## 16 — `dance` · 6 cases · 10 fps

```
Image de référence jointe : planche de retournement du personnage « OLU », un renard anthropomorphe explorateur, vu de face, de trois quarts, de profil et de dos.

Génère UNE SEULE image : une bande horizontale de 6 cases côte à côte, de gauche à droite, représentant les 6 étapes successives d'une même animation en boucle de CE MÊME personnage.

PERSONNAGE — à respecter à l'identique, case par case : pelage roux/orange chaud, museau, joues, poitrail et bout de queue crème, grandes oreilles dressées à l'intérieur rosé, yeux ronds très expressifs avec un petit reflet blanc, sac à dos en toile beige/kaki à sangles et rabat brun cuir, tapis de couchage roulé vert sauge sanglé sur le sac, petite boussole en laiton pendue à une sangle de poitrine. Aucun élément ne doit apparaître, disparaître ou changer de forme d'une case à l'autre.

STYLE : illustration cartoon 2D moderne, contours souples, ombrage doux type cel-shading, palette chaude et légèrement désaturée. Rendu propre et lisible en très petite taille.

CADRAGE : corps entier dans chaque case, des oreilles aux pieds, vu de face. Le personnage a exactement la MÊME TAILLE et la MÊME HAUTEUR DE TÊTE dans les 6 cases. La ligne de sol invisible est au MÊME NIVEAU dans les 6 cases : quand le personnage saute, c'est lui qui monte dans sa case, jamais le cadrage qui suit. Il est centré horizontalement dans sa case. Les 6 cases ont la même largeur et sont régulièrement espacées.

FOND : aplat uniforme magenta pur #FF00FF, parfaitement plat, sans dégradé, sans texture, sans ombre portée et sans ligne de sol. Aucun élément magenta ou rose vif sur le personnage.

INTERDITS ABSOLUS : aucun texte, aucune lettre, aucun chiffre, aucun numéro de case, aucun libellé, aucun filigrane. Aucun cadre, aucune bordure, aucun trait de séparation entre les cases, aucune grille visible. Aucun emoji ni pictogramme flottant : pas de note de musique, pas d'étoile, pas de confetti, pas d'ampoule, pas de coche, pas de point d'interrogation ni d'exclamation, pas de lignes de mouvement, pas de bulle de dialogue. Aucun décor, aucun accessoire autre que ceux du personnage. Un seul personnage par case.

ANIMATION : petite danse en boucle, joyeuse et simple. Case 1 : appui sur la jambe droite, hanche décalée à droite, bras gauche levé, bras droit bas. Case 2 : transition, les deux pieds au sol, les bras à mi-hauteur. Case 3 : appui sur la jambe gauche, hanche décalée à gauche, bras droit levé, bras gauche bas. Case 4 : transition inverse, les deux pieds au sol, les bras à mi-hauteur. Case 5 : petit saut sur place, les deux pieds décollés, les deux bras levés, grand sourire. Case 6 : réception, pieds au sol, genoux fléchis, bras qui redescendent. La queue accompagne le mouvement avec un temps de retard. Grand sourire et yeux plissés dans les six cases.
```

---

## Récapitulatif

| #   | Planche          | États du pack          | Cases             | Cadence |
| --- | ---------------- | ---------------------- | ----------------- | ------- |
| 1   | `idle`           | `idle`                 | 4                 | 4 fps   |
| 2   | `walking`        | `walking` + `running`  | 6                 | 10 / 14 |
| 3   | `talk`           | `talk`                 | 4                 | 8 fps   |
| 4   | `point`          | `point`                | 4                 | 6 fps   |
| 5   | `happy`          | `happy`                | 5                 | 10 fps  |
| 6   | `happy_jump`     | `happy_jump`           | 5                 | 10 fps  |
| 7   | `celebrate`      | `celebrate`            | 6                 | 12 fps  |
| 8   | `spin`           | `spin`                 | 6                 | 12 fps  |
| 9   | `inspect`        | `inspect` + `map_read` | 4                 | 3 fps   |
| 10  | `search`         | `search`               | 5                 | 6 fps   |
| 11  | `wave`           | `wave`                 | 5                 | 8 fps   |
| 12  | `alert_surprise` | `alert` / `surprise`   | 3 + 3 (2 rangées) | 11 / 9  |
| 13  | `sad_love`       | `sad` / `love`         | 4 + 4 (2 rangées) | 4 / 6   |
| 14  | `angry_sleep`    | `angry` / `sleep`      | 4 + 4 (2 rangées) | 8 / 3   |
| 15  | `eat`            | `eat`                  | 5                 | 6 fps   |
| 16  | `dance`          | `dance`                | 6                 | 10 fps  |

**19 animations distinctes, 21 états couverts** — `running` réutilise les trames de `walking` à
cadence plus élevée, `map_read` celles d'`inspect`. C'est le jeu d'états complet que gèle
`tests/visit-mascot-catalog-states.test.js` : plus aucun état ne retombera sur `idle`.
