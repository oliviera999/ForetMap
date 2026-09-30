# Plan e-nov — présentation

> **Public visé : administrateurs et professeurs.** Aucune connaissance technique requise.

## À quoi sert ce plan ?

Le **plan e-nov** (`enov.olution.info`) est le plan de l'établissement tourné vers le
**label e-nov** : il montre les lieux que l'établissement présente pour leur **caractère
innovant**, sur le vrai plan du lycée, pour qu'on les repère **au premier coup d'œil**.

C'est **le même plan** que [le Plan Lyautey public](presentation.md) — la même carte, la même
recherche, les mêmes fiches, le même bouton « Me situer » — avec trois différences :

- les **lieux innovants ressortent** : un halo coloré les entoure et respire doucement, leur nom
  est écrit en gras et souligné de la même couleur, et **les autres lieux s'estompent** ;
- une puce **« Innovations »**, la première de la rangée sous la recherche, les **liste** tous
  (avec leur nombre) pour les parcourir un à un ;
- la fiche d'un lieu innovant s'ouvre sur un encadré **« 💡 Innovation e-nov »** qui dit **en
  quoi ce lieu est une innovation**, avant tout le reste (sous-titre, photo, description).

Comme le plan public, il ne demande **aucun compte** et ne conserve aucune donnée personnelle.
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

| Réglage                           | Effet                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| **Catégories mises en avant**     | Les catégories dont les lieux ressortent (par défaut « e-nov » seule)                     |
| **Couleur du halo**               | La couleur de la mise en avant (halo, souligné, puce, encadré de la fiche)                |
| **Pastille « e-nov »**            | Ajoute une pastille « e-nov » à côté des lieux mis en avant, en plus du halo (désactivée) |
| **Intitulé de la liste**          | Le nom de la puce qui liste les lieux mis en avant (par défaut « Innovations »)           |
| **Titre, message d'accueil**      | Le titre de l'application et la bulle affichée à la première ouverture                    |
| **Mention en pied de page**       | Une mention sur la carte (source du fond de plan, par exemple)                            |
| **Autres plans proposés**         | D'autres cartes que le lecteur peut ouvrir depuis « Réglages → Plan affiché »             |
| **Catégories cochées / masquées** | Comme sur le plan public : filtres à l'ouverture, catégories retirées des filtres         |
| **Mode d'accès, code d'accès**    | Public, ou fermé par un code (voir ci-dessous)                                            |

La **carte** affichée est celle du Plan Lyautey public : la changer là change aussi le plan
e-nov. Masquer la puce « e-nov » des filtres (« Catégories masquées ») **n'éteint pas** la mise
en avant : les lieux continuent de ressortir.

### Ouvrir le plan à un jury seulement

Par défaut le plan e-nov est **public**. Pour le réserver (visite d'un jury, présentation à des
partenaires), passez le **mode d'accès** sur « Code d'accès » et enregistrez un code d'au moins
8 caractères. Ce code est **propre au plan e-nov** : il n'ouvre pas le plan public, et le code
du plan public n'ouvre pas le plan e-nov. Un lien du plan peut porter le code (`?code=…`), ce
qui permet d'imprimer un QR code qui ouvre directement le plan. Un visiteur entré avec le code
le reste 30 jours sur son appareil ; changer le code referme la porte à tous.

En mode « code » **sans** code enregistré, le plan reste ouvert à tous (on n'enferme pas les
visiteurs dehors par un réglage à moitié rempli).

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

## Renvois

- [Le Plan Lyautey public](presentation.md) — tout ce qui est commun (recherche, filtres,
  fiches, position, parcours).
- [Le plan des personnels](plan-des-personnels.md) — l'autre variante du même plan.
- [Carte et zones](../foretmap/carte-et-zones.md) — où apparaît un lieu, catégories, fiche
  _Modifier_.
