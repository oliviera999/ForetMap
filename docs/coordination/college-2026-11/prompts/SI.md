# Session SI — Intégration et vérification (seule, en dernier)

> Document d'orchestration du 21/11/2026, § 5 et § 6. Lis d'abord la fiche (§ 1 « Numéros
> relatifs », § 7 « Ordre de fusion »), les PR des flux (rubriques « À faire par SI » et « Écart
> au prompt ») et l'état de `main` (flux R1 éventuellement fusionné : renumérotation de toute la
> série collège).

1. Depuis `origin/integration/college`, fusionne les branches de flux prêtes dans l'ordre de la
   fiche (par numéro de migration si le runner l'exige). Conflits : garder les deux intentions ;
   en cas d'impossibilité, choisir la solution qui préserve le comportement validé (§ 1.3) et
   noter l'écart dans la PR finale.
2. Applique les besoins hors périmètre notés dans les PR (fichiers chauds, `App.jsx`, registre
   MCP). Si `App.jsx` reçoit des ajouts, extrais-les dans des composants dédiés sans changement de
   comportement.
3. Reporte `changelog.d/*.md` dans `CHANGELOG.md` sous `[Non publié]` et supprime le dossier.
   Documentation : section « Profil collège et paliers » (`docs/`), colonnes ajoutées, options de
   séance, champs MCP.
4. Suite complète : lint, format, tests ForêtMap **et** G&L, `test:content`, `test:ui`, `build`,
   e2e concernés ; toutes les migrations du chantier rejouées deux fois sur base fraîche puis sur
   une base chargée de l'instantané, dans l'ordre réel.
5. **Vérification indépendante** : lance un sous-agent qui n'a pas vu le travail et qui, sur
   l'application démarrée avec la base de test chargée de l'instantané, contrôle avec trois
   comptes (6e, 3e, 2de) et la Visite sans compte, captures Playwright à l'appui :
   - catalogue rangé par groupe, espèces phares en tête, aucune famille en -idés ni libellé
     latin au collège ;
   - fiche : étiquette simple, groupe d'usage, pas de jauges ni de sections savantes ;
   - réseau : espèce de départ demandée, aucune espèce hors carte, frugivorie visible en 6e,
     symbiose visible en 3e seulement ;
   - glossaire : 6e = termes `base` par défaut, 3e = `base` + `approfondissement`, « Pour aller
     plus loin » fonctionne ; auto-lien conforme ;
   - quiz : aucune question de palier 2 ne verrouille une fiche pour la 6e, aucune question de
     lycée pour la 3e ;
   - groupes emboîtés : 4 niveaux au plus ;
   - 2de : affichage identique à l'actuel ;
   - G&L : parcours e2e inchangés.
     Corrige ce qui échoue (ou renvoie au flux concerné par une note si c'est hors de portée), puis
     relance la vérification.
6. Supprime la fiche de coordination et l'instantané de la branche (ils ne vont pas sur `main`).
   Garde les fichiers de revue dans la PR finale (description) plutôt que dans le dépôt. Si R1
   n'est pas fusionné, recopie `sessions/R1-referents-eleves.md` dans la description.
7. Poussée de `integration/college` et PR **vers `main`**, prête à relire : résumé par lot,
   migrations, résultats de la vérification indépendante, fichiers de revue (espèces phares,
   étiquettes, niveaux des termes, paliers des questions, clés courtes), écarts au prompt.
   **Oliv relit et fusionne lui-même** : aucune fusion sur `main` par une session.

## Points d'attention pour Oliv (consignés dans la PR finale, ne bloquent pas les sessions)

1. Relecture des espèces phares et des 644 étiquettes (décision 4 et 6).
2. Catégorie choisie pour « champignon » dans le glossaire.
3. Questions passées au lycée et questions encore dépendantes d'un tutoriel.
4. Présence du connecteur `foretmap` dans les sessions : sans lui, les flux D travaillent sur
   l'instantané de S0.
5. Hors périmètre, à signaler seulement : présences jamais confirmées sur le terrain (0
   `confirme_site`), 368 interactions « hypothèse » montrées aux élèves, notions cycle 3 en double
   (C3-MAT / C3-MATORG, C3-DEV / C3-DEVREPRO).
