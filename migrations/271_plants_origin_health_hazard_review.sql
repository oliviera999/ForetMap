-- Statut d'origine étendu, risque sanitaire et traçabilité de la validation des dangers.
--
-- 1) `origin_status` gagne `endemique` et `domestique`.
--    La migration 244 rabattait « endémique » sur « indigène » et n'avait aucune case pour
--    l'âne, la chèvre ou le chat. Or ce sont deux informations que le catalogue porte déjà :
--    l'arganier n'est pas seulement indigène au Maroc, il n'existe nulle part ailleurs ; et
--    un animal de ferme n'est ni indigène, ni introduit au sens des invasions biologiques.
--    Les deux valeurs s'ajoutent en fin d'ENUM : aucune ligne existante ne change.
--
-- 2) `health_risk` / `health_notes` — le risque SANITAIRE, distinct de la toxicité.
--    `toxicity_level` (migration 251) répond à « qu'est-ce que cette espèce me fait si je la
--    touche ou la mange ». La rage, le tétanos, la salmonellose ou la leptospirose ne sont pas
--    ça : l'animal n'est pas toxique, il est porteur. Écrire « mortel » sur la fiche du renard
--    serait faux et rendrait la pastille de toxicité illisible sur tout le catalogue animal.
--    Un SET et non un ENUM : le chat cumule rage et toxoplasmose.
--
-- 3) `hazard_reviewed_by` / `hazard_reviewed_at` — qui a validé, et quand.
--    `hazard_reviewed` (251) est un booléen anonyme : une fiche « validée » ne dit pas par qui
--    ni à quelle date, donc une relecture ne peut être ni vérifiée ni datée. Le lien vers
--    `users` est en ON DELETE SET NULL : le départ d'un enseignant ne dévalide pas la fiche,
--    elle perd seulement son relecteur (même règle que `map_species.first_record_by`).
--
-- Un ALTER par colonne : errno 1060 (colonne déjà présente) est ignoré instruction par
-- instruction par database.js, donc un lot groupé perdrait les colonnes suivantes si la
-- première existait déjà. Idem errno 1022 / 1826 pour la contrainte.
ALTER TABLE plants
  MODIFY COLUMN origin_status ENUM('indigene','introduit','envahissant','endemique','domestique') DEFAULT NULL
    COMMENT 'Statut biogéographique pédagogique (indigène / introduit / envahissant / endémique / domestique)';

ALTER TABLE plants
  ADD COLUMN health_risk SET('rage','tetanos','salmonellose','leptospirose','toxoplasmose','vecteur','allergie') DEFAULT NULL
    COMMENT 'Risque sanitaire transmissible, distinct de la toxicité propre à l''espèce';
ALTER TABLE plants
  ADD COLUMN health_notes TEXT DEFAULT NULL
    COMMENT 'Circonstances du risque sanitaire et conduite à tenir';
ALTER TABLE plants
  ADD COLUMN hazard_reviewed_by VARCHAR(64) DEFAULT NULL
    COMMENT 'users.id de l''enseignant qui a validé les dangers de la fiche';
ALTER TABLE plants
  ADD COLUMN hazard_reviewed_at DATETIME DEFAULT NULL
    COMMENT 'Date de validation des dangers de la fiche';

ALTER TABLE plants
  ADD CONSTRAINT fk_plants_hazard_reviewed_by
    FOREIGN KEY (hazard_reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- Le panneau prof « dangers à valider » filtre sur ce drapeau ; l'index évite un balayage
-- complet du catalogue à chaque ouverture de la base biodiversité.
CREATE INDEX idx_plants_hazard_reviewed ON plants (hazard_reviewed);

-- ---------------------------------------------------------------------------
-- Amorçage (sql/biodiv_structure_seeds/02_statuts_risques.sql)
--
-- Chaque UPDATE est borné par la valeur actuelle (`IS NULL`, ou `indigene` pour les
-- endémiques) : rejouer la migration ne réécrit jamais par-dessus une saisie d'enseignant.
-- Les identifiants de fiche sont doublés du nom attendu, pour qu'un catalogue renuméroté ne
-- pose pas un statut sur la mauvaise espèce.
--
-- `hazard_reviewed_by` est laissé NULL : le pré-remplissage est bibliographique, aucun compte
-- ne l'a relu. Seule la date de constitution du lot est posée sur les fiches déjà validées.
-- ---------------------------------------------------------------------------

-- Endémiques du Maroc ou d'Afrique du Nord
UPDATE plants SET origin_status = 'endemique' WHERE id = 117 AND name = 'Arganier' AND (origin_status IS NULL OR origin_status = 'indigene');
UPDATE plants SET origin_status = 'endemique' WHERE id = 527 AND name = 'Discoglosse peint du Maroc' AND (origin_status IS NULL OR origin_status = 'indigene');
UPDATE plants SET origin_status = 'endemique' WHERE id = 315 AND name = 'Rougequeue de Moussier' AND (origin_status IS NULL OR origin_status = 'indigene');
UPDATE plants SET origin_status = 'endemique' WHERE id = 443 AND name = 'Narcisse de Broussonet' AND (origin_status IS NULL OR origin_status = 'indigene');
UPDATE plants SET origin_status = 'endemique' WHERE id = 148 AND name = 'Crapaud de Maurétanie' AND (origin_status IS NULL OR origin_status = 'indigene');
UPDATE plants SET origin_status = 'endemique' WHERE id = 528 AND name = 'Crapaud vert d''Afrique du Nord' AND (origin_status IS NULL OR origin_status = 'indigene');
UPDATE plants SET origin_status = 'endemique' WHERE id = 529 AND name = 'Grenouille verte d''Afrique du Nord' AND (origin_status IS NULL OR origin_status = 'indigene');

-- Espèces domestiques
UPDATE plants SET origin_status = 'domestique' WHERE id = 588 AND name = 'Âne' AND origin_status IS NULL;
UPDATE plants SET origin_status = 'domestique' WHERE id = 590 AND name = 'Cheval Barbe' AND origin_status IS NULL;
UPDATE plants SET origin_status = 'domestique' WHERE id = 587 AND name = 'Chèvre' AND origin_status IS NULL;
UPDATE plants SET origin_status = 'domestique' WHERE id = 586 AND name = 'Mouton (race Sardi)' AND origin_status IS NULL;
UPDATE plants SET origin_status = 'domestique' WHERE id = 591 AND name = 'Mulet' AND origin_status IS NULL;
UPDATE plants SET origin_status = 'domestique' WHERE id = 589 AND name = 'Vache' AND origin_status IS NULL;
UPDATE plants SET origin_status = 'domestique' WHERE id = 40 AND name = 'Chat' AND origin_status IS NULL;

-- Risques sanitaires (distincts de la toxicité)
UPDATE plants SET health_risk = 'rage,toxoplasmose', health_notes = 'Au Maroc, la rage circule chez les carnivores domestiques et sauvages : ne jamais approcher ni toucher l''animal ; toute morsure ou griffure impose une consultation médicale immédiate. Le chat peut transmettre la toxoplasmose (litière, sol souillé) : lavage des mains après contact.' WHERE id = 40 AND name = 'Chat' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'vecteur', health_notes = 'Au Maroc, ce moustique peut transmettre le virus du Nil occidental.' WHERE id = 81 AND name = 'Moustique commun' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'tetanos', health_notes = 'Terre, compost et déjections peuvent contenir le bacille du tétanos : toute plaie souillée se nettoie et se désinfecte ; vaccination antitétanique à jour.' WHERE id = 91 AND name = 'Compost et épluchures' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'tetanos', health_notes = 'Terre, compost et déjections peuvent contenir le bacille du tétanos : toute plaie souillée se nettoie et se désinfecte ; vaccination antitétanique à jour.' WHERE id = 96 AND name = 'Crottes et fientes' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'allergie', health_notes = 'Pollen allergisant : prévenir les élèves allergiques lors des sorties en période de floraison.' WHERE id = 115 AND name = 'Olivier' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'rage', health_notes = 'Les chauves-souris peuvent porter des virus apparentés à la rage : ne jamais les manipuler à mains nues ; toute morsure impose une consultation médicale immédiate.' WHERE id = 147 AND name = 'Pipistrelle commune' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'rage', health_notes = 'Les chauves-souris peuvent porter des virus apparentés à la rage : ne jamais les manipuler à mains nues ; toute morsure impose une consultation médicale immédiate.' WHERE id = 320 AND name = 'Pipistrelle de Kuhl' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'vecteur', health_notes = 'Transporte des germes sur ses pattes : couvrir les déchets et le compost frais.' WHERE id = 344 AND name = 'Mouche domestique' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'allergie', health_notes = 'Pollen allergisant : prévenir les élèves allergiques lors des sorties en période de floraison.' WHERE id = 375 AND name = 'Pariétaire de Mauritanie' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'salmonellose', health_notes = 'Les tortues portent souvent des salmonelles : se laver les mains après tout contact avec l''animal ou son eau.' WHERE id = 532 AND name = 'Émyde lépreuse' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'salmonellose', health_notes = 'Les tortues portent souvent des salmonelles : se laver les mains après tout contact avec l''animal ou son eau.' WHERE id = 533 AND name = 'Tortue mauresque' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'rage', health_notes = 'Au Maroc, la rage circule chez les carnivores domestiques et sauvages : ne jamais approcher ni toucher l''animal ; toute morsure ou griffure impose une consultation médicale immédiate.' WHERE id = 535 AND name = 'Renard roux' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'rage', health_notes = 'Au Maroc, la rage circule chez les carnivores domestiques et sauvages : ne jamais approcher ni toucher l''animal ; toute morsure ou griffure impose une consultation médicale immédiate.' WHERE id = 536 AND name = 'Belette' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'leptospirose', health_notes = 'Les rongeurs peuvent transmettre la leptospirose par leur urine : ne pas toucher l''eau ou le sol souillés à mains nues.' WHERE id = 539 AND name = 'Rat rayé' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'allergie', health_notes = 'Pollen allergisant : prévenir les élèves allergiques lors des sorties en période de floraison.' WHERE id = 577 AND name = 'Oléastre (olivier sauvage)' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'rage', health_notes = 'Au Maroc, la rage circule chez les carnivores domestiques et sauvages : ne jamais approcher ni toucher l''animal ; toute morsure ou griffure impose une consultation médicale immédiate.' WHERE id = 593 AND name = 'Loup doré africain (chacal)' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'rage', health_notes = 'Au Maroc, la rage circule chez les carnivores domestiques et sauvages : ne jamais approcher ni toucher l''animal ; toute morsure ou griffure impose une consultation médicale immédiate.' WHERE id = 594 AND name = 'Mangouste ichneumon' AND health_risk IS NULL;
UPDATE plants SET health_risk = 'rage', health_notes = 'Au Maroc, la rage circule chez les carnivores domestiques et sauvages : ne jamais approcher ni toucher l''animal ; toute morsure ou griffure impose une consultation médicale immédiate.' WHERE id = 595 AND name = 'Genette commune' AND health_risk IS NULL;

-- Traçabilité des validations antérieures : la date de constitution du lot, faute de mieux.
UPDATE plants SET hazard_reviewed_at = '2026-09-22 12:00:00' WHERE hazard_reviewed = 1 AND hazard_reviewed_at IS NULL;
