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

- **Les tours** : passer au tour suivant ouvre un nouveau round où **toutes les équipes
  rejouent** — le moteur ne désigne pas d'équipe « au trait ». Le tour réarme seulement ce
  que chaque équipe peut faire une fois par tour (déplacement, lancer de dé) ; l'alternance
  stricte entre équipes reste une convention d'animation que vous tenez. Les **sortilèges ne
  sont pas liés au tour** : ce qui les régule, c'est la validation du MJ (voir
  [l'économie](economie-marche-sorts.md)).
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

## L'aide et les visites guidées

**Un bouton « ? »** est présent en bas de chaque onglet. Il ouvre l'aide de l'écran
affiché — auparavant, ce texte était un encadré qu'il fallait aller chercher sous le
contenu de la page. Le bouton **clignote** tant que l'aide de cet onglet n'a jamais été
ouverte, puis se calme définitivement.

**Vous ne lisez pas la même aide que vos élèves.** Sur les écrans que vous partagez avec
eux — la carte, le carnet, le marché, le forum, le journal, les sortilèges, les
glossaires, les tutoriels — l'aide affiche une version qui vous est destinée : ce qu'il
faut vérifier avant la séance, où se règle telle mécanique. Les autres écrans affichent le
même texte pour tout le monde.

**Dix-huit onglets ont une visite guidée** — tout ce qui se joue : cartes, écosystèmes,
biodiversité, glossaire scientifique, histoire, carnet de Sélène, sortilèges,
introduction, règles, lexique du récit, tutoriels, forum, marché, statistiques, journal
de partie, journal personnel, plateau de découverte et console MJ. C'est une courte
séquence qui présente l'écran, bulle après bulle, la première fois qu'on l'ouvre. Elle se
relance à volonté depuis le bouton « ? » → « ▶ Visite guidée ». Les élèves qui ont déjà
vu un onglet ne la revoient pas.

Les **quatre écrans d'administration** (utilisateurs, contenus, réglages, mascottes)
n'ont pas de visite : OLU n'y parle pas, leur aide est rédigée sur un ton neutre.

Chaque sous-onglet d'un regroupement — « La nature », « L'aventure », « Le monde G&L »,
« Les joueurs » — ouvre sa visite sur une bulle qui montre la barre de sous-onglets et dit
ce qu'il y a à côté. Vous la reverrez en ouvrant un deuxième sous-onglet du même
regroupement : c'est voulu, elle rappelle où l'on se trouve.

**Vous pouvez réécrire ces textes** sans attendre une mise à jour : onglet **Contenus →
Visites guidées**. On y trouve chaque parcours, étape par étape, avec le texte livré
affiché en filigrane ; laisser un champ vide revient à ce texte d'origine. Comme pour
l'aide, vous disposez d'une version joueur et d'une version MJ là où le parcours en
prévoit une.

> La section **« Étapes communes »**, en tête, regroupe les bulles réutilisées par
> plusieurs visites : la bulle finale (« je reste dans le coin ») et les quatre bulles
> d'orientation des regroupements. Les réécrire ici les change **partout** — c'est
> pourquoi elles n'apparaissent qu'une fois.

> Seuls les **textes** sont modifiables. Ce que chaque bulle désigne à l'écran reste
> défini dans l'application : une cible saisie à la main serait le moyen le plus simple
> de faire disparaître une étape sans le moindre message d'erreur.

> Les visites sont **désactivées pour les invités** : leur passage est éphémère, leur
> imposer un parcours à chaque venue serait une porte qui claque. Elles suivent aussi
> l'interrupteur du module d'aide : éteindre l'aide éteint les visites.

## À la première connexion, OLU se présente

Un nouveau venu — élève ou MJ — est accueilli par **trois bulles** : OLU se présente, dit
ce qu'on fait dans le jeu, et indique où le retrouver. Puis il s'efface, et ne revient
plus.

Il ne raconte **pas** l'histoire : « L'histoire, elle, je te laisse la découvrir — ce
n'est pas la mienne à raconter. » Le récit reste au carnet et à vous.

Cet accueil est distinct de l'intro cinématique de l'écran de connexion, qui, elle, ne
change pas.

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
| Une visite guidée ne se relance pas         | L'onglet affiché n'en a pas (les écrans d'administration), ou le module d'aide est éteint                    | Ouvrir le « ? » : le bouton « ▶ Visite guidée » n'apparaît que si un parcours existe                   |
| Un texte de visite réécrit ne s'affiche pas | La réécriture est enregistrée mais la page n'a pas rechargé le parcours                                      | Rouvrir l'onglet ; en cas de doute, vérifier le champ dans Contenus → Visites guidées                  |
| Un élève veut revoir l'accueil d'OLU        | Il n'est joué qu'une fois par navigateur                                                                     | Effacer les données du site dans le navigateur, ou passer par un autre profil                          |
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
