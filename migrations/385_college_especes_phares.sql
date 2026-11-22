SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Chantier collège (novembre 2026), flux D6 : espèces phares et descriptions collège.
--
-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-d6-migration.js à partir de
-- data/college-2026-11/d6/*.json : ne pas modifier à la main.
--
--   1. `map_species.is_featured` = 1 pour 12 à 20 espèces par carte (registre de
--      présence) : visibles à l'œil nu ou à la boîte-loupe, communes, présence
--      attendue de préférence, groupes variés, aucune espèce toxique ou mortelle.
--   2. `plants.description_college` : deux phrases courtes (35 mots au plus) pour
--      chaque espèce phare, une seule par espèce même présente sur plusieurs cartes.
--
-- Clé naturelle (nom + nom scientifique) : une fiche ou une présence absente est
-- sautée sans erreur. Gardes : is_featured passe de 0 à 1 seulement ; la
-- description n'est posée que si elle est vide (une saisie dans l'application est
-- conservée). Idempotent, rejouable ; aucun trigger, aucun DEFINER, aucune donnée
-- personnelle, aucune table `gl_*`.
-- =====================================================================

-- 1. Espèces phares par carte

-- beaulieu : 2 espèce(s)
UPDATE map_species ms
  JOIN plants p ON p.id = ms.plant_id
   SET ms.is_featured = 1
 WHERE ms.map_id = 'beaulieu'
   AND ms.is_featured = 0
   AND (
        (p.name = 'Rougequeue noir' AND p.scientific_name <=> 'Phoenicurus ochruros')
     OR (p.name = 'Huppe fasciée' AND p.scientific_name <=> 'Upupa epops')
   );

-- dayat : 16 espèce(s)
UPDATE map_species ms
  JOIN plants p ON p.id = ms.plant_id
   SET ms.is_featured = 1
 WHERE ms.map_id = 'dayat'
   AND ms.is_featured = 0
   AND (
        (p.name = 'Foulque macroule' AND p.scientific_name <=> 'Fulica atra')
     OR (p.name = 'Gallinule poule-d''eau' AND p.scientific_name <=> 'Gallinula chloropus')
     OR (p.name = 'Échasse blanche' AND p.scientific_name <=> 'Himantopus himantopus')
     OR (p.name = 'Aigrette garzette' AND p.scientific_name <=> 'Egretta garzetta')
     OR (p.name = 'Canard colvert' AND p.scientific_name <=> 'Anas platyrhynchos')
     OR (p.name = 'Roseau commun' AND p.scientific_name <=> 'Phragmites australis')
     OR (p.name = 'Massette à larges feuilles' AND p.scientific_name <=> 'Typha latifolia')
     OR (p.name = 'Tamaris' AND p.scientific_name <=> 'Tamarix aphylla')
     OR (p.name = 'Libellule écarlate' AND p.scientific_name <=> 'Crocothemis erythraea')
     OR (p.name = 'Trithémis pourpré' AND p.scientific_name <=> 'Trithemis annulata')
     OR (p.name = 'Piéride de la rave' AND p.scientific_name <=> 'Pieris rapae')
     OR (p.name = 'Caragouille rosée' AND p.scientific_name <=> 'Theba pisana')
     OR (p.name = 'Grenouille verte d''Afrique du Nord' AND p.scientific_name <=> 'Pelophylax saharicus')
     OR (p.name = 'Émyde lépreuse' AND p.scientific_name <=> 'Mauremys leprosa')
     OR (p.name = 'Gambusie' AND p.scientific_name <=> 'Gambusia affinis')
     OR (p.name = 'Psammodrome algire' AND p.scientific_name <=> 'Psammodromus algirus')
   );

-- foret : 17 espèce(s)
UPDATE map_species ms
  JOIN plants p ON p.id = ms.plant_id
   SET ms.is_featured = 1
 WHERE ms.map_id = 'foret'
   AND ms.is_featured = 0
   AND (
        (p.name = 'Basilic' AND p.scientific_name <=> 'Ocimum basilicum')
     OR (p.name = 'Pourpier' AND p.scientific_name <=> 'Portulaca oleracea')
     OR (p.name = 'Mauve à petites fleurs' AND p.scientific_name <=> 'Malva parviflora')
     OR (p.name = 'Laiteron maraîcher' AND p.scientific_name <=> 'Sonchus oleraceus')
     OR (p.name = 'Coccinelle des friches' AND p.scientific_name <=> 'Hippodamia variegata')
     OR (p.name = 'Machaon' AND p.scientific_name <=> 'Papilio machaon')
     OR (p.name = 'Belle-Dame' AND p.scientific_name <=> 'Vanessa cardui')
     OR (p.name = 'Xylocope violet' AND p.scientific_name <=> 'Xylocopa violacea')
     OR (p.name = 'Éristale gluant' AND p.scientific_name <=> 'Eristalis tenax')
     OR (p.name = 'Libellule écarlate' AND p.scientific_name <=> 'Crocothemis erythraea')
     OR (p.name = 'Bulbul des jardins' AND p.scientific_name <=> 'Pycnonotus barbatus')
     OR (p.name = 'Moineau domestique' AND p.scientific_name <=> 'Passer domesticus')
     OR (p.name = 'Chardonneret élégant' AND p.scientific_name <=> 'Carduelis carduelis')
     OR (p.name = 'Caragouille rosée' AND p.scientific_name <=> 'Theba pisana')
     OR (p.name = 'Cloporte poudré' AND p.scientific_name <=> 'Porcellionides pruinosus')
     OR (p.name = 'Argiope à bandes' AND p.scientific_name <=> 'Argiope trifasciata')
     OR (p.name = 'Ver de compost' AND p.scientific_name <=> 'Eisenia fetida')
   );

-- lyautey : 17 espèce(s)
UPDATE map_species ms
  JOIN plants p ON p.id = ms.plant_id
   SET ms.is_featured = 1
 WHERE ms.map_id = 'lyautey'
   AND ms.is_featured = 0
   AND (
        (p.name = 'Mauve à petites fleurs' AND p.scientific_name <=> 'Malva parviflora')
     OR (p.name = 'Laiteron maraîcher' AND p.scientific_name <=> 'Sonchus oleraceus')
     OR (p.name = 'Pourpier' AND p.scientific_name <=> 'Portulaca oleracea')
     OR (p.name = 'Bulbul des jardins' AND p.scientific_name <=> 'Pycnonotus barbatus')
     OR (p.name = 'Moineau domestique' AND p.scientific_name <=> 'Passer domesticus')
     OR (p.name = 'Tourterelle turque' AND p.scientific_name <=> 'Streptopelia decaocto')
     OR (p.name = 'Martinet pâle' AND p.scientific_name <=> 'Apus pallidus')
     OR (p.name = 'Faucon crécerelle' AND p.scientific_name <=> 'Falco tinnunculus')
     OR (p.name = 'Souci' AND p.scientific_name <=> 'Colias croceus')
     OR (p.name = 'Machaon' AND p.scientific_name <=> 'Papilio machaon')
     OR (p.name = 'Xylocope violet' AND p.scientific_name <=> 'Xylocopa violacea')
     OR (p.name = 'Coccinelle des friches' AND p.scientific_name <=> 'Hippodamia variegata')
     OR (p.name = 'Libellule écarlate' AND p.scientific_name <=> 'Crocothemis erythraea')
     OR (p.name = 'Argiope à bandes' AND p.scientific_name <=> 'Argiope trifasciata')
     OR (p.name = 'Caragouille rosée' AND p.scientific_name <=> 'Theba pisana')
     OR (p.name = 'Xanthorie des murailles' AND p.scientific_name <=> 'Xanthoria parietina')
     OR (p.name = 'Pipistrelle de Kuhl' AND p.scientific_name <=> 'Pipistrellus kuhlii')
   );

-- melah : 16 espèce(s)
UPDATE map_species ms
  JOIN plants p ON p.id = ms.plant_id
   SET ms.is_featured = 1
 WHERE ms.map_id = 'melah'
   AND ms.is_featured = 0
   AND (
        (p.name = 'Blé tendre' AND p.scientific_name <=> 'Triticum aestivum')
     OR (p.name = 'Pois chiche' AND p.scientific_name <=> 'Cicer arietinum')
     OR (p.name = 'Massette' AND p.scientific_name <=> 'Typha sp.')
     OR (p.name = 'Tamaris de France' AND p.scientific_name <=> 'Tamarix gallica')
     OR (p.name = 'Héron garde-bœufs' AND p.scientific_name <=> 'Bubulcus ibis')
     OR (p.name = 'Huppe fasciée' AND p.scientific_name <=> 'Upupa epops')
     OR (p.name = 'Cigogne blanche' AND p.scientific_name <=> 'Ciconia ciconia')
     OR (p.name = 'Abeille domestique' AND p.scientific_name <=> 'Apis mellifera intermissa')
     OR (p.name = 'Libellule écarlate' AND p.scientific_name <=> 'Crocothemis erythraea')
     OR (p.name = 'Criquet égyptien' AND p.scientific_name <=> 'Anacridium aegyptium')
     OR (p.name = 'Bousier sacré' AND p.scientific_name <=> 'Scarabaeus sacer')
     OR (p.name = 'Escargot petit-gris' AND p.scientific_name <=> 'Cornu aspersum')
     OR (p.name = 'Grenouille verte d''Afrique du Nord' AND p.scientific_name <=> 'Pelophylax saharicus')
     OR (p.name = 'Gambusie' AND p.scientific_name <=> 'Gambusia affinis')
     OR (p.name = 'Psammodrome algire' AND p.scientific_name <=> 'Psammodromus algirus')
     OR (p.name = 'Hérisson d’Algérie' AND p.scientific_name <=> 'Atelerix algirus')
   );

-- n3 : 16 espèce(s)
UPDATE map_species ms
  JOIN plants p ON p.id = ms.plant_id
   SET ms.is_featured = 1
 WHERE ms.map_id = 'n3'
   AND ms.is_featured = 0
   AND (
        (p.name = 'Martinet pâle' AND p.scientific_name <=> 'Apus pallidus')
     OR (p.name = 'Hirondelle de fenêtre' AND p.scientific_name <=> 'Delichon urbicum')
     OR (p.name = 'Bergeronnette grise' AND p.scientific_name <=> 'Motacilla alba')
     OR (p.name = 'Coccinelle des friches' AND p.scientific_name <=> 'Hippodamia variegata')
     OR (p.name = 'Libellule écarlate' AND p.scientific_name <=> 'Crocothemis erythraea')
     OR (p.name = 'Drosophile' AND p.scientific_name <=> 'Drosophila melanogaster')
     OR (p.name = 'Éristale gluant' AND p.scientific_name <=> 'Eristalis tenax')
     OR (p.name = 'Criquet à antennes rousses' AND p.scientific_name <=> 'Acanthacris ruficornis')
     OR (p.name = 'Mouche soldat noire' AND p.scientific_name <=> 'Hermetia illucens')
     OR (p.name = 'Cloporte poudré' AND p.scientific_name <=> 'Porcellionides pruinosus')
     OR (p.name = 'Géophile' AND p.scientific_name <=> 'Geophilomorpha')
     OR (p.name = 'Pholque de Pluche' AND p.scientific_name <=> 'Holocnemus pluchei')
     OR (p.name = 'Caragouille rosée' AND p.scientific_name <=> 'Theba pisana')
     OR (p.name = 'Pourpier' AND p.scientific_name <=> 'Portulaca oleracea')
     OR (p.name = 'Amarante verte' AND p.scientific_name <=> 'Amaranthus viridis')
     OR (p.name = 'Laiteron maraîcher' AND p.scientific_name <=> 'Sonchus oleraceus')
   );

-- sablettes : 16 espèce(s)
UPDATE map_species ms
  JOIN plants p ON p.id = ms.plant_id
   SET ms.is_featured = 1
 WHERE ms.map_id = 'sablettes'
   AND ms.is_featured = 0
   AND (
        (p.name = 'Goéland leucophée' AND p.scientific_name <=> 'Larus michahellis')
     OR (p.name = 'Bergeronnette grise' AND p.scientific_name <=> 'Motacilla alba')
     OR (p.name = 'Gravelot à collier interrompu' AND p.scientific_name <=> 'Charadrius alexandrinus')
     OR (p.name = 'Figue marine' AND p.scientific_name <=> 'Carpobrotus edulis')
     OR (p.name = 'Cakilier maritime' AND p.scientific_name <=> 'Cakile maritima')
     OR (p.name = 'Laitue de mer' AND p.scientific_name <=> 'Ulva spp.')
     OR (p.name = 'Fucus spiralé' AND p.scientific_name <=> 'Fucus spiralis')
     OR (p.name = 'Patelle rustique' AND p.scientific_name <=> 'Patella rustica')
     OR (p.name = 'Monodonte' AND p.scientific_name <=> 'Phorcus lineatus')
     OR (p.name = 'Pagure des rochers' AND p.scientific_name <=> 'Clibanarius erythropus')
     OR (p.name = 'Crabe marbré' AND p.scientific_name <=> 'Pachygrapsus marmoratus')
     OR (p.name = 'Anémone tomate' AND p.scientific_name <=> 'Actinia equina')
     OR (p.name = 'Oursin violet' AND p.scientific_name <=> 'Paracentrotus lividus')
     OR (p.name = 'Pimélie' AND p.scientific_name <=> 'Pimelia sp.')
     OR (p.name = 'Gobie paganel' AND p.scientific_name <=> 'Gobius paganellus')
     OR (p.name = 'Talitre (puce de mer)' AND p.scientific_name <=> 'Talitrus saltator')
   );

-- 2. Descriptions collège (une par espèce phare)

UPDATE plants SET description_college = 'Insecte au corps brun doré et velu, à quatre ailes, qui vit en colonie. En butinant le nectar et le pollen des fleurs, il les pollinise et produit du miel.'
 WHERE name = 'Abeille domestique' AND scientific_name <=> 'Apis mellifera intermissa'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit héron tout blanc au bec noir et aux pattes noires terminées par des doigts jaunes. Il agite ses pieds dans l''eau pour faire sortir ses proies.'
 WHERE name = 'Aigrette garzette' AND scientific_name <=> 'Egretta garzetta'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Plante aux feuilles ovales, souvent creusées au sommet, et aux fins épis de fleurs vertes. Elle pousse vite dans les potagers arrosés pendant la saison chaude.'
 WHERE name = 'Amarante verte' AND scientific_name <=> 'Amaranthus viridis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Anémone de mer rouge sombre qui se referme en boule gélatineuse à marée basse. Sous l''eau, elle déploie une couronne de tentacules qui piquent et retiennent ses proies.'
 WHERE name = 'Anémone tomate' AND scientific_name <=> 'Actinia equina'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Grande araignée dont la femelle, à l''abdomen argenté rayé de fines lignes noires, se tient tête en bas au centre de sa toile ronde. Elle capture des criquets et d''autres insectes.'
 WHERE name = 'Argiope à bandes' AND scientific_name <=> 'Argiope trifasciata'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Plante aromatique du potager aux feuilles vertes, ovales et très parfumées. Ses tiges sont carrées et ses petites fleurs blanches forment des épis au sommet.'
 WHERE name = 'Basilic' AND scientific_name <=> 'Ocimum basilicum'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Papillon orange saumon taché de noir, avec des taches blanches au bout des ailes avant. Il parcourt des milliers de kilomètres lors de grandes migrations.'
 WHERE name = 'Belle-Dame' AND scientific_name <=> 'Vanessa cardui'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Oiseau fin gris, noir et blanc, qui court au sol en agitant sans arrêt sa longue queue. Il mange des insectes et se voit surtout d''octobre à mars.'
 WHERE name = 'Bergeronnette grise' AND scientific_name <=> 'Motacilla alba'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Céréale aux tiges creuses coupées de nœuds et aux épis serrés qui portent les grains. Ses grains donnent la farine du pain.'
 WHERE name = 'Blé tendre' AND scientific_name <=> 'Triticum aestivum'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Gros coléoptère noir qui façonne des boules d''excréments et les roule à reculons avant de les enterrer. Il recycle les bouses des troupeaux et fertilise le sol.'
 WHERE name = 'Bousier sacré' AND scientific_name <=> 'Scarabaeus sacer'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Oiseau brun-gris à la tête noire, un peu plus petit qu''un merle, au chant flûté entendu toute la journée. Il mange des fruits et des insectes et disperse les graines.'
 WHERE name = 'Bulbul des jardins' AND scientific_name <=> 'Pycnonotus barbatus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Plante charnue du haut de plage, aux feuilles découpées et aux fleurs lilas à quatre pétales. Ses fruits flottent et sont transportés par la mer, et la plante retient les premiers sables.'
 WHERE name = 'Cakilier maritime' AND scientific_name <=> 'Cakile maritima'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Canard très commun, dont le mâle a la tête vert brillant et un collier blanc, et la femelle un plumage brun. Il se nourrit en basculant, la tête sous l''eau.'
 WHERE name = 'Canard colvert' AND scientific_name <=> 'Anas platyrhynchos'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Escargot à coquille blanc crème ornée de fines lignes brunes en spirale. En été, il reste collé en grappes sur les tiges et les murets, loin du sol brûlant.'
 WHERE name = 'Caragouille rosée' AND scientific_name <=> 'Theba pisana'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit oiseau à la face rouge vif et aux ailes noires barrées d''une bande jaune d''or. Il est granivore et se nourrit surtout des graines des chardons et d''autres plantes à capitules.'
 WHERE name = 'Chardonneret élégant' AND scientific_name <=> 'Carduelis carduelis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Très grand échassier blanc aux plumes noires sur les ailes, au long bec et aux longues pattes rouges. Il vole le cou tendu et mange des insectes, des grenouilles et des petits rongeurs.'
 WHERE name = 'Cigogne blanche' AND scientific_name <=> 'Ciconia ciconia'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit crustacé terrestre gris bleuté, couvert d''une fine poudre, qui ne se roule pas en boule. Il vit dans le compost et se nourrit de débris de végétaux, qu''il aide à recycler.'
 WHERE name = 'Cloporte poudré' AND scientific_name <=> 'Porcellionides pruinosus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petite coccinelle allongée, orange à rouge, aux points noirs en nombre très variable. Sa larve et l''adulte mangent des pucerons, ce qui en fait un auxiliaire du jardinier.'
 WHERE name = 'Coccinelle des friches' AND scientific_name <=> 'Hippodamia variegata'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Crabe très rapide à carapace carrée, marbrée de vert sombre et de clair, qui court sur les rochers. Il broute les algues et capture de petites proies.'
 WHERE name = 'Crabe marbré' AND scientific_name <=> 'Pachygrapsus marmoratus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Très grand criquet brun, avec une bande crème au milieu du dos et des ailes arrière jaune pâle. Il vit sur les arbustes et s''envole en faisant claquer ses ailes.'
 WHERE name = 'Criquet à antennes rousses' AND scientific_name <=> 'Acanthacris ruficornis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Un des plus grands criquets de Méditerranée, gris, brun ou olive, qui vit dans les arbres et les arbustes. On le reconnaît à ses yeux rayés de noir et de blanc.'
 WHERE name = 'Criquet égyptien' AND scientific_name <=> 'Anacridium aegyptium'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Toute petite mouche beige aux gros yeux rouge vif, qui apparaît vite autour des fruits mûrs. Elle se nourrit des sucres et des levures des fruits qui fermentent.'
 WHERE name = 'Drosophile' AND scientific_name <=> 'Drosophila melanogaster'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Échassier noir et blanc aux pattes roses très longues et au bec noir très fin. Il niche au bord de l''eau et défend son nid en criant fort.'
 WHERE name = 'Échasse blanche' AND scientific_name <=> 'Himantopus himantopus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Tortue d''eau à carapace aplatie brun-olive, au cou rayé de lignes orange. Omnivore, elle se chauffe souvent au soleil sur les berges.'
 WHERE name = 'Émyde lépreuse' AND scientific_name <=> 'Mauremys leprosa'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Grosse mouche brun-noir qui imite une abeille mais ne pique pas, et fait du sur-place devant les fleurs. Sa larve vit dans l''eau croupie et respire par un long tube.'
 WHERE name = 'Éristale gluant' AND scientific_name <=> 'Eristalis tenax'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Escargot à coquille brun clair barrée de bandes sombres, qui sort surtout par temps humide. Il mange les feuilles tendres et laisse derrière lui une trace brillante.'
 WHERE name = 'Escargot petit-gris' AND scientific_name <=> 'Cornu aspersum'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit rapace roux tacheté de noir, à longue queue, qui fait du sur-place face au vent. Il repère d''en haut les petits rongeurs, les gros insectes et les lézards.'
 WHERE name = 'Faucon crécerelle' AND scientific_name <=> 'Falco tinnunculus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Plante grasse rampante aux feuilles charnues à trois faces et aux grandes fleurs jaunes ou roses. Espèce exotique, elle forme des tapis épais qui étouffent les plantes locales.'
 WHERE name = 'Figue marine' AND scientific_name <=> 'Carpobrotus edulis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Oiseau d''eau noir et rond, au bec et à la plaque du front blancs. Il plonge pour arracher les plantes aquatiques dont il se nourrit.'
 WHERE name = 'Foulque macroule' AND scientific_name <=> 'Fulica atra'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Algue brune en lanières plates, souvent tordues en spirale, aux extrémités renflées. Elle vit en haut de l''estran, sur des rochers découverts à marée basse.'
 WHERE name = 'Fucus spiralé' AND scientific_name <=> 'Fucus spiralis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Oiseau d''eau noir ardoisé au bec rouge à pointe jaune, avec un trait blanc sur le flanc. Ses très longs doigts lui permettent de marcher sur les plantes flottantes.'
 WHERE name = 'Gallinule poule-d''eau' AND scientific_name <=> 'Gallinula chloropus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Très petit poisson gris-olive à la bouche tournée vers le haut, qui nage près de la surface. Il mange beaucoup de larves de moustiques.'
 WHERE name = 'Gambusie' AND scientific_name <=> 'Gambusia affinis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Mille-pattes très long et jaunâtre, sans yeux, avec une seule paire de pattes par anneau. Il se faufile dans la terre et chasse les petits vers et les larves.'
 WHERE name = 'Géophile' AND scientific_name <=> 'Geophilomorpha'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit poisson brun marbré des cuvettes de l''estran, dont les nageoires du ventre forment une ventouse. Il se nourrit de petits crustacés et de vers.'
 WHERE name = 'Gobie paganel' AND scientific_name <=> 'Gobius paganellus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Grand oiseau marin au dos gris, à la tête blanche et aux pattes jaunes, avec une tache rouge sur le bec jaune. Omnivore, il se nourrit de presque tout ce qu''il trouve.'
 WHERE name = 'Goéland leucophée' AND scientific_name <=> 'Larus michahellis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit échassier couleur sable, au collier noir incomplet sur la poitrine. Il pond à même le sable et il est très sensible au dérangement pendant la nidification.'
 WHERE name = 'Gravelot à collier interrompu' AND scientific_name <=> 'Charadrius alexandrinus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Grenouille verte à brune, tachée de sombre, aux longues pattes arrière palmées, qui saute à l''eau au moindre bruit. Les mâles chantent grâce à deux sacs de peau sur les côtés de la tête.'
 WHERE name = 'Grenouille verte d''Afrique du Nord' AND scientific_name <=> 'Pelophylax saharicus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit mammifère au dos couvert de piquants clairs, au museau pointu, qui se roule en boule quand il a peur. Il chasse la nuit les insectes, les vers et les escargots.'
 WHERE name = 'Hérisson d’Algérie' AND scientific_name <=> 'Atelerix algirus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit héron blanc et trapu au bec jaune, souvent au milieu du bétail. Il mange les insectes que les sabots des animaux font sortir de l''herbe.'
 WHERE name = 'Héron garde-bœufs' AND scientific_name <=> 'Bubulcus ibis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petite hirondelle bleu-noir dessus et blanche dessous, avec un croupion blanc bien visible en vol. Elle construit sous les avant-toits un nid fermé en boue.'
 WHERE name = 'Hirondelle de fenêtre' AND scientific_name <=> 'Delichon urbicum'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Oiseau rose orangé aux ailes rayées de noir et de blanc, coiffé d''une crête qu''il ouvre en éventail. Avec son long bec courbé, il fouille le sol à la recherche de larves d''insectes.'
 WHERE name = 'Huppe fasciée' AND scientific_name <=> 'Upupa epops'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Plante de la famille du pissenlit, aux feuilles vert bleuté qui entourent la tige. Ses petits capitules jaunes deviennent des boules d''aigrettes blanches qui emportent les graines dans le vent.'
 WHERE name = 'Laiteron maraîcher' AND scientific_name <=> 'Sonchus oleraceus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Algue verte en lames très fines et translucides, comme une feuille de salade, fixée aux rochers. Elle est broutée par les patelles et les oursins.'
 WHERE name = 'Laitue de mer' AND scientific_name <=> 'Ulva spp.'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Libellule à l''abdomen large et aplati, rouge vif chez le mâle et jaune-brun chez la femelle. Elle se pose à découvert près de l''eau et chasse les insectes en plein vol.'
 WHERE name = 'Libellule écarlate' AND scientific_name <=> 'Crocothemis erythraea'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Grand papillon jaune pâle veiné de noir, dont l''aile arrière porte une queue et une tache rouge et bleue. Sa chenille verte annelée de noir mange les feuilles du fenouil et de la carotte.'
 WHERE name = 'Machaon' AND scientific_name <=> 'Papilio machaon'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Oiseau brun à la silhouette en faucille, qui vole en groupes en poussant des cris stridents. Il se nourrit des petits insectes qu''il capture en plein ciel.'
 WHERE name = 'Martinet pâle' AND scientific_name <=> 'Apus pallidus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Grande plante des bords d''eau aux longues feuilles en ruban, avec un épi brun en forme de saucisse. Elle forme des peuplements serrés qui abritent les oiseaux nicheurs.'
 WHERE name = 'Massette' AND scientific_name <=> 'Typha sp.'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Grande plante des bords d''eau aux feuilles en ruban, avec un épi brun et velouté en forme de massue. Elle forme des peuplements serrés où nichent des oiseaux d''eau.'
 WHERE name = 'Massette à larges feuilles' AND scientific_name <=> 'Typha latifolia'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Plante basse et étalée aux feuilles rondes au bord ondulé et aux fleurs minuscules blanches à rose pâle. Très commune au bord des chemins, elle fait partie des mauves appelées khobbiza au Maroc.'
 WHERE name = 'Mauve à petites fleurs' AND scientific_name <=> 'Malva parviflora'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit oiseau brun rayé qui vit en groupes bruyants près des bâtiments. Le mâle porte une bavette noire et une calotte grise, la femelle est beige.'
 WHERE name = 'Moineau domestique' AND scientific_name <=> 'Passer domesticus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Escargot marin à coquille épaisse gris-vert, rayée de zigzags pourpres. Commun sur les rochers de l''estran, il racle les algues qui couvrent la roche.'
 WHERE name = 'Monodonte' AND scientific_name <=> 'Phorcus lineatus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Grande mouche noire à l''allure de guêpe, totalement inoffensive. Ses larves vivent dans le compost humide et transforment très vite les déchets de cuisine.'
 WHERE name = 'Mouche soldat noire' AND scientific_name <=> 'Hermetia illucens'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Oursin aux piquants violets à verdâtres, souvent couvert de débris de coquilles et d''algues. Il broute les algues et se creuse un abri dans la roche.'
 WHERE name = 'Oursin violet' AND scientific_name <=> 'Paracentrotus lividus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit crustacé, appelé aussi bernard-l''ermite, qui protège son abdomen mou dans une coquille vide d''escargot marin. Il a des pattes rougeâtres et vit dans les cuvettes de l''estran.'
 WHERE name = 'Pagure des rochers' AND scientific_name <=> 'Clibanarius erythropus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Mollusque à coquille conique qui reste collé à la roche dans le haut de l''estran. Il broute la fine couche d''algues sur les rochers, puis revient toujours à sa place.'
 WHERE name = 'Patelle rustique' AND scientific_name <=> 'Patella rustica'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Araignée aux pattes très longues et fines, à l''abdomen marbré de brun. Elle se tient tête en bas dans une toile en désordre, sous les auvents et dans les angles des murs.'
 WHERE name = 'Pholque de Pluche' AND scientific_name <=> 'Holocnemus pluchei'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Papillon blanc très commun, à la pointe des ailes avant grise. Sa chenille verte et veloutée ronge les feuilles des choux et des plantes de la même famille.'
 WHERE name = 'Piéride de la rave' AND scientific_name <=> 'Pieris rapae'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Coléoptère noir au corps rond et très bombé, incapable de voler, qui marche sur le sable. Il s''y enfouit quand il fait trop chaud et se nourrit de débris de plantes.'
 WHERE name = 'Pimélie' AND scientific_name <=> 'Pimelia sp.'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Très petite chauve-souris brun clair, au bord des ailes souvent liséré de blanc. Au crépuscule, elle chasse les moustiques et les papillons de nuit autour des lampadaires.'
 WHERE name = 'Pipistrelle de Kuhl' AND scientific_name <=> 'Pipistrellus kuhlii'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Plante basse et velue aux petites feuilles dentées, qui porte des gousses courtes et gonflées. Ses racines abritent des bactéries qui enrichissent le sol en azote.'
 WHERE name = 'Pois chiche' AND scientific_name <=> 'Cicer arietinum'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petite plante grasse qui rampe au sol, avec des tiges rougeâtres et des feuilles épaisses en forme de spatule. Elle pousse avec la chaleur et porte de petites fleurs jaunes.'
 WHERE name = 'Pourpier' AND scientific_name <=> 'Portulaca oleracea'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Lézard brun à très longue queue, avec deux lignes claires le long du dos et des écailles pointues. Très rapide, il vit dans les broussailles et chasse araignées et insectes.'
 WHERE name = 'Psammodrome algire' AND scientific_name <=> 'Psammodromus algirus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Très grande plante des bords d''eau, aux tiges creuses coupées de nœuds, qui peut dépasser deux mètres. Elle forme la roselière, abri et dortoir de nombreux oiseaux d''eau.'
 WHERE name = 'Roseau commun' AND scientific_name <=> 'Phragmites australis'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit oiseau gris-noir ou gris-brun à la queue rousse qui tremble sans arrêt. Il arrive en automne pour passer l''hiver et se laisse tomber au sol pour saisir des insectes.'
 WHERE name = 'Rougequeue noir' AND scientific_name <=> 'Phoenicurus ochruros'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Papillon jaune orangé vif aux ailes bordées de noir, qui se pose toujours ailes fermées. Sa chenille se nourrit de plantes de la famille du pois.'
 WHERE name = 'Souci' AND scientific_name <=> 'Colias croceus'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Petit crustacé sauteur, beige-gris, qui s''enfouit le jour dans le sable humide. La nuit, il mange les algues échouées et recycle la laisse de mer.'
 WHERE name = 'Talitre (puce de mer)' AND scientific_name <=> 'Talitrus saltator'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Arbre au feuillage gris-vert retombant, fait de rameaux fins couverts de feuilles minuscules. Il rejette le sel par ses feuilles et supporte la sécheresse et le vent chargé d''embruns.'
 WHERE name = 'Tamaris' AND scientific_name <=> 'Tamarix aphylla'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Arbuste aux rameaux fins couverts de minuscules feuilles en écailles et aux grappes de petites fleurs roses. Il supporte les sols salés et humides des bords d''oued.'
 WHERE name = 'Tamaris de France' AND scientific_name <=> 'Tamarix gallica'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Tourterelle gris-beige avec un demi-collier noir sur la nuque. Son roucoulement en trois notes est répété sans relâche, et elle se nourrit de graines.'
 WHERE name = 'Tourterelle turque' AND scientific_name <=> 'Streptopelia decaocto'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Libellule dont le mâle est d''un rouge violacé rosé, avec des nervures rouges sur les ailes. Sa larve vit dans l''eau et chasse de petits animaux aquatiques.'
 WHERE name = 'Trithémis pourpré' AND scientific_name <=> 'Trithemis annulata'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Ver rouge vif, plus petit que le ver de terre, qui vit en grand nombre dans le compost. Il se nourrit de déchets organiques et les transforme en engrais naturel.'
 WHERE name = 'Ver de compost' AND scientific_name <=> 'Eisenia fetida'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Lichen jaune orangé en petites rosettes, très commun sur les écorces, les murs et les toits. C''est l''association d''un champignon et d''une algue, et il pousse mieux là où l''air est riche en azote.'
 WHERE name = 'Xanthorie des murailles' AND scientific_name <=> 'Xanthoria parietina'
   AND description_college IS NULL;

UPDATE plants SET description_college = 'Très grosse abeille noire aux ailes sombres à reflets violets, au vol lourd et bruyant. Elle butine les fleurs profondes et creuse son nid dans le bois mort.'
 WHERE name = 'Xylocope violet' AND scientific_name <=> 'Xylocopa violacea'
   AND description_college IS NULL;
