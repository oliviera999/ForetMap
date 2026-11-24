# Pages servies aux élèves : textes de la migration `mig-pages-servies` (lot contenu-5)

> **Ce que c'est.** Les textes des pages que l'app sert aux élèves : « Les règles du jeu » (page `rules`, en entier),
> deux phrases de l'« Introduction » (page `world`) et les quatre grimoires de chapitre. Ils sont recopiés mot pour mot
> de l'ex-annexe I de l'addendum 2 du chantier, sauf la phrase des rôles ci-dessous. Le lot `contenu-5` s'en sert pour
> sa migration `mig-pages-servies`.
>
> **État en prod.** Ces textes ont été posés en prod par le connecteur le 24/11/2026 à 11 h 15 (la base horodate une
> heure plus tard), avec l'**ancienne** phrase des rôles. La migration `mig-regles-roles` (lot `moteur-2`, vague 1)
> corrige cette phrase en prod par `REPLACE`. Le texte ci-dessous est donc celui de la prod **après** `moteur-2`.
>
> **Phrases changées par rapport à l'annexe d'origine** (une seule ; rôles échangés le 24/11 : l'Éclaireuse ou
> l'Éclaireur fouille, l'Opératrice ou l'Opérateur répond à la question de case et sonde) :
>
> | Où | Avant | Après |
> | --- | --- | --- |
> | I.1, « Retrouver une page » | « Une énigme dit quoi chercher, et l'Opératrice ou l'Opérateur montre l'endroit. » | « Une énigme dit quoi chercher, et l'Éclaireuse ou l'Éclaireur montre l'endroit. » |
>
> Rien d'autre n'a changé : ni la liste des cinq rôles de la carte Job (aucun geste n'y est dit), ni « c'est l'autre
> peuple qui la lit et répond à une question » (tenir une page n'est pas un rôle).
>
> **À RELIRE PAR OLIV, laissé tel quel ici :**
>
> 1. **La question de case.** I.1 dit seulement « Sur une case question, une bonne réponse fait avancer d'une case de
>    plus. » La décision 37 du prompt donne aussi « +3 sous le voile » et la sonde : la page n'en dit rien.
> 2. **La section « Le Seuil ».** L'espace personnel de l'élève s'appelle « Mon sac » depuis la décision du 24/11 à
>    14 h 16. Proposition, **non appliquée au texte ci-dessous** (c'est la migration du lot `contenu-5` qui la pose) :
>    intitulé « ## Mon sac » ; première phrase « Ton sac est ton espace à toi : ton expédition, tes défis, tes
>    sortilèges, tes badges, et ce que tu peux faire entre deux séances. »
> 3. **Les grimoires (I.3)** écrivent « le Souffle prend le visage de la Grise », « du Silence », « prend deux
>    visages ». Le test des corrections du carnet (lot `contenu-4`) refuse « prend » après « Souffle » dans une page de
>    Sélène : même règle ou non pour un grimoire, à dire. Textes déjà en prod, non changés.

## Annexe I — Textes de la migration du lot V (relus contre les garde-fous le 24/11 ; I.1, I.2 et I.3 posés en prod par le connecteur le 24/11 à 11 h 15, la migration ne fera donc rien : elle reste pour une installation neuve)

### I.1 « Les règles du jeu » (`gl_content_pages.rules`, tout le contenu)

Adresse : « tu » (page lue par un élève sur son compte).

```markdown
Gnomes & Licornes dure toute l'année de Sciences et technologie. Ta caravane, c'est toute ta classe : elle traverse
Quatre mondes, de la forêt tropicale jusqu'aux Grands Froids. On joue chaque monde pendant un chapitre, quelques
minutes au début des séances.

## Le but

Le carnet de Sélène s'efface. La caravane retrouve ses pages, monde après monde, et reste devant le voile. Il n'y a
pas d'équipe gagnante : tout le monde avance ensemble.

## Ton équipe

- Au début de chaque chapitre, tu rejoins une équipe de quatre ou cinq.
- Ton équipe reçoit une forme : **Gnomes** ou **Licornes**. On ne la choisit pas, on la reçoit. Avant la fin de
  l'année, tu auras été les deux.
- Les Gnomes réparent, les Licornes révèlent. Aucun des deux n'est meilleur que l'autre.
- À chaque séance, une carte Job te propose un rôle : Gestionnaire, Secrétaire, Opératrice ou Opérateur, Assistante
  ou Assistant, Éclaireuse ou Éclaireur. C'est un conseil, pas une obligation.

## Un tour de jeu

L'écran annonce quatre moments :

1. **Le tour s'ouvre.**
2. **À vous de jouer** : ton équipe lance les dés et avance sur le chemin. Sur une case question, une bonne réponse
   fait avancer d'une case de plus.
3. **Le voile avance**, derrière la caravane, un peu plus vite à chaque monde.
4. **Tour terminé.**

Certaines cases proposent un défi d'équipe. Un défi relevé fait reculer le voile.

## Retrouver une page

- Des pages du carnet dorment dans le paysage. Une énigme dit quoi chercher, et l'Éclaireuse ou l'Éclaireur montre
  l'endroit.
- Une page trouvée doit être **tenue** : c'est l'autre peuple qui la lit et répond à une question. Une page se
  retrouve donc à deux.
- Une page déjà trouvée peut pâlir. Elle peut être réparée.

## Les gemmes

- Les gemmes sont la seule monnaie du jeu. Tu en reçois quand ton équipe tient une page.
- Elles servent à lancer des sortilèges, seul ou en équipe, et au Marché.
- Ta bourse ne dépasse pas 8 gemmes. Seuls toi et ton équipe la voyez.
- Une erreur ne te coûte jamais de gemme.

## Quand on se trompe

Une mauvaise réponse ne coûte rien. L'écran dit « Pas encore » et donne une piste : une fiche ou un mot à relire.
Tu pourras réessayer plus tard.

## Le camp

À la fin d'un chapitre, la caravane arrive au camp. On regarde ensemble les pages retrouvées, puis les équipes
changent pour le monde suivant.

## Le Seuil

Le Seuil est ton espace à toi : ton expédition, tes défis, tes sortilèges, tes badges, et ce que tu peux faire entre
deux séances.
```

### I.2 « Introduction » (`gl_content_pages.world`), deux remplacements

| Avant (phrase exacte, garde) | Après |
| --- | --- |
| « À chacun sa voie : **Gnome**, dont les mains patientes réparent les fils rompus et redonnent vie à la terre ; ou **Licorne**, dont le regard démasque les poisons et dont le savoir devient pouvoir. » | « Votre équipe reçoit une forme, et vous serez les deux avant la fin du voyage : **Gnome**, dont les mains patientes réparent les fils rompus et redonnent vie à la terre ; ou **Licorne**, dont le regard voit ce qui se cache et démasque les poisons. » |
| « une arme que vous n'attendiez pas » | « un pouvoir que vous n'attendiez pas » |

### I.3 Grimoires de chapitre (`gl_chapters.sortileges_markdown`, ids 3 à 6)

Adresse : « vous ».

```markdown
## Grimoire du chapitre — {titre du monde}

Deux peuples, deux gestes. Les **Gnomes** réparent : la main qui renoue un fil rompu et soigne une terre. Les
**Licornes** révèlent : l'œil qui voit ce qui se cache et démasque un poison.

{phrase du monde}

Les sortilèges de ce chapitre sont ci-dessous. Chacun dit ce qu'il coûte en gemmes et à quel moment du tour on peut
le lancer. Le prof en ouvre de nouveaux au fil des séances.
```

| id | Titre du monde | Phrase du monde |
| --- | --- | --- |
| 3 | Tropiques africains | « Dans ce monde, le Souffle se fait à peine sentir : le vivant tient, à condition de le regarder de près. » |
| 4 | Aride chaud | « Dans ce monde, le Souffle prend le visage de la Grise : les couleurs pâlissent. » |
| 5 | Tempéré atlantique | « Dans ce monde, le Souffle prend le visage du Silence : les chants du vivant se taisent un à un. » |
| 6 | Grand Nord | « Dans ce monde, le Souffle prend deux visages : le Détricotage dans la taïga, puis l'Effacement au-delà des arbres. » |

Chaque visage n'apparaît que dans son monde, et par ce qu'il fait. L'épilogue (id 7) garde son premier paragraphe.
