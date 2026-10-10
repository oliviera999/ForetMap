# Double authentification des comptes administrateur et n3boss

> **Public de ce document : administrateurs et n3boss.** Il décrit ce que l'application fait
> aujourd'hui, sans jargon technique. Retour au sommaire : [../README.md](../README.md)

## À quoi ça sert

Un compte **administrateur** ou **n3boss** peut tout voir et beaucoup modifier : comptes des
élèves, réglages, contenus. Un mot de passe deviné, recopié ou volé suffisait jusqu'ici à
prendre ces droits. La **double authentification** ajoute une seconde preuve à la connexion :
un **code à 6 chiffres** affiché par une application sur votre téléphone, renouvelé toutes les
30 secondes. Sans le téléphone, le mot de passe seul n'ouvre plus le compte.

**Qui est concerné** : les comptes dont le profil est **Admin** ou **n3boss** (ou un profil de
même niveau créé par l'établissement). **Jamais les élèves**, ni les **personnels**, ni les
**profs de classe**, ni les comptes du jeu Gnomes & Licornes.

## Activer la double authentification

Il faut une **application d'authentification** sur le téléphone, gratuite : par exemple
**FreeOTP**, **Aegis**, **2FAS**, **Google Authenticator** ou **Microsoft Authenticator**.

1. Connectez-vous comme d'habitude. L'application vous propose **« Activer la double
   authentification »** (ou ouvrez **Mon profil → Double authentification**).
2. Cliquez sur **Afficher le QR code** et scannez-le avec l'application du téléphone. Si le
   téléphone ne scanne pas, recopiez la **clé à saisir à la main** affichée dessous.
3. Saisissez le **code à 6 chiffres** que l'application affiche, puis **Activer**.
4. L'écran affiche **10 codes de secours**. **Notez-les ou imprimez-les** et rangez-les à part
   du téléphone : ils ne seront plus jamais affichés. Cochez **« J'ai noté ces codes en lieu
   sûr »** pour continuer.

Activer la double authentification **ferme vos autres sessions** (autres navigateurs, autres
appareils) : vous vous y reconnecterez avec votre code. Un e-mail vous prévient de chaque
activation ; s'il arrive sans que vous ayez rien fait, prévenez immédiatement un
administrateur et changez votre mot de passe.

## Se connecter ensuite

Après le mot de passe (ou après Google, ou en arrivant depuis un cours Moodle), l'application
demande le **code à 6 chiffres** du moment. Un code ne sert **qu'une fois** : s'il vient d'être
utilisé, attendez le suivant. Après **5 codes faux**, le compte est bloqué quelques instants
(30 secondes, puis de plus en plus longtemps, 15 minutes au plus).

## Les codes de secours

Chaque code de secours remplace **une fois** le code du téléphone : bouton **« Utiliser un code
de secours »** à l'écran du code. Un e-mail signale chaque utilisation. **Mon profil** indique
combien il vous en reste et vous alerte à partir de deux ; **« Nouveaux codes de secours »**
(avec le code actuel du téléphone) en produit un lot neuf et rend l'ancien inutilisable.

## Téléphone perdu, changé ou réinitialisé

- **Vous avez encore vos codes de secours** : connectez-vous avec un code de secours, puis
  **Mon profil → Double authentification → Changer d'appareil** (un code de secours est
  accepté comme preuve) et scannez le nouveau QR code avec le nouveau téléphone.
- **Vous changez de téléphone en ayant l'ancien** : même chemin, avec un code de l'ancien.
- **Plus de téléphone ni de codes** : demandez à un **administrateur** de réinitialiser votre
  double authentification (fiche du compte → **Réinitialiser la double authentification**).
  Toutes vos sessions sont fermées ; vous la configurerez de nouveau à votre prochaine
  connexion. L'action est inscrite au journal de sécurité et un e-mail vous prévient.
- **C'est le dernier administrateur qui est bloqué** : la personne qui gère le serveur dispose
  d'une commande de secours qui réinitialise ce compte (procédure technique décrite dans la
  documentation d'exploitation). D'où le conseil : **avoir deux administrateurs enrôlés**.

## Ce que l'administrateur règle

**Réglages → Sécurité → Double authentification des comptes administrateur et n3boss** :

| Valeur                                   | Ce qui se passe                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Transition** (valeur à l'installation) | Un compte qui a activé la double authentification donne toujours son code. Un compte qui ne l'a pas encore activée se connecte normalement, et l'activation lui est proposée à chaque connexion. |
| **Obligatoire**                          | Aucun compte administrateur ou n3boss n'entre sans son code. Un compte pas encore équipé doit l'activer avant d'entrer. Les sessions ouvertes sans code se ferment.                              |
| **Désactivée**                           | Mode de secours seulement : plus aucun code n'est demandé, même aux comptes équipés.                                                                                                             |

**Ordre conseillé** : activer d'abord votre propre double authentification (et celle d'un
second administrateur), prévenir les n3boss, attendre qu'ils l'aient activée, puis passer à
**Obligatoire**. L'application **refuse** ce passage tant que vous n'avez pas vous-même activé
la double authentification et que vous n'êtes pas connecté avec votre code : impossible de
s'enfermer dehors par mégarde. Elle le refuse aussi si le serveur n'a pas encore reçu sa clé
de sécurité (à demander à la personne qui gère le serveur).

**Voir comme un autre utilisateur** (prise de contrôle) n'est possible que depuis une session
administrateur ouverte **avec** le code.

**Suivre l'équipement** : la fiche de chaque compte (Profils → Comptes) indique si la double
authentification est active et combien de codes de secours restent ; le journal de sécurité
trace chaque activation, connexion avec code, code refusé, code de secours utilisé et
réinitialisation (jamais les codes eux-mêmes).

## ⚠️ Points d'attention

- **Le premier qui active gagne** : tant qu'un compte n'a pas activé la double
  authentification, quelqu'un qui connaîtrait son mot de passe pourrait l'activer avec son
  propre téléphone. Le titulaire est alors prévenu par e-mail, et un administrateur peut
  réinitialiser le compte. En cas de doute sur votre mot de passe, **changez-le avant
  d'activer**.
- **Gnomes & Licornes n'est pas concerné** : la connexion d'un maître du jeu dans le jeu se fait
  toujours avec le seul mot de passe. Elle n'ouvre que le jeu, pas ForetMap.
- **L'heure du téléphone compte** : un téléphone dont l'heure est fausse produit des codes
  refusés. Laissez-le régler l'heure automatiquement.
