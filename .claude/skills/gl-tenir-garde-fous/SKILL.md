---
name: gl-tenir-garde-fous
description: Garde-fous non négociables de la mouture « Tenir à deux » de Gnomes & Licornes (Souffle jamais personnifié, oiseau jamais nommé, l'erreur ne punit jamais, aucune ressource pour un défi, bourses privées, aucun état d'attente sans sortie). À lire avant d'écrire ou de relire tout texte visible d'un élève, tout retour de QCM, toute règle qui touche aux ressources ou tout flux qui attend un geste du prof.
---

# « Tenir à deux » — garde-fous

Ils priment sur toute autre règle. Source : `docs/GL_TENIR_A_DEUX_REGLES.md` § 1.

## Les douze règles

1. **Le Souffle n'est jamais personnifié** : un voile, une bande grise, des pages qui pâlissent.
   Vocabulaire _tenir / résister_. Jamais monstre, ennemi, attaque, poursuite, visage ni voix.
2. **L'oiseau n'est jamais nommé** dans une chaîne visible d'un élève. `kraa` reste un
   identifiant technique (code, clés de payload, `data-testid`).
3. Aucun contenu du tiers `secret` du lore côté élève (`gl_lore_glossary_terms.niveau`).
4. **L'erreur ne punit jamais.** Côté élève : « Pas encore… », « à discuter ». Jamais « Non »,
   jamais « faux ». Un défi n'échoue pas. Le mot « erreur » reste permis (l'erreur du jour d'Olu).
5. **Aucune ressource (cœur ou gemme) pour un défi**, une bonne réponse, une lecture, une
   fouille, un badge. Les ressources viennent des pages tenues, de la Trame, du carnet complet,
   du Marché.
6. Bourses privées, aucun classement d'élèves. La projection ne montre aucun solde.
7. Aucune donnée d'élève dans les logs, tests, fixtures ou rapports (`joueur-a-<stamp>`).
8. Isolement G&L / ForêtMap : `/api/gl/*`, `src/gl/`, `lib/gl*`, tables `gl_*`.
9. Tout ce qui touche au réel passe par le prof. Le serveur rejoue les droits ; le client grise.
10. Toute écriture de bourse passe par `applyBourseDeltaTx` ; la réserve par `creditReserveTx` /
    `debitReserveTx` (`lib/glBourses.js`, causes du grand livre dans `CAUSES`).
11. **Aucun état d'attente sans sortie automatique** : ce qui attend un geste (jet en suspens,
    défi, demande) se résout ou s'annule seul au changement de phase, à la clôture du tour ou
    au Seuil.
12. Au tableau (`surface = tableau`), le comportement existant ne change pas sans décision.

## Où vit la liste des mots interdits

Source unique : `src/shared/glGardeFousCore.js` (miroir `lib/shared/`, `npm run sync:shared-cores`).

- `FORBIDDEN_WORDS_CI` (début de mot, insensible à la casse) : monstre, ennemi, attaque,
  poursui, corbeau, faux, raté, ratée, perdu, classement.
- `FORBIDDEN_WORDS_CS` (casse exacte) : Krâ, Kraa, Grise (« une bande grise » reste permis).
- `findForbiddenString(texte)` → premier mot trouvé ou `null` ; `GARDE_FOUS_EXCEPTIONS` liste
  les champs réservés au prof (`titre_prive`, `justification`, `avertissement`).
- Piège : la règle est un **préfixe**. « perdurer », « poursuivre », « s'attaquer » sont refusés.
  Réécrire (« durer », « continuer », « s'en prendre à »), ne pas toucher à la liste.

## Le ton des retours

- Une seule fonction : `lib/glRetourQcm.js › resoudreRetour` (chasse, lecture, case, hors partie).
  Ordre d'une erreur : `feedback_<lettre>`, puis `feedback_incorrect`, puis le défaut.
- L'amorce « Non » d'un retour d'auteur est retirée à l'affichage ; « Pas encore » n'apparaît
  qu'une fois. Un retour neuf s'écrit sans « Non » : il explique, il ne gronde pas.
- Textes visibles : français, courts, niveau 6e. Un refus dit quoi faire (« Dites d'abord s'il
  manque quelqu'un. »), pas ce qui est interdit.

## Les tests qui les contrôlent

| Garde-fou                       | Test                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Mots interdits au rendu         | `tests-ui/gl/tenir-chaines-interdites.test.jsx`                                  |
| Mots interdits dans les données | `tests/content/gl-tenir-donnees.test.js`, `gl-tenir-feedbacks.test.js`           |
| Libellés du journal             | `tests/gl-journal-tenir-exhaustif.test.js` (tout évènement émis a son libellé)   |
| Retours « Pas encore »          | `tests/gl-retour-qcm.test.js`                                                    |
| Aucune ressource créée          | `tests/gl-tenir-economie-globale.test.js`, invariants `lib/glTenirInvariants.js` |
| Bourses privées, projection     | `tests/gl-tenir-projection.test.js`, `gl-tenir-correctifs-banc.test.js`          |
| Tout corps servi à un élève     | banc `tools/gl-sim/client.js` (`--mots-interdits strict`)                        |

Un nouveau type d'évènement doit recevoir un libellé dans `lib/glJournalPresentTenir.js` et
entrer dans `TENIR_EVENT_TYPES`, sinon le test d'exhaustivité échoue.

Relecture d'un diff contre ces règles : sous-agent `gl-relecteur-garde-fous`.
