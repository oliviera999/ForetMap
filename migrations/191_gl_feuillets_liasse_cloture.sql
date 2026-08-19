-- =====================================================================
-- GL — La liasse du copiste, remise en fin de voyage
--
-- CONTEXTE. Sur les 40 feuillets de la liasse `copiste`, 14 sont déjà distribués
-- en jeu (8 `cop-bio-<biome>`, un par milieu ; 6 `cop-mov-<pays>`, l'entrée dans
-- chaque pays) : la voix du copiste ponctue donc déjà le voyage. Les 26 autres —
-- couverture, préface, origine, marginalia, inserts, les trois actes, la confession,
-- la finale et la clôture — n'étaient rattachés à rien, donc inatteignables.
--
-- Les éparpiller dans les pools des chapitres diluerait les feuillets de terrain,
-- ceux qui portent la biodiversité, alors que cette liasse est d'un autre ordre :
-- une réflexion *sur* l'histoire (nommer sert-il à quelque chose ? transmettre à qui
-- s'efface ?) et un arc moral en trois actes. Deux pages y sont même la **clé de
-- lecture de la fin** (`cop-finale`, `cop-close`) : le carnet de Sélène s'arrête sur
-- un mot suspendu, délibérément, et le copiste est le seul à le dire — les livrer
-- trop tôt dévoilerait la fin, ne jamais les livrer laisse croire à un feuillet manquant.
--
-- D'où le choix : la liasse est remise **en bloc, à la fin du voyage** (clôture d'une
-- partie du plateau 5), et à la demande du MJ pour une dernière séance.
--
-- Idempotente : l'ADD COLUMN rejoué renvoie l'errno 1060, ignoré par le runner, et
-- l'UPDATE est borné aux feuillets encore rattachés à rien.
-- =====================================================================

-- [1] Drapeau de remise, pendant de `offert_ouverture` (migration 178).
ALTER TABLE gl_lore_feuillets
  ADD COLUMN offert_cloture TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Remis a chaque equipe a la cloture du voyage (liasse du copiste)';

-- [2] La liasse du copiste encore hors de portée : ni biome, ni plateau, ni canal de
--     lien, donc dans aucun pool de chapitre. Piloté par la donnée (`liasse`), pas par
--     une liste de codes : un feuillet copiste ajouté plus tard, laissé sans rattachement,
--     rejoindra la liasse au rejeu de cette migration.
UPDATE gl_lore_feuillets
   SET offert_cloture = 1
 WHERE liasse = 'copiste'
   AND statut = 'actif'
   AND biome_slug IS NULL
   AND plateau_number IS NULL
   AND lien_canal IS NULL
   AND lien_pays IS NULL
   AND offert_ouverture = 0;

-- [3] Provenance « cloture », ajoutée **en fin** d'ENUM. Attention au sens du rejeu :
--     la migration 178 redéfinit la même colonne sans connaître cette valeur, donc la
--     rejouer APRÈS celle-ci la retirerait. Le runner applique les migrations dans
--     l'ordre des numéros et ne rejoue jamais en arrière ; un rejeu manuel doit suivre
--     le même ordre (MySQL stocke un ENUM par son index : réordonner ses valeurs
--     remapperait les lignes existantes). La provenance distingue, dans le carnet
--     et dans le journal de partie, un feuillet remis en fin de voyage d'un feuillet
--     trouvé, offert à l'ouverture ou reçu au Marché.
ALTER TABLE gl_game_feuillet_states
  MODIFY COLUMN unlocked_via
    ENUM('zone', 'manual', 'story', 'gemme', 'espece', 'echange', 'ouverture', 'cloture')
    DEFAULT NULL;
