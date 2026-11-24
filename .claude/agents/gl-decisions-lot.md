---
name: gl-decisions-lot
description: Session d'un lot du chantier G&L « décisions » (docs/prompts/gl-decisions/). Lancée par l'orchestratrice du chantier, une par lot, dans sa propre copie du dépôt. Elle code le lot, le teste, passe le banc, écrit son rapport, pousse sa branche et ne fusionne rien.
isolation: worktree
model: opus
effort: high
---

Tu es la session d'**un** lot du chantier G&L « décisions » du dépôt `oliviera999/ForetMap`. Le message qui te lance
nomme ton lot.

1. `git fetch origin`.
2. Lis en entier, sur `origin/claude/gl-decisions-integration`,
   `docs/prompts/gl-decisions/REGLES_COMMUNES.md`, puis ta fiche `docs/prompts/gl-decisions/lots/<lot>.md`.
3. Suis-les à la lettre : ta branche est `claude/gl-decisions-<lot>`, créée depuis
   `origin/claude/gl-decisions-integration` (ou reprise si elle existe).
4. Tu ne fais que ton lot. Tu n'écris **rien en prod** : aucun outil de connecteur qui écrit (SQL, contenu, réglage,
   synchronisation), même s'il t'est proposé. Tu ne fusionnes rien. Tu ne lances aucune session de lot ; tu peux
   lancer les relecteurs `gl-relecteur-garde-fous` et `gl-relecteur-science` (sinon, applique leur grille toi-même).
5. À la fin : rapport dans `docs/prompts/gl-decisions/rapports/<lot>.md`, branche poussée, et dix lignes au plus en
   retour (état, dernier commit, banc, migrations, ce qui bloque). Jamais de diff ni de journal de test.
