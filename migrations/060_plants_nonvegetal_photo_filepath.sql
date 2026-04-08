-- Photos catalogue : liens directs Special:FilePath pour fiches non végétales
-- (animaux, bactéries) dont les champs photo* avaient été vidés par 012 ou ne
-- passaient pas le rendu « image directe ». Noms de fichiers vérifiés sur Commons.
-- Planorbe / Pléco : cohérents avec 014 (réapplication idempotente).

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Goldfish3.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Goldfish3.jpg'
WHERE name = 'Poisson rouge commun' AND scientific_name = 'Carassius auratus';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cyprinus_carpio.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cyprinus_carpio.jpg'
WHERE name = 'Carpe Koï' AND scientific_name = 'Cyprinus carpio';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Gyrinocheilus_aymonieri.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Gyrinocheilus_aymonieri.jpg'
WHERE name = 'Poisson indien mangeur d''algues' AND scientific_name = 'Gyrinocheilus aymonieri';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Gambusia_affinis.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Gambusia_affinis.jpg'
WHERE name = 'Gambusie' AND scientific_name = 'Gambusia affinis';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Oreochromis_niloticus.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Oreochromis_niloticus.jpg'
WHERE name = 'Tilapia du Nil' AND scientific_name = 'Oreochromis niloticus';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Naturalis_Biodiversity_Center_-_RMNH.MOL.150271_-_Neritina_spec._-_Neritidae_-_Mollusc_shell.jpeg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Naturalis_Biodiversity_Center_-_RMNH.MOL.150271_-_Neritina_spec._-_Neritidae_-_Mollusc_shell.jpeg'
WHERE name = 'Nérite tacheté' AND scientific_name = 'Neritina turrita';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Planorbarius_corneus_001.JPG',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Planorbarius_corneus_001.JPG'
WHERE name = 'Planorbe' AND scientific_name = 'Planorbarius corneus';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/2014_08_01_Wasserschnecke2.JPG',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/2014_08_01_Wasserschnecke2.JPG'
WHERE name = 'Limnée' AND scientific_name = 'Lymnaea sp.';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Compost_with_worms.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Compost_with_worms.jpg'
WHERE name = 'Vers de terre' AND scientific_name = 'Eisenia sp.';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Lasius_niger.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Lasius_niger.jpg'
WHERE name = 'Fourmi' AND scientific_name = 'Lasius niger';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Apis_mellifera.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Apis_mellifera.jpg'
WHERE name = 'Abeille' AND scientific_name = 'Anthophila sp.';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/TEM_Image_of_Nitrobacter_winogradskyi_str._Nb-255.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/TEM_Image_of_Nitrobacter_winogradskyi_str._Nb-255.jpg'
WHERE name = 'Nitrobacter' AND scientific_name = 'Nitrobacter sp.';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Aquarium-NitrogenCycle.png',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Aquarium-NitrogenCycle.png'
WHERE name = 'Nitrospira' AND scientific_name = 'Nitrospira sp.';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/PDB_1iqc_EBI.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/PDB_1iqc_EBI.jpg'
WHERE name = 'Nitrosomonas' AND scientific_name = 'Nitrosomonas sp.';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Sapu-sapu_(Hypostomus_Plecostomus).jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Sapu-sapu_(Hypostomus_Plecostomus).jpg'
WHERE name = 'Pléco albinos' AND scientific_name = 'Hypostomus plecostomus';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cat_November_2010-1a.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cat_November_2010-1a.jpg'
WHERE name = 'Chat' AND scientific_name = 'Felis catus';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/African_mantis.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/African_mantis.jpg'
WHERE name = 'Mante religieuse africaine' AND scientific_name = 'Sphodromantis viridis';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Carausius_morosus.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Carausius_morosus.jpg'
WHERE name = 'Phasme morose' AND scientific_name = 'Carausius morosus';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Blatella_germanica_001.JPG',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Blatella_germanica_001.JPG'
WHERE name = 'Blatte germanique' AND scientific_name = 'Blattella germanica';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Compost_with_worms.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Compost_with_worms.jpg'
WHERE name = 'Ver de lombricompost' AND scientific_name = 'Eisenia fetida';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Argiope_bruennichi.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Argiope_bruennichi.jpg'
WHERE name = 'Argiope' AND scientific_name = 'Argiope bruennichi';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/2016.07.07.-01-Felde--Grosser_Kohlweissling.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/2016.07.07.-01-Felde--Grosser_Kohlweissling.jpg'
WHERE name = 'Piéride du chou' AND scientific_name = 'Pieris brassicae';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Armadillidium_vulgare_(18670779364).jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Armadillidium_vulgare_(18670779364).jpg'
WHERE name = 'Cloporte' AND scientific_name = 'Armadillidium vulgare';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Myzus_persicae.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Myzus_persicae.jpg'
WHERE name = 'Puceron' AND scientific_name = 'Myzus persicae';

UPDATE plants SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Planococcus_citri_2.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Planococcus_citri_2.jpg'
WHERE name = 'Cochenille' AND scientific_name = 'Planococcus citri';
