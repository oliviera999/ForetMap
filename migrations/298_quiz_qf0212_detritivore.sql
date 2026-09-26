-- Reformulation de la question QF0212 (« lequel est un décomposeur ? » → le cloporte).
--
-- Depuis la migration 295 (rôle trophique `detritivore`), la fiche du cloporte le classe
-- « détritivore » : la question contredisait la fiche. Décision du mainteneur du 25/09/2026 :
-- reformuler. La question reste rattachée aux termes « décomposeur » (FM0015) et
-- « détritivore » (FM0035) : l'énoncé porte sur la décomposition, et les explications
-- distinguent celui qui fragmente la matière morte de ceux qui la minéralisent.
--
-- Gardée par l'ancien énoncé : un texte déjà retouché à la main n'est pas écrasé.
-- Idempotent. Aucune table `gl_*`.

UPDATE quiz_questions
   SET question = 'Parmi ces êtres vivants, lequel participe à la décomposition en fragmentant la matière morte ?',
       feedback_correct = 'Oui ! Le cloporte est un détritivore : il fragmente les feuilles mortes et le bois. Les décomposeurs (bactéries, champignons) transforment ensuite ces débris en sels minéraux.',
       feedback_a = 'Oui ! Le cloporte est un détritivore : il fragmente les feuilles mortes et le bois. Les décomposeurs (bactéries, champignons) transforment ensuite ces débris en sels minéraux.',
       feedback_b = 'L''abeille est un pollinisateur : elle se nourrit de nectar et de pollen, pas de matière morte.',
       feedback_c = 'La tomate est un producteur : elle fabrique sa matière grâce à la lumière.',
       feedback_d = 'Le tilapia est un poisson consommateur : il ne fragmente pas la matière morte du sol.',
       updated_at = NOW()
 WHERE question_code = 'QF0212'
   AND question = 'Parmi ces êtres vivants, lequel est un décomposeur ?';
