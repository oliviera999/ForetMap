# Audit — les commandes flottantes et leurs cibles tactiles (2026-08)

Déclencheur : « les icônes cliquables se chevauchent parfois ou sont mal agencées suivant
les onglets ». L'audit part des feuilles de style et des points de rendu des deux produits.

> **Portée.** Les valeurs ci-dessous sont **déclarées** dans le CSS ; aucun rendu n'a été
> mesuré. Les trois chevauchements se déduisent des seules déclarations et ne dépendent
> d'aucune mesure ; les cibles tactiles sont des tailles déclarées, elles aussi.

## 1. Ce qui se chevauchait

### 1.1 GL — la cloche recouvrait la navigation basse

| Élément             | `bottom` | occupe    | `z-index` |
| ------------------- | -------- | --------- | --------- |
| `.gl-notifications` | `16px`   | 16 → 60px | **205**   |
| `.gl-bottom-nav`    | `0`      | 0 → 64px  | **110**   |

La cloche tombait dans les 64 px de la barre, au-dessus d'elle : elle masquait l'item de
droite, affiché sous 640 px.

Le plus révélateur : `.gl-zone-music-global-dock` était posé à `bottom: max(72px, safe+56px)`
— une valeur calée à la main **pour dégager ces 64 px**. Le problème était donc connu et
résolu une fois, au cas par cas ; la cloche n'a pas reçu le même traitement.

### 1.2 ForetMap — le bandeau était _sous_ la navigation, donc invisible

`.app-inline-toast` : `bottom:16px`, `z-index:40`. `.bottom-nav` : `bottom:0`, 56–72 px,
`z-index:99`, rendue à toutes les tailles pour un élève. **40 < 99** : le bandeau n'était pas
chevauché, il était **caché**. Plus grave que le cas GL — le message ne s'affichait jamais.

### 1.3 GL — le « ? » dépendait de l'onglet

Deux systèmes de positionnement pour deux boutons voisins : le dock d'aide **dans le flux**
(`margin-top:12px`, aligné à droite, en fin de contenu) et la cloche **fixe**. Sur un onglet
court le « ? » restait haut, sur un onglet long il arrivait à hauteur de la cloche. Le
résultat ne pouvait pas être stable — c'est le « mal agencés suivant les onglets » du
signalement.

## 2. La cause

**Aucune convention ne régissait la zone flottante bas-droite.** Chaque commande choisissait
son `bottom` et son `z-index` dans son coin de feuille — 16/205, 72/90, 16/40, 12/12 — sans
que ces valeurs se connaissent. Rien ne garantissait qu'elles s'empilent, et l'échelle des
`z-index` va de 12 à 99 999 par paliers improvisés.

## 3. Ce qui a été fait

### P1 — la pile est déclarée

`src/shared/styles/floating-dock.css` pose deux invariants :

1. **Rien ne se pose sur une barre de navigation.** `--fm-safe-bottom-nav` vaut la hauteur de
   la barre **là où elle existe**, zéro ailleurs. Il est déclaré sur le conteneur qui porte
   la barre — `.main` côté ForetMap (vue élève), `.gl-app--has-bottom-nav` côté GL — et non
   globalement : une valeur `:root` sur-réserverait chez le prof, qui n'a pas de barre basse.
   La propriété étant héritée, une commande fixe rendue sous ce conteneur la voit ; rendue
   ailleurs, elle retombe sur le zéro, ce qui est le bon résultat.
2. **L'ordre est nommé.** `--fm-z-nav` < `--fm-z-dock` < `--fm-z-toast`. Les valeurs
   numériques restent celles déjà en place produit par produit (99 côté ForetMap, 110 côté
   GL) : on déclare l'ordre existant, on ne renumérote pas une échelle de 12 à 99 999.

### P2 — un seul empilement

`src/shared/components/FloatingDock.jsx` : un conteneur `fixed` en `column-reverse`. Les
enfants **ne se positionnent plus** ; l'ordre et l'espacement viennent du flex, donc deux
commandes ne peuvent plus se recouvrir. Côté GL il réunit la cloche, le bouton musique et le
« ? ».

L'ordre de bas en haut suit celui que les joueurs connaissent — cloche, musique — et le « ? »
prend le cran resté libre : il n'avait pas de place apprise, puisqu'elle changeait d'un onglet
à l'autre.

Deux détails qui comptent :

- Le conteneur est en `pointer-events: none`, les enfants en `auto`. Sans cela, la colonne
  et ses gouttières voleraient les clics du contenu situé derrière.
- Le dock ne rend **rien** sans enfant. Les trois commandes sont conditionnelles (module
  éteint, invité, onglet) : « zéro enfant » est un état normal, et un conteneur fixe vide
  couvrirait une colonne pour n'afficher rien.

> Point vérifié avant de déplacer le « ? » : `DialogShell` **portalise** vers `document.body`.
> Sa modale ne se retrouve donc pas piégée dans le contexte d'empilement du dock — ce qui
> l'aurait fait passer sous le QCM ou l'intro. Sans cette propriété, le déplacement aurait
> été à refuser.

Au passage, le `aria-hidden` que portait l'ancien dock musique disparaît avec lui : il
masquait aux technologies d'assistance un bouton qui restait atteignable au clavier.

### P3 — les cibles tactiles

Règle projet (`CLAUDE.md`) et lot 4 de `docs/AUDIT_GENERAL_2026-08.md`. Sept commandes **en
icône seule** déclaraient moins de 44 px, à toutes les tailles d'écran :

| Produit  | Sélecteur                            | Déclaré |
| -------- | ------------------------------------ | ------- |
| GL       | `.gl-subtabs button`                 | 40 px   |
| GL       | `.gl-glossary-popover__close`        | 36 px   |
| GL       | `.gl-help-panel > header button`     | 36 px   |
| GL       | `.gl-forum-thread > header > button` | 38 px   |
| ForetMap | `.modal-close`                       | 36 px   |
| ForetMap | `header .lock-btn`                   | 36 px   |
| ForetMap | `.editorial-photo-lightbox__close`   | 40 px   |

La zone **cliquable** est portée à 44 px par un pseudo-élément centré (`max(100%, 44px)`),
hors flux : aucun visuel ne grossit, aucune mise en page ne bouge. L'expansion reste
inférieure à la gouttière des conteneurs visés, donc deux cibles voisines ne se recouvrent
pas.

**Portée volontairement limitée aux commandes en icône seule** : les boutons génériques
(`.btn-sm`, 34–38 px) portent un libellé, donc une largeur. Les élargir en hauteur seule ne
réglerait pas grand-chose et risquerait de voler le clic du voisin dans une rangée serrée.

## 4. Ce qui ferme la classe de défaut

`tests/floating-dock-contract.test.js` (5 cas, sans base) et
`tests-ui/shared/FloatingDock.test.jsx` (3 cas) :

1. l'empilement se pose par `calc()`, jamais sur un nombre en dur ;
2. chaque produit déclare ce que sa barre basse occupe — sans quoi le repli vaut zéro et tout
   retombe dans la barre ;
3. aucune des trois commandes ne se repositionne dans son coin ;
4. l'ordre nommé tient : barre < dock < bandeau ;
5. le gabarit de 44 px est présent dans les deux feuilles ;
6. le dock empile dans l'ordre déclaré, sans style en ligne, et ne rend rien à vide.

Le garde-fou n°3 a été vérifié **en le faisant échouer volontairement** : reposer
`bottom:16px` sur le bandeau ForetMap le fait sortir avec « il retomberait sous la barre
basse ».

## 5. Ce que cet audit n'a pas couvert

- **Aucun rendu mesuré** : pas de capture ni de mesure de boîte. Les constats sont des
  lectures de déclarations — suffisantes pour les chevauchements, qui se déduisent des seuls
  `bottom` et `z-index`, mais qui ne diraient rien d'un débordement dû au contenu.
- **Les barres du plateau** (`.gl-board-chrome-bar`, `.gl-board-turn-hud`,
  `.gl-board-chrome-dock`, z-index 12) n'ont pas été reprises : elles sont `absolute` dans le
  plateau, mutuellement exclusives par media query avec les actions d'en-tête, et aucun
  chevauchement ne s'en déduit. Elles restent hors de la convention partagée — un sujet à
  part si le plateau venait à toucher le bas de l'écran.
- **Les écrans d'administration** n'ont pas été balayés pour les cibles tactiles.
