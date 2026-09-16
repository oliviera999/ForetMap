-- ---------------------------------------------------------------------------
-- 257 — Réillustration des 30 fiches dont la photo pointait un fichier supprimé
--
-- La migration 252 avait retiré 42 liens morts (30 fiches de production, 12 du catalogue
-- livré, 404 vérifié une à une) : les fiches étaient propres, mais nues. Celle-ci leur
-- redonne une photo, avec son auteur et sa licence.
--
-- Comment ces fichiers ont été choisis
-- ------------------------------------
-- Pas par l'image de tête de l'article Wikipédia. Ce premier essai a bien rendu 29 fiches
-- sur 30, et il était à jeter : il attribuait au **criquet marocain** une photo
-- d'*Aiolopus thalassinus* — une autre espèce —, à l'**arganier** une photo d'huile
-- d'argan, et à neuf fiches des planches botaniques du XIXᵉ siècle. C'est mot pour mot le
-- défaut que la migration 252 vient de corriger sur la fiche « Laitue », illustrée par une
-- planche de *Lactuca virosa*. Une illustration plausible mais fausse est pire qu'une
-- fiche sans image : elle apprend à reconnaître la mauvaise espèce.
--
-- La sélection retenue part donc de la **catégorie Commons du taxon** — y être classé est
-- déjà un acte de détermination par la communauté — et écarte :
--   - les planches, gravures, documents d'herbier et figures d'articles ;
--   - les cartes de répartition (qui ne disent pas « carte » dans leur nom, mais
--     « presence in European countries ») ;
--   - les sujets qui ne montrent pas l'espèce telle qu'on la rencontre : bonsaï, kokedama,
--     spécimen en vitrine de musée ;
--   - le produit plutôt que l'être vivant (coopérative d'huile d'argan, bocal, marché) ;
--   - les cultivars au feuillage atypique et les cadres où deux espèces se disputent la
--     vedette.
-- Chaque fichier retenu a été relu ; six passes ont été nécessaires pour que les 30 tiennent.
--
-- Auteur et licence viennent de l'API Commons (`prop=imageinfo&iiprop=extmetadata`, champs
-- `Artist` puis `Credit`/`Attribution`), jamais d'une saisie à la main : 13 fichiers en
-- CC BY-SA 4.0, 6 en CC BY-SA 3.0, 3 en CC BY 2.0, 3 en CC0, 2 en CC BY-SA 2.0, et un
-- chacun en CC BY 3.0, CC BY 4.0 et CC BY-SA 2.5. Aucune fiche sans auteur.
--
-- Deux pièges rencontrés, tous deux des faux négatifs silencieux
-- -------------------------------------------------------------
-- 1. `upload.wikimedia.org` applique son propre quota et répond 429 sous charge. Une
--    première version du contrôle de lien rendait « mort » sur toute erreur : elle
--    fabriquait donc les liens morts qu'elle était censée détecter. Seuls 404 et 410
--    signent un fichier supprimé.
-- 2. `Category:Argania spinosa` est une **redirection de catégorie**, que l'API rend comme
--    une catégorie vide, sans erreur. L'arganier semblait n'avoir aucune photo sur Commons ;
--    il est rangé sous `Category:Sideroxylon spinosum`.
--
-- Idempotence et portée
-- ---------------------
-- Indexé par **nom** : les noms concernés sont uniques des deux côtés (vérifié sur le dump
-- de production comme sur une base neuve), et un seul bloc couvre donc les deux. Le garde
-- `photo IS NULL OR photo = ''` fait le reste : la migration ne repose une photo que là où
-- il n'y en a pas — elle n'écrase jamais une illustration choisie par un enseignant, et la
-- rejouer ne fait rien. Sur le dump de production restauré : 30 fiches concernées ; sur une
-- base neuve : 16, les 14 autres portant déjà une photo du catalogue livré.
-- ---------------------------------------------------------------------------

-- Arganier — A lonley argan tree.jpg
--   commons:Category:Sideroxylon spinosum
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/1/13/A_lonley_argan_tree.jpg',
       photo_credit = 'Mohamed amine HNIOUA',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Arganier' AND (photo IS NULL OR photo = '');

-- Artichaut — 20210620 Hortus botanicus Leiden - Cynara cardunculus.jpg
--   commons:Category:Cynara cardunculus
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/d/d5/20210620_Hortus_botanicus_Leiden_-_Cynara_cardunculus.jpg',
       photo_credit = 'Rudolphous',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Artichaut' AND (photo IS NULL OR photo = '');

-- Bois mort — Avatar Grove Nurse Log 3.jpg
--   commons:Category:Coarse woody debris
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/4/41/Avatar_Grove_Nurse_Log_3.jpg',
       photo_credit = 'Photo by TJ Watt',
       photo_licence = 'CC BY-SA 3.0'
 WHERE name = 'Bois mort' AND (photo IS NULL OR photo = '');

-- Bougainvillier — (Bougainvillea glabra) at Bakkannapalem.JPG
--   commons:Category:Bougainvillea glabra
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/4/44/%28Bougainvillea_glabra%29_at_Bakkannapalem.JPG',
       photo_credit = 'Adityamadhav83',
       photo_licence = 'CC BY-SA 3.0'
 WHERE name = 'Bougainvillier' AND (photo IS NULL OR photo = '');

-- Capucine — 3853 - Tropaeolum majus (Große Kapuzinerkresse).JPG
--   commons:Category:Tropaeolum majus
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/e/e8/3853_-_Tropaeolum_majus_%28Gro%C3%9Fe_Kapuzinerkresse%29.JPG',
       photo_credit = 'Tubifex',
       photo_licence = 'CC BY-SA 3.0'
 WHERE name = 'Capucine' AND (photo IS NULL OR photo = '');

-- Caroubier — Ceratonia siliqua (Carob Tree) - Flickr - S. Rae.jpg
--   commons:Category:Ceratonia siliqua
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/c/cf/Ceratonia_siliqua_%28Carob_Tree%29_-_Flickr_-_S._Rae.jpg',
       photo_credit = 'S. Rae from Scotland, UK',
       photo_licence = 'CC BY 2.0'
 WHERE name = 'Caroubier' AND (photo IS NULL OR photo = '');

-- Champignons de litière — 2010-10-16 Marasmius oreades (Bolton) Fr 112276.jpg
--   commons:Category:Marasmius oreades
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/1/10/2010-10-16_Marasmius_oreades_%28Bolton%29_Fr_112276.jpg',
       photo_credit = 'This image was created by user Lord Mayonnaise at Mushroom Observer , a source for mycological images. You can contact this user here',
       photo_licence = 'CC BY-SA 3.0'
 WHERE name = 'Champignons de litière' AND (photo IS NULL OR photo = '');

-- Citronnier — -lemon tree -nature -greenery -vegetable.jpg
--   commons:Category:Citrus × limon
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/b/ba/-lemon_tree_-nature_-greenery_-vegetable.jpg',
       photo_credit = 'Govindaraj Mahalakshmi',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Citronnier' AND (photo IS NULL OR photo = '');

-- Coccinelle à sept points — 7-spot Ladybird. Coccinella 7-punctata - Flickr - gailhampshire.jpg
--   commons:Category:Coccinella septempunctata
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/8/85/7-spot_Ladybird._Coccinella_7-punctata_-_Flickr_-_gailhampshire.jpg',
       photo_credit = 'gailhampshire from Cradley, Malvern, U.K',
       photo_licence = 'CC BY 2.0'
 WHERE name = 'Coccinelle à sept points' AND (photo IS NULL OR photo = '');

-- Cochenille de la figue de Barbarie — 20250702 Dactylopius opuntiae.jpg
--   commons:Category:Dactylopius opuntiae
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/8/83/20250702_Dactylopius_opuntiae.jpg',
       photo_credit = 'Flocci Nivis',
       photo_licence = 'CC BY 4.0'
 WHERE name = 'Cochenille de la figue de Barbarie' AND (photo IS NULL OR photo = '');

-- Crapaud de Maurétanie — Bufo mauritanicus01.jpg
--   commons:Category:Bufo mauritanicus
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/5/59/Bufo_mauritanicus01.jpg',
       photo_credit = 'Pierre-Yves Vaucher ( http://www.batraciens-reptiles.com )',
       photo_licence = 'CC BY-SA 2.5'
 WHERE name = 'Crapaud de Maurétanie' AND (photo IS NULL OR photo = '');

-- Criquet marocain — Dociostaurus maroccanus female La Palma 006.jpg
--   commons:Category:Dociostaurus maroccanus
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Dociostaurus_maroccanus_female_La_Palma_006.jpg',
       photo_credit = 'Sphingonotus',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Criquet marocain' AND (photo IS NULL OR photo = '');

-- Escargot petit-gris — Alter Friedhof Duisburg 18.05.2017 Garden Snail - Cornu aspersum (34351082904).jpg
--   commons:Category:Helix aspersa
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/8/8e/Alter_Friedhof_Duisburg_18.05.2017_Garden_Snail_-_Cornu_aspersum_%2834351082904%29.jpg',
       photo_credit = 'Björn S',
       photo_licence = 'CC BY-SA 2.0'
 WHERE name = 'Escargot petit-gris' AND (photo IS NULL OR photo = '');

-- Fenouil — A Foeniculum vulgare dulce.jpg
--   commons:Category:Foeniculum vulgare
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/a/af/A_Foeniculum_vulgare_dulce.jpg',
       photo_credit = 'YAKSH75',
       photo_licence = 'CC0'
 WHERE name = 'Fenouil' AND (photo IS NULL OR photo = '');

-- Figuier commun — 11-Figuier-Ficus carica.jpg
--   commons:Category:Ficus carica
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/d/d9/11-Figuier-Ficus_carica.jpg',
       photo_credit = 'AnimaTer34120',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Figuier commun' AND (photo IS NULL OR photo = '');

-- Figuier de Barbarie — 20220605 Hortus Botanicus - Opuntia ficus-indica (plant).jpg
--   commons:Category:Opuntia ficus-indica
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/1/16/20220605_Hortus_Botanicus_-_Opuntia_ficus-indica_%28plant%29.jpg',
       photo_credit = 'Rudolphous',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Figuier de Barbarie' AND (photo IS NULL OR photo = '');

-- Merle noir — Amsel (Turdus merula) in Beeren.jpg
--   commons:Category:Turdus merula
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Amsel_%28Turdus_merula%29_in_Beeren.jpg',
       photo_credit = 'Federlesen',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Merle noir' AND (photo IS NULL OR photo = '');

-- Moustique commun — Culex cf. pipiens.jpg
--   commons:Category:Culex pipiens
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/5/56/Culex_cf._pipiens.jpg',
       photo_credit = 'Danny S',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Moustique commun' AND (photo IS NULL OR photo = '');

-- Olivier — Old olive tree (Olea europaea) and Aleem house in Lajbouk (Lajbook) village, Lower Dir District, KPK, Pakistan.jpg
--   commons:Category:Olea europaea
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/a/ae/Old_olive_tree_%28Olea_europaea%29_and_Aleem_house_in_Lajbouk_%28Lajbook%29_village%2C_Lower_Dir_District%2C_KPK%2C_Pakistan.jpg',
       photo_credit = 'aleemkhanljb',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Olivier' AND (photo IS NULL OR photo = '');

-- Palmier-dattier — Arecales - Phoenix dactylifera - 22.jpg
--   commons:Category:Phoenix dactylifera
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Arecales_-_Phoenix_dactylifera_-_22.jpg',
       photo_credit = 'Emőke Dénes',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Palmier-dattier' AND (photo IS NULL OR photo = '');

-- Pois chiche — Chickpeas - Cicer arietinum - കടല.jpg
--   commons:Category:Cicer arietinum
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Chickpeas_-_Cicer_arietinum_-_%E0%B4%95%E0%B4%9F%E0%B4%B2.jpg',
       photo_credit = 'Shijan Kaakkara',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Pois chiche' AND (photo IS NULL OR photo = '');

-- Pâquerette — 00 4448 Gänseblümchen (Bellis perennis).jpg
--   commons:Category:Bellis perennis
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/d/d6/00_4448_G%C3%A4nsebl%C3%BCmchen_%28Bellis_perennis%29.jpg',
       photo_credit = 'W. Bulach',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Pâquerette' AND (photo IS NULL OR photo = '');

-- Rhizobium — CSIRO ScienceImage 2483 Rhizobium bacteria.jpg
--   commons:Category:Rhizobium
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/2/23/CSIRO_ScienceImage_2483_Rhizobium_bacteria.jpg',
       photo_credit = 'Publishing, CSIRO',
       photo_licence = 'CC BY 3.0'
 WHERE name = 'Rhizobium' AND (photo IS NULL OR photo = '');

-- Souci officinal — Calendula officinalis 2004-02-21.jpg
--   commons:Category:Calendula officinalis
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/8/84/Calendula_officinalis_2004-02-21.jpg',
       photo_credit = 'Kowloonese',
       photo_licence = 'CC BY-SA 3.0'
 WHERE name = 'Souci officinal' AND (photo IS NULL OR photo = '');

-- Sureau noir — 20140424Sambucus nigra1.jpg
--   commons:Category:Sambucus nigra
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/0/05/20140424Sambucus_nigra1.jpg',
       photo_credit = 'AnRo0002',
       photo_licence = 'CC0'
 WHERE name = 'Sureau noir' AND (photo IS NULL OR photo = '');

-- Syrphe ceinturé — Episyrphus balteatus (9367543924).jpg
--   commons:Category:Episyrphus balteatus
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Episyrphus_balteatus_%289367543924%29.jpg',
       photo_credit = 'Donald Hobern from Copenhagen, Denmark',
       photo_licence = 'CC BY 2.0'
 WHERE name = 'Syrphe ceinturé' AND (photo IS NULL OR photo = '');

-- Tarente de Maurétanie — 003-Tarentola mauritanica.jpg
--   commons:Category:Tarentola mauritanica
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/2/27/003-Tarentola_mauritanica.jpg',
       photo_credit = 'Luis nunes alberto',
       photo_licence = 'CC BY-SA 3.0'
 WHERE name = 'Tarente de Maurétanie' AND (photo IS NULL OR photo = '');

-- Tillandsia — Arid rock face with Spanish moss (Tillandsia usneoides) near Villa de Leyva, 2026.jpg
--   commons:Category:Tillandsia usneoides
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/0/0f/Arid_rock_face_with_Spanish_moss_%28Tillandsia_usneoides%29_near_Villa_de_Leyva%2C_2026.jpg',
       photo_credit = 'Mottenpriesterin',
       photo_licence = 'CC BY-SA 4.0'
 WHERE name = 'Tillandsia' AND (photo IS NULL OR photo = '');

-- Violette odorante — 20150324Viola odorata3.jpg
--   commons:Category:Viola odorata
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/9/99/20150324Viola_odorata3.jpg',
       photo_credit = 'AnRo0002',
       photo_licence = 'CC0'
 WHERE name = 'Violette odorante' AND (photo IS NULL OR photo = '');

-- Volubilis — Batatilla - Campanita (Ipomoea indica) (14673960710).jpg
--   commons:Category:Ipomoea indica
UPDATE plants
   SET photo = 'https://upload.wikimedia.org/wikipedia/commons/b/bf/Batatilla_-_Campanita_%28Ipomoea_indica%29_%2814673960710%29.jpg',
       photo_credit = 'Alejandro Bayer Tamayo from Armenia, Colombia',
       photo_licence = 'CC BY-SA 2.0'
 WHERE name = 'Volubilis' AND (photo IS NULL OR photo = '');
