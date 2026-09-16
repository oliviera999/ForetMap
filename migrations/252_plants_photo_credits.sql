-- Attribution des photos du catalogue, et correction de la fiche « Laitue ».
--
-- 225 fiches illustrent leur photo principale par un fichier Wikimedia Commons sans porter
-- ni auteur ni licence. Les licences en présence — CC BY-SA 3.0 (54 fichiers), CC BY-SA 4.0
-- (38), CC BY 3.0/4.0, CC BY-SA 2.x, GFDL — imposent toutes de nommer l'auteur. Seul le
-- domaine public (39 fichiers) ne l'exige pas, et il reste la bonne pratique.
--
-- Le projet sait déjà faire : `quiz_questions` porte `photo_credit` et `photo_licence`,
-- remplis sur 14 questions sur 14. Le trou est propre à `plants` ; ces deux colonnes
-- reprennent donc les mêmes noms, pour que les deux tables se lisent pareil.
--
-- Portée : la colonne `photo` (l'image « héro » de la fiche). Les cinq autres colonnes
-- photo restent sans attribution stockée — l'affichage retombe pour elles sur le lien vers
-- la page du fichier Commons, que l'URL suffit à reconstruire.
--
-- Les valeurs ci-dessous ne sont PAS saisies à la main : elles viennent de l'API Commons
-- (action=query&prop=imageinfo&iiprop=extmetadata), champs `Artist` et `LicenseShortName`,
-- balises HTML retirées. Là où `Artist` est vide, `Credit`/`Attribution` puis le
-- téléverseur d'origine ont servi de repli — jamais un auteur inventé.
--
-- Un ALTER par colonne : errno 1060 est ignoré instruction par instruction par database.js.
ALTER TABLE plants
  ADD COLUMN photo_credit VARCHAR(255) DEFAULT NULL
    COMMENT 'Auteur de la photo principale (attribution CC)';
ALTER TABLE plants
  ADD COLUMN photo_licence VARCHAR(64) DEFAULT NULL
    COMMENT 'Licence de la photo principale (ex. CC BY-SA 4.0)';

-- ---------------------------------------------------------------------------
-- Attribution des 195 photos Wikimedia résolues.
-- Borné par `photo_credit IS NULL` : une correction manuelle n'est jamais réécrite.
-- ---------------------------------------------------------------------------
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 1 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Carl Axel Magnus Lindman', photo_licence = 'Public domain' WHERE id = 2 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Philippe-e Roche', photo_licence = 'CC BY-SA 4.0' WHERE id = 3 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Photo by David J. Stang', photo_licence = 'CC BY-SA 4.0' WHERE id = 4 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Commonists', photo_licence = 'CC BY-SA 4.0' WHERE id = 5 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Various', photo_licence = 'CC BY-SA 1.0' WHERE id = 6 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Rasbak', photo_licence = 'CC BY-SA 3.0' WHERE id = 7 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 8 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Spedona', photo_licence = 'CC BY-SA 3.0' WHERE id = 9 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Formulax~commonswiki (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 2.0' WHERE id = 10 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 11 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Jeffdelonge at French Wikipedia', photo_licence = 'CC BY-SA 3.0' WHERE id = 12 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Symac at French Wikipedia', photo_licence = 'CC BY-SA 3.0' WHERE id = 13 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 14 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Francisco Manuel Blanco (O.S.A.)', photo_licence = 'Public domain' WHERE id = 15 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Kayser Ahmad', photo_licence = 'CC BY-SA 4.0' WHERE id = 16 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Anu', photo_licence = 'CC BY-SA 4.0' WHERE id = 17 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Heptagon', photo_licence = 'Public domain' WHERE id = 18 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Dezidor', photo_licence = 'CC BY-SA 3.0' WHERE id = 19 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Gnushi at German Wikipedia Later versions were uploaded by Haplochromis at de.wikipedia .', photo_licence = 'CC BY-SA 3.0' WHERE id = 20 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'NOZO', photo_licence = 'CC BY-SA 3.0' WHERE id = 21 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Bob Walker in Democratic Republic of Congo in 1988', photo_licence = 'CC BY-SA 2.5' WHERE id = 22 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Naturalis Biodiversity Center', photo_licence = 'CC0' WHERE id = 23 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'H. Zell', photo_licence = 'CC BY-SA 3.0' WHERE id = 24 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Slimguy04', photo_licence = 'CC BY-SA 4.0' WHERE id = 25 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Marcus33', photo_licence = 'CC BY-SA 3.0' WHERE id = 27 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Cody Hough', photo_licence = 'CC BY-SA 3.0' WHERE id = 28 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Professor William Hickey', photo_licence = 'CC BY-SA 2.0' WHERE id = 29 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'w:pl:Wikipedysta:Lukas3', photo_licence = 'CC BY 2.5' WHERE id = 30 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Jawahar Swaminathan and MSD staff at the European Bioinformatics Institute', photo_licence = 'Public domain' WHERE id = 31 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Mmustafa (téléversement Wikimedia Commons)', photo_licence = 'Public domain' WHERE id = 32 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Carl Axel Magnus Lindman', photo_licence = 'Public domain' WHERE id = 33 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Christian Fischer', photo_licence = 'CC BY-SA 3.0' WHERE id = 34 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Pinpin (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 3.0' WHERE id = 35 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'ArtMechanic (téléversement Wikimedia Commons)', photo_licence = 'Public domain' WHERE id = 36 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 37 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Taka', photo_licence = 'CC BY-SA 3.0' WHERE id = 38 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Alfazzati', photo_licence = 'CC BY 4.0' WHERE id = 39 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Alvesgaspar', photo_licence = 'CC BY-SA 3.0' WHERE id = 40 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'dotun55', photo_licence = 'CC BY-SA 2.0' WHERE id = 41 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 42 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Walther Otto Müller', photo_licence = 'Public domain' WHERE id = 43 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Joydeep', photo_licence = 'CC BY-SA 3.0' WHERE id = 44 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Jun Seita from Palo Alto, CA, U.S.', photo_licence = 'CC BY 2.0' WHERE id = 45 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 46 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Evanherk at nl.wikipedia', photo_licence = 'CC BY-SA 3.0' WHERE id = 47 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Oliver Ren', photo_licence = 'CC BY-SA 3.0' WHERE id = 48 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Gordon Joly', photo_licence = 'CC BY-SA 4.0' WHERE id = 49 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Glenio', photo_licence = 'CC BY-SA 2.5' WHERE id = 50 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Lionelr (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 2.0 fr' WHERE id = 51 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Patrice78500', photo_licence = 'CC BY-SA 4.0' WHERE id = 52 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Walther Otto Müller', photo_licence = 'Public domain' WHERE id = 53 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Illustration_Anethum_graveolens0.jpg : Prof. Dr. Otto Wilhelm Thomé derivative work: Aroche ( talk )', photo_licence = 'Public domain' WHERE id = 54 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Ivar Leidus', photo_licence = 'CC BY-SA 3.0' WHERE id = 55 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Henna (téléversement Wikimedia Commons)', photo_licence = 'CC BY 2.0' WHERE id = 56 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Andreas Eichler', photo_licence = 'CC BY-SA 4.0' WHERE id = 57 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Donald Hobern from Copenhagen, Denmark', photo_licence = 'CC BY 2.0' WHERE id = 58 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Scott Bauer', photo_licence = 'Public domain' WHERE id = 59 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Amédée Masclef', photo_licence = 'Public domain' WHERE id = 60 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'E4024', photo_licence = 'CC BY-SA 4.0' WHERE id = 61 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Wouterhagens at Dutch Wikipedia', photo_licence = 'CC BY-SA 3.0' WHERE id = 62 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Ermell', photo_licence = 'CC BY-SA 4.0' WHERE id = 63 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Arn', photo_licence = 'CC BY-SA 4.0' WHERE id = 64 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'miya ( talk )', photo_licence = 'CC BY-SA 4.0' WHERE id = 65 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Jeffrey W. Lotz, Florida Department of Agriculture and Consumer Services, Bugwood.org', photo_licence = 'CC BY 3.0 us' WHERE id = 66 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Jörg Hempel', photo_licence = 'CC BY-SA 3.0 de' WHERE id = 67 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Ivar Leidus', photo_licence = 'CC BY-SA 4.0' WHERE id = 68 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Alberto Salguero', photo_licence = 'CC BY-SA 3.0' WHERE id = 69 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'JMK', photo_licence = 'CC BY-SA 3.0' WHERE id = 70 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Ejgouda (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 3.0' WHERE id = 71 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Arch. Attilio Mileto - attilio.mileto@florero.net', photo_licence = 'CC BY-SA 3.0' WHERE id = 72 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Stan Shebs', photo_licence = 'CC BY-SA 3.0' WHERE id = 73 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Griensteidl', photo_licence = 'CC BY-SA 3.0' WHERE id = 74 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'ArtMechanic (téléversement Wikimedia Commons)', photo_licence = 'Public domain' WHERE id = 75 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 76 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Scott Bauer, USDA ARS', photo_licence = 'Public domain' WHERE id = 77 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 78 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'H. Zell', photo_licence = 'CC BY-SA 3.0' WHERE id = 86 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Mauro Mazzio ( Boboseiptu )', photo_licence = 'CC BY 2.5' WHERE id = 87 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Mvuijlst', photo_licence = 'CC BY-SA 3.0' WHERE id = 88 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Mokkie', photo_licence = 'CC BY-SA 3.0' WHERE id = 90 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Contributeur de Wikipédia (auteur non précisé sur Commons)', photo_licence = 'Public domain' WHERE id = 91 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Thamizhpparithi Maari', photo_licence = 'CC BY-SA 4.0' WHERE id = 122 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Escaladix', photo_licence = 'CC BY-SA 3.0' WHERE id = 123 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Forest & Kim Starr', photo_licence = 'CC BY 3.0' WHERE id = 125 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Mangostar', photo_licence = 'CC BY-SA 3.0' WHERE id = 129 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Wouter Hagens', photo_licence = 'CC BY-SA 4.0' WHERE id = 130 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Conselleria de Medi Ambient i Mobilitat, Govern des Illes Balears', photo_licence = 'CC BY-SA 3.0' WHERE id = 132 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Vaikoovery', photo_licence = 'CC BY 3.0' WHERE id = 134 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Travus', photo_licence = 'CC BY-SA 2.5' WHERE id = 135 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Factumquintus (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 3.0' WHERE id = 143 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'ArtMechanic', photo_licence = 'CC BY-SA 3.0' WHERE id = 144 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Immanuel Giel (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 3.0' WHERE id = 146 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Amirekul', photo_licence = 'CC BY-SA 4.0' WHERE id = 147 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'PaulT', photo_licence = 'CC BY-SA 3.0' WHERE id = 150 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Kulmalukko', photo_licence = 'CC BY-SA 3.0' WHERE id = 151 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'AnastasiaObradovych', photo_licence = 'CC BY 4.0' WHERE id = 152 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'ManyJanos at Hungarian Wikipedia', photo_licence = 'CC BY-SA 3.0' WHERE id = 153 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Hans Hillewaert', photo_licence = 'CC BY-SA 4.0' WHERE id = 154 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Stanzilla', photo_licence = 'CC BY-SA 4.0' WHERE id = 156 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Luis nunes alberto', photo_licence = 'CC BY 3.0' WHERE id = 158 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Forest & Kim Starr', photo_licence = 'CC BY 3.0' WHERE id = 174 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Thierry Caro', photo_licence = 'CC BY-SA 2.5' WHERE id = 175 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Taken by Fanghong', photo_licence = 'CC BY-SA 3.0' WHERE id = 176 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Fir0002 (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 3.0' WHERE id = 177 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Winfried Bruenken ( Amrum )', photo_licence = 'CC BY-SA 2.5' WHERE id = 178 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'UK Palms Exotics', photo_licence = 'CC0' WHERE id = 179 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Bidgee', photo_licence = 'CC BY 3.0' WHERE id = 180 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Francisco Manuel Blanco (O.S.A.)', photo_licence = 'Public domain' WHERE id = 181 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'B.navez', photo_licence = 'CC BY-SA 4.0' WHERE id = 182 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'spacebirdy (also known as geimfyglið (:&gt; )=| made with Sternenlaus -spirit)', photo_licence = 'CC BY-SA 3.0' WHERE id = 183 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Georges Jansoone', photo_licence = 'CC BY 2.5' WHERE id = 184 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'O Tupinólogo', photo_licence = 'CC BY 4.0' WHERE id = 185 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Francisco Manuel Blanco (O.S.A.)', photo_licence = 'Public domain' WHERE id = 186 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Aftabbanoori', photo_licence = 'CC BY-SA 3.0' WHERE id = 187 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 188 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Francisco Manuel Blanco (O.S.A.)', photo_licence = 'Public domain' WHERE id = 189 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Jon Sullivan', photo_licence = 'Public domain' WHERE id = 190 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Nard the Bard (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 3.0' WHERE id = 191 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Janeznovak', photo_licence = 'CC BY 2.5' WHERE id = 192 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Craig Ledbetter, USDA ARS', photo_licence = 'Public domain' WHERE id = 193 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'shioshvili at Flickr', photo_licence = 'CC BY-SA 2.0' WHERE id = 194 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Dietrich Krieger', photo_licence = 'CC BY-SA 3.0' WHERE id = 195 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Rob Hille', photo_licence = 'CC BY-SA 3.0' WHERE id = 196 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Ahodges7', photo_licence = 'CC BY-SA 3.0' WHERE id = 197 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'B.navez', photo_licence = 'CC BY-SA 3.0' WHERE id = 198 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 199 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Kurt Stüber [1]', photo_licence = 'CC BY-SA 3.0' WHERE id = 200 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Bouba at French Wikipedia', photo_licence = 'CC BY-SA 3.0' WHERE id = 201 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Amédée Masclef', photo_licence = 'Public domain' WHERE id = 202 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Fir0002 (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 3.0' WHERE id = 203 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'H. Zell', photo_licence = 'CC BY-SA 3.0' WHERE id = 204 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Otto Wilhelm Thomé', photo_licence = 'Public domain' WHERE id = 205 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Kolforn ( Kolforn ) I''d appreciate if you could mail me (Kolforn@gmail.com) if you want to use this picture out of th…', photo_licence = 'CC BY-SA 4.0' WHERE id = 206 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'H. Zell', photo_licence = 'CC BY-SA 3.0' WHERE id = 207 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Otto Wilhelm Thomé', photo_licence = 'CC BY-SA 3.0' WHERE id = 208 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Walther Otto Müller', photo_licence = 'Public domain' WHERE id = 209 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'CSvBibra', photo_licence = 'Public domain' WHERE id = 210 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'FranciscoWelterSchultes', photo_licence = 'CC0' WHERE id = 211 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Franz Eugen Köhler, Köhler''s Medizinal-Pflanzen', photo_licence = 'Public domain' WHERE id = 212 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Pethan', photo_licence = 'CC BY-SA 3.0' WHERE id = 213 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Wilhelm Schmidle (1860–1951)', photo_licence = 'Public domain' WHERE id = 214 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Unknown author Unknown author', photo_licence = 'CC0' WHERE id = 215 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Kurt Stüber [1]', photo_licence = 'CC BY-SA 3.0' WHERE id = 216 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'JackyM59', photo_licence = 'CC BY-SA 4.0' WHERE id = 217 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Valérie75 (téléversement Wikimedia Commons)', photo_licence = 'CC BY-SA 3.0' WHERE id = 218 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'TeunSpaans', photo_licence = 'CC BY 2.5' WHERE id = 219 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Chartmann', photo_licence = 'CC BY 2.5' WHERE id = 220 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Charles J. Sharp', photo_licence = 'CC BY-SA 4.0' WHERE id = 301 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Charles J. Sharp', photo_licence = 'CC BY-SA 4.0' WHERE id = 302 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Rhododendrites', photo_licence = 'CC BY-SA 4.0' WHERE id = 303 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'stevem4560', photo_licence = 'CC BY 4.0' WHERE id = 304 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Charles J. Sharp', photo_licence = 'CC BY-SA 4.0' WHERE id = 305 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'william_stephens', photo_licence = 'CC BY 4.0' WHERE id = 306 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Charles J. Sharp', photo_licence = 'CC BY-SA 4.0' WHERE id = 307 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Giles Laurent', photo_licence = 'CC BY-SA 4.0' WHERE id = 308 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Irvin calicut', photo_licence = 'CC BY-SA 4.0' WHERE id = 309 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Alexis Lours', photo_licence = 'CC BY 4.0' WHERE id = 310 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Estormiz', photo_licence = 'CC0' WHERE id = 311 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Dcabrilo', photo_licence = 'CC BY-SA 3.0' WHERE id = 312 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Alexis Lours', photo_licence = 'CC BY 4.0' WHERE id = 313 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Charles J. Sharp', photo_licence = 'CC BY-SA 4.0' WHERE id = 314 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Charles J. Sharp', photo_licence = 'CC BY-SA 4.0' WHERE id = 315 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Bernard Gagnon', photo_licence = 'CC BY 4.0' WHERE id = 316 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Andreas Trepte', photo_licence = 'CC BY-SA 2.5' WHERE id = 317 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Dion Art', photo_licence = 'CC BY-SA 4.0' WHERE id = 318 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Maisrimer', photo_licence = 'CC BY-SA 4.0' WHERE id = 319 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Leonardoancillotto86', photo_licence = 'CC BY 3.0' WHERE id = 320 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Jean-Pol GRANDMONT', photo_licence = 'CC BY 3.0' WHERE id = 321 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Jean-Pol GRANDMONT', photo_licence = 'CC BY 3.0' WHERE id = 322 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Alpsdake', photo_licence = 'CC BY-SA 3.0' WHERE id = 323 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Michael Wittwer', photo_licence = 'CC BY-SA 4.0' WHERE id = 324 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Gideon Pisanty ( Gidip ) גדעון פיזנטי', photo_licence = 'CC BY 3.0' WHERE id = 325 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Alvesgaspar', photo_licence = 'CC BY 2.5' WHERE id = 326 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Didier Descouens', photo_licence = 'CC BY-SA 4.0' WHERE id = 327 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Scott Bauer, U.S. Department of Agriculture', photo_licence = 'Public domain' WHERE id = 328 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Patrick Clement from West Midlands, England', photo_licence = 'CC BY 2.0' WHERE id = 329 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Didier Descouens', photo_licence = 'CC BY-SA 4.0' WHERE id = 330 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Y tambe (original uploader)', photo_licence = 'CC BY-SA 3.0' WHERE id = 331 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Agricultural Research Service (NRRL)Culture Collection', photo_licence = 'Public domain' WHERE id = 332 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Moez (téléversement Wikimedia Commons)', photo_licence = 'Public domain' WHERE id = 333 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'US Department of Agriculture, Agricultural Research Service, Systematic Botany and Mycology Laboratory, [1]', photo_licence = 'Public domain' WHERE id = 334 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'US Department of Health and Human Services.', photo_licence = 'Public domain' WHERE id = 335 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Curtis Clark', photo_licence = 'CC BY-SA 3.0' WHERE id = 336 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Cherus', photo_licence = 'CC BY-SA 3.0' WHERE id = 337 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'CDC Division of Parasitic Diseases http://www.dpd.cdc.gov/dpdx/HTML/ImageLibrary/Ascariasis_il.htm http://www.dpd.cdc…', photo_licence = 'Public domain' WHERE id = 338 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Ernst Haeckel', photo_licence = 'Public domain' WHERE id = 339 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'S.E. Thorpe', photo_licence = 'Public domain' WHERE id = 340 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Photo or drawing by Pavel Klimov, Bee Mite ID (idtools.org/id/mites/beemites) unless otherwise stated in description…', photo_licence = 'Public domain' WHERE id = 341 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Christian Fischer', photo_licence = 'CC BY-SA 3.0' WHERE id = 342 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'xpda', photo_licence = 'CC BY-SA 4.0' WHERE id = 343 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Muhammad Mahdi Karim', photo_licence = 'GFDL 1.2' WHERE id = 344 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'James K. Lindsey', photo_licence = 'CC BY-SA 3.0' WHERE id = 345 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Sanjay Acharya', photo_licence = 'CC BY-SA 4.0' WHERE id = 346 AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'AJC1 from UK', photo_licence = 'CC BY-SA 2.0' WHERE id = 348 AND photo_credit IS NULL;

-- ---------------------------------------------------------------------------
-- Fiche « Laitue » : la photo principale était une planche de Köhler représentant
-- *Lactuca virosa*, la laitue vireuse — une espèce sauvage toxique — sur une fiche
-- marquée comestible, dans une forêt où les élèves récoltent.
--
-- La fiche reste au rang « genre » (`Lactuca sp.`, taxon_rank = 'genus'), ce qui est
-- cohérent avec les autres fiches de genre du catalogue : seule l'illustration était
-- fausse. La confusion part dans `lookalike_species`, le champ prévu pour ça depuis la
-- migration 243, où elle s'affiche en encadré d'alerte.
-- ---------------------------------------------------------------------------
UPDATE plants
SET photo = 'https://upload.wikimedia.org/wikipedia/commons/b/b7/Kopfsalat_Setzlinge.JPG',
    photo_credit = '4028mdk09',
    photo_licence = 'CC BY-SA 3.0'
WHERE name = 'Laitue'
  AND photo LIKE '%Lactuca_virosa%';

UPDATE plants
SET lookalike_species = CONCAT_WS(
      '\n\n',
      NULLIF(lookalike_species, ''),
      'Laitue vireuse (*Lactuca virosa*) : laitue sauvage toxique, au latex blanc amer et aux feuilles épineuses sur la nervure. Ne jamais récolter une laitue spontanée pour la manger.'
    )
WHERE name = 'Laitue'
  AND (lookalike_species IS NULL OR lookalike_species NOT LIKE '%virosa%');


-- ---------------------------------------------------------------------------
-- Photos supprimées de Wikimedia Commons : 30 fiches pointaient un fichier qui n'existe
-- plus. Vérifié deux fois avant suppression du lien — l'API Commons ne connaît plus le
-- fichier, et une requête HTTP HEAD sur l'URL stockée renvoie 404 pour les 30.
--
-- Le lien est mis à NULL plutôt que conservé : tel quel, il affiche une icône d'image
-- cassée sur la fiche. Aucune de ces 30 fiches n'a de `photo_species` de repli, elles
-- perdent donc leur illustration — c'est le constat, pas une régression : elles ne
-- l'affichaient déjà plus. Fiches à réillustrer :
--   Arganier, Artichaut, Bois mort, Bougainvillier
--   Capucine, Caroubier, Champignons de litière, Citronnier
--   Coccinelle à sept points, Cochenille de la figue de Barbarie, Crapaud de Maurétanie, Criquet marocain
--   Escargot petit-gris, Fenouil, Figuier commun, Figuier de Barbarie
--   Merle noir, Moustique commun, Olivier, Palmier-dattier
--   Pois chiche, Pâquerette, Rhizobium, Souci officinal
--   Sureau noir, Syrphe ceinturé, Tarente de Maurétanie, Tillandsia
--   Violette odorante, Volubilis
--
-- `PlantBiodivHeroPhoto` gère désormais l'erreur de chargement (`onError`), ce qui couvre
-- les liens qui mourront après cette migration.
-- ---------------------------------------------------------------------------
UPDATE plants SET photo = NULL
WHERE id IN (81, 82, 83, 84, 85, 89, 92, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 124, 126, 127, 128, 131, 133, 136, 137, 145, 148, 155, 157, 159)
  AND photo LIKE '%wikimedia%';


-- ---------------------------------------------------------------------------
-- Catalogue semé (`sql/schema_foretmap.sql`) — une base neuve n'a pas les identifiants de
-- production, les UPDATE ci-dessus ne l'atteignent donc pas. Ce bloc-ci est indexé par NOM,
-- et ne concerne que les fiches du semis.
--
-- Même constat que sur la production, en pire : 12 des 16 photos Wikimedia du semis
-- pointent un fichier supprimé de Commons (404 vérifié une à une). Le semis versionné
-- livre donc des images cassées à toute base neuve. Les liens morts sont retirés ; les
-- fiches restent à réillustrer.
-- ---------------------------------------------------------------------------
UPDATE plants SET photo_credit = 'Contributeur de Wikipédia (auteur non précisé sur Commons)', photo_licence = 'Public domain' WHERE name = 'Compost et épluchures' AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Thamizhpparithi Maari', photo_licence = 'CC BY-SA 4.0' WHERE name = 'Fenugrec' AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Forest & Kim Starr', photo_licence = 'CC BY 3.0' WHERE name = 'Jasmin' AND photo_credit IS NULL;
UPDATE plants SET photo_credit = 'Escaladix', photo_licence = 'CC BY-SA 3.0' WHERE name = 'Lavande' AND photo_credit IS NULL;

-- Liens morts du semis (404 confirmé) : Arganier, Artichaut, Bois mort, Bougainvillier, Capucine, Caroubier, Citronnier, Figuier commun, Olivier, Palmier-dattier, Pois chiche, Volubilis.
UPDATE plants SET photo = NULL
WHERE photo LIKE '%wikimedia%' AND name IN (
  'Arganier',
  'Artichaut',
  'Bois mort',
  'Bougainvillier',
  'Capucine',
  'Caroubier',
  'Citronnier',
  'Figuier commun',
  'Olivier',
  'Palmier-dattier',
  'Pois chiche',
  'Volubilis'
);
