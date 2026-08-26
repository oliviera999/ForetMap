# Audit — conditionnement des lectures par question (ForetMap)

> Août 2026. Porte sur le dispositif qui subordonne la validation d'une lecture
> (« Marquer comme lu », « Espèce découverte ») à la réussite de questions du Quiz.
> Périmètre : `lib/learningGating*.js`, `routes/learning-gating.js`,
> `routes/learning-links.js`, `routes/quiz.js`, le flux d'accusé côté élève.
> Gnomes & Licornes partage le cœur mais a ses propres réglages : signalé au cas par cas.

## Ce que le dispositif fait aujourd'hui

L'élève clique « Marquer comme lu ». Le serveur regarde si des questions du Quiz sont
**rattachées** au tutoriel et marquées **bloquantes** et **approuvées**. Si oui, et si
l'interrupteur du site est allumé, l'élève doit y répondre juste avant de pouvoir cocher
la case de confirmation.

Trois modes : une bonne réponse suffit (`any`, défaut), toutes (`all`), ou un seuil (`threshold`).
Chaque ressource peut surcharger le mode ou se dispenser. **L'interrupteur global reste maître** :
éteint, aucune surcharge ne peut rallumer le conditionnement.

Les bonnes réponses données ailleurs comptent : `user_quiz_attempts` enregistre toute réponse,
y compris en entraînement libre, et le conditionnement les relit. L'activation est donc
rétroactive — un choix délibéré et bien documenté.

## Constats

### C1 — Deux régimes possibles, aucun entre-deux · **corrigé dans ce lot**

La première mauvaise réponse verrouillait la ressource **entière** pour trois jours. En mode
« toutes », une erreur à la quatrième question sur cinq annulait tout. À l'inverse, régler le
délai à `0` supprimait toute vérification : rien ne limitait les tentatives, il suffisait de
réessayer jusqu'à tomber juste.

Le dispositif n'avait donc que deux régimes : brutal, ou nul.

→ Nouveau réglage **« Erreurs tolérées avant blocage »** (`learning.gating.allowed_wrong_attempts`,
0 à 10, défaut **0** = comportement inchangé). Le compteur vit dans `resource_gating_cooldowns`
(migration 199) et repart à zéro dès que le verrou expire — sans quoi la faute suivante
re-verrouillerait aussitôt.

### C2 — L'élève découvrait l'épreuve après s'être engagé · **corrigé dans ce lot**

Le bouton disait « ✓ Marquer comme lu ». Rien n'indiquait qu'un contrôle suivrait ; l'annonce
n'arrivait qu'après le clic, la fenêtre ouverte. Un élève pouvait déclencher un verrou de trois
jours sans avoir jamais su qu'il jouait quelque chose.

→ Nouvelle route `GET /api/learning/gating/summary` (résumé groupé, une requête pour toute la
liste), pastille sur le bouton (« 1 question », « 🔒 »), et **règles énoncées avant de commencer** :
combien de questions, combien d'erreurs permises, ce que coûte une erreur, et le rappel que
l'abandon ne coûte rien.

### C3 — Marathon de questions en mode « toutes » · **corrigé dans ce lot**

Une ressource portant huit questions bloquantes les enchaînait sans plafond.

→ Réglage **« Questions posées d'affilée au maximum »** (`learning.gating.max_questions_per_session`,
1 à 10, défaut 3). Les bonnes réponses restant acquises, l'élève avance par paliers. Le serveur
renvoie désormais `ask_count` (ce qui sera posé maintenant) à côté de `pending_count` (ce qu'il
reste au total) ; le client respecte le premier.

### C4 — Le professeur ne voit rien des verrous · **corrigé (lot 27)**

Aucune route, aucun écran n'expose `resource_gating_cooldowns`. Un élève bloqué trois jours est
**invisible** : le professeur ne peut ni le constater, ni comprendre pourquoi l'élève ne valide
pas, ni lever le verrou. En classe, c'est le constat le plus gênant de cet audit : le dispositif
peut bloquer un élève sans que personne ne le sache.

Le contournement actuel est une requête SQL directe. Voir _Évolutions_, piste 1.

### C5 — `auto_mark_on_correct` est un réglage mort · **corrigé (lot 27)**

Lu et exposé des deux côtés, mais **aucune décision ne le consultait**. L'auto-marquage avait été
retiré ; le réglage était resté. → **Supprimé du catalogue**, donc des deux consoles. Un réglage
visible qui ne fait rien use la confiance dans tous les autres.

### C6 — Aucun filtrage par niveau · **bloqué : la donnée n'existe pas**

Le conditionnement ne regarde ni `niveau` ni `difficulte` de la question. Une question marquée
« lycée » peut bloquer un élève de collège.

**Ce constat n'a pas pu être corrigé** : la table `users` ne porte aucun niveau scolaire — ni
colonne, ni groupe qui en tienne lieu. Les paliers RBAC (novice / avancé / chevronné) mesurent les
tâches validées, pas le niveau. Livrer l'interrupteur sans la donnée aurait fait un second réglage
sans effet, exactement ce que C5 vient de retirer.

**Ce qu'il faut décider avant de l'implémenter** : d'où vient le niveau d'un élève ? Une colonne sur
le compte, renseignée à l'inscription ? Un attribut de groupe-classe ? Une correspondance depuis
`affiliation` ? Le filtrage lui-même est ensuite une clause de quelques lignes.

### C7 — Divergence silencieuse ForetMap / GL sur la granularité · **corrigé (lot 27)**

Symptôme d'un mal plus large : **chaque produit définissait les mêmes réglages de son côté**, avec
ses propres bornes. GL avait la granularité que ForetMap n'avait pas ; ForetMap avait la tolérance
d'essais et le plafond par session que GL n'avait pas. Un réglage ajouté d'un côté restait invisible
de l'autre.

→ **Catalogue commun** `lib/shared/gatingSettingsCore.js` : un descripteur par réglage (type, bornes,
défaut, clé de chaque produit). Les deux tables de réglages en sont désormais dérivées — ajouter une
ligne l'ajoute aux deux, avec la même sémantique. Seul le stockage reste distinct (`app_settings` /
`gl_settings`). La granularité reste propre à GL, mais **explicitement** : ForetMap n'a pas d'équipes,
et l'exposer y serait un réglage sans effet.

### C8 — Ce qui tient bien

Plusieurs points méritent d'être notés comme sains, pour ne pas les défaire par mégarde :

- **Le jeton de présentation ne porte jamais la bonne réponse** : il porte une empreinte HMAC et
  un `nonce`. Un `atob()` dans la console ne révèle rien.
- **Anti-rejeu** : le `jti` du jeton est consommé à la première réponse.
- **L'interrupteur global est réellement maître** : une surcharge par ressource ne peut
  qu'assouplir, jamais rallumer derrière lui.
- **Le verrou ne se pose que depuis le flux de validation** : répondre faux en entraînement libre
  ne bloque rien, parce que le contexte ressource n'est pas transmis.
- **Le conditionnement ne s'applique qu'au premier marquage** : une re-observation d'espèce n'est
  pas re-conditionnée.

## Réglages du dispositif après ce lot

| Réglage                                           | Défaut  | Rôle                                             |
| ------------------------------------------------- | ------- | ------------------------------------------------ |
| Exiger des questions avant de valider une lecture | **non** | Interrupteur maître.                             |
| Exigence par défaut                               | une     | `any` / `all` / `threshold` / `off`.             |
| Nombre de bonnes réponses attendues               | 1       | Le N du mode « seuil ».                          |
| **Erreurs tolérées avant blocage**                | **0**   | Nouveau (C1). 0 = verrou dès la première erreur. |
| Délai avant nouvelle tentative après une erreur   | 3 j     | 0 = pas de verrou.                               |
| **Questions posées d'affilée au maximum**         | **3**   | Nouveau (C3).                                    |
| **Annoncer le contrôle sur le bouton**            | **oui** | Nouveau (C2).                                    |
| Marquage automatique sur bonne réponse            | oui     | **Sans effet** (C5).                             |

## Combinaisons à connaître

- **Délai 0 + tolérance 0** → aucune limite de tentative : le contrôle devient une formalité.
  C'est le réglage le plus permissif possible, à réserver à l'entraînement.
- **Délai 3 + tolérance 0** → réglage historique, le plus sévère. Une erreur, trois jours.
- **Délai 3 + tolérance 2** → l'entre-deux recommandé pour une classe : on peut se tromper,
  pas indéfiniment.
- **Mode « toutes » + plafond par session** → l'élève valide en plusieurs passages. Prévenir
  les élèves, sans quoi le refus après une session complète paraît arbitraire.

## Ce que le lot 27 a mutualisé

| Brique                              | Fichier                                              | Sert          |
| ----------------------------------- | ---------------------------------------------------- | ------------- |
| Catalogue des réglages              | `lib/shared/gatingSettingsCore.js`                   | ForetMap + GL |
| Verrou et tolérance d'essais        | `lib/learningGatingCooldown.js`                      | ForetMap + GL |
| Vue enseignante des verrous         | `lib/learningGatingAdmin.js`                         | ForetMap + GL |
| Écran « lecteurs bloqués »          | `src/shared/components/LearningGatingLocksPanel.jsx` | ForetMap + GL |
| Taux de réussite par question       | `lib/quizQuestionStats.js`                           | ForetMap + GL |
| Cœur du challenge et des politiques | `lib/learningGatingAcknowledge.js`                   | ForetMap + GL |

Le principe retenu : **la sémantique est commune, le stockage reste propre à chaque produit**. GL
garde ses tables `gl_*`, son authentification et son isolement ; ce qui est partagé, c'est la
décision — quels réglages existent, ce qu'ils valent, comment un verrou se pose et se lève.
