# Fiche de registre — Connecteur MCP distant

> Fiche au format du registre des activités de traitement (RGPD, art. 30). À reporter dans le
> registre de l'établissement. Rédigée le 02/11/2026 avec l'arrivée du connecteur
> (`docs/MCP.md`) ; mise à jour multi-clients (Claude, Cursor, ChatGPT, Gemini CLI). Public
> concerné par l'application : **élèves mineurs**, personnels.

## 1. Identification

| Rubrique                | Contenu                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Nom du traitement       | Connexion d'un assistant compatible MCP au contenu pédagogique du site                   |
| Responsable             | L'établissement exploitant l'instance (chef d'établissement)                             |
| Contact DPO             | Contact DPO du site (celui indiqué sur la page « Vos données », réglage de l'instance)   |
| Mise en œuvre technique | Module `lib/mcp/` ; activable par l'administrateur (`MCP_ENABLED`), désactivé par défaut |

## 2. Finalité

Permettre à un **personnel habilité** (profils administrateur et n3boss/professeur, permission
« Connecteur MCP ») d'interroger le **contenu pédagogique** (fiches espèces, cartes, clés de
détermination, QCM, glossaires, contenu du jeu Gnomes & Licornes) depuis un assistant
(Claude, Cursor, ChatGPT, Gemini CLI…), de lancer des **audits de cohérence** de ce contenu et,
pour les seuls administrateurs, de **préparer et appliquer des corrections de contenu**
(crédits photo, définitions, rattachement d'une espèce à une zone…).

Hors finalité : consulter un compte, un élève, une classe, une production d'élève
individuelle, un message, un journal de connexion. **Garantie réelle** :

- **outils standards** (20 outils) : ils n'exécutent que du SQL écrit dans le code, contrôlé
  contre une liste blanche de tables de contenu, colonnes nominatives retirées des réponses.
  Ils ne permettent pas ces consultations ;
- **outil SQL libre** (`foretmap_sql_select`, administrateurs, **désactivé par défaut**) : il
  n'est disponible que si **trois** contrôles sont en place — un refus en amont de tout
  commentaire SQL (`/* */`, `#`, `--`), de tout « ; » et de tout caractère invisible ou non
  canonique (MariaDB exécute le contenu des commentaires `/*! … */`) ; une analyse syntaxique
  de la requête qui refuse toute table hors liste blanche (y compris par sous-requête, table
  parenthésée, CTE ou `UNION`) et les fonctions d'identité, de fichier ou de temporisation ;
  **et** un compte MySQL dédié dont les droits sont **vérifiés par le serveur lui-même**
  (`SHOW GRANTS` du compte **et** de `PUBLIC`, à chaque appel) : lecture des seules tables de
  contenu, rien d'autre. Un droit plus large (base entière, écriture, rôle, droit accordé à
  tous les comptes par `PUBLIC`…) rend l'outil indisponible, et l'incident est journalisé. Les fonctions de mise en forme `CAST`, `HEX`,
  `CONCAT` restent admises : elles ne donnent accès à aucune donnée supplémentaire, le
  périmètre lisible étant borné par les droits vérifiés ;
- **journaux techniques** (`foretmap_tail_logs`, `foretmap_diagnostics`, administrateurs) :
  ils ne transmettent qu'une **liste fermée de champs** — niveau, heure, message, identifiant
  de requête, méthode, statut et durée HTTP, gabarit de route défini par le code
  (`/api/gl/players/:id/journal` ; un chemin réel n'est jamais transmis, il devient `autre`),
  type et code d'erreur s'ils ont une forme technique (sinon `[valeur]`), message d'erreur ; pour les diagnostics, des compteurs et états nommés un par
  un. Tout autre champ (identifiants de comptes, d'élèves, d'équipes, pseudos, auteurs…) est
  retiré. Dans les messages, les identifiants techniques (UUID, suites hexadécimales) et les
  adresses IP sont remplacés par des **pseudonymes** (`id#3f2a91`, `ip#7c01d4`), stables au
  sein d'une réponse pour permettre le diagnostic, calculés avec une clé aléatoire jetée après
  chaque appel (impossibles à relier à un compte ou d'un appel à l'autre) ; les nombres de
  trois chiffres ou plus sont remplacés par `[n]`, les valeurs citées entre apostrophes ou
  guillemets (par exemple la valeur en double d'une erreur d'unicité) par `'[valeur]'` ;
  e-mails, hachages et jetons sont masqués.
  **Limite honnête** : un nom ou un pseudo écrit en clair dans le texte d'un message ne peut
  pas être reconnu avec certitude et n'est donc pas garanti absent. Le code du site passe les
  identifiants en champs séparés (retirés), jamais dans le texte des messages ; c'est la règle
  à tenir pour tout nouveau message de journal.

**Fonctions d'exploitation** (ajoutées le 03/11/2026, `docs/MCP.md` § 11), qui ne retirent
aucune des garanties ci-dessus :

- **mémoire du connecteur** (`foretmap_recall`, `foretmap_remember`, `foretmap_forget`, profils
  ayant la permission du connecteur) : notes techniques stables (conventions, pièges connus,
  emplacements). Le serveur **refuse** toute note qui contient une adresse e-mail ou ressemble à
  un secret (mot de passe, jeton, clé, hachage) ; la consigne donnée à Claude interdit d'y
  mettre une donnée d'élève. Une note personnelle n'est visible que de son auteur ; une note
  partagée ne peut être modifiée ou supprimée que par son auteur ou un administrateur ;
- **rapport de santé** (`foretmap_health_report`, `foretmap_health_history`, administrateurs ;
  tâche quotidienne ; point d'accès protégé par un jeton) : uniquement des **agrégats
  techniques** — version, mémoire, latence et taille des tables (métadonnées, aucune ligne
  lue), compteurs de réponses en erreur, état des tâches planifiées, espace disque, échéance des
  certificats, nombre de connexions du connecteur (sans identité), nombre de constats du corpus ;
- **journaux et fichiers du serveur** (`foretmap_list_files`, `foretmap_read_file`,
  `foretmap_grep_files`, `foretmap_cron_status`, **administrateurs seulement**) : lecture seule
  dans une liste fermée de dossiers (journaux des tâches planifiées, journaux de démarrage et du
  serveur web, scripts, documentation, migrations). Valeurs des fichiers de configuration
  (`.env`) **toujours** masquées (seuls les noms de variables), fichiers de clés jamais transmis,
  secrets reconnaissables (jetons, mots de passe dans une adresse, en-têtes d'authentification)
  masqués ; dans les journaux, adresses e-mail masquées, valeurs citées, identifiants et
  adresses IP remplacés par des pseudonymes comme pour `foretmap_tail_logs`. **Limite** : un
  nom écrit en clair dans une ligne de journal texte n'est pas reconnaissable de façon sûre ;
  c'est pourquoi ces outils sont réservés aux administrateurs, qui ont déjà accès à ces
  journaux sur le serveur.

Avant la relecture de sécurité du 03/11/2026, l'outil SQL libre se contrôlait par expressions
régulières, contournables (`SELECT * FROM (users)`) ; la contre-vérification du même jour a
montré que l'analyse syntaxique seule laissait passer un commentaire exécutable MariaDB. Il
était désactivé par défaut et n'a jamais été déployé.

### Mode productivité (drapeaux serveur — optionnel)

Ces réglages (`docs/MCP.md` § 2 et § 13) **ne changent pas** la finalité du connecteur ; ils
autorisent des **outils ou flux supplémentaires** réservés aux administrateurs. Tant qu'ils
restent aux valeurs protégées par défaut, **rien** de ce qui suit n'est transmis à Anthropic.

| Drapeau / permission                              | Effet côté serveur                                                                                        | Ce qui peut être transmis à **Anthropic** (dans la conversation du personnel)                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_WRITE_REQUIRE_PLAN=false`                    | Expose `foretmap_content_change` (écriture directe de contenu, même liste blanche)                        | Uniquement du **contenu pédagogique** corrigé (textes, crédits, liaisons espèce ↔ zone…) — pas de comptes élèves                                                 |
| `MCP_SQL_WRITE_ENABLED` + `mcp.sql_execute`       | Expose `foretmap_sql_execute`                                                                             | Résultats d'une instruction SQL (lignes affectées, échantillon de lignes, `migration_sql`) : **peut contenir des données** selon la requête ; secrets masqués    |
| `MCP_SQL_DDL_ENABLED`                             | Autorise DDL/DCL dans `foretmap_sql_execute`                                                              | Métadonnées de schéma / messages d'erreur SQL — pas de listes nominatives d'élèves en soi                                                                        |
| `MCP_SQL_MAX_AFFECTED_ROWS`                       | Plafond avant confirmation                                                                                | Aucun transfert supplémentaire : borne technique                                                                                                                 |
| `MCP_CONFIRM_REQUIRED=false`                      | Pas de code e-mail avant certaines exécutions SQL sensibles                                               | Aucune donnée en plus ; **moins** de friction, donc risque opérationnel accru pour le même contenu SQL                                                           |
| `MCP_PRIVACY_BYPASS` + ACK + `mcp.privacy_bypass` | Outils `foretmap_list_students`, `foretmap_get_student` ; seuils « &lt;5 » levés sur les agrégats d'usage | **Données nominatives d'élèves** (identité, e-mail, groupes, activité récente) et agrégats finement détaillés — **jamais** mots de passe, hachages, TOTP, jetons |

Anthropic reçoit **toujours** ce que le modèle demande via les outils autorisés pour le compte
connecté ; ces drapeaux élargissent la **liste d'outils** et le **périmètre des réponses**, pas
le canal (HTTPS depuis `160.79.104.0/21`, compte Claude du personnel).

## 3. Personnes concernées et catégories de données

| Personnes                         | Données traitées par le connecteur                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personnel utilisant le connecteur | Identifiant interne du compte (`user_id`), profil et permissions (lus pour décider de l'accès), horodatages d'usage ; auteur (identifiant) des notes de mémoire                                                                                                                                                                                    |
| Élèves                            | **Par défaut : aucune donnée individuelle** — agrégats anonymes seulement (observations, QCM, tutoriels, tâches), effectifs &lt; 5 masqués. **Si bypass RGPD actif** (`MCP_PRIVACY_BYPASS` + ACK + permission admin) : identité et activité récente d'élèves consultés via les outils nominatifs ; secrets (mot de passe, TOTP, jetons) **exclus** |
| Auteurs de contenu                | Crédits photo publics (noms d'auteurs, licences) tels qu'affichés sur le site ; adresses e-mail éventuelles masquées                                                                                                                                                                                                                               |

Aucune donnée sensible (art. 9), aucun mot de passe en clair, aucune adresse IP en clair
n'est transmise à Claude (les journaux techniques ne portent que des pseudonymes, § 2).

## 4. Minimisation — mesures par construction

- **Liste blanche** de tables de contenu ; **liste noire prioritaire** de toutes les tables de
  comptes, identités, jetons, journaux, forum, commentaires, notifications, inscriptions, LTI,
  OAuth (détail : `docs/MCP.md` § 5).
- Colonnes nominatives (e-mail, nom, prénom, pseudo, auteur d'une action, IP, jetons, hachages)
  refusées dans les requêtes et **retirées des réponses** ; tout motif d'e-mail, de hachage ou de
  jeton est masqué en sortie.
- Traces d'élèves : uniquement des **comptages**, jamais par personne ni par classe ; seuil
  **n ≥ 5** ; fenêtres de temps **fixes** (7, 30, 90, 365 jours) pour empêcher d'isoler une
  journée par différence de deux requêtes.
- Lecture en **transaction en lecture seule**, avec durée maximale et nombre de lignes plafonné.
- Écriture limitée à une **liste fermée de champs de contenu**, en deux temps (plan montré à la
  personne, puis application) et journalisée.
- Un test automatique vérifie, à chaque modification du code, qu'aucune réponse d'outil ne
  contient d'e-mail, de hachage ou de jeton.

## 5. Destinataires

| Destinataire                                       | Données                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le personnel connecté                              | Réponses des outils (contenu pédagogique, audits, agrégats)                                                                                                                                                   |
| **Anthropic** (si client Claude)                   | Mêmes réponses, transmises au modèle : contenu pédagogique et agrégats **par défaut** ; avec **mode productivité**, périmètre élargi comme dans le tableau § 2. Trafic cloud souvent depuis `160.79.104.0/21` |
| **OpenAI** (si client ChatGPT)                     | Mêmes réponses (périmètre élargi en mode productivité), selon les conditions du compte / espace de travail ChatGPT                                                                                            |
| **Google** (si client Gemini CLI)                  | Mêmes réponses (périmètre élargi en mode productivité), selon les conditions du compte Google utilisé pour Gemini CLI                                                                                         |
| Éditeur de l’IDE (si client Cursor sur le distant) | Les réponses transitent via l’infrastructure Cursor lorsque l’agent distant OAuth est utilisé                                                                                                                 |
| Administrateurs du site                            | Journaux techniques (§ 6)                                                                                                                                                                                     |

**Le choix du client MCP = choix du sous-traitant IA.** Chaque fournisseur agit selon les
conditions du compte utilisé. **À vérifier par le DPO** pour chaque client autorisé : nature
du compte (individuel / organisation), localisation et encadrement du transfert hors UE,
option d'exclusion de l'entraînement. Recommandation : réserver le connecteur à des comptes
d'organisation documentés.

## 6. Durées de conservation

| Donnée                                                                | Durée                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code d'autorisation (haché)                                           | 60 s de validité ; supprimé 1 h après expiration                                                                                                                                                                                                                                                       |
| Jeton d'accès (haché)                                                 | 1 h de validité ; supprimé 7 jours après expiration ou révocation                                                                                                                                                                                                                                      |
| Jeton de rafraîchissement (haché)                                     | 30 jours de validité ; supprimé 7 jours après expiration ou révocation                                                                                                                                                                                                                                 |
| Client OAuth enregistré                                               | Sans donnée personnelle (nom d'application, redirections)                                                                                                                                                                                                                                              |
| Plan d'écriture                                                       | 1 h de validité ; plans non appliqués supprimés 7 jours après expiration ; plans appliqués conservés (trace de la correction)                                                                                                                                                                          |
| Journal d'appels (Pino)                                               | Tampon mémoire et journaux du serveur, rotation de l'hébergeur ; outil, compte, durée, statut — **sans les arguments**                                                                                                                                                                                 |
| `security_events` (connexion, consentement) / `audit_log` (écritures) | Durées déjà définies pour ces journaux (`docs/reference/exploitation/durees-de-conservation.md`)                                                                                                                                                                                                       |
| Note de mémoire du connecteur (`mcp_memory`)                          | Jusqu'à son oubli (`foretmap_forget`) ; signalée « à revérifier » après 90 jours ; note personnelle supprimée avec le compte, note partagée conservée sans auteur                                                                                                                                      |
| Rapport de santé (`mcp_health_reports`)                               | 90 jours (`MCP_HEALTH_REPORT_RETENTION_DAYS`) ; aucune donnée de personne                                                                                                                                                                                                                              |
| Journal des tâches planifiées (`scheduled_job_runs`)                  | 180 jours ; comptages et messages d'erreur nettoyés, aucune donnée de personne                                                                                                                                                                                                                         |
| Lecture de fichiers et journaux du serveur                            | Rien n'est conservé par le connecteur : lecture à la demande ; les journaux eux-mêmes suivent leur rotation (`docs/CRONTAB.md`, ligne 8)                                                                                                                                                               |
| Confirmation MCP (`mcp_confirmations`)                                | **10 min** de validité pour un code à 6 chiffres (HMAC, jamais le code en clair en base) ; usage unique ou verrouillage après 3 essais ; lignes expirées ou consommées **supprimées** opportunistément (au plus toutes les **10 min**, même cadence que la purge OAuth, déclenchée par `/oauth/token`) |

La suppression d'un compte supprime ses jetons, plans et confirmations en attente (clés étrangères en cascade).
Durées réglables par variables d'environnement (`docs/MCP.md` § 2).

## 7. Sécurité

OAuth 2.1 avec PKCE, clients publics, redirections limitées à une **allowlist multi-clients**
(Claude, Cursor, ChatGPT, Gemini CLI ; motifs préfixe pour ChatGPT) ; connexion par les
identifiants du site et **double authentification** si le compte l'a activée ; jetons
aléatoires de 256 bits stockés **hachés** ; rotation des jetons de rafraîchissement avec
révocation en cas de réutilisation ; jetons liés à l'**époque** du compte (un changement de
mot de passe ou une désactivation les révoque aussitôt) ; vérification du compte et des
permissions **à chaque requête** (retrait immédiat) ; jetons du connecteur refusés sur l'API du site et inversement ;
limitation de débit ; journalisation.

## 8. Droits des personnes

- **Personnels** : accès, rectification, effacement par les moyens habituels du site
  (page « Vos données ») ; retrait du connecteur à tout moment dans les réglages de
  l’assistant utilisé, ou par un administrateur (retrait de la permission, effet immédiat).
- **Élèves** : aucune donnée individuelle n'est traitée par le connecteur ; leurs droits
  s'exercent sur les traitements principaux du site.

## 9. Points à valider par le DPO avant activation

1. Clients autorisés (Claude / Cursor / ChatGPT / Gemini CLI) et encadrement du transfert vers
   chaque sous-traitant IA correspondant ; comptes d'organisation recommandés.
2. Information des personnels (mention dans la page « Vos données » si le connecteur est activé).
3. Liste des profils autorisés (par défaut : admin et n3boss/professeur en lecture ; admin seul
   en écriture).
4. Outils de lecture des journaux du serveur (administrateurs) : confirmer qu'ils peuvent
   rester actifs (`MCP_FILES_ENABLED=false` les retire) ; les journaux de l'hébergeur sont déjà
   accessibles aux administrateurs du serveur, le connecteur les leur transmet nettoyés.
5. Utilisateur MySQL en lecture seule pour le connecteur (`DB_MCP_USER`, `GRANT SELECT` par
   table de contenu), recommandé ; condition de l'outil SQL libre. Sur un hébergement qui ne
   permet que des droits par base entière, l'outil SQL reste indisponible de lui-même (droits
   vérifiés par `SHOW GRANTS`) : le laisser désactivé.

### Prérequis **obligatoires** avant `MCP_PRIVACY_BYPASS=true`

Le bypass nominatif élèves **contredit** la garantie « aucune donnée individuelle d'élève » du
§ 2. Ne poser **`MCP_PRIVACY_BYPASS_ACK=AAAA-MM-JJ`** qu'**après** :

1. **Base légale** identifiée et documentée pour ce traitement via Claude (finalité, proportionnalité).
2. **Accord de traitement / sous-traitance** avec **Anthropic** adapté à un **compte Claude
   d'organisation** (Team / Enterprise), couvrant transferts hors UE si applicable (CCT, DPA).
3. **Information** des **familles** et des **personnels** concernés (ou mise à jour de la page
   « Vos données » / registre) : le connecteur peut, si activé, transmettre identité et activité
   d'élèves au modèle.
4. **Analyse d'impact (AIPD)** lorsque des **données de mineurs** sont concernées.
5. **Durée de conservation** définie pour les traces (`audit_log` `mcp.privacy_bypass.read`,
   conversations Claude selon réglages Anthropic) et procédure de retrait du bypass.

Ensuite seulement : `MCP_PRIVACY_BYPASS=true` et `MCP_PRIVACY_BYPASS_ACK=<date du GO DPO>`
(format `AAAA-MM-JJ`, non future). Sans ACK valide, le serveur **refuse** d'activer les outils
nominatifs même si le drapeau est à `true` (`docs/MCP.md` § 13).
