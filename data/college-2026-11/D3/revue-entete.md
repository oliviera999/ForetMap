## Points d’attention pour Oliv

**Méthode.** Chaque question est tranchée d’après son contenu et les programmes (cycle 3 :
Sciences et technologie ; cycle 4 : SVT). Règle de C6 : au moins une notion de cycle 3 effective
→ palier 1, sinon palier 2. Le palier retenu garde ses notions ; celles de l’autre cycle sont
retirées (exclusion si elles viennent de la catégorie, suppression de l’`ajout` sinon). Un élève
de cycle 4 voit aussi les questions de cycle 3 : « cycle 3 » veut dire « accessible dès la 6e ».

**Règles de cohérence appliquées.**

- Catégorie `glossaire_definitions` : profondeur du terme dans le glossaire (`base` → cycle 3,
  `approfondissement` → cycle 4, `avance` → lycée), en accord avec la barrière de vocabulaire
  (C2).
- Familles botaniques (rotation des cultures) → cycle 4 ; familles zoologiques en -idés →
  lycée (libellés savants relevés par l’audit).
- « Photosynthèse » est un terme `base` (cycle 3) ; échanges gazeux (dioxygène rejeté, CO2
  source de matière, respiration des plantes) → cycle 4.
- Symbioses (mycorhizes, nodosités, lichen, fixation d’azote), relations entre êtres vivants
  (défense, avertissement, dispersion), pollutions et dynamique des populations → cycle 4.
- Reconnaissance d’espèces, régimes alimentaires, cycles de vie, consignes de sécurité,
  gestes de jardinage → cycle 3.

**Questions passées au lycée : 22** (le prompt annonçait « une trentaine ») : les cinq citées
(QF9220, QF9222, QF9237, QF9250, QF9256), les termes `avance` du glossaire (biocénose, niche
écologique, hétérotrophe, angiosperme, commensalisme, bioindicateur), les familles en -idés,
la nitrification (QF9530, QF9701, QF9706, par cohérence avec QF9237 — revue de la catégorie
`cycle_azote_aquaponie` : le reste y est au cycle 4 ou 3), et QF9219 (molécule), QF9229
(génétique F1), QF9234 (H2S), QF9235 (pH et fer), QF9239 (kg N/ha). Les autres questions jugées
difficiles restent au cycle 4 plutôt que de quitter le collège. **QF0020 reste active** (cycle 4 ;
D1 la retire de la séance).

**Ancrage explicite.** Les liaisons catégorie → notions de la prod (66) diffèrent de celles
qu’une base semée par les migrations reçoit (55), et quatre notions n’existent qu’en prod
(`C3-DEV`, `C3-MAT`, `C4-MICRO`, `C4-REPRO`, créées dans l’application). Pour que le palier ne
dépende pas de ces liaisons, la migration pose un `ajout` explicite pour chaque notion du palier
retenu qui ne venait que de la catégorie (sans effet en prod), et calcule les exclusions de
l’autre cycle sur les liaisons présentes au moment du rejeu. **À faire par SI** (hors
périmètre D3) : semer les quatre notions et les onze liaisons propres à la prod par une
migration de référentiel, et dédoublonner `C3-DEV` / `C3-DEVREPRO` et `C3-MAT` / `C3-MATORG`
(libellés identiques).

**Ajouts supprimés.** 59 lignes `ajout` de l’autre cycle (souvent `C3-ENV` / `C3-VIV` posés par
la migration du 20/11 sur des questions tranchées au cycle 4) et 14 sur les questions passées au
lycée : détail dans la colonne « Opérations ».

**À arbitrer (hors mandat D3, non modifié).**

- Questions collège à un seul cycle (59 au 21/11) : seule QF0377 (bioindicateur) est passée au
  lycée. Plusieurs questions « cycle 4 seul » de `ravageurs_auxiliaires` sont de niveau 6e
  (QF0070, QF0071, QF9251, QF9254, QF9258…) ; QF9920 (respiration des plantes, cycle 3) contredit
  QF9011 (même notion, tranchée au cycle 4).
- QF0527 invite à « cueillir » (règle de rédaction 1.8) : à réécrire.
- Réponses à reformuler : QF9206 et QF9208 (« Bank de graines »), QF9268 (« nœud-nourriture
  nommé »), QF9271.
- QF0503 (date erronée d’un panneau) et QF0532 (chiffre d’un panneau) : non rendues autonomes.

**Typographie.** Les énoncés réécrits et les descriptions collège portent des espaces
insécables (avant `; : ! ? %` et dans « »), conformément aux règles du chantier ; le corpus
existant emploie des espaces ordinaires.

**Preuve en lecture seule (prod, 21/11, après l’instantané).** 504 questions collège actives :
445 sur les deux cycles, 8 cycle 3 seul, 51 cycle 4 seul ; 482 lignes de notions ; aucune
`description_college` : état identique à l’instantané, la migration s’appliquera en entier.
Après la migration sur la base « instantané » : **0** question collège sur les deux cycles,
482 questions collège (330 au palier 1, 152 au palier 2), 255 de lycée.
