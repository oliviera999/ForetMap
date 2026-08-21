# Guide pratique du maître du jeu — Gnomes & Licornes

> **Public de ce document : maîtres du jeu (MJ), professeurs.**
> Le mode d'emploi d'une séance, de la préparation au bilan.
> Retour au sommaire : [../README.md](../README.md)

## Avant la séance

1. **Choisir un profil de séance** (Réglages → Gameplay) : Minimal (découverte, le MJ
   déplace tout), MJ + tours (animation guidée, joueurs spectateurs), MJ + tours
   interactif (l'équipe du tour répond aux QCM), Complet avec tours (actions des
   joueurs, score) ou Complet libre. Le profil règle d'un clic les tours, la
   narration, les actions, le score et qui lance QCM et sorts.
2. **Vérifier les modules** voulus : vitalité (cœurs/gemmes), Marché (exige la
   vitalité — les réglages avertissent), Sortilèges, journaux, dé virtuel, musique de
   zone…
3. **Préparer le chapitre** : plateau prêt (zones, repères, effets — voir
   [Carte du royaume](carte-du-royaume.md)), questions en place, feuillets répartis.
4. **Composer les équipes** et attribuer les mascottes **gnome ou licorne** — en
   s'appuyant sur le récit : la forme n'est pas un choix d'équipe, c'est « le seuil qui
   la donne » (voir [Les deux peuples du seuil](lore-deux-peuples.md)).
5. **Les comptes** : joueurs créés ou importés, codes distribués. Un mot de passe
   oublié se réinitialise en un clic dans la gestion des joueurs.

## Pendant la séance — la console MJ

- **Les tours** : passer au tour suivant fait tourner les équipes (et restreint QCM,
  actions et sorts à l'équipe active si les tours sont activés).
- **Les déplacements** : selon le réglage, le MJ déplace les mascottes ou laisse la
  main aux joueurs. À l'arrivée sur un repère, les effets s'appliquent — parfois
  différemment pour un gnome et une licorne : c'est le moment de la phrase-clé,
  _« ce lieu est écrit pour l'autre peuple »_.
- **Les questions** : en mode « QCM réservés au MJ », c'est vous qui présentez la
  question à la classe et validez la réponse depuis la console ; sinon, le popover
  s'ouvre chez l'équipe.
- **Les actions des joueurs** : les propositions arrivent dans votre file — valider,
  refuser, raconter. La **narration** s'écrit au journal de partie, que les joueurs
  lisent en direct.
- **La vitalité** : ajuster cœurs et gemmes par joueur ou par équipe (récompense,
  péripétie, correction).
- **Les sorts** : suivre le pot commun des contributions, approuver le lancement si
  le réglage l'exige — puis **appliquer l'effet**. Le logiciel encaisse le coût, il
  n'exécute pas l'effet : la file **« Sortilèges à appliquer »** liste les sorts payés
  dont l'effet reste à jouer, avec son texte, et un bouton « Effet appliqué ✔ » quand
  c'est fait. Détail : [Économie du jeu](economie-marche-sorts.md).
- **Entre deux chapitres** : annoncer le **passage de seuil** — et, si vous changez
  les mascottes des équipes, c'est le récit qui le justifie (« le seuil donne la forme
  dont le prochain territoire aura besoin »).

## Après la séance

- **Scores et statistiques** : le score des équipes, la progression individuelle et de
  classe (contenus appris, feuillets découverts).
- **Les carnets personnels** : consultables en lecture (et exportables) pour valoriser
  le travail d'écriture des élèves.
- **Le journal de partie** garde la trace narrative de la séance.

## OLU, le narrateur, entre dans le jeu

**OLU** — le renard explorateur qui accompagne déjà l'aide de ForetMap — est désormais présent
dans Gnomes & Licornes. C'est **le même personnage**, pas un sosie.

Où on le voit :

- **À l'ouverture d'un feuillet** du carnet de voyage : son portrait apparaît à gauche et le texte
  du feuillet s'affiche dans une bulle, avec un léger effet de frappe. Un clic dans la bulle
  affiche tout le texte d'un coup. **La bulle ne porte pas son nom, et c'est voulu** : le feuillet
  est écrit par vous, pas par lui. Il le montre, il ne le récite pas.
- **Dans les encadrés d'aide** de chaque onglet : un petit visage dans l'en-tête, discret. Les
  textes d'aide des onglets joueurs sont désormais **écrits à sa voix** — il dit « je », il
  tutoie. Sur les écrans d'administration et la console MJ, il se tait : les textes y restent
  factuels, parce qu'on ne plaisante pas avec des comptes et des permissions.

Ce qu'il faut savoir :

- **Le portrait ne porte jamais d'information.** Tout ce qui compte est dans le texte, et les
  lecteurs d'écran ignorent l'image. Si aucun portrait n'a été chargé, une silhouette dessinée
  prend le relais : rien ne reste vide, rien ne se casse.
- **Il parle du jeu, jamais dans le jeu.** OLU explique comment on ouvre un feuillet ; il ne dit
  jamais ce que le feuillet raconte, n'a pas d'avis sur le Souffle et **ne prend jamais parti
  entre gnomes et licornes**. Ce n'est pas un détail d'écriture : un narrateur qui aurait un camp,
  des élèves le discuteraient — et lui feraient donner raison à leur propre équipe. Il a traversé
  le seuil, mais il n'y a pas pris de forme : il est de passage, pas du royaume.
- **Les textes d'aide restent modifiables** depuis Contenus → Bulles d'aide. Réécrire une entrée
  remplace la version livrée, pour tout le monde.
- **Le réglage est commun aux deux applications.** Nom affiché, portraits, interrupteur : tout se
  règle **une seule fois**, côté ForetMap (Paramètres → Narrateur OLU), et l'effet est immédiat
  des deux côtés. Concrètement, les images n'ont à être téléversées qu'une fois.
- **Éteindre OLU** depuis ce même réglage retire portrait et nom partout, GL compris. Les textes
  des feuillets et de l'aide, eux, ne bougent pas.

> Conséquence à connaître : un MJ qui n'est pas administrateur ForetMap ne peut pas modifier OLU
> lui-même — il faut passer par un administrateur. C'est le revers du personnage unique.

## Incidents courants

| Symptôme                                    | Cause probable                                                                                               | Geste                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| « Le Marché a disparu »                     | Vitalité désactivée (le Marché l'exige)                                                                      | Réglages → activer la vitalité (bouton proposé sous l'avertissement)                                   |
| Un élève ne peut pas marquer « appris »     | Conditionnement par QCM actif : question à réussir, ou délai de nouvelle tentative en cours après une erreur | Vérifier Contenus → Conditionnement QCM et le délai dans Réglages plateforme                           |
| Un popover de zone ne s'ouvre plus          | Réglage de répétition « une fois par partie » : l'équipe l'a déjà vu                                         | Changer le réglage de répétition (globalement ou pour la partie)                                       |
| Mot de passe oublié                         | —                                                                                                            | Gestion des joueurs → réinitialiser le mot de passe (ou forcer le changement à la prochaine connexion) |
| Vérifier ce que voit un élève               | —                                                                                                            | Prendre la main sur son compte (bandeau affiché, action tracée) ou basculer en « vue joueur »          |
| Les sorts ne se lancent pas                 | Module Sortilèges désactivé, ou lancement réservé au MJ par le profil de séance                              | Réglages → modules / gameplay                                                                          |
| OLU n'apparaît pas sur les feuillets        | Le narrateur a été éteint côté ForetMap (le réglage est commun)                                              | ForetMap → Paramètres → Narrateur OLU → rallumer l'interrupteur                                        |
| Un élève ne peut pas payer pour un camarade | C'est le réglage par défaut (chacun sa part, sa propre équipe) — le MJ, lui, répartit toujours librement     | Réglages → gameplay → « Mode de contribution » / « Équipes pouvant lancer »                            |

## Lire et amender cette documentation depuis le jeu

Les documents de référence de Gnomes & Licornes — celui-ci compris — sont consultables
**directement dans l'application** : onglet **Contenus → Doc de référence**. La liste
reprend l'ordre de lecture du sommaire ; le document choisi s'affiche mis en forme.

Un MJ ou un administrateur peut aussi les **modifier** sur place (« Modifier le
document ») : le texte est enregistré au fil de la frappe et remplace, pour tout le
monde, la version livrée avec l'application. C'est le moyen le plus direct de demander
une évolution — écrivez le comportement **souhaité**, précédé du repère
`🔧 À implémenter :`, et la demande est prise en compte au développement suivant.

Trois repères utiles :

- La liste marque d'un point (**•**) les documents modifiés depuis l'application ; les
  autres affichent le texte d'origine.
- **Réinitialiser depuis le dépôt** annule toutes les modifications d'un document et
  rétablit le texte livré avec l'application.
- **Télécharger le .md** enregistre le document tel qu'il est affiché, pour l'archiver
  ou le transmettre.
- Si le document **ne se charge pas** (réseau coupé, serveur qui ne répond pas), le
  panneau n'affiche plus le document précédent : il annonce l'échec et propose
  « Réessayer ». Aucun bouton d'édition n'apparaît tant que le texte n'est pas
  réellement chargé — c'est ce qui évite d'enregistrer par-dessus le mauvais
  document, ou de le vider. Même règle pour la fiche d'un **feuillet** et pour
  l'écran **Intro** ouverts depuis l'onglet Contenus : sans chargement réussi, le
  formulaire ne s'ouvre pas, et rien n'est enregistré.

## ⚠️ Point d'attention

> ⚠️ **Point d'attention** — Les profils de séance ne touchent **pas** aux modules :
> appliquer « Complet avec tours » n'active ni la vitalité, ni le Marché, ni les
> Sortilèges. Faire les deux vérifications (profil **et** modules) avant la classe.

## Pour aller plus loin

[Présentation générale](presentation.md) · [Chapitres et progression](chapitres-et-progression.md) · [Économie du jeu](economie-marche-sorts.md) · [QCM et pédagogie](qcm-et-pedagogie.md) · [Sommaire](../README.md)
