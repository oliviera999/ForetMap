# Plan e-nov — présentation

> **Public visé : administrateurs et professeurs.** Aucune connaissance technique requise.

## À quoi sert ce plan ?

Le **plan e-nov** (`enov.olution.info`) est le plan de l'établissement tourné vers le
**label e-nov** : il montre les lieux que l'établissement présente pour leur **caractère
innovant**, sur le vrai plan du lycée, pour qu'on les repère **au premier coup d'œil**.

C'est **le même plan** que [le Plan Lyautey public](presentation.md) — la même carte, la même
recherche, les mêmes fiches, le même bouton « Me situer » — habillé aux **couleurs du label
e-nov** :

- la **barre du haut** reprend les bleus du logo e-nov, soulignée d'un trait jaune, et porte le
  **logo officiel « Label e-nov — Établissements innovants »** (AEFE) à côté du titre ;
- le **logo du lycée** reste affiché en bas à gauche de la carte, comme sur les autres plans ;
- les boutons, le fond et les textes passent du bleu marine du lycée aux bleus du label.

Il s'en distingue aussi par quatre fonctions :

- les **lieux innovants ressortent** : un contour coloré épais entoure chaque zone et un
  anneau fin chaque repère, leur nom est écrit en gras et souligné de la même couleur, et **les
  autres lieux s'estompent**. À l'ouverture du plan, ces contours respirent deux fois pour
  attirer l'œil, puis restent fixes : la carte redevient calme et le fond de plan reste
  lisible entre les lieux ;
- une puce **« Innovations »**, la première de la rangée sous la recherche, les **liste** tous
  (avec leur nombre) pour les parcourir un à un ;
- la fiche d'un lieu innovant s'ouvre sur un encadré **« 💡 Innovation e-nov »** qui dit **en
  quoi ce lieu est une innovation** et de **quel type d'espace** il s'agit, avant tout le reste
  (sous-titre, photo, description) ;
- quand plusieurs cartes sont publiées (le lycée et le complexe sportif), une **bascule** sous
  la barre du haut passe de l'une à l'autre d'un seul geste.

Comme le plan public, il ne demande **aucun compte** et ne conserve aucune donnée personnelle ;
sa page **« Vos données »** (lien dans l'aide et sur l'écran de saisie du code) le dit aux
visiteurs.
Il n'y a ni tâche, ni élève, ni progression. Des **compteurs anonymes** de fréquentation lui sont
propres (ouvertures, recherches, ouvertures de la liste « Innovations »), séparés de ceux du
plan public.

## Ce que voit un visiteur

1. **Tout le plan de l'établissement**, pour s'y repérer : les mêmes lieux que sur le plan
   public. Un lieu retiré du plan public (par exemple pour des raisons de sécurité) est aussi
   absent du plan e-nov.
2. **Les innovations mises en avant.** Elles restent affichées même vue d'ensemble (elles ne
   sont jamais regroupées dans une pastille chiffrée, et leur nom passe devant les autres quand
   la place manque). Si l'établissement l'a activée, une petite **pastille « e-nov »** est
   accolée à chacune.
3. **La puce « Innovations »** ouvre la liste des lieux innovants dans la feuille du bas ; la
   carte reste visible et manipulable. Toucher un lieu de la liste ouvre sa fiche. Dans la liste
   de recherche aussi, les innovations portent une étiquette « Innovation ».
4. **La fiche d'une innovation** commence par l'encadré « 💡 Innovation e-nov » et son texte,
   puis présente le lieu comme sur le plan public.

Pour un lecteur d'écran, le nom de chaque lieu innovant est suivi de « Innovation e-nov » : le
halo ne s'entend pas, l'information ne doit pas se perdre pour autant. Si le téléphone est
réglé en **mouvement réduit**, le halo ne respire plus : il reste affiché, immobile.

Quand on **referme la fiche** d'un lieu, ce lieu respire brièvement, une seule fois : on voit
d'un coup d'œil où il se trouve sur la carte, même après avoir lu sa fiche en plein écran. En
mouvement réduit, ce rappel n'est pas animé.

## Ce que fait un professeur ou un administrateur (dans ForetMap)

Le plan e-nov n'a **pas de console à lui**. Tout se règle depuis ForetMap, sur les lieux que
l'établissement décrit déjà : **on ne recrée aucun lieu**.

### Désigner un lieu comme innovation

Dans la fiche de la zone ou du repère, onglet _Modifier_ :

1. **Cochez la catégorie « 💡 e-nov »** dans la liste des catégories. C'est elle qui fait
   ressortir le lieu sur le plan e-nov.
2. **Remplissez le champ « 💡 Description e-nov »** (juste sous les catégories) : en quoi ce
   lieu est une innovation pour l'établissement. C'est le texte qui ouvre la fiche sur le plan
   e-nov. Un retour à la ligne est conservé tel quel ; un lien web écrit en toutes lettres
   devient cliquable.
3. Enregistrez.

Les deux vont ensemble : un texte sans la catégorie ne met pas le lieu en avant, et la
catégorie sans texte met le lieu en avant avec un encadré « Innovation e-nov » sans
explication.

### Indiquer le type d'espace

Toujours dans l'onglet _Modifier_, sous la description e-nov, le menu **« Type d'espace
e-nov »** range le lieu parmi : espace extérieur, espace pédagogique, espace sportif, vie
scolaire et bien-être, espace administratif, restauration, autre espace. Le label attend, au
niveau 3, un plan qui montre **plusieurs espaces de types différents** : c'est ce type qui
range la légende du plan imprimé (voir plus bas), et il s'affiche sous le titre de l'encadré
« Innovation e-nov » de la fiche. Un lieu sans type reste sur le plan, rangé en fin de légende
sous « Type d'espace non renseigné ».

### Une catégorie invisible ailleurs

La catégorie « e-nov » est une **catégorie-label** : elle **signale** un lieu sans jamais le
retirer d'un autre plan. Concrètement :

- elle n'apparaît **que sur le plan e-nov** — ni sur la carte des élèves, ni dans la Visite, ni
  sur le Plan Lyautey public, ni sur le plan des personnels. Personne ne la voit sur une fiche
  hors du plan e-nov, et le texte e-nov n'y est pas affiché non plus ;
- dans ForetMap, **seuls les comptes qui peuvent modifier les lieux** (administrateur, n3boss)
  la voient, dans la fiche du lieu et dans _Réglages → Cartographie → Catégories_ ;
- poser la catégorie sur un lieu qui n'en avait aucune (une entrée, la loge…) **ne le fait pas
  disparaître** des autres plans : il y reste affiché comme avant.

Vous pouvez créer d'autres catégories-labels : dans _Réglages → Cartographie → Catégories_, cochez
« Catégorie-label » sur la catégorie. Sans cette case, une catégorie visible sur le seul plan
e-nov **retirerait** de tous les autres plans les lieux qui n'ont qu'elle.

### Régler le plan e-nov

Dans _Réglages → Plan Lyautey_, section **« Plan e-nov (enov) »** :

| Réglage                           | Effet                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Catégories mises en avant**     | Les catégories dont les lieux ressortent (par défaut « e-nov » seule)                                          |
| **Couleur du halo**               | La couleur de la mise en avant (halo, souligné, puce, encadré de la fiche) — par défaut le jaune du logo e-nov |
| **Pastille « e-nov »**            | Ajoute une pastille « e-nov » à côté des lieux mis en avant, en plus du halo (désactivée)                      |
| **Intitulé de la liste**          | Le nom de la puce qui liste les lieux mis en avant (par défaut « Innovations »)                                |
| **Titre, message d'accueil**      | Le titre de l'application et la bulle affichée à la première ouverture                                         |
| **Mention en pied de page**       | Une mention sur la carte (source du fond de plan, par exemple)                                                 |
| **Autres plans proposés**         | D'autres cartes que le lecteur peut ouvrir depuis « Réglages → Plan affiché »                                  |
| **Catégories cochées / masquées** | Comme sur le plan public : filtres à l'ouverture, catégories retirées des filtres                              |
| **Mode d'accès, code d'accès**    | Public, ou fermé par un code (voir ci-dessous)                                                                 |

La **carte** affichée est celle du Plan Lyautey public : la changer là change aussi le plan
e-nov. Les **couleurs et le logo e-nov**, eux, ne se règlent pas : ils suivent la charte du label,
et les couleurs de marque réglées pour le Plan Lyautey ne s'appliquent pas au plan e-nov. Masquer la puce « e-nov » des filtres (« Catégories masquées ») **n'éteint pas** la mise
en avant : les lieux continuent de ressortir.

### Ouvrir le plan à un jury seulement

Par défaut le plan e-nov est **public**. Pour le réserver (visite d'un jury, présentation à des
partenaires), passez le **mode d'accès** sur « Code d'accès » et enregistrez un code d'au moins
12 caractères (le bouton « Générer un code » en propose un, à noter avant d'enregistrer). Ce code est **propre au plan e-nov** : il n'ouvre pas le plan public, et le code
du plan public n'ouvre pas le plan e-nov. Un lien du plan peut porter le code (`?code=…`), ce
qui permet d'imprimer un QR code qui ouvre directement le plan ; le code disparaît de la barre
d'adresse dès que le plan est ouvert. Un visiteur entré avec le code
le reste 30 jours sur son appareil (durée réglable de 1 à 90 jours, vérifiée par le serveur) ;
changer le code referme la porte à tous.

En mode « code » **sans** code enregistré, le plan reste ouvert à tous (on n'enferme pas les
visiteurs dehors par un réglage à moitié rempli).

### Imprimer les plans annotés (dossier de labellisation)

Dans _Réglages → Plan Lyautey_, section « Plan e-nov », le bloc **« Plans annotés à
imprimer »** ouvre la page d'impression du plan e-nov : un bouton pour **tous les plans**, un
bouton par carte (le lycée, le complexe sportif…). La page est aussi joignable directement à
l'adresse `enov.olution.info/impression`. Si le plan e-nov est fermé par un code, elle le
demande, comme le plan.

Chaque carte donne **une feuille A4** :

- en tête, le logo du label, le nom de l'établissement, le titre « Plan annoté des espaces
  innovants » et le nombre d'espaces et de types d'espace ;
- la **carte**, sur laquelle chaque lieu innovant est entouré et porte un **numéro** ; les
  autres lieux apparaissent en pointillés, avec leur nom, pour s'y repérer ;
- la **légende**, rangée par type d'espace, les numéros se suivant de haut en bas ; chaque
  entrée reprend le début de la description e-nov ;
- en pied de page, la date du jour, la mention de pied de page du plan e-nov (source du fond
  de plan, par exemple) et un **QR code** qui ouvre la carte sur le plan interactif.

Avant d'imprimer, la page propose : les cartes à inclure, l'orientation (A4 paysage ou
portrait), le détail de la légende (texte court, texte développé, noms seuls), l'affichage des
autres lieux et du QR code. Rien n'est enregistré : ces choix ne valent que pour l'impression
en cours. Le bouton **« Imprimer / PDF »** ouvre la fenêtre d'impression du navigateur :
choisissez « Enregistrer au format PDF », **sans** en-têtes ni pieds de page du navigateur,
avec les **arrière-plans graphiques** activés (sinon les contours colorés disparaissent).

Pour qu'une carte figure sur la page, elle doit être proposée sur le plan e-nov (« Autres plans
proposés »), comme pour la bascule.

### Parcours

Un parcours du plan public **n'est pas repris** automatiquement sur le plan e-nov. Pour un
« parcours des innovations », créez-le dans ForetMap (_Réglages → Cartographie → Parcours_) et cochez
**« Plan e-nov »** dans « Proposé sur ».

## ⚠️ Points d'attention

> ⚠️ **Point d'attention — l'adresse doit être ouverte.** Le plan ne répond que sur l'adresse
> `enov.olution.info`. Tant que cette adresse n'a pas été créée chez l'hébergeur et pointée vers
> l'application (intervention technique, comme pour `planlyautey`), le plan e-nov n'est pas
> joignable.

> ⚠️ **Point d'attention — couleur du halo.** La pastille, la puce « Innovations » et l'encadré
> de la fiche écrivent **en sombre** sur la couleur choisie. Choisissez une couleur vive et
> claire (ambre, vert d'eau, jaune) : une couleur foncée rendrait ces textes difficiles à lire.

> ⚠️ **Point d'attention — lieux masqués.** Un lieu masqué sur le Plan Lyautey public est
> masqué aussi sur le plan e-nov au moment où le plan e-nov a été créé. Si l'une de vos
> innovations était retirée du plan public, décochez « Plan e-nov » dans son bloc
> « Masquer sur » pour qu'elle y apparaisse.

> ⚠️ **Point d'attention — message d'accueil.** Depuis l'arrivée de la bascule entre cartes,
> un message d'accueil qui renvoie à « Réglages → Plan affiché » pour le complexe sportif
> décrit un chemin devenu inutile : pensez à le reformuler.

> ⚠️ **Point d'attention — numéros superposés.** Sur le plan imprimé, le numéro d'un lieu se
> pose au centre de sa zone. Deux petites zones très proches peuvent voir leurs numéros se
> chevaucher : vérifiez l'aperçu avant d'imprimer et, au besoin, retouchez le tracé du lieu.

> ⚠️ **Point d'attention — suivi d'usage.** Les compteurs de fréquentation du plan e-nov sont
> bien enregistrés, mais l'écran de suivi d'usage ne propose comme filtre que ForetMap,
> Gnomes & Licornes et le Plan Lyautey : on ne peut pas y isoler le plan e-nov. Ses chiffres
> n'apparaissent qu'en choisissant « Tous les produits », mêlés à ceux des autres applications.

## Renvois

- [Le Plan Lyautey public](presentation.md) — tout ce qui est commun (recherche, filtres,
  fiches, position, parcours).
- [Le plan des personnels](plan-des-personnels.md) — l'autre variante du même plan.
- [Carte et zones](../foretmap/carte-et-zones.md) — où apparaît un lieu, catégories, fiche
  _Modifier_.
