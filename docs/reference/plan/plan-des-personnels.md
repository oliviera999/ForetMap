# Plan des personnels (proflyautey / stafflyautey) — présentation

> **Public visé : administrateurs et professeurs.** Aucune connaissance technique requise.

## À quoi sert ce plan ?

Le **plan des personnels** (`proflyautey.olution.info`, ou `stafflyautey.olution.info` — voir
plus bas) est le **même plan** que [le Plan Lyautey public](presentation.md) — la même carte, la
même recherche, les mêmes fiches de lieu — mais réservé aux personnels du lycée, et **plus
complet**.

Il existe parce que le plan public est vraiment public : parents, élèves, visiteurs, curieux.
Certains repères n'y ont pas leur place (locaux techniques, réserves, circulations de service),
et certaines informations non plus (où se trouve la clé, qui contacter, quelle consigne
s'applique). Plutôt que d'entretenir deux cartes, on entretient **une seule carte** dont
chaque lieu dit où il s'affiche et pour qui.

Concrètement, un personnel connecté y voit **deux choses de plus** que le public :

- **les lieux retirés du plan public** — tout ce que vous avez décoché de la surface
  « Plan public » mais laissé sur « Plan personnels » ;
- **le complément réservé de chaque fiche** — le bloc « 🔒 Réservé aux personnels », qui
  n'apparaît nulle part ailleurs que dans la console ForetMap.

Ce qu'il ne contient **pas**, comme le plan public : ni tâches, ni élèves, ni progression, ni
données pédagogiques. C'est un plan, rien d'autre.

## Deux adresses, un seul plan

Le plan des personnels répond sur **deux adresses équivalentes** :

| Adresse                     | Statut                                                                   |
| --------------------------- | ------------------------------------------------------------------------ |
| `proflyautey.olution.info`  | Adresse historique, toujours valable — rien à changer si vous l'utilisez |
| `stafflyautey.olution.info` | Nouvelle adresse, à préférer quand on la communique                      |

Elles ouvrent **le même écran**, avec les mêmes lieux, les mêmes fiches et le même mode
d'entrée. Ce n'est pas un second plan à entretenir : c'est la même application, jointe par
deux noms. La seconde existe parce que « staff » dit mieux ce qu'est le public visé — la vie
scolaire, l'intendance et les agents sont concernés autant que les professeurs.

Une session ouverte sur une adresse ne suit pas sur l'autre (chaque adresse garde sa propre
session dans le navigateur) : on se reconnecte une fois, et c'est réglé. De même, si vous avez
installé le plan sur l'écran d'accueil de votre téléphone, l'icône installée continue d'ouvrir
l'adresse depuis laquelle vous l'avez installée.

> Côté technique, la nouvelle adresse doit être dirigée vers l'application comme l'ancienne
> (nom de domaine et certificat) : c'est la seule intervention nécessaire.

## Comment on y entre

### La voie normale : son compte du lycée

On ouvre `proflyautey.olution.info` ou `stafflyautey.olution.info`, on touche **« Se connecter
avec Google »**, on choisit son compte du lycée. C'est tout : pas de code à retenir, pas de mot
de passe supplémentaire.

Le compte doit porter la permission **« Accès plan des personnels »**. Elle est accordée
d'office aux profils **Administrateur**, **n3boss**, **Prof de classe** et **Personnel**. Pour
un autre profil — y compris un profil maison que vous auriez créé — il suffit de cocher cette
permission dans **Réglages → Profils RBAC**. Aucune intervention technique.

> Si la connexion Google aboutit mais que le plan reste fermé, ce n'est pas une panne : le
> compte n'a pas encore cette permission. L'écran le dit en clair.

Au passage, la page vous renvoie brièvement vers l'adresse de ForetMap avant d'ouvrir Google :
c'est normal et sans conséquence. Google n'accepte de rappeler qu'une seule adresse, connue
d'avance ; on y passe donc pour poser la session, puis vous êtes ramené sur l'adresse d'où
vous êtes parti — `proflyautey` ou `stafflyautey`, selon le cas.

Cette permission est volontairement **séparée** de « Accès interface n3boss » : un agent ou un
membre de la vie scolaire peut entrer sur le plan sans qu'on lui ouvre la console de gestion.

### La voie secondaire : un code partagé (désactivée par défaut)

Pour les personnels **sans compte** — un agent, un intervenant extérieur, un remplaçant —
un administrateur peut activer une entrée par **code partagé**, dans
**Réglages → Plan Lyautey → Plan des personnels (proflyautey)**.

Elle est **désactivée à la livraison**, et c'est volontaire. Un code partagé n'est pas une
authentification :

- il ne dit **pas qui** est entré ;
- il se transmet d'une capture d'écran, y compris à un élève ;
- on ne peut le retirer à une personne qu'en le changeant **pour tout le monde**.

Si vous l'activez malgré tout, trois garde-fous s'appliquent :

- le laissez-passer dure **7 jours** (contre 30 jours sur le plan public) ;
- le porteur du code endosse un **profil que vous choisissez** (par défaut « Personnel »), qui
  décide de ce qu'il voit : laissé bas, il ne verra pas les lieux réservés à l'encadrement ;
- **chaque ouverture est inscrite au journal d'audit**, réussie comme refusée.

Le code n'est jamais stocké en clair, seulement son empreinte. Et contrairement au plan public,
activer le mode « code » **sans** enregistrer de code ne laisse entrer personne : cette surface
n'a pas de version publique acceptable.

## Ce qu'un personnel peut faire de plus

- **Lire le complément réservé** d'un lieu, dans un encadré « 🔒 Réservé aux personnels » sous
  la fiche. Ce texte se saisit dans la console ForetMap, sur la fiche du lieu, champ
  « Complément réservé » — voir [Carte et zones](../foretmap/carte-et-zones.md).
- **Signaler ou proposer** quelque chose sur un lieu, depuis sa fiche : « Signaler un problème
  ou proposer une correction ». Le message est attaché **au lieu concerné**, dans ses
  commentaires, là où un administrateur le retrouve avec son contexte. (Réservé aux comptes :
  un porteur de code n'a pas d'identité à associer au message.) Le profil « Personnel » en
  fait partie : c'est le public de ce plan, il peut signaler même s'il ne participe ni au
  forum ni aux commentaires de la console.

  **Où va le message, et qui le voit ?** Il n'est envoyé à personne par courriel : il devient
  un commentaire du lieu. Un administrateur le retrouve à deux endroits — sur la fiche du lieu
  dans la console, et dans le journal **Réglages → Cartographie → Messages** (« Messages reçus
  sur les lieux »), qui liste tout ce qui est arrivé, du plus récent au plus ancien, avec un
  repère « nouveau ». Une notification apparaît en plus dans la cloche des personnes qui ont la
  console ouverte. Si le module « Commentaires de contexte » est désactivé, le bouton
  disparaît : mieux vaut pas de bouton qu'un message qui n'atterrit nulle part.

- **Ouvrir la console ForetMap** pour corriger le lieu — lien affiché uniquement aux comptes
  qui peuvent réellement éditer zones et repères.

## Décider ce que chacun voit

Chaque lieu porte quatre cases, « Masquer sur » : **Carte**, **Visite**, **Plan public**,
**Plan personnels**. Elles se règlent sur la fiche du lieu, et se règlent aussi **par lot**.

La même logique existe au niveau des **catégories** (« Visible sur ») : décocher une surface sur
une catégorie y retire d'un coup tous ses lieux.

### La revue des surfaces

Pour faire le tri sans ouvrir les fiches une par une :
**Réglages → Cartographie → Zones & repères**.

- Le filtre **Surface** liste les quatre surfaces avec, entre parenthèses, **combien de lieux
  chacune publie**. C'est la réponse à « qu'est-ce que le public voit, aujourd'hui ? ».
- Le filtre **Sur cette surface** (Affichés / Retirés) restreint la liste à ce qui vous
  intéresse, et se combine avec la recherche, la catégorie et la carte.
- Chaque ligne indique, en clair, sur quelles surfaces le lieu sort (« 👁 Carte, Plan public »).
- Les actions par lot **« Afficher sur une surface »** et **« Retirer d'une surface »**
  s'appliquent à toute la sélection.

Marche à suivre conseillée pour ouvrir proprement le plan public :

1. filtrer **Surface = Plan public**, **Sur cette surface = Affichés** ;
2. parcourir la liste et sélectionner tout ce qui n'a rien à y faire ;
3. action par lot **« Retirer d'une surface » → Plan public**.

Ces lieux restent visibles sur le plan des personnels : vous ne perdez rien, vous déplacez.

## Ce qui est partagé avec le plan public, et ce qui ne l'est pas

| Réglage                               | Partagé avec le plan public ?                        |
| ------------------------------------- | ---------------------------------------------------- |
| La carte affichée, son calage GPS     | **Oui** — c'est la même carte de l'établissement     |
| L'identité visuelle (couleurs, logo)  | **Oui**, hors la teinte brune qui distingue les deux |
| Titre, message d'accueil, mention     | Non — propres au plan des personnels                 |
| Catégories cochées d'office, masquées | Non — propres au plan des personnels                 |
| Mode d'entrée, code, profil du code   | Non — propres au plan des personnels                 |

La carte n'a volontairement **pas** de réglage séparé : deux réglages à tenir synchronisés à la
main finiraient par diverger, pour aucun gain.

## Points d'attention

⚠️ **Le plan des personnels ne fonctionne pas hors ligne.** Le plan public garde sa dernière
carte en mémoire sur l'appareil ; celui-ci ne garde que l'habillage, jamais le contenu. C'est
délibéré : des consignes internes ne doivent pas rester sur un téléphone après un changement de
poste, un départ ou un prêt d'appareil. Sans réseau, l'application s'ouvre et dit qu'elle ne
peut pas charger.

⚠️ **La distinction visuelle repose sur la couleur et le titre.** La barre haute est brune sur
proflyautey, bleu marine sur planlyautey, et l'icône d'onglet porte un cadenas. Regardez-la
avant de montrer votre écran à quelqu'un d'extérieur.

⚠️ **« Retiré du plan public » n'est pas « secret ».** C'est une mesure d'éditorialisation :
on ne met pas la chaufferie sur le plan des familles. Pour une information réellement sensible,
utilisez en plus le champ « Qui peut voir » du lieu, qui la réserve à des profils précis.

---

**Voir aussi** : [Plan Lyautey (public)](presentation.md) ·
[Carte et zones](../foretmap/carte-et-zones.md) ·
[Comptes, rôles et groupes](../foretmap/comptes-roles-et-groupes.md)
