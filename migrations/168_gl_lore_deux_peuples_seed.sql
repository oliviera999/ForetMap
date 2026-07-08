-- G1 — « Les deux peuples du seuil » : intégration versionnée du socle narratif
-- (docs/reference/gl/lore-deux-peuples.md) dans les contenus du jeu.
-- Non destructif : INSERT IGNORE uniquement — une page ou un feuillet déjà présent
-- (même slug / même code) n'est jamais écrasé, l'éditorial en base fait foi.

INSERT IGNORE INTO gl_content_pages (slug, title, body_markdown, updated_by)
VALUES (
  'deux-peuples',
  'Pourquoi Gnomes & Licornes ?',
  'On ne traverse pas le miroir avec ses mains d''écolier.\n\nDe l''autre côté, ceux qui viennent aider Sélène prennent une forme. Certains se réveillent **gnomes** : petits, lourds de patience, le nez à hauteur des racines. Rien ne leur échappe de ce qui pousse, rampe, creuse et décompose. Les autres se réveillent **licornes** : hautes, vives, la crinière pleine de vent. Elles entendent les histoires que les territoires se racontent, et s''en souviennent.\n\nLe Souffle, lui, mange les noms. Quand un nom disparaît, la chose et son histoire se séparent : le gnome retrouve la chose, la licorne retrouve l''histoire. **Aucun des deux ne peut réécrire une page seul.** C''est le pacte du seuil : deux peuples, deux regards, un seul carnet.\n\nÀ chaque frontière de biome, le seuil défait la forme et en donne une autre — celle dont le prochain territoire aura besoin. Ne soyez pas surpris de changer de compagnon en chemin : Sélène elle-même a marché tantôt gnome, tantôt licorne, de la chaleur de l''équateur jusqu''à la glace du pôle.\n\nChoisissez une chose vivante. Regardez-la comme un gnome. Racontez-la comme une licorne. Le carnet fera le reste.',
  'seed:G1'
);

INSERT IGNORE INTO gl_lore_feuillets
  (feuillet_code, type, titre, signature, idee_cle, texte, mode_apparition, ordre_recit, statut)
VALUES
  (
    'GL2P-01',
    'feuillet',
    'Le pacte du seuil',
    'le passeur',
    'Le seuil donne à chacun la forme dont le prochain territoire aura besoin.',
    'Le premier seuil est le plus étrange. On y entre avec ses habitudes, on en sort avec une forme. Ne la choisissez pas — elle vous choisit, selon ce que le prochain territoire demandera. Un désert veut des gnomes qui savent lire l''ombre des pierres. Une savane veut des licornes qui savent où courent les troupeaux depuis mille ans. Le seuil sait. Passez.',
    'preface',
    1,
    'actif'
  ),
  (
    'GL2P-02',
    'feuillet',
    'Ce que voit un gnome',
    'Sélène, forme gnome',
    'Le regard gnome : observer, compter, mesurer — mais une page sans histoire reste fragile.',
    'Aujourd''hui j''étais gnome. J''ai passé la matinée sous une feuille morte : il y a là-dessous plus d''habitants que dans toute une ville. J''ai compté, gratté, senti. J''ai noté des chiffres — hauteur, humidité, petites bêtes au décimètre carré. Le soir, ma page était solide comme un caillou. Mais il lui manquait quelque chose : elle ne racontait rien. Le Souffle n''aime pas les chiffres, il rôde autour des pages muettes. Demain, il me faudra une histoire.',
    'boite',
    2,
    'actif'
  ),
  (
    'GL2P-03',
    'feuillet',
    'Ce que garde une licorne',
    'Sélène, forme licorne',
    'Le regard licorne : relier et raconter — mais une histoire sans preuves reste fragile.',
    'Aujourd''hui j''étais licorne. Du haut de la crête, j''ai vu le territoire entier se raconter : où l''eau passe, où les graines voyagent, qui mange qui et qui aide qui. J''ai écrit une histoire magnifique — et fausse, peut-être, par endroits. Une histoire sans preuves est une porte ouverte au Souffle. Demain, il me faudra des mains de gnome pour vérifier chaque phrase au ras du sol.',
    'boite',
    3,
    'actif'
  ),
  (
    'GL2P-04',
    'feuillet',
    'Les formes de Sélène',
    'le copiste',
    'Sélène a porté les deux formes : les pages qui résistent au Souffle mêlent mesures et récit.',
    'On me demande souvent : Sélène était-elle gnome ou licorne ? J''ai recopié tout son carnet, et voici ma réponse : elle était le passage de l''un à l''autre. Les plus belles pages — celles que le Souffle n''a jamais pu mordre — sont écrites des deux écritures à la fois : la petite, serrée, pleine de mesures ; et la grande, penchée, pleine de vent. Faites comme elle. Changez de forme sans regret à chaque seuil, et prêtez votre regard à l''autre peuple.',
    'boite',
    4,
    'actif'
  );
