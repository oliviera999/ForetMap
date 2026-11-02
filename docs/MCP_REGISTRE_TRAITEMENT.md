# Fiche de registre — Connecteur Claude (MCP distant)

> Fiche au format du registre des activités de traitement (RGPD, art. 30). À reporter dans le
> registre de l'établissement. Rédigée le 02/11/2026 avec l'arrivée du connecteur
> (`docs/MCP.md`). Public concerné par l'application : **élèves mineurs**, personnels.

## 1. Identification

| Rubrique                | Contenu                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Nom du traitement       | Connexion d'un assistant conversationnel (Claude) au contenu pédagogique du site         |
| Responsable             | L'établissement exploitant l'instance (chef d'établissement)                             |
| Contact DPO             | Contact DPO du site (celui indiqué sur la page « Vos données », réglage de l'instance)   |
| Mise en œuvre technique | Module `lib/mcp/` ; activable par l'administrateur (`MCP_ENABLED`), désactivé par défaut |

## 2. Finalité

Permettre à un **personnel habilité** (profils administrateur et n3boss/professeur, permission
« Connecteur Claude (MCP) ») d'interroger le **contenu pédagogique** (fiches espèces, cartes,
clés de détermination, QCM, glossaires, contenu du jeu Gnomes & Licornes) depuis Claude, de
lancer des **audits de cohérence** de ce contenu et, pour les seuls administrateurs, de
**préparer et appliquer des corrections de contenu** (crédits photo, définitions, rattachement
d'une espèce à une zone…).

Hors finalité, et **techniquement impossible** par le connecteur : consulter un compte, un
élève, une classe, une production d'élève individuelle, un message, un journal de connexion.

## 3. Personnes concernées et catégories de données

| Personnes                         | Données traitées par le connecteur                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personnel utilisant le connecteur | Identifiant interne du compte (`user_id`), profil et permissions (lus pour décider de l'accès), horodatages d'usage                                                                                     |
| Élèves                            | **Aucune donnée individuelle.** Agrégats anonymes seulement (nombre d'observations, de réponses aux QCM par catégorie, de lectures de tutoriels, de tâches réalisées), effectifs inférieurs à 5 masqués |
| Auteurs de contenu                | Crédits photo publics (noms d'auteurs, licences) tels qu'affichés sur le site ; adresses e-mail éventuelles masquées                                                                                    |

Aucune donnée sensible (art. 9), aucun mot de passe en clair, aucune adresse IP n'est
transmise à Claude.

## 4. Minimisation — mesures par construction

- **Liste blanche** de tables de contenu ; **liste noire prioritaire** de toutes les tables de
  comptes, identités, jetons, journaux, forum, commentaires, notifications, inscriptions, LTI,
  OAuth (détail : `docs/MCP.md` § 5).
- Colonnes nominatives (e-mail, nom, prénom, pseudo, auteur d'une action, IP, jetons, hachages)
  refusées dans les requêtes et **retirées des réponses** ; tout motif d'e-mail, de hachage ou de
  jeton est masqué en sortie.
- Traces d'élèves : uniquement des **comptages**, jamais par personne ni par classe ; seuil
  **n ≥ 5**.
- Lecture en **transaction en lecture seule**, avec durée maximale et nombre de lignes plafonné.
- Écriture limitée à une **liste fermée de champs de contenu**, en deux temps (plan montré à la
  personne, puis application) et journalisée.
- Un test automatique vérifie, à chaque modification du code, qu'aucune réponse d'outil ne
  contient d'e-mail, de hachage ou de jeton.

## 5. Destinataires

| Destinataire                          | Données                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Le personnel connecté                 | Réponses des outils (contenu pédagogique, audits, agrégats)                                                                 |
| **Anthropic** (fournisseur de Claude) | Mêmes réponses, transmises au modèle dans la conversation de ce personnel. Trafic entrant depuis la plage `160.79.104.0/21` |
| Administrateurs du site               | Journaux techniques (§ 6)                                                                                                   |

Anthropic agit selon les conditions du compte Claude de l'utilisateur ou de l'organisation
(conservation et usage des conversations : réglages du compte Claude). **À vérifier par le
DPO** : nature du compte utilisé (individuel, Team, Enterprise), localisation et encadrement
du transfert hors UE (clauses contractuelles types), option d'exclusion de l'entraînement.
Recommandation : réserver le connecteur à un compte d'organisation dont ces points sont
documentés.

## 6. Durées de conservation

| Donnée                                                                | Durée                                                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Code d'autorisation (haché)                                           | 60 s de validité ; supprimé 1 h après expiration                                                                              |
| Jeton d'accès (haché)                                                 | 1 h de validité ; supprimé 7 jours après expiration ou révocation                                                             |
| Jeton de rafraîchissement (haché)                                     | 30 jours de validité ; supprimé 7 jours après expiration ou révocation                                                        |
| Client OAuth enregistré                                               | Sans donnée personnelle (nom d'application, redirections)                                                                     |
| Plan d'écriture                                                       | 1 h de validité ; plans non appliqués supprimés 7 jours après expiration ; plans appliqués conservés (trace de la correction) |
| Journal d'appels (Pino)                                               | Tampon mémoire et journaux du serveur, rotation de l'hébergeur ; outil, compte, durée, statut — **sans les arguments**        |
| `security_events` (connexion, consentement) / `audit_log` (écritures) | Durées déjà définies pour ces journaux (`docs/reference/exploitation/durees-de-conservation.md`)                              |

La suppression d'un compte supprime ses jetons et plans (clés étrangères en cascade).
Durées réglables par variables d'environnement (`docs/MCP.md` § 2).

## 7. Sécurité

OAuth 2.1 avec PKCE, clients publics, redirections limitées à Claude ; connexion par les
identifiants du site et **double authentification** si le compte l'a activée ; jetons
aléatoires de 256 bits stockés **hachés** ; rotation des jetons de rafraîchissement avec
révocation en cas de réutilisation ; vérification du compte et des permissions **à chaque
requête** (retrait immédiat) ; jetons du connecteur refusés sur l'API du site et inversement ;
limitation de débit ; journalisation.

## 8. Droits des personnes

- **Personnels** : accès, rectification, effacement par les moyens habituels du site
  (page « Vos données ») ; retrait du connecteur à tout moment dans les réglages de Claude, ou
  par un administrateur (retrait de la permission, effet immédiat).
- **Élèves** : aucune donnée individuelle n'est traitée par le connecteur ; leurs droits
  s'exercent sur les traitements principaux du site.

## 9. Points à valider par le DPO avant activation

1. Compte Claude utilisé (organisation recommandée) et encadrement du transfert vers Anthropic.
2. Information des personnels (mention dans la page « Vos données » si le connecteur est activé).
3. Liste des profils autorisés (par défaut : admin et n3boss/professeur en lecture ; admin seul
   en écriture).
4. Utilisateur MySQL en lecture seule pour le connecteur (`DB_MCP_USER`), recommandé.
