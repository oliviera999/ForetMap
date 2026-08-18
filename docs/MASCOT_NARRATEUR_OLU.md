# OLU narrateur — plan d'implantation

> **Avancement.** **Lots 1, 2, 3, 4 et 5 livrés.**
>
> - **Lot 1** — `src/shared/components/SpeechBubble.jsx` + `src/shared/styles/speech-bubble.css`,
>   branchés sur `DiscoveryTour`.
> - **Lot 2** — `src/shared/components/MascotSpeaker.jsx`, `src/utils/mascotExpressions.js`,
>   réglage `content.help.narrator` (`lib/helpNarrator.js`, routes `/admin/help-narrator`,
>   exposition publique). Le nom du locuteur s'affiche désormais dans la visite guidée.
> - **Lot 3** — champ `expression` par étape dans `DISCOVERY_TOURS` et portrait affiché dans
>   `DiscoveryTour` (médaillon sous 480 px). Voir §12.
> - **Lot 4** — **réécriture du corpus à la voix d'OLU** : 21 étapes de parcours, 7 panneaux
>   d'aide (défauts + miroir client), 3 `quickTips`. Et, en réponse à l'arbitrage §11.4 tranché
>   en cours de lot, **édition des parcours depuis l'application** sous permission dédiée
>   `tours.manage`. Voir §6ter.
> - **Lot 5** — studio prof `HelpNarratorAdminPanel` (onglet **Paramètres → Narrateur OLU**) et
>   portrait `face` dans l'en-tête de `HelpPanel`. Voir §12 et §6bis.
>
> **Reste à faire : lot 6 (GL), lot 7 (optionnel).** OLU est à l'écran **et** il parle à la
> première personne. Le brief de production graphique des portraits est dans
> [`MASCOT_OLU_BRIEF_VISUEL.md`](./MASCOT_OLU_BRIEF_VISUEL.md).

> **Statut : plan d'implantation, mise en œuvre en cours.** Décrit la mise en place d'un avatar
> narrateur, **OLU**, portant à la première personne l'aide contextuelle et les passages
> narratifs de ForetMap et de Gnomes & Licornes. À lire avec
> [`MASCOT_ARCHITECTURE_CONVERGENCE.md`](./MASCOT_ARCHITECTURE_CONVERGENCE.md) (état du
> système mascotte et dette structurelle) et [`MASCOT_PACK.md`](./MASCOT_PACK.md) (format des
> packs). Seuls les lots marqués **livrés** au §12 modifient le comportement de l'application ;
> le reste du document reste prescriptif.

---

## 1. Décisions arrêtées (lot 0)

| Décision                 | Choix                                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Voix**                 | **OLU narrateur unique.** L'aide et le récit ont une seule voix. Les autres mascottes restent compagnons de carte/visite.                                                                                                                                                                        |
| **Personne**             | **Première personne** (« je »), tutoiement de l'interlocuteur (aligné sur le corpus actuel).                                                                                                                                                                                                     |
| **Personnalité**         | **Jeune explorateur** : curieux, motivé, espiègle et blagueur — et lucide. Capable de porter des messages lourds de sens sans les édulcorer ni s'y appesantir. _(Révisé en cours de lot 4 : la formule initiale « copiste cool » contredisait le visuel arrêté au brief graphique — voir §2.1.)_ |
| **Corpus**               | **Réécriture intégrale** de l'aide et des parcours à la première personne, en lot séparé du lot technique. Les tooltips restent neutres (cf. §7.3).                                                                                                                                              |
| **Périmètre**            | **ForetMap + GL**, même personnage.                                                                                                                                                                                                                                                              |
| **Stockage des visuels** | **Studio prof / base de données** (pas d'assets versionnés en dur). Voir l'arbitrage majeur en §5.1.                                                                                                                                                                                             |

---

## 2. La voix d'OLU — charte rédactionnelle

### 2.1 Qui est OLU

OLU est un **jeune renard explorateur**. Le brief graphique
([`MASCOT_OLU_BRIEF_VISUEL.md`](./MASCOT_OLU_BRIEF_VISUEL.md) §1) le fixe sans ambiguïté : sac à
dos de toile, tapis de couchage sanglé, boussole de laiton, grandes oreilles dressées, yeux ronds
très expressifs — et, pour l'expression `cherche`, « sourcils froncés par la curiosité et non par
l'inquiétude ». C'est quelqu'un qui **arpente** le site, y retourne sans se lasser, remarque ce
que les autres traversent sans voir, et a envie de le montrer.

Il est **curieux, motivé, espiègle et franchement drôle**. Ce n'est pas pour autant un naïf : il
observe finement, tire des conclusions justes et dit les choses telles qu'elles sont. Enthousiaste
ne veut pas dire bête — c'est la ligne de crête de cette voix.

**Il s'ennuierait tout seul.** Il a déjà tout parcouru, il connaît les raccourcis ; ce qui
l'intéresse désormais, c'est d'y retourner _avec quelqu'un_. Il adopte son interlocuteur comme
complice dès la première bulle, pas comme élève.

**Il a du matériel, donc des anecdotes.** Sac, tapis et boussole ne sont pas des accessoires de
dessin : ce sont des occasions de gags de terrain — le carnet tombé dans la mare, deux branches
taillées de trop, le champignon qui le fixe depuis deux semaines. C'est ce qui lui donne un passé
sans lui donner de l'âge.

Il n'est ni un assistant serviable ni un mentor solennel : il est **à côté** de l'utilisateur, pas
au-dessus. Il connaît le terrain mieux que lui et l'y emmène, sans jamais faire la leçon.

> ⚠️ **Révision en cours de lot 4.** Le lot 0 avait retenu la figure du **copiste** — un observateur
> âgé qui recopie et transmet. Le visuel produit ensuite montre un jeune explorateur, et le corpus
> écrit sur la première hypothèse sonnait faux dès qu'on le lisait à côté du portrait. La voix a
> donc été refondue. Les tournures scribales (« j'ai recopié », « mon herbier », « mes vieux
> yeux », « recopier est mon métier ») ont toutes été retirées du corpus : elles sont l'anti-patron
> le plus visible de cette charte.

### 2.2 Les quatre traits, et ce qu'ils excluent

| Trait            | Ce que ça donne                                                                                                  | Ce que ça exclut                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Bienveillant** | Ne juge jamais l'erreur ; propose toujours une porte de sortie.                                                  | Pas de flatterie (« Bravo ! Excellent ! »), pas d'infantilisation.            |
| **Lucide**       | Nomme les choses telles qu'elles sont, y compris quand c'est inconfortable.                                      | Pas d'optimisme de façade, pas de « tout va bien » quand non.                 |
| **Curieux**      | S'intéresse pour de bon ; remarque le détail et le partage. Il pose des questions au monde, pas à l'utilisateur. | Pas de curiosité feinte, pas de « tu ne devineras jamais ».                   |
| **Enthousiaste** | De l'élan et de l'envie d'y aller. Il donne envie de sortir voir.                                                | Pas d'excitation permanente, pas de flot d'exclamations, pas de survente.     |
| **Espiègle**     | Chambre gentiment, glisse une pointe en fin de bulle, joue la complicité.                                        | Jamais aux dépens de l'utilisateur (règle d'or, §2.2bis).                     |
| **Drôle**        | Autodérision de terrain, anti-climax, chute placée après l'information.                                          | Pas de blague à chaque phrase, pas de private joke, pas de jeu de mots forcé. |

### 2.2bis La règle d'or de l'humour — trois contraintes

1. **La cible, c'est lui.** Il se moque de lui-même, des objets et des situations ; **jamais de la
   personne en face**, et surtout jamais d'une erreur qu'elle vient de commettre. Un assistant qui
   vanne son utilisateur devient insupportable en trois écrans. C'est cette règle qui garde le
   personnage gentil malgré l'espièglerie.
2. **La chute vient après l'information.** L'utile d'abord, la pointe ensuite — le plus souvent
   après un tiret cadratin. Quelqu'un qui lit en diagonale récupère quand même le renseignement,
   et la blague ne coûte rien à celui qui ne la lit pas.
3. **Il sait se taire.** Trois endroits sans plaisanterie : les **permissions**, les **passages
   graves** (§2.3) et les **avertissements**. Un personnage qui blague partout n'est plus drôle,
   il est bruyant — et on cesse de le croire quand ça compte. Le corpus l'assume à voix haute dans
   le parcours Profils : « la seule page où je ne fais pas le malin ».

**L'enthousiasme ne dispense pas de la justesse.** Un personnage jeune et motivé qui dirait des
approximations serait pire qu'un personnage neutre : il rendrait l'aide moins fiable tout en
occupant plus de place. OLU va à l'essentiel — une phrase juste plutôt que trois approximatives —
et c'est sa curiosité, pas son volume, qui porte l'élan.

### 2.3 Porter la pesanteur — la règle des trois temps

Le point délicat de cette voix : certains messages sont **lourds de sens** (une forêt comestible
parle d'écologie, de temps long, de ce qu'on lègue). OLU doit pouvoir les porter sans plomber
l'interface. Structure recommandée :

1. **Le fait**, nu, sans emphase.
2. **Le poids**, assumé en une phrase courte — sans point d'exclamation, sans dramatisation.
3. **La sortie**, concrète : une action, ou une pointe d'humour qui rend le poids tenable.

> **Exemple.** « Un noyer met quarante ans à donner sa pleine récolte. Celui que tu notes
> aujourd'hui nourrira quelqu'un que tu ne connaîtras pas. Note-le bien, du coup — la personne
> en question n'aura pas mon numéro pour se plaindre. »

**Contre-exemple à proscrire** (l'humour annule le propos) : « Un noyer met quarante ans !
Autant dire jamais 😄 Passons à la suite ! »

**Fréquence.** Un passage « lourd » par parcours au maximum. Sinon, l'effet s'use et le ton
devient moralisateur — exactement ce qu'on cherche à éviter.

### 2.4 Registre concret

- **Longueur** : 1 à 3 phrases par bulle. Le texte du corpus actuel est déjà court, on ne l'allonge pas.
- **Ponctuation** : point d'exclamation **rare** (≤ 1 par parcours, vérifié par test). Le plafond
  a été **maintenu** au passage au registre blagueur, et il n'a pas gêné : deux exclamations
  suffisent sur l'ensemble du corpus. L'humour naît du décalage et du placement de la chute, pas
  de la ponctuation — un corpus criblé d'exclamations lit comme de la publicité, pas comme
  quelqu'un de drôle. Le tiret cadratin et la parenthèse portent l'ironie bien mieux.
- **Emoji** : **aucun dans les textes d'OLU.** L'expression passe par le portrait (§4.3). Les
  emoji décoratifs de l'interface existante (`💡` en préfixe de panneau, `▶`) ne sont pas concernés.
- **Terminologie** : respecter `getRoleTerms()` ([`src/utils/n3-terminology.js`](../src/utils/n3-terminology.js)) —
  « n3beur » / « n3boss ». OLU emploie ces termes naturellement, il ne les explique pas.
- **Adresse** : tutoiement pour l'élève. Côté prof (`textTeacher` / `bodyTeacher`), OLU reste
  tutoyant mais **change de sujet**, pas de ton : il parle d'organisation et d'outillage, pas d'apprentissage.

### 2.5 Exemples de conversion (avant → après)

Tirés du corpus réel, pour caler le ton :

| Source                                         | Actuel                                                                                                   | Voix OLU                                                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCOVERY_TOURS.map` étape 1                  | « Bienvenue sur la carte ! C'est ici que tu explores les zones et les repères du verger-forêt. »         | « Voilà la carte. J'ai déjà arpenté tout ça et il me reste des coins entiers à explorer — viens, je te montre ! »                                           |
| `DISCOVERY_TOURS.map` étape « barre d'outils » | « Zoom, étiquettes et gestes tactiles se règlent ici pour adapter la carte à ton écran. »                | « Zoom, étiquettes, gestes : c'est ici que je règle ma vue avant de partir. Un coup de zoom et on repère des choses qu'on avait traversées sans les voir. » |
| `RELAUNCH_STEP`                                | « Besoin d'un rappel ? Ce bouton « ? » rouvre l'aide et permet de relancer cette visite quand tu veux. » | « Si tu me perds en route, ce « ? » me rappelle. Je reviens toujours — c'est un peu ma spécialité. »                                                        |
| `HELP_TOOLTIPS.header.logout`                  | « Quitter ForetMap proprement. »                                                                         | _(inchangé — les tooltips restent neutres, cf. §7.3)_                                                                                                       |

### 2.6 Ce qu'OLU ne dit jamais

- Il ne s'excuse pas d'exister (« Désolé de te déranger… »).
- Il ne demande pas de validation (« C'est clair ? », « Tu me suis ? »).
- Il ne commente pas ses propres blagues.
- Il ne parle pas de lui plus que du contenu.
- Il ne dit jamais « n'hésite pas à… ».
- **Il ne se moque jamais de l'utilisateur**, ni d'une erreur qu'il vient de commettre (§2.2bis).
- **Il ne plaisante pas sur les permissions, les avertissements et les passages graves.**
- **Il ne se présente jamais comme un copiste ou un scribe** : il n'a pas « recopié » la forêt, il
  l'a parcourue. Pas de « mon herbier », pas de « mes vieux yeux », pas de « je note, je ne devine
  pas » — ces tournures viennent d'une première version de la charte et contredisent son visuel.

---

## 3. État des lieux — ce qui existe déjà

Le système mascotte est **mature** ; ce plan l'étend, il ne le crée pas.

| Brique                        | Emplacement                                                                                                                                           | Réutilisable pour OLU                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Catalogue mascottes           | [`visitMascotCatalog.js`](../src/utils/visitMascotCatalog.js) (474 l.)                                                                                | ✅ entrée `olu-spritesheet` existante (l. 222)                                 |
| Palette d'états               | [`visitMascotState.js`](../src/utils/visitMascotState.js)                                                                                             | ✅ 21 états canoniques, dont `talk`, `point`, `alert`, `search`, `sad`, `wave` |
| Dialogues data-driven         | [`visitMascotDialogEvents.js`](../src/utils/visitMascotDialogEvents.js) (298 l.)                                                                      | ✅ modèle de clés stables + priorité de résolution                             |
| **Fallback SVG paramétrique** | [`VisitMascotFallbackSvg.jsx`](../src/components/VisitMascotFallbackSvg.jsx)                                                                          | ✅ silhouette `olu` (l. 608), **eager, 0 KB réseau**                           |
| Rendu animé                   | [`VisitMapMascotRenderer.jsx`](../src/components/VisitMapMascotRenderer.jsx)                                                                          | ⚠️ **à ne pas réutiliser tel quel** (cf. §4.1)                                 |
| Aide (contenu)                | [`data/help.default.json`](../data/help.default.json) + surcharges BDD `content.help.registry` via [`lib/helpContent.js`](../lib/helpContent.js)      | ✅ 21 sections de tooltips, 7 panneaux                                         |
| Studio prof aide              | [`ForetMapHelpContentAdminPanel.jsx`](../src/components/help/ForetMapHelpContentAdminPanel.jsx)                                                       | ✅ édition + autosave déjà en place                                            |
| Parcours découverte           | [`discoveryTour.js`](../src/constants/discoveryTour.js) (295 l.) + [`DiscoveryTour.jsx`](../src/components/DiscoveryTour.jsx) (231 l.)                | ✅ cible n°1                                                                   |
| Aide GL                       | [`useGlHelpContent.js`](../src/gl/hooks/useGlHelpContent.js), [`GLHelpContentAdminPanel.jsx`](../src/gl/components/admin/GLHelpContentAdminPanel.jsx) | ✅ système parallèle, par onglet                                               |
| Médiathèque                   | [`routes/media-library.js`](../routes/media-library.js)                                                                                               | ✅ stockage d'images déjà outillé                                              |

### 3.1 Deux constats de départ

**(a) L'entrée `olu-spritesheet` existe mais son asset n'a jamais été versionné.**
[`visitMascotCatalog.js:222`](../src/utils/visitMascotCatalog.js) déclare une grille 64×64 avec
12 états mappés pointant vers `/assets/mascots/olu/olu-spritesheet.png` — fichier **absent du
dépôt** (aucun commit sur ce chemin, absent de `dist/`). OLU retombe donc systématiquement sur le
fallback SVG aujourd'hui. Les sprites à venir comblent ce trou : **prévoir de vérifier
si le mapping d'états existant correspond aux nouveaux sprites, ou s'il faut le corriger.**

**(b) Le corpus d'aide vit à trois endroits, avec des règles différentes.** Point structurant
pour le lot de réécriture — détaillé en §7.

---

## 4. Architecture cible

### 4.1 Trois niveaux de rendu — la règle de perf

Le renderer animé de la carte **ne doit pas** servir l'aide. D'après le commentaire de
[`VisitMapMascotRenderer.jsx`](../src/components/VisitMapMascotRenderer.jsx) : `rive ~166 KB`,
`sprite_cut ~102 KB` en chunks lazy — auxquels s'ajoutent les frames (`public/assets/mascots/`
pèse 1,9 Mo, dont 856 Ko pour `fox-backpack`). Déclencher cela à l'ouverture d'un panneau d'aide
est disqualifiant sur le réseau d'un lycée.

```
Niveau 1 — mascotte animée   sprite_cut / rive / spritesheet, plein corps    ~100-170 KB
                             → carte, plan de visite, plateau GL              (existant)

Niveau 2 — PORTRAIT          buste ou visage, 1 image (ou 2-3 frames)        ~10-30 KB
                             → aide, parcours, récit                          (à créer)

Niveau 3 — FALLBACK SVG      VisitMascotFallbackSvg, silhouette `olu`        ~0 KB
                             → toujours disponible, jamais d'écran vide       (existant)
```

**Règle absolue** : le niveau 3 doit suffire à faire fonctionner toute la fonctionnalité. Le
niveau 2 est un enrichissement, jamais une dépendance. Conséquence directe : **les lots 1 à 4
sont livrables sans qu'aucun sprite n'ait été produit.**

### 4.2 Le composant `MascotSpeaker`

Un composant de présentation unique, **partagé FM/GL**, à placer dans `src/shared/components/`
(et non sous `src/components/` ni `src/gl/components/`, pour ne pas rejouer le dédoublement
décrit dans [`MASCOT_ARCHITECTURE_CONVERGENCE.md`](./MASCOT_ARCHITECTURE_CONVERGENCE.md) §3).

```
MascotSpeaker
  props : { expression, size = 'bust' | 'face' | 'body', speakerName, className }
  rôle  : rend UNIQUEMENT le portrait. Ne connaît ni le texte, ni la mise en page.
  sortie: <span aria-hidden="true" data-mascot-speaker="olu" data-expression="...">
```

Points de conception :

- **Décoratif par construction.** `aria-hidden="true"` systématique. Le portrait ne porte jamais
  d'information : le texte reste le contenu. Cohérent avec le traitement actuel
  (`VisitMapMascot.jsx` est déjà `aria-hidden`).
- **Résolution en cascade** : portrait du pack publié → portrait par défaut → fallback SVG `olu`.
  Jamais d'espace vide, jamais de « cassé ».
- **Aucun import de renderer lourd.** Interdiction explicite d'importer `VisitMapMascotRive`,
  `VisitMapMascotSpriteCut` ou `VisitMapMascotSpritesheet` depuis ce composant.
- **`data-*` stables** (`data-mascot-speaker`, `data-expression`) sur le modèle de
  `GLMascotAvatar` — les e2e existants (`e2e/gl-mascots.spec.js`) s'appuient sur cette convention.

### 4.3 Les expressions

Une **expression** n'est pas un état d'animation : c'est un sous-ensemble sémantique, mappé sur
les états canoniques déjà définis dans `VISIT_MASCOT_STATE`. **Aucun nouvel enum concurrent.**

| Expression | État canonique | Quand l'employer                                             |
| ---------- | -------------- | ------------------------------------------------------------ |
| `neutre`   | `idle`         | Défaut, en-tête de panneau                                   |
| `parle`    | `talk`         | Étape de parcours standard                                   |
| `montre`   | `point`        | Coach mark qui désigne un élément précis                     |
| `content`  | `happy`        | Fin de parcours, validation                                  |
| `vigilant` | `alert`        | Action irréversible, avertissement                           |
| `cherche`  | `search`       | Étape d'exploration, découverte                              |
| `grave`    | `sad`          | **Passages lourds de sens** (§2.3) — au plus un par parcours |
| `complice` | `wave`         | Trait d'humour, clin d'œil, relance                          |

**Démarrage recommandé : 4 expressions** (`neutre`, `parle`, `montre`, `content`). Les quatre
autres retombent sur `neutre` tant qu'elles ne sont pas fournies. Cela divise par deux la
production graphique initiale sans bloquer l'écriture.

### 4.4 Les trois cadrages

Ce qui détermine le cadrage, c'est **la surface**, pas l'esthétique :

| Cadrage | Rendu    | Source               | Surfaces                                                     |
| ------- | -------- | -------------------- | ------------------------------------------------------------ |
| `face`  | 40–48 px | visage seul          | En-tête de `HelpPanel`, `GLTabHelpPanel`                     |
| `bust`  | 72–96 px | buste                | `DiscoveryTour`, `GLFeuilletPopover` — **cadrage principal** |
| `body`  | 120+ px  | corps (sprite carte) | Première ouverture, intro GL, écran d'accueil                |

**Le cadrage `bust` est le seul indispensable.** `face` peut en être un recadrage CSS (`object-fit`

- `object-position`) en attendant un asset dédié ; `body` réutilise le sprite carte existant.

### 4.5 Mise en scène — deux registres, un personnage

| Surface                                 | Registre                                                                                  | Justification                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| `DiscoveryTour`, GL intro, GL feuillets | **Visual novel léger** : portrait latéral, cadre, nom du locuteur, effet machine à écrire | Narration séquentielle, attention déjà captée |
| `HelpPanel`, `GLTabHelpPanel`           | **Portrait d'en-tête** : visage discret, aucune animation                                 | Panneau de référence, consulté vite           |
| `Tooltip` (20 usages)                   | **Aucun portrait**                                                                        | 300 ms au survol, une ligne — voir §7.3       |

**Le compagnon flottant persistant est explicitement exclu.** Un avatar présent en permanence,
non sollicité, produit l'effet Clippy en quelques jours. OLU apparaît quand l'utilisateur a
demandé de l'aide, ou quand il y a du récit. Jamais en interruption.

### 4.6 Le cadre et le rythme — le vrai levier ludique ✅ _livré (lot 1)_

> **Ce qui a été livré.** `SpeechBubble` (`src/shared/components/SpeechBubble.jsx`) rend le
> cadre, l'étiquette de locuteur optionnelle et l'effet machine à écrire ; styles partagés dans
> `src/shared/styles/speech-bubble.css` (variables `--fm-bubble-*` surchargeables par GL, dont
> l'import viendra au lot 6). `DiscoveryTour` le consomme à la place de `.discovery-tour__body`.
> Deux points d'implémentation à connaître :
>
> - **Texte complet dès le premier rendu.** La portion non encore « tapée » reste dans le flux
>   avec `opacity: 0` — jamais `display:none` ni `visibility:hidden` — donc toujours présente
>   dans l'arbre d'accessibilité, et la hauteur de la carte ne bouge pas pendant la frappe.
> - **La réf expose `{ revealAll(), isTyping() }`.** C'est ce qui permet à l'hôte de câbler
>   « première validation = terminer le texte, seconde = avancer » sans dupliquer l'état de
>   frappe. `Échap` et les boutons restent inconditionnels.
>
> Le nom de locuteur est **volontairement non transmis** par `DiscoveryTour` pour l'instant :
> afficher « OLU » au-dessus d'un corpus encore rédigé à la troisième personne lui attribuerait
> une voix qui n'est pas la sienne. Le câblage se fait au lot 2, depuis
> `content.help.narrator.speakerName`.
>
> Le système de cadres [`GL_IMAGE_FRAMES.md`](./GL_IMAGE_FRAMES.md) a bien été examiné comme
> demandé ci-dessous : il traite du **recadrage d'images** (`aspectRatio`, `objectFit`, focale),
> pas d'un cadre de bulle. Il n'y avait donc rien à y réutiliser.

Une large part de l'effet « jeu vidéo » ne vient pas du portrait mais de la **mise en scène du
texte**. Ces éléments coûtent presque rien et sont livrables **avant** tout asset :

- Cadre de bulle stylisé (le projet dispose déjà de [`GLImageFrameEditor`](../src/gl/components/GLImageFrameEditor.jsx)
  et d'un système de cadres documenté dans [`GL_IMAGE_FRAMES.md`](./GL_IMAGE_FRAMES.md) — à
  regarder avant d'en écrire un nouveau).
- Étiquette de locuteur au-dessus de la bulle (« OLU »).
- Effet machine à écrire, **avec clic pour tout afficher immédiatement**.
- Avancée au clic / `Entrée` — déjà géré par `DiscoveryTour.jsx` (`Enter`, flèches, `Échap`).

⚠️ **`prefers-reduced-motion` : l'effet machine à écrire doit être instantané en mode `reduce`.**
Un texte qui s'écrit lettre par lettre sans possibilité de le figer est un anti-pattern
d'accessibilité caractérisé. Le projet gère déjà cette media query dans
[`motion.css`](../src/shared/styles/motion.css) et [`gl-theme.css`](../src/gl/styles/gl-theme.css).

---

## 5. Stockage des visuels

### 5.1 ⚠️ Arbitrage majeur — `visit_mascot_packs` ne convient pas

La décision du lot 0 est « studio prof / base de données ». **Mais la table existante n'est pas
le bon réceptacle**, et c'est le point d'architecture le plus important de ce document.

[`migrations/072_visit_mascot_packs.sql`](../migrations/072_visit_mascot_packs.sql) définit :

```sql
map_id VARCHAR(32) NOT NULL,
UNIQUE KEY uq_visit_mascot_packs_map_catalog (map_id, catalog_id),
CONSTRAINT fk_visit_mascot_packs_map FOREIGN KEY (map_id) REFERENCES maps(id)
```

Les packs sont **par carte**, publiés par carte, et renvoyés par `GET /api/visit/content` pour
une carte donnée. Or le narrateur de l'aide est **global à l'application** : le portrait d'OLU
dans le panneau « Tâches » ou « Stats » n'a aucune carte de rattachement. Y loger les portraits
signifierait qu'OLU change de visage selon la carte sélectionnée — incohérent — et poserait la
question insoluble du portrait à utiliser hors contexte carte.

**Trois options, avec ma recommandation :**

| Option                                                                       | Pour                                                                                                                                                                                                                                                                                                                                                          | Contre                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) Réglage global `content.help.narrator` + médiathèque** ✅ _recommandé_ | Idiomatique : la convention `content.*` est massivement utilisée, `content.help.registry` existe déjà. Le studio d'aide existe déjà ([`ForetMapHelpContentAdminPanel`](../src/components/help/ForetMapHelpContentAdminPanel.jsx)). Images via la médiathèque. **Aucune migration, aucun schéma Zod de pack à toucher, aucun miroir `lib/` à resynchroniser.** | Le portrait n'est plus décrit dans le même objet que la mascotte animée.                                                                                                                                         |
| **(B) Nouvelle table `narrator_packs`**                                      | Modèle riche, versionnable, exportable en ZIP comme les packs mascotte.                                                                                                                                                                                                                                                                                       | Migration + routes + studio dédié + schéma Zod + miroirs `lib/`. Lourd pour ce besoin.                                                                                                                           |
| **(C) Étendre `visit_mascot_packs` avec un bloc `portrait`**                 | Un seul objet décrit toute la mascotte.                                                                                                                                                                                                                                                                                                                       | **Problème de portée non résolu** (par carte). Touche les deux schémas Zod divergents FM/GL et impose la resynchronisation `lib/visit-pack/` + `lib/gl-pack/`. Aggrave la dette de §3 de la note de convergence. |

**Recommandation : option (A).** Elle respecte l'intention (édition par les profs, sans
redéploiement) tout en évitant le chantier le plus lourd et le plus risqué. Le bloc `portrait`
dans le schéma de pack (option C) reste souhaitable **plus tard**, pour que chaque mascotte de
carte puisse fournir son propre portrait — mais ce n'est pas ce que demande OLU narrateur unique.

### 5.2 Forme du réglage (option A) ✅ _livré (lot 2)_

> **Ce qui a été livré.** [`lib/helpNarrator.js`](../lib/helpNarrator.js) — clé
> `content.help.narrator`, défauts, normalisation, schéma Zod, lecture/écriture. Exposé
> publiquement par `enrichHelpNarratorPublic` (`lib/settings.js`) et repris côté front par
> `mergePublicSettings`. Quatre points d'implémentation à connaître :
>
> - **Routes dédiées `/admin/help-narrator` (GET/PUT + `/reset`)**, et non l'extension de
>   `/admin/help-content` prévue au §6. Raison : les deux réglages ont des cycles de vie
>   distincts, et surtout `POST /admin/help-content/reset` — que le §11.2 envisage sérieusement
>   en production — ne doit pas emporter les portraits avec le corpus. Schémas, audits et
>   réinitialisations restent donc séparés. Couvert par un test explicite.
> - **Défauts déclarés en code**, pas dans un `data/*.json` : quatre clés sans contenu
>   éditorial ne justifient pas un fichier de surcharge.
> - **URL de portrait restreintes** au chemin absolu du site (`/uploads/…`) ou à `http(s)`.
>   `data:`, `javascript:`, protocole-relatif et chemin relatif sont **écartés** à
>   l'enregistrement plutôt que corrigés.
> - **Zod 4** : `z.record(z.enum(…), …)` exige _toutes_ les clés de l'énumération. Les portraits
>   utilisent donc `z.object({…}).partial()`, seule forme qui autorise l'absence d'une expression.

### 5.2bis Le modèle

Clé de réglage `content.help.narrator`, à valider par Zod dans [`lib/helpContent.js`](../lib/helpContent.js)
sur le modèle de `helpConfigSchema` :

```
{
  enabled: boolean,              // interrupteur global — voir §9.4
  speakerName: string,           // « OLU »
  fallbackSilhouette: string,    // « olu » — pilote le niveau 3
  portraits: {
    "<expression>": {            // clés = expressions de §4.3
      face?: string,             // URL médiathèque
      bust?: string,
      body?: string
    }
  }
}
```

Toutes les URLs sont **optionnelles** : une expression sans portrait retombe sur `neutre`, et
`neutre` sans portrait retombe sur le fallback SVG. Aucun état ne produit d'écran vide.

### 5.3 Spécifications pour les sprites

Brief de production prêt à l'emploi (analyse de la planche d'expressions fournie, prompts de
génération, critères de recette) : **[`MASCOT_OLU_BRIEF_VISUEL.md`](./MASCOT_OLU_BRIEF_VISUEL.md)**.

À transmettre au moment de la production graphique :

| Cadrage | Dimensions source recommandées | Format                | Fond        | Priorité |
| ------- | ------------------------------ | --------------------- | ----------- | -------- |
| `bust`  | 256 × 320 px                   | WebP (+ PNG de repli) | transparent | **1**    |
| `face`  | 256 × 256 px                   | WebP                  | transparent | 2        |
| `body`  | grille spritesheet 64 × 64     | PNG                   | transparent | 3        |

- **Budget** : ≤ 30 Ko par portrait après compression. Au-delà, le bénéfice perçu ne justifie
  plus le coût réseau.
- **Pixel art** : si les sprites sont en pixel art (cohérent avec `pixelated: true` du catalogue
  actuel), fournir en dimensions natives **multiples de 2** et laisser le CSS gérer
  l'agrandissement avec `image-rendering: pixelated`. Ne jamais livrer un pixel art pré-agrandi.
- **Cohérence** : le cadrage `bust` doit être recadrable en `face` sans perte — même axe, même
  échelle de tête. Cela permet de démarrer avec un seul asset.
- **Spritesheet `body`** : si elle est produite, vérifier le mapping d'états déjà écrit dans
  [`visitMascotCatalog.js:222-253`](../src/utils/visitMascotCatalog.js) (rangées et nombres de
  frames par état) et le corriger si la planche ne correspond pas. Ce mapping n'a jamais pu être
  vérifié faute d'asset (§3.1a).

---

## 6. Points d'ancrage — carte des modifications

| Fichier                                                                                                             | Nature                                                                                                                                                                 | Lot                |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/shared/components/MascotSpeaker.jsx`                                                                           | **Nouveau.** Portrait seul, cascade de résolution, `aria-hidden`.                                                                                                      | 2                  |
| `src/shared/components/SpeechBubble.jsx`                                                                            | **Nouveau.** Cadre + étiquette locuteur + machine à écrire (`reduced-motion`).                                                                                         | 1                  |
| `src/utils/mascotExpressions.js`                                                                                    | **Nouveau.** Mapping expression → état canonique (§4.3). Aucun enum concurrent.                                                                                        | 2                  |
| [`src/components/DiscoveryTour.jsx`](../src/components/DiscoveryTour.jsx)                                           | Insérer portrait + bulle dans `discovery-tour__card`. ⚠️ `CARD_WIDTH = 320` en dur (l. 9) → prévoir le mode compact mobile. Ne pas toucher `role="dialog" aria-modal`. | 1-2                |
| [`src/constants/discoveryTour.js`](../src/constants/discoveryTour.js)                                               | Champ `expression` optionnel par étape (à côté de `placement`, `role`). Réécriture du corpus.                                                                          | 3-4                |
| [`src/components/HelpPanel.jsx`](../src/components/HelpPanel.jsx)                                                   | Portrait `face` en en-tête, à côté du `💡`. Ne pas insérer dans le nom accessible (`ariaLabel` de `DialogShell`).                                                      | 5                  |
| [`lib/helpContent.js`](../lib/helpContent.js)                                                                       | Schéma Zod `content.help.narrator` + exposition dans `buildPublicHelpPayload`.                                                                                         | 2                  |
| [`routes/settings.js`](../routes/settings.js)                                                                       | Étendre `/admin/help-content` (l. 116-158) — audit `settings_help_content_update` déjà en place.                                                                       | 2                  |
| [`src/components/help/ForetMapHelpContentAdminPanel.jsx`](../src/components/help/ForetMapHelpContentAdminPanel.jsx) | Section « Narrateur » : nom, portraits par expression, interrupteur. Autosave déjà câblé.                                                                              | 5                  |
| [`data/help.default.json`](../data/help.default.json)                                                               | Réécriture du corpus `panels` (7 sections). `tooltips` inchangés (§7.3).                                                                                               | 4                  |
| [`src/constants/help.js`](../src/constants/help.js)                                                                 | Réécriture des `HELP_PANELS` (défauts client). Cohérence obligatoire avec `help.default.json`.                                                                         | 4                  |
| `src/index.css` / feuille dédiée                                                                                    | Styles bulle, cadre, portrait. Respecter le thème forêt (`--forest`, `--leaf`).                                                                                        | 1                  |
| `docs/reference/foretmap/visite-et-mascottes.md`                                                                    | Doc de référence fonctionnelle — **obligatoire, même lot** (règle projet).                                                                                             | chaque lot visible |
| `docs/API.md`                                                                                                       | Si `content.help.narrator` est exposé publiquement → documenter.                                                                                                       | 2                  |

---

## 6bis. Ce qui a été livré aux lots 3 et 5

### 6bis.1 Lot 3 — l'expression suit l'étape

- `DISCOVERY_TOURS` accepte un champ **`expression`** par étape ; toutes les étapes existantes en
  portent un (`parle` pour une présentation, `montre` pour un coach mark qui désigne, `cherche`
  pour une étape d'exploration, `vigilant` pour les paramètres, `complice` pour la relance).
  `resolveDiscoveryExpression()` neutralise l'absence et l'inconnu — un parcours reste valide sans
  aucune expression déclarée.
- `DiscoveryTour` rend le portrait **à gauche de la bulle**, dans une scène en deux colonnes. Deux
  points d'implémentation :
  - **`CARD_WIDTH` n'est plus une constante unique.** La carte passe de 320 à 384 px quand un
    portrait est affiché sur grand écran, et `computeCardPosition()` reçoit désormais la largeur en
    paramètre — sinon le texte se serait retrouvé comprimé à ~210 px (§9.3). La largeur est aussi
    bornée à la fenêtre, ce qui n'était pas le cas avant.
  - **Sous 480 px, le portrait devient un médaillon `face` de 44 px** et la carte reste à 320 px.
    Le seuil est lu par `useMediaQuery` (`src/shared/hooks/useMediaQuery.js`, nouveau, partagé) et
    non par un `resize` maison.
- Aucune ancre CSS de parcours n'a été renommée ni déplacée (§9.4) : les étapes existantes ciblent
  exactement les mêmes sélecteurs.

### 6bis.2 Lot 5 — le studio, et l'écart assumé avec le §6

Le §6 prévoyait une **section « Narrateur » dans `ForetMapHelpContentAdminPanel`**. Le lot livre à
la place un **écran dédié** (`src/components/help/HelpNarratorAdminPanel.jsx`), en troisième
sous-onglet de « Paramètres administrateur ». Raison : le lot 2 a délibérément séparé les deux
réglages côté serveur — routes distinctes, réinitialisations distinctes, pour que
`POST /admin/help-content/reset` n'emporte pas les portraits (§5.2). Les fondre dans un seul écran
aurait remis en cause cette séparation là où elle est la plus visible, le bouton
« Réinitialiser » : l'utilisateur en aurait vu deux dans la même page, sans moyen de savoir lequel
emporte quoi. Deux réglages, deux cycles de vie, deux écrans.

Trois partis pris d'interface, tous vérifiés par les tests :

| Parti pris                        | Ce que ça donne                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Montrer la cascade**            | Chaque expression affiche **le rendu effectif** — image propre, à défaut celle de « Neutre », à défaut la silhouette SVG — avec un badge de provenance (« Image dédiée » / « reprend Neutre » / « silhouette de repli »). Une case vide n'est donc pas lue comme une erreur, ce qui est exactement le sens de la règle « le niveau 3 doit suffire » (§4.1). |
| **Aperçu dans les deux surfaces** | Un commutateur Visite guidée / Panneau d'aide, avec sélecteur d'expression, rend le portrait et la bulle réels. Le réglage se juge en situation, pas sur une vignette isolée.                                                                                                                                                                               |
| **Un seul geste pour illustrer**  | « Importer » téléverse dans la médiathèque **et** affecte l'emplacement ; « Choisir… » ouvre la médiathèque en galerie, filtrée par le seul emplacement visé. Enregistrement automatique (`useDebouncedAutoSave`), comme les autres studios prof.                                                                                                           |

Autres points :

- **Le cadrage `bust` est au premier plan**, `face` et `body` sont repliés dans « Cadrages
  complémentaires » avec la mention explicite que le visage est recadré automatiquement depuis le
  buste (§4.4). L'écran n'invite donc pas à produire trois images là où une suffit.
- **Le budget de 30 Ko (§9.2) est rappelé après un import trop lourd**, en avertissement — jamais
  en blocage : c'est un conseil de réseau, pas une règle métier.
- **`src/utils/helpNarratorDraft.js`** (nouveau) rejoue côté client la règle d'URL du serveur : une
  saisie que `lib/helpNarrator.js` écarterait est effacée immédiatement plutôt qu'affichée puis
  perdue au premier enregistrement.
- **Portrait `face` dans `HelpPanel`**, à côté du `💡`. `ariaLabel={title}` du `DialogShell` est
  inchangé et le portrait reste `aria-hidden` : le nom accessible du dialogue n'a pas bougé (§9.1).

## 6ter. Ce qui a été livré au lot 4

### 6ter.1 Le corpus

Réécrits à la première personne : les **21 étapes** de `DISCOVERY_TOURS` (`title`, `body`,
`bodyTeacher`), les **7 panneaux** de `data/help.default.json` et leur miroir `src/constants/help.js`,
et les **3 `quickTips`**. Inchangés, conformément au §7.3 : les 21 infobulles, les `mapCanvasHints`,
les `realtime`, et les 4 libellés de `chrome` — un bouton « Fermer » ne parle pas.

> **Refonte du ton en fin de lot.** Le corpus a d'abord été écrit sur la figure du **copiste**
> retenue au lot 0, puis **entièrement repris** à la voix du jeune explorateur du brief graphique
> (§2.1). Ce sont les mêmes textes, mêmes longueurs et mêmes garde-fous ; seule la personnalité
> qui les porte a changé.

Trois points d'écriture qui ont demandé un arbitrage :

- **Le miroir est désormais identique au caractère près.** `help.default.json` et `HELP_PANELS`
  divergeaient sur les apostrophes (et portaient des `d abord` / `c est` sans apostrophe du tout).
  Les deux fichiers sont maintenant strictement égaux, et un test le vérifie — l'utilisateur voyait
  sinon un texte avant la réponse serveur, un autre après.
- **`RELAUNCH_STEP` n'a pas été dupliqué.** Son texte (« Si tu m'oublies, ce « ? » me rappelle. »)
  est écrit pour fonctionner dans les 13 parcours ; un test vérifie qu'il reste un objet unique
  partagé par référence.
- **Cinq passages « lourds » sur treize parcours**, portant l'expression `grave` : carte (ce qu'on
  lègue), tâches (une tâche prise et jamais faite), biodiversité (le noyer et ses quarante ans),
  réseau trophique (retirer un fil de la toile), carnet (le banal d'aujourd'hui). Les huit autres
  parcours restent au registre courant : la règle du §2.3 est un plafond, pas un quota. Chez un
  personnage enthousiaste, ces passages se disent en **émerveillement** plutôt qu'en gravité de
  vieux sage — « c'est ce qui me sidère le plus ici », « je suis resté planté devant ».

### 6ter.2 L'édition des parcours — §11.4 tranché dans l'autre sens

Le brief du lot prévoyait d'**assumer et documenter** l'écart entre l'aide (éditable) et les
parcours (en code). L'arbitrage a été rendu à l'inverse : **les parcours deviennent éditables**,
par l'administrateur, **avec délégation possible à un profil professeur**. La forme retenue est
celle que le §11.4 désignait déjà comme la bonne — une surcharge **par clé**, pas un snapshot :

| Point                | Choix                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Réglage              | `content.tour.registry` — clés plates `<parcours>.<étape>.<champ>` ([`lib/tourContent.js`](../lib/tourContent.js))                                                           |
| Ce qui est éditable  | `title`, `body`, `bodyTeacher`. **Rien d'autre.**                                                                                                                            |
| Ce qui reste en code | `target`, `placement`, `role`, `expression` — et le corpus par défaut lui-même                                                                                               |
| Permission           | **`tours.manage`**, nouvelle, distincte de `admin.settings.write`. Accordée à `admin` par la matrice, absente de `prof` : c'est un choix d'établissement, pas un défaut.     |
| Routes               | `/api/settings/admin/tour-content` (GET/PUT + `/reset`), audit `settings_tour_content_update` / `_reset`                                                                     |
| Écran                | `DiscoveryTourAdminPanel` — 3ᵉ sous-onglet **Paramètres → Visites guidées**, autosave                                                                                        |
| Champ vide           | = **retour au défaut**. Contrairement au registre d'aide, où vider une ligne est une décision qu'on conserve : une bulle de parcours sans texte n'a pas de rendu acceptable. |

Quatre décisions d'implémentation méritent d'être connues :

- **La structure n'est pas exposée, et c'est ce qui rend la délégation acceptable.** Une étape dont
  la cible est absente du DOM est ignorée **silencieusement** (§9.4) : offrir un champ « sélecteur
  CSS » à un prof, c'est offrir un moyen de faire disparaître une étape sans message d'erreur.
  `applyTourOverrides()` ne recopie que les trois champs de texte, et un test vérifie qu'une
  surcharge portant `target` ou `placement` reste sans effet.
- **Le serveur ne connaît pas le corpus par défaut.** Il ne stocke que la surcharge ; le client
  l'applique sur les textes du bundle. La propriété obtenue au v1.95.1 pour l'aide — améliorer un
  défaut versionné reste visible partout où personne n'a réécrit — est ici acquise **par
  construction**, sans mécanisme de diff.
- **L'étape de relance s'édite une seule fois**, sous un parcours réservé `commun`. La montrer
  treize fois laisserait croire qu'on peut l'adapter à un onglet, alors que l'objet est partagé.
- **`bodyTeacher` ne se crée pas.** Surcharger ce champ sur une étape qui n'en déclare pas est
  ignoré : le rendu prof divergerait sinon sans que personne l'ait décidé.

Un prof qui ne détient que `tours.manage` voit l'onglet **Paramètres** et **uniquement** la section
« Visites guidées » — le chargement de `/api/settings/admin` n'est même pas tenté, puisqu'il
répondrait 403.

### 6ter.3 Ce qui n'a pas été fait

- **Pas de mémoire d'OLU** (§11.6) — la position reste « non », et c'est désormais écrit dans la
  doc de référence comme un point d'attention plutôt que passé sous silence.
- **Pas de GL** : le corpus GL est le lot 6, en commits `feat(gl)` séparés.
- **`chrome` non converti** (§11.8) : les quatre libellés restent fonctionnels.

## 7. Le corpus — stratégie de réécriture

### 7.1 Trois gisements, trois régimes

C'est le point le plus souvent sous-estimé : **le corpus ne vit pas au même endroit selon la surface.**

| Gisement                                  | Volume                                                                                            | Éditable par les profs ?                           | Régime de réécriture                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `data/help.default.json`                  | 7,3 Ko — 21 sections de tooltips, 7 panneaux, 3 quickTips, 4 chrome, 6 mapCanvasHints, 5 realtime | ✅ **oui**, surcharges BDD `content.help.registry` | Réécrire **les défauts**. Les surcharges existantes en base **priment** — voir ⚠️ ci-dessous. |
| `src/constants/help.js` (186 l.)          | `HELP_TOOLTIPS` + `HELP_PANELS`                                                                   | ❌ non (défauts client)                            | Réécrire en miroir de `help.default.json`.                                                    |
| `src/constants/discoveryTour.js` (295 l.) | 100 % du contenu des parcours                                                                     | ❌ **non — code uniquement**                       | Réécriture directe. Aucun risque de collision.                                                |

⚠️ **Piège de la surcharge BDD.** Si une instance en production a déjà des textes personnalisés
enregistrés sous `content.help.registry`, **réécrire les défauts ne changera rien à l'écran** :
les surcharges gagnent. Il faut donc, avant la livraison du lot corpus, vérifier l'état de ce
réglage en production et décider — soit réinitialiser (`POST /admin/help-content/reset` existe
déjà, l. 147 de `routes/settings.js`), soit reporter les textes manuellement. **À trancher avec
l'exploitant.**

⚠️ **Asymétrie à signaler.** Les parcours `DISCOVERY_TOURS` ne sont **pas** éditables par les
profs, alors que l'aide l'est. Après réécriture à la première personne, cet écart deviendra plus
visible (les profs pourront corriger la voix d'OLU dans les panneaux, mais pas dans les
parcours). Rendre les parcours éditables est un chantier à part entière — voir arbitrage §11.4.

### 7.2 Ordre de réécriture

1. **Parcours `map`** en pilote (5 étapes) → validation du ton avec toi.
2. Les autres parcours de `discoveryTour.js`.
3. Les 7 `panels` de `help.default.json` + miroir dans `src/constants/help.js`.
4. GL : contenus d'aide par onglet (§8).

Le lot de réécriture est **strictement séparé** du lot technique : deux chantiers de nature
différente, deux relectures différentes, et l'un ne doit pas bloquer l'autre.

### 7.3 Les tooltips restent neutres — pourquoi

Les 21 sections de tooltips (20 usages de `<Tooltip>`) ne passent **pas** à la première personne :

- Ouverture en 300 ms au survol, texte d'une ligne : aucune place pour une voix.
- Un tooltip est consulté **en action** (la main est sur le bouton), pas en lecture.
- Y injecter de la personnalité rallonge le texte et ralentit le geste.
- Y injecter un portrait produit du bruit visuel sur chaque survol.

Les tooltips décrivent ce que fait un bouton. C'est un registre fonctionnel, et il doit le rester.
Même raisonnement pour `mapCanvasHints` (hints de tracé, contextuels et brefs) et `realtime`
(indicateurs d'état technique).

**`quickTips` (3 entrées) et `chrome` (4 entrées)** : à examiner au cas par cas au moment du lot 4
— certains peuvent porter la voix, d'autres non.

---

## 8. Gnomes & Licornes

### 8.1 Pourquoi OLU y a sa place

« Copiste » n'est pas un habillage plaqué sur GL : c'est le métier même de l'univers. GL est
construit autour de **feuillets**, de lore, de chapitres et d'un carnet — un explorateur qui note
ce qu'il découvre y est chez lui sans qu'on force quoi que ce soit. C'est le point fort de ce
choix de personnalité.

> Le §8.1 parlait initialement du **copiste** ; l'argument tient à l'identique pour l'explorateur,
> puisqu'il repose sur le carnet et la découverte, pas sur l'âge du personnage. À ne pas confondre
> avec le type de feuillet `copiste` du lore GL, qui reste ce qu'il est.

### 8.2 Isolement GL — ce qui est permis et ce qui ne l'est pas

La règle d'isolement du projet porte sur le **runtime** : routage par host, `/api/gl/*`, JWT
`product:'gl'` rejeté hors GL. Elle **n'interdit pas** le partage de code utilitaire — c'est déjà
le cas (`VisitMapMascotRenderer` est réutilisé par GL, `mascotBehaviorEngine.js` est partagé).

| Autorisé                                                         | Interdit                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| `MascotSpeaker` et `SpeechBubble` dans `src/shared/components/`  | Un appel GL vers `/api/visit/*` ou l'inverse          |
| Mapping d'expressions partagé (`src/utils/mascotExpressions.js`) | Réutiliser le réglage `content.help.narrator` côté GL |
| Styles de bulle partagés, thémés par produit                     | Un JWT traversant                                     |

⚠️ **Conséquence :** GL a besoin de **son propre réglage narrateur** (`gl` settings, via
[`lib/glSettings.js`](../lib/glSettings.js)) et de ses propres assets. Même personnage, mêmes
composants, **deux configurations**. C'est le coût de l'isolement, et il est assumé.

### 8.3 Points d'ancrage GL

| Fichier                                                               | Nature                                                                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GLFeuilletPopover.jsx`](../src/gl/components/GLFeuilletPopover.jsx) | Cible **n°1** — c'est le feuillet, le terrain naturel du carnet d'exploration                                                                                          |
| [`GLTabHelpPanel.jsx`](../src/gl/components/GLTabHelpPanel.jsx)       | Portrait `face` en en-tête                                                                                                                                             |
| [`useGlHelpContent.js`](../src/gl/hooks/useGlHelpContent.js)          | Corpus d'aide GL par onglet (~19 onglets listés dans `GLHelpContentAdminPanel`)                                                                                        |
| [`GLIntroOverlay.jsx`](../src/gl/components/GLIntroOverlay.jsx)       | ⚠️ **iframe statique** (`/gl/intro/index.html`) — hors React. Modifier l'intro suppose de toucher l'asset statique, pas le composant. **Sortir du périmètre initial.** |
| [`GLGlossaryPopover.jsx`](../src/gl/components/GLGlossaryPopover.jsx) | Candidat secondaire                                                                                                                                                    |

⚠️ **Commits GL exclusifs** : préfixe `feat(gl)` / `fix(gl)` / `chore(gl)`. Un lot mixte FM+GL
doit être **découpé en deux commits**.

⚠️ **Tests GL séquentiels obligatoires** (`--test-concurrency=1 --test-force-exit`) — BDD partagée.

---

## 9. Accessibilité, performance, robustesse

### 9.1 Accessibilité — non négociable

- Portrait **toujours** `aria-hidden="true"` / `alt=""`. Le texte est le contenu.
- Ne **jamais** insérer le nom du locuteur dans le nom accessible d'un dialogue.
  `DiscoveryTour` a `role="dialog" aria-modal="true" aria-label="Visite guidée"` ; `HelpPanel`
  passe par `DialogShell` avec `ariaLabel={title}`. Ces valeurs restent inchangées.
- Les bulles existantes utilisent `role="status" aria-live="polite"`
  ([`VisitMapMascot.jsx`](../src/components/VisitMapMascot.jsx)) — reprendre ce traitement, et
  **ne pas** rendre `aria-live` une région qui se réécrit lettre par lettre (le lecteur d'écran
  la relirait en boucle). En machine à écrire, annoncer le texte **complet** d'un coup.
- Contraste du texte de bulle sur le cadre : viser WCAG AA (4.5:1).
- Cibles tactiles ≥ 44 px (règle projet) — la zone d'avancée du texte comprise.

### 9.2 Performance

- Aucun import de renderer lourd depuis `MascotSpeaker` (§4.2).
- Portraits en **WebP** avec repli PNG, `loading="lazy"`, `width`/`height` explicites pour éviter
  le décalage de mise en page.
- Préchargement du portrait **au démarrage du parcours**, pas au montage de la page.
- Budget : ≤ 30 Ko par portrait, ≤ 120 Ko pour l'ensemble des expressions chargées.

### 9.3 Mobile

`CARD_WIDTH = 320` est en dur dans `DiscoveryTour.jsx` (l. 9). Un portrait latéral y consomme une
part significative de la largeur utile. Prévoir sous ~480 px : portrait en **médaillon d'angle**
(40 px) ou masqué, texte pleine largeur. À vérifier sur un écran réel avant de figer.

### 9.4 Robustesse et réversibilité

- **Interrupteur global** `content.help.narrator.enabled`. Si OLU dérange (retour de classe,
  problème de perf, corpus incomplet), on le coupe sans redéploiement.
- **Cascade sans écran vide** : pack → défaut → SVG. Testée explicitement.
- ⚠️ **Sélecteurs des parcours** : `DISCOVERY_TOURS` cible des sélecteurs CSS réels
  (`.fm-help-btn`, `.map-view-toolbar`, `.nav-btn.active`…). Une étape dont la cible est absente
  du DOM est **silencieusement ignorée**. Ajouter le portrait ne doit ni déplacer ni renommer ces
  ancres — sinon des étapes disparaîtront sans erreur visible.

---

## 10. Tests

Règle projet : **les tests sont dans le même lot que le code.**

| Niveau                | Objet                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend (`node:test`) | Schéma Zod `content.help.narrator` : valeurs valides, rejets, valeurs partielles. Routes `/admin/help-content` (lecture, écriture, reset). Audit `settings_help_content_update`.                                                              |
| UI (Vitest)           | `MascotSpeaker` : cascade pack → défaut → SVG ; `aria-hidden` présent ; **aucun renderer lourd importé** (assertion sur les imports). `SpeechBubble` : machine à écrire instantanée sous `prefers-reduced-motion`. Mapping expression → état. |
| e2e (Playwright)      | Parcours découverte avec portrait : progression, `Échap`, clic pour tout afficher. Portrait absent → SVG de repli, aucune erreur console. `data-mascot-speaker` stable.                                                                       |
| Non-régression        | Les parcours existants ne perdent aucune étape (sélecteurs intacts). Les tooltips restent inchangés.                                                                                                                                          |

Rappels d'exécution : `npm run start:e2e` (sinon `429` sur les formulaires) ; `npm run build`
avant les e2e si `dist/` est absent ou obsolète ; tests GL en séquentiel.

---

## 11. Arbitrages restants

À trancher, dans l'ordre. Les trois premiers conditionnent le démarrage.

### 11.1 ✅ Réceptacle des visuels — §5.1 — _tranché (lot 2)_

`visit_mascot_packs` est **par carte** et ne convient pas à un narrateur global. **Option A
retenue et livrée** : réglage `content.help.narrator` + médiathèque, sans migration ni schéma de
pack touché. Détail d'implémentation en §5.2.

### 11.2 ✅ Surcharges d'aide en production — §7.1 — _tranché et corrigé_

Le risque était réel : le registre était persisté **en objet dense** (toutes les clés, y compris
celles que personne n'avait touchées), donc la première sauvegarde d'un prof gelait le corpus et
annulait toute réécriture ultérieure des défauts.

Deux constats ont clos l'arbitrage :

1. **Mesure de la production** (`GET /api/settings/public` comparé à `data/help.default.json`) :
   **zéro écart** sur les 21 infobulles, 7 panneaux, astuces, libellés, bandeaux carte et
   indicateurs temps réel. Personne n'a personnalisé de texte — il n'y a donc rien à reporter, et
   un `POST /admin/help-content/reset` après déploiement ne détruirait rien.
2. **Dégel du mécanisme** : `saveHelpConfigToDb` ne persiste plus que la **surcharge**
   (`buildStoredOverride`, noyau partagé `lib/shared/jsonDefaultsStore.js`). La lecture n'a pas
   changé — elle retombait déjà sur les défauts pour toute valeur absente. Conséquence : une
   amélioration des défauts versionnés reste visible partout où un prof n'a rien réécrit, ce qui
   est exactement ce dont le lot 4 a besoin.

Une instance déjà en service conserve sa ligne dense tant que personne n'enregistre :
`node scripts/compact-help-registry.js --apply` la réécrit en surcharge, à rendu identique
(le script refuse d'écrire si le contenu affiché changerait).

> ⚠️ **Dette symétrique non traitée** : `lib/glHelp.js` (aide GL par onglet) persiste toujours
> l'objet dense et présente donc le même gel. Le correctif y est mécaniquement identique, mais
> relève d'un commit `feat(gl)` séparé (règle projet).

### 11.3 🟠 Nombre d'expressions au démarrage — §4.3

4 (`neutre`, `parle`, `montre`, `content`) ou 8 ? Recommandation : **4**, les autres retombant sur
`neutre`. Détermine le volume de production graphique.

> **Sans effet sur le code depuis le lot 2.** Les 8 expressions sont acceptées par le réglage et
> par `MascotSpeaker`, toutes facultatives : n'en fournir que 4 est un choix de production, pas
> une contrainte technique. L'arbitrage ne porte donc plus que sur le brief graphique
> ([`MASCOT_OLU_BRIEF_VISUEL.md`](./MASCOT_OLU_BRIEF_VISUEL.md) §2.1).

### 11.4 ✅ Parcours éditables par les profs — §7.1 — _tranché et livré (lot 4)_

**Fait**, et pas seulement assumé. L'écart avec l'aide éditable a été comblé au moment même où la
réécriture le rendait visible : réglage `content.tour.registry`, surcharge **par clé**, permission
dédiée **`tours.manage`** détenue par l'admin et **délégable à un profil prof**. Seuls les trois
champs de texte sont exposés — la structure reste en code, ce qui est la condition pour que la
délégation ne puisse pas casser un parcours. Détail en §6ter.2.

### 11.5 🟠 Portrait animé ou statique — §4.1

2-3 frames apportent de la vie mais ajoutent du poids et une boucle à gérer sous
`reduced-motion`. Recommandation : **statique d'abord**, animation évaluée après retour d'usage.

> **Tranché de fait par le lot 5** : le studio n'accepte qu'une image fixe par cadrage. Passer à
> l'animé demanderait un nouveau champ dans le réglage, pas seulement de nouveaux assets — donc un
> arbitrage à reprendre s'il devient souhaitable, avec le retour d'usage en main.

### 11.6 🟡 Mémoire d'OLU

OLU répète-t-il le même texte à chaque ouverture, ou varie-t-il selon qu'on l'a déjà consulté ?
`useHelp.js` trace déjà `seenSections` et des métriques en `localStorage` — la donnée existe.
Tentant, mais c'est du corpus × 2. Recommandation : **non au départ**.

### 11.7 🟡 Identité d'OLU dans le lore GL

OLU est-il un personnage **du** monde de Gnomes & Licornes (avec une place dans le lore, une
relation au carnet de Sélène), ou un narrateur **extérieur** aux deux produits ? Question
d'écriture, pas de technique — mais elle change le corpus GL.

### 11.8 ✅ `quickTips` et `chrome` — §7.3 — _tranché (lot 4)_

**`quickTips` (3) à la voix d'OLU, `chrome` (4) inchangé.** Une astuce se lit au calme sous un
panneau : la voix y tient. « Astuce : », « Fermer », « Ne plus afficher » et le préfixe `💡` sont
de la chrome d'interface — un bouton ne parle pas, et le préfixe est de toute façon plafonné à
8 caractères par le schéma.

---

## 12. Découpage en lots

| Lot   | Contenu                                                                                                                                          | Assets requis  | Effort | Risque            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------ | ----------------- |
| **1** | ✅ **Livré** — `SpeechBubble` : cadre, étiquette locuteur, machine à écrire + `reduced-motion`. Branché sur `DiscoveryTour` seul. Styles.        | ❌ aucun       | Faible | Très faible       |
| **2** | ✅ **Livré** — `MascotSpeaker` (rendu SVG niveau 3) + `mascotExpressions.js` + réglage `content.help.narrator` (schéma, routes, payload public). | ❌ aucun       | Moyen  | Faible            |
| **3** | ✅ **Livré** — champ `expression` dans `DISCOVERY_TOURS`, portrait dans `DiscoveryTour`, médaillon sous 480 px (§6bis.1).                        | ❌ aucun       | Faible | Faible            |
| **4** | ✅ **Livré** — corpus à la voix d'OLU (21 étapes, 7 panneaux + miroir, 3 `quickTips`) **et** édition des parcours sous `tours.manage` (§6ter).   | ❌ aucun       | Moyen  | Moyen — §11.2     |
| **5** | ✅ **Livré** — studio prof `HelpNarratorAdminPanel` (onglet dédié, cf. §6bis.2) + portrait `face` dans `HelpPanel`.                              | ❌ aucun\*     | Moyen  | Faible            |
| **6** | GL : `GLFeuilletPopover` + `GLTabHelpPanel`, réglage GL dédié, corpus GL. **Commits `feat(gl)` séparés.**                                        | ✅ portraits   | Moyen  | Moyen — isolement |
| **7** | _(optionnel)_ Cadrage `body`, spritesheet OLU, correction du mapping d'états §3.1a.                                                              | ✅ spritesheet | Moyen  | Faible            |

**Les lots 1 à 4 ont été livrés sans aucun sprite** et apportent déjà l'essentiel de l'effet
ludique — le cadre, le rythme et la voix. C'est délibéré : la production graphique ne doit
bloquer ni le développement ni l'écriture.

\* Le lot 5 a finalement été livré **sans aucun asset** : le studio se charge d'accueillir les
portraits, et tant qu'il n'y en a pas, l'aide et les parcours affichent la silhouette SVG. Les
portraits restent évidemment le but — mais leur absence ne bloque plus rien, et le jour où ils
arrivent, il n'y a plus une ligne de code à écrire pour les mettre en service.

---

## 13. Anti-patterns — ce qu'il ne faut pas faire

| ❌ À éviter                                      | Pourquoi                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Portrait dans les `Tooltip`                      | 20 usages, bruit permanent, aucun bénéfice (§7.3)                     |
| Compagnon flottant persistant                    | Effet Clippy garanti                                                  |
| Réutiliser `VisitMapMascotRenderer` dans l'aide  | 100–170 Ko + frames sur un survol (§4.1)                              |
| Implémenter le portrait séparément FM et GL      | Aggrave la dette de `MASCOT_ARCHITECTURE_CONVERGENCE.md` §3           |
| Mélanger lot technique et lot corpus             | Deux natures, deux relectures ; l'un bloquerait l'autre               |
| Portrait porteur d'information                   | Casse l'accessibilité et le mode dégradé                              |
| `aria-live` sur un texte en machine à écrire     | Relecture en boucle par les lecteurs d'écran (§9.1)                   |
| Emoji dans les textes d'OLU                      | L'expression passe par le portrait ; les emoji la contredisent (§2.4) |
| Un trait d'humour à chaque bulle                 | Le ton s'use et devient une signature agaçante (§2.2)                 |
| Renommer ou déplacer les ancres CSS des parcours | Étapes silencieusement ignorées (§9.4)                                |

---

## 14. Obligations projet à chaque lot

- **Tests dans le même lot** que le code (`npm test` au minimum avant commit).
- **`docs/API.md`** si une route publique est créée ou modifiée.
- **`docs/reference/foretmap/visite-et-mascottes.md`** dès qu'un comportement visible change —
  la doc de référence fonctionnelle est non technique et destinée aux profs/admins.
- **`CHANGELOG.md`** sous `[Non publié]`, puis `npm run bump:*`, commit, push.
- **`npm run lint`** et **`npm run format:check`** avant de pousser (la CI les enchaîne).
- **Cohérence inter-PR** : vérifier les autres PR ouvertes qui bumpent `package.json`, la tête du
  `CHANGELOG.md` ou ajoutent des migrations, et rebaser pour éviter les conflits.
- **Miroirs `lib/`** : uniquement si l'option (C) de §5.1 était retenue —
  `sync:visit-pack-lib` et `sync:gl-pack-lib`. L'option (A) recommandée n'y touche pas.

---

## 15. Faut-il refactoriser avant ? (partage FM/GL)

Question posée en amont du chantier : puisque OLU touche les deux produits, ne faudrait-il pas
d'abord mutualiser davantage de code entre ForetMap et Gnomes & Licornes ?

**Verdict : non pour OLU, et plus généralement « moins qu'on ne le croit ».** Le dépôt est déjà
très avancé sur le partage. Ce qui suit est mesuré, pas estimé.

> **Mise à jour.** L'audit a depuis été approfondi, outillé et étendu au-delà du périmètre OLU :
> voir **[`PARTAGE_FM_GL.md`](./PARTAGE_FM_GL.md)** (méthode reproductible via
> `scripts/audit-duplication-fm-gl.mjs`, résultats front + back, plan en trois axes, écueils).
> Deux quick wins en sont issus et sont **livrés** : le noyau `lib/shared/jsonDefaultsStore.js`
> (candidat A du §15.5 ci-dessous, avancé avant le lot 2 — voir §15.6) et le hook partagé
> `src/shared/hooks/useAdminCrud.js` (candidat B).

### 15.1 Le principe

> Un pré-refactor se justifie quand le travail à venir **créerait** de la duplication.
> Pas quand il range de la duplication existante que ce travail ne touche pas.

### 15.2 État réel du partage — inventaire

| Emplacement                           | Contenu                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/shared/` (22 modules, ~3 100 l.) | Noyaux **métier** : `contextCommentsCore`, `resourceQuestionGatingCore`, `questionCrudCore`, `questionQueryFactory`, `questionPoolFiltering`, `xlsxImportCore`, `glossaryNormalization`, `learningAckCore`, `foodWebCore`, `httpHelpers`…                                      |
| `src/shared/` (59 fichiers)           | Composants (`DialogShell`, `ImportPanel`, `MediaLibraryMenu`, `ImageLightbox`), hooks (`useDebouncedAutoSave`, `usePrefersReducedMotion`, `useMapFullscreen`), styles (`motion.css`, `visit-map-mascot.css`), sous-dossiers `qcm/`, `mascot-pack/`, `pct-map/`, `image-frame/` |
| Mascotte                              | **Convergence terminée** — étapes 0 à 7 de [`MASCOT_ARCHITECTURE_CONVERGENCE.md`](./MASCOT_ARCHITECTURE_CONVERGENCE.md) toutes marquées réalisées                                                                                                                              |

Le motif établi du projet est **« noyau métier partagé (`*Core.js`) + adaptateur par produit »**.
Il fonctionne, il est respecté, et `ImportPanel` en est l'illustration : consommé par 3 panneaux
ForetMap **et une dizaine de panneaux GL**.

### 15.3 Ce qui reste dupliqué — mesuré

Lignes substantielles communes (hors accolades, blancs et lignes < 14 caractères) entre routes
homonymes :

| Paire                                          | Volumes         | Communes | Lecture                                                                                                     |
| ---------------------------------------------- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `routes/learning-links.js` ↔ `routes/gl/…`     | 273 l. / 360 l. | **114**  | Noyau **déjà partagé** (`resourceQuestionGatingCore`) — ce qui reste est la **plomberie**                   |
| `routes/context-comments.js` ↔ `routes/gl/…`   | 439 l. / 300 l. | **105**  | Idem (`contextCommentsCore`)                                                                                |
| `routes/glossary.js` ↔ `routes/gl/glossary.js` | 149 l. / 525 l. | 21       | **Faux jumeaux** — GL porte un modèle bien plus riche (lore)                                                |
| `routes/forum.js` ↔ `routes/gl/forum.js`       | 662 l. / 161 l. | 20       | **Faux jumeaux** — le forum GL est un pont, pas un clone                                                    |
| `lib/helpContent.js` ↔ `lib/glHelp.js`         | 204 l. / 133 l. | ~60–70   | Même **mécanisme** (défauts JSON → Zod → surcharge BDD → payload public), **modèles de contenu différents** |

**Conclusion de la mesure : la logique métier est déjà factorisée. Ce qui se répète encore, c'est
la plomberie** — middleware d'auth (`requirePermission` vs `requireGlPermission`), source de
réglages (`getSettingValue` vs `getGlGatingSettings`), préfixes de chemins, échafaudage CRUD.

### 15.4 Le vrai gisement n'est pas la duplication, c'est l'asymétrie

Constat plus utile que le précédent : **GL dispose d'outils que ForetMap n'a pas.**

| Outil                                   | GL                           | ForetMap             |
| --------------------------------------- | ---------------------------- | -------------------- |
| `useDebouncedAutoSave`                  | 17 fichiers                  | **1 fichier**        |
| `useGlAdminCrud` (squelette CRUD admin) | oui (174 l.)                 | **aucun équivalent** |
| Doc de référence éditable depuis l'app  | oui (`GLReferenceDocsPanel`) | non                  |

Le meilleur gain de maintenabilité n'est donc pas « partager davantage » mais **réduire
l'asymétrie** : promouvoir dans `src/shared/hooks/` ce que GL a déjà éprouvé, pour que ForetMap
en bénéficie. C'est du gain sans réécriture, donc sans risque de régression.

### 15.5 Candidats, classés

| #   | Candidat                                                                    | Gain                             | Risque | Verdict                                                      |
| --- | --------------------------------------------------------------------------- | -------------------------------- | ------ | ------------------------------------------------------------ |
| A   | **Mécanisme « défauts JSON + surcharge BDD »** (`helpContent` / `glHelp`)   | ~35 l. × 2, sert directement OLU | Faible | ✅ **Livré** — `lib/shared/jsonDefaultsStore.js` (cf. §15.6) |
| B   | **`useAdminCrud` promu en `src/shared/hooks/`**                             | ForetMap gagne un outil éprouvé  | Faible | ✅ **Livré** — `src/shared/hooks/useAdminCrud.js`            |
| C   | **Fabrique de routes CRUD** (`makeCrudRouter`)                              | ~100 l. par paire de routes      | Moyen  | ⚠️ Voir l'avertissement ci-dessous                           |
| D   | **Unifier forum / glossaire / tutoriels / stats**                           | —                                | Élevé  | ❌ Faux jumeaux (§15.3)                                      |
| E   | **Unifier les composants d'aide** (`HelpPanel` ↔ `GLHelpPanel`)             | —                                | Élevé  | ❌ Modèles d'interaction différents                          |
| F   | **Unifier les modèles de contenu d'aide** (sections/rôles ↔ onglets à plat) | —                                | Élevé  | ❌ Migration de réglages en production                       |
| G   | **Système de parcours découverte pour GL**                                  | —                                | Élevé  | ❌ **Fonctionnalité**, pas refactor (§15.7)                  |

⚠️ **Avertissement sur (C).** Une fabrique de routes Express est un piège d'abstraction classique.
Middleware d'auth, noms de permissions, événements d'audit et sémantique d'erreur diffèrent par
produit. Un `makeCrudRouter` à quinze options est **pire** que cent lignes dupliquées : il déplace
la complexité au lieu de la supprimer, et rend chaque évolution ultérieure plus coûteuse.
N'y aller que si un troisième appelant apparaît (règle de trois), et en factorisant **le noyau, pas
la plomberie** — exactement ce que le projet fait déjà.

### 15.6 (A) finalement livré avant le lot 2 — pourquoi ce revirement

La position initiale était « attendre le lot 2 », au motif qu'on ne connaît la bonne forme d'un
helper qu'après avoir écrit le cas d'usage une fois. **L'examen des deux implémentations
existantes a invalidé ce raisonnement** : `lib/helpContent.js` et `lib/glHelp.js` écrivaient déjà
le même mécanisme, à l'identique. La forme était donc **observée, pas devinée** — la prudence ne
s'appliquait plus.

Extrait : `createDefaultsLoader` (lecture JSON cachée + clone défensif) et `resolveStoredConfig`
(surcharge base → normalisation → repli sur les défauts). ~35 lignes de duplication réelle
supprimées, et la configuration narrateur d'OLU dispose d'une base prête des deux côtés.

On a factorisé **le mécanisme, pas le modèle** : les modèles de contenu diffèrent réellement
(ForetMap sectionné et sensible au rôle `text`/`textTeacher` ; GL à plat par onglet `title`/`body`),
et l'**écriture** (upsert) reste chez chaque produit — les tables et colonnes d'audit divergent.

### 15.7 Ce dont OLU a réellement besoin : du code neuf, bien rangé

`MascotSpeaker`, `SpeechBubble` et `mascotExpressions.js` **n'existent pas encore**. Les écrire
dans `src/shared/` dès la première ligne ne coûte rien de plus que les écrire ailleurs.

**Un partage obtenu gratuitement en écrivant du code neuf au bon endroit n'est pas un refactor.**
Il n'y a donc rien à faire « au préalable » — seulement à ne pas se tromper de dossier.

Corollaire sur (G) : GL n'a **aucun** système de parcours aujourd'hui (uniquement une iframe
statique d'intro, cf. §8.3). Lui en construire un ne mutualiserait rien : ce serait une
fonctionnalité neuve, et une explosion de périmètre.

### 15.8 Deux garde-fous à la place d'un lot de refactor

1. **Test d'architecture** (lot 2) : assertion Vitest vérifiant que `MascotSpeaker` n'importe aucun
   renderer lourd. Verrouille durablement la règle de performance du §4.1 — mieux qu'un commentaire.
2. **Emplacement imposé** : `src/shared/` pour tout ce que les deux produits consomment, dès la
   première ligne. Coût nul, et cela évite précisément la dette que la convergence mascotte a mis
   sept étapes à résorber.

### 15.9 Deux arguments de calendrier

- **Retour d'usage.** Les lots 1 à 4 ne demandent ni sprite ni refactor : ils mettent OLU à l'écran
  vite. Or le risque n°1 de ce chantier est **le ton**, pas la technique. Une classe qui lit trois
  bulles apprendra plus qu'un mois de refactor. Un lot de refactor en préalable repousse ce retour.
- **Conflits de merge.** La règle de cohérence inter-PR du projet existe pour une raison : une
  grosse PR de refactor touchant des fichiers partagés entrerait en conflit avec tout ce qui est
  en vol.

---

## 16. Pour aller plus loin

- [`MASCOT_ARCHITECTURE_CONVERGENCE.md`](./MASCOT_ARCHITECTURE_CONVERGENCE.md) — état du système mascotte, dette et plan de convergence
- [`MASCOT_PACK.md`](./MASCOT_PACK.md) — format des packs v1/v2
- [`GL_IMAGE_FRAMES.md`](./GL_IMAGE_FRAMES.md) — cadres d'image GL (à regarder avant d'écrire un nouveau cadre)
- [`VISIT_MAP_GEOMETRY.md`](./VISIT_MAP_GEOMETRY.md) — géométrie du plan de visite et assets mascottes
- [`docs/reference/foretmap/visite-et-mascottes.md`](./reference/foretmap/visite-et-mascottes.md) — doc de référence fonctionnelle
