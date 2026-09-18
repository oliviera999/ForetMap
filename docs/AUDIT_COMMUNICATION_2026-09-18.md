# Communication entre utilisateurs — état des lieux, possibilités, projets déjà réfléchis

> **Instantané du 18 septembre 2026.** Déclencheur : une question simple sur le plan des
> personnels — « où part le message de "Signaler un problème", et comment l'admin en est-il
> averti ? ». La réponse tenait en deux temps : le message partait bien quelque part, et
> **personne n'était averti**. Un profil « Personnel » ne pouvait même pas l'envoyer.
>
> Les deux défauts sont corrigés dans le même lot (§4). Ce document sert à l'autre moitié de la
> question : **la plateforme fait-elle communiquer ses utilisateurs, et comment ?**
>
> Statut : **cadrage**. Aucune des pistes de la §6 n'est engagée ; la §8 propose un ordre.

---

## 1. Périmètre et méthode

Ce qui est examiné : tout chemin par lequel **un humain écrit quelque chose qu'un autre humain
lira** dans ForetMap, Gnomes & Licornes ou les deux plans. Sont exclus les flux machine (logs,
compteurs d'usage, audit technique) sauf quand ils servent, faute de mieux, de canal humain — et
c'est justement le cas du journal d'audit aujourd'hui.

Tout ce qui suit est lu dans le code à la date du document, pas estimé :

| Mesure                                                   | Valeur                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Tables portant des messages d'humains                    | 14 (forum ×4, commentaires de contexte ×3, GL forum ×2, carnet ×4, `task_logs`) |
| Routes HTTP des deux forums + deux jeux de commentaires  | 25                                                                              |
| Notifications produites **par le serveur**               | **0**                                                                           |
| Courriels sortants applicatifs                           | 2 usages : réinitialisation de mot de passe, alerte d'exploitation              |
| Écrans listant « ce qui est arrivé » sans ouvrir l'objet | 1 (livré par ce lot, §4) ; 0 auparavant                                         |

La dernière ligne est le cœur du sujet.

---

## 2. L'existant : la carte des canaux

| Canal                                  | Où ça vit                                       | Qui écrit                      | Qui lit                                   | Comment le destinataire est prévenu                          |
| -------------------------------------- | ----------------------------------------------- | ------------------------------ | ----------------------------------------- | ------------------------------------------------------------ |
| **Forum ForetMap**                     | `forum_threads/_posts/_reports/_post_reactions` | élèves n3beur, profs           | idem, cloisonné par groupe le cas échéant | **rien** — il faut ouvrir l'onglet                           |
| **Commentaires de contexte**           | `context_comments` (+ réactions, signalements)  | élèves n3beur, profs           | qui peut ouvrir l'objet commenté          | pastille « non lu » sur l'objet **ouvert**, temps réel       |
| **Signalement d'un lieu (plan)**       | même table, `zone`/`marker`                     | comptes du plan des personnels | console                                   | **notification + journal** (nouveau, §4)                     |
| **Commentaires de tâche**              | `task_logs`                                     | élève qui rend une tâche       | prof qui valide                           | file « à valider » + notification « Validations en attente » |
| **Proposition de tâche**               | `tasks.status = 'proposed'`                     | élève habilité                 | profs                                     | notification « Nouvelle proposition »                        |
| **Carnet / observations**              | `user_journal_*`, observations                  | élève                          | profs selon périmètre de groupe           | rafraîchissement temps réel, aucune alerte                   |
| **Forum GL / commentaires GL**         | `gl_forum_*`, `context_comments` (types `gl_*`) | joueurs, MJ                    | idem                                      | centre de notifications GL (événements de jeu)               |
| **Message d'accueil**                  | réglage `ui.auth.welcome_message`               | admin                          | tout visiteur de l'écran de connexion     | affichage, sans historique ni accusé                         |
| **Complément réservé d'un lieu**       | `restricted_note` + audience par rôle           | gestionnaire de lieux          | rôles visés, sur le plan                  | consultation seule                                           |
| **Doc de référence `docs/reference/`** | fichiers Markdown, marqueur `🔧 À implémenter`  | admin / prof                   | le mainteneur                             | relecture au début d'une tâche                               |
| **Courriel**                           | `lib/mailer.js`                                 | le serveur                     | un compte / l'équipe ops                  | réinitialisation de mot de passe, alerte d'exploitation      |
| **Journal d'audit**                    | `audit_log`                                     | le serveur                     | `audit.read`                              | consultation ; ni filtre par action, ni corps des messages   |

Trois remarques sur cette carte.

**a. Tout est « au fil de l'eau », rien n'est « adressé ».** Aucun message de la plateforme n'a
de destinataire : il est déposé quelque part, et quelqu'un le trouvera peut-être. C'est un choix
défendable pour un forum de classe ; c'en est un mauvais pour un signalement d'infrastructure,
qui a besoin d'un responsable.

**b. Le centre de notifications est entièrement dérivé côté client.** `useNotificationCenter`
fabrique ses avis à partir des données **déjà chargées** par l'application (tâches en attente,
échéances, état du temps réel). Il ne consomme aucune notification serveur, pour l'excellente
raison qu'il n'en existe pas. Conséquences directes : pas d'avis si l'application est fermée,
état « lu » stocké en `localStorage` donc propre à l'appareil, et rien ne peut être adressé à
une personne précise.

**c. GL et ForetMap partagent la table des commentaires mais rien d'autre.** Les types de
contexte sont disjoints (`gl_chapter`, `gl_scene`… contre `zone`, `marker`, `task`…), les
routeurs sont séparés, et les deux centres de notifications sont deux composants distincts —
constat déjà posé par `AUDIT_CONVERGENCE_APPS_2026-09.md` (lot 7, « centre de notifications côté
G&L »), toujours ouvert.

---

## 3. Les six angles morts

1. **Aucune alerte hors application.** Ni courriel, ni notification web (`push` n'est pas
   implémenté : aucun appel à `pushManager` ni à `Notification.requestPermission` dans le
   dépôt). Un message déposé le vendredi soir attend qu'on ouvre la console.
2. **Pas de boucle de retour vers l'auteur.** Qui signale une porte cassée n'apprend jamais si
   c'est lu, encore moins traité. Pire, sur le plan des personnels il ne peut même pas relire
   son propre message : la fiche de lieu n'affiche pas les commentaires, et le routeur de la
   console refuse son profil en lecture.
3. **Pas de statut sur un signalement.** `context_comment_reports` et `forum_reports` ont bien
   une colonne `status`, mais un _message_ de signalement d'infrastructure, lui, n'a ni « pris en
   compte », ni « fait », ni « sans suite ». La seule sortie est la suppression, qui efface
   l'information au lieu de la clore.
4. **L'état « lu » est local à l'appareil.** Deux administrateurs ne savent pas que l'autre a
   déjà vu — et donc traité, ou pas. Vrai du centre de notifications comme du journal livré ici.
5. **Aucun canal descendant.** Un administrateur ne peut pas dire « le jardin est fermé cette
   semaine » autrement qu'en modifiant le message de l'écran de connexion, sans historique, sans
   ciblage par rôle ou par groupe, et sans savoir qui l'a vu.
6. **Aucune modération outillée des signalements.** Les signalements de messages existent en
   base, mais aucun écran ne liste ceux qui sont ouverts : il faut tomber sur le message.

---

## 4. Ce que ce lot livre (18 septembre 2026)

Deux correctifs, volontairement étroits, qui ferment le cas le plus visible sans préjuger de la
§6.

- **Le profil « Personnel » peut signaler.** L'envoi passe désormais par la porte de sa surface
  (`POST /api/staff-plan/report`) plutôt que par `POST /api/context-comments`, qui refuse les
  profils en lecture seule — dont `personnel`, c'est-à-dire le public même de proflyautey. Le
  message reste un commentaire du lieu ; le routeur de la console n'est pas ouvert à ce profil.
  Le lieu visé doit être **réellement visible par ce lecteur** sur la surface `staff`.
- **La console voit ce qui arrive.** Nouvelle vue **Réglages → Cartographie → Messages**
  (« Messages reçus sur les lieux ») alimentée par `GET /api/context-comments/recent`, et
  nouvelle règle du centre de notifications : un message reçu sur un lieu produit un avis nommant
  le lieu. Le repère « déjà lu » reste local à l'appareil (angle mort 4, assumé pour l'instant).

Ce qui **n'est pas** livré : la boucle de retour vers l'auteur, le statut, l'alerte hors
application, le destinataire. Ce sont les objets de la §6.

---

## 5. Ce qui est déjà réfléchi ailleurs dans le dépôt

Aucune de ces pistes ne part d'une page blanche ; quatre documents datés les encadrent déjà.

| Document                                                                            | Ce qu'il dit, et qui s'applique ici                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`AUDIT_STRATEGIE_PLATEFORME_2026-09.md`](AUDIT_STRATEGIE_PLATEFORME_2026-09.md) §7 | **Charte du non-développement** : « ce qui ressemble à une fonction de LMS part chez Moodle » ; « une nouvelle table se justifie par écrit » ; « que se passe-t-il si je ne suis plus là ? ». Une messagerie interne tombe sous les trois. |
| [`AUDIT_CONVERGENCE_APPS_2026-09.md`](AUDIT_CONVERGENCE_APPS_2026-09.md) lot 7      | Centre de notifications à converger entre ForetMap et G&L. Tout travail sur les notifications devrait être fait **une fois**, dans le noyau partagé, pas deux.                                                                             |
| [`AUDIT_MOODLE_IDENTITES_2026-09.md`](AUDIT_MOODLE_IDENTITES_2026-09.md)            | Annuaire + LTI. Si les comptes sont un jour adossés à Moodle, la messagerie et les annonces y sont **déjà** — et avec elles la conformité et la conservation.                                                                              |
| [`AUDIT_STABILITE_PERF_2026-09.md`](AUDIT_STABILITE_PERF_2026-09.md)                | Toute notification serveur est une écriture de plus par événement et une lecture de plus par client. À dimensionner avant, pas après.                                                                                                      |

---

## 6. Les possibilités, et ce qu'elles coûtent

Classées par rapport valeur / risque, pas par séduction.

### C1 — Boucle de retour sur un message de lieu _(petit, immédiatement utile)_

Un statut sur le message (`nouveau` / `pris en compte` / `traité` / `sans suite`), posé depuis la
vue livrée en §4, et visible de son auteur sur la fiche du lieu. Pour l'auteur, c'est la
différence entre « j'ai parlé dans le vide » et « quelqu'un s'en occupe ».

- Coût : une colonne (justifiable par écrit au sens de la charte, §5), une route de mise à jour,
  l'affichage des commentaires sur la fiche du plan.
- Risque : faible. Le seul vrai arbitrage est **qui** peut changer le statut.
- Écart avec l'existant : c'est l'angle mort 2 et 3 d'un coup.

### C2 — Notifications côté serveur _(socle, structurant)_

Une table `notifications` (destinataire, type, objet, lu\_le) et une route de lecture. Le centre
de notifications cesse de deviner : il lit. Tout le reste en dépend — adressage, état « lu »
partagé, courriel, digest.

- Coût : réel. Une table, deux routes, la règle de production par événement, la purge, et la
  reprise du centre de notifications (idéalement dans le noyau partagé, cf. §5 lot 7).
- Risque : moyen. C'est **le** point où une plateforme scolaire se met à ressembler à un LMS.
- Garde-fou : ne produire des notifications que pour des événements **sans équivalent Moodle**
  (un lieu signalé, une tâche du jardin à valider), jamais pour de la vie de classe.

### C3 — Digest courriel aux administrateurs _(petit, à faire après C2, ou même sans)_

Un envoi quotidien ou hebdomadaire récapitulant les messages reçus sur les lieux. `nodemailer`
est déjà là et `sendOpsAlert` fournit le patron ; le cron est documenté (`docs/CRONTAB.md`).

- Coût : faible.
- Risque : faible, à condition d'un **digest** (pas un courriel par message) et d'un réglage
  destinataire explicite.
- C'est la réponse la moins chère à l'angle mort 1.

### C4 — Destinataire / référent _(moyen)_

Rattacher un lieu, une catégorie de lieux ou un type de signalement à un référent (« les portes,
c'est l'agent d'accueil »). Transforme « quelqu'un verra » en « c'est à vous ».

- Coût : moyen, et surtout **organisationnel** : il faut que l'établissement veuille nommer des
  référents. Sans cette décision humaine, la fonction reste vide.
- À ne pas engager avant C1/C2.

### C5 — Annonces descendantes _(moyen, valeur incertaine)_

Un message d'administrateur ciblé par rôle ou par groupe, affiché en bandeau et repris en
notification, avec une date de fin.

- Coût : moyen (contenu, ciblage, accusé de lecture éventuel).
- Risque : **c'est exactement une fonction de LMS**. Si Moodle est en place, l'annonce doit y
  être faite. À n'envisager que pour le périmètre que Moodle ne couvre pas (les visiteurs des
  plans, qui n'ont pas de compte Moodle).

### C6 — Web Push _(à écarter pour l'instant)_

- Coût : service worker, clés VAPID, gestion des abonnements, et un parcours iOS qui exige
  l'installation préalable de la PWA.
- Bénéfice réel très inférieur à C3 pour cette audience (quelques dizaines de personnes).

### C7 — Messagerie interne 1 ↔ 1 _(à écarter)_

- Coût : élevé (fils, non-lus, modération, conservation, signalement).
- Risque : le plus élevé du document — messages privés entre mineurs et adultes dans un outil
  d'établissement, avec un seul mainteneur (§5, point 8 de la charte).
- L'ENT et Moodle le font déjà, avec le cadre juridique qui va avec.

### C8 — Modération outillée des signalements _(petit, dette ancienne)_

Un écran listant les `*_reports` ouverts, avec clôture. Les tables existent, l'écran manque.

---

## 7. Ce qu'il ne faut pas construire

Formulé pour être opposable en revue, dans l'esprit de la charte (§5) :

1. **Pas de messagerie privée entre utilisateurs.** Quelle que soit la demande.
2. **Pas de second centre de notifications.** Toute évolution passe par le noyau partagé.
3. **Pas de notification sans destinataire.** Un avis « à qui de droit » recrée l'angle mort
   qu'on cherche à fermer.
4. **Pas de courriel par événement.** Digest, réglable, désactivable.
5. **Pas de canal nouveau pour un besoin que Moodle couvre déjà.** Un lien profond, pas une
   route.

---

## 8. Séquencement proposé

| Ordre | Lot                                                        | Pourquoi maintenant                                                                                       |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 0     | _(livré, §4)_ signalement `personnel` + vue console + avis | Ferme le défaut le plus visible ; donne un premier écran « qu'avons-nous reçu ? ».                        |
| 1     | **C1** — statut + retour à l'auteur                        | Plus petit gain de confiance par ligne écrite. Se mesure : un signalement clos est un signalement traité. |
| 2     | **C3** — digest courriel aux administrateurs               | Répond à l'angle mort 1 sans toucher à l'architecture.                                                    |
| 3     | **C8** — écran de modération des signalements              | Dette ancienne, tables déjà là.                                                                           |
| 4     | **C2** — notifications serveur, dans le noyau partagé      | À n'engager qu'avec le lot 7 de convergence, sinon on écrit deux fois la même chose.                      |
| 5     | **C4** — référents                                         | Après une décision de l'établissement, pas avant.                                                         |

C5 à C7 restent hors séquence : à réexaminer seulement si le lien Moodle échoue ou si le public
change.

---

## 9. Questions ouvertes pour l'établissement

Ces trois réponses conditionnent la moitié du document, et aucune n'est technique.

1. **Qui est responsable d'un signalement de lieu ?** Sans réponse, C4 est sans objet et C1 se
   limite à un statut que personne ne pose.
2. **Moodle sera-t-il la source des comptes ?** Si oui, C5 et C7 sont définitivement écartés.
3. **Accepte-t-on des courriels sortants de la plateforme vers des adresses d'établissement ?**
   C3 en dépend entièrement.
