-- 341 — G&L « Tenir à deux » : Relance annule le jet (9 novembre 2026).
--
-- Relance ne « rejoue » plus les dés par-dessus un jet déjà appliqué : après un jet, tant que
-- l'équipe peut lancer Relance, la case d'arrivée s'affiche sans s'appliquer
-- (`lib/glArriveeSuspendue.js`). Relance annule alors ce jet — la mascotte revient sur sa case
-- de départ, la case d'arrivée ne s'applique jamais — et l'équipe rejette les dés. Le texte de
-- la fiche, semé par la migration 333 depuis `data/gl/tenir/sorts.json`, suit la règle.
-- Idempotent : la clause WHERE ne retient que l'ancien texte exact du sort v2.
UPDATE gl_spells
   SET effet_court = 'annule le jet : la mascotte revient, la case d’arrivée ne s’applique pas, l’équipe rejette les dés',
       updated_at = NOW()
 WHERE spell_code = 'SL005'
   AND tenir_v2 = 1
   AND effet_court = 'rejoue les dés (serveur) ou autorise une nouvelle saisie';
