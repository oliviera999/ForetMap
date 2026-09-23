-- Horodatage des commentaires à la **milliseconde**.
--
-- Le défaut. `context_comments.created_at` était un `DATETIME` — précision à la seconde — et
-- `id` porte un UUID tiré au hasard. Or les deux requêtes qui ordonnent les messages trient
-- par `created_at DESC, id DESC` : quand deux messages tombent dans la **même seconde**, le
-- départage se fait sur un UUID, c'est-à-dire au hasard. Ce n'est pas un cas de bord — c'est
-- le cas courant d'un échange vif entre un professeur et un élève, mesuré à quatre exécutions
-- sur six du test `context-comments /counts`.
--
-- Deux conséquences visibles, pas une :
--   1. **L'ordre d'affichage du fil** peut inverser deux messages de la même seconde ;
--   2. le **marqueur du dernier message** (résumé `/counts`, badge « non lus ») pouvait
--      désigner l'avant-dernier, donc ne pas bouger à l'arrivée du dernier.
--
-- Pourquoi la précision plutôt qu'une colonne de séquence. Une colonne `AUTO_INCREMENT`
-- dédiée corrigerait aussi le tri, mais elle ajoute une clé, un index et un concept à une
-- table déjà partagée avec G&L. Passer l'horodatage à la milliseconde corrige la **cause**
-- (deux écritures indiscernables) sans changer une seule requête : `ORDER BY created_at DESC`
-- redevient discriminant de lui-même. Deux messages dans la même milliseconde supposeraient
-- deux requêtes HTTP traitées dans le même millième de seconde sur le même contexte.
--
-- Le DEFAULT doit être requalifié en `CURRENT_TIMESTAMP(3)` : `CURRENT_TIMESTAMP` sans
-- argument rendrait une valeur à la seconde, et la colonne élargie ne servirait à rien.
--
-- Les lignes **existantes** gardent `.000` : leur ordre relatif à l'intérieur d'une seconde
-- reste ce qu'il est. C'est de l'historique déjà écrit, et le rattraper n'aurait aucun sens —
-- l'information de l'ordre réel n'existe nulle part.
--
-- Idempotent : `MODIFY COLUMN` rejoué sur une colonne déjà au bon type est sans effet.
-- Coût : reconstruction de la table (changement de type), à la charge d'une table qui porte
-- les commentaires et les messages de lieu — quelques milliers de lignes au plus.

ALTER TABLE context_comments
  MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    COMMENT 'Précision milliseconde (migration 278) : départage deux messages de la même seconde';
