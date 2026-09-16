-- Ancre de récurrence : la date qui porte le rythme d'une série, indépendante des
-- décalages que le calendrier scolaire impose aux occurrences.
--
-- Pourquoi. Jusqu'ici la prochaine occurrence était calculée depuis la précédente. Or une
-- date théorique tombant un jour fermé est accrochée au prochain jour ouvré, et cette date
-- accrochée devenait l'origine du calcul suivant : le décalage se propageait. Sur le
-- calendrier réel 2026-2027 du lycée, une tâche hebdomadaire du mardi 15/09 perd son mardi
-- dès la 5e occurrence (20/10, vacances de Toussaint → lundi 02/11 de rentrée) et reste au
-- lundi toute l'année : 33 occurrences sur 37 hors du jour d'origine. Comme
-- `nextSchoolOpenDay` renvoie toujours le PREMIER jour de réouverture, toutes les séries
-- convergent en outre vers le même lundi, concentrant la charge sur un seul jour.
--
-- Avec l'ancre, l'occurrence de rang k vaut « ancre + k × période » calculée sur la date
-- théorique ; l'accrochage au jour ouvré ne sert plus qu'à écrire la ligne et ne se
-- réinjecte plus dans le calcul. Le mardi reste mardi.
--
-- Backfill : chaque tâche récurrente reçoit SA PROPRE date de départ comme ancre (à défaut
-- sa date de création). C'est un gel, pas un rattrapage : les séries déjà décalées ne
-- sautent pas d'un coup vers leur jour d'origine — elles cessent simplement de dériver
-- davantage. Seule l'occurrence validée courante engendre la suivante, donc les ancres
-- hétérogènes des occurrences passées sont sans effet ; à partir du premier clone posé
-- après ce lot, l'ancre se propage de parent à enfant.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS + UPDATE conditionné à une ancre encore vide.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_anchor_date DATE NULL DEFAULT NULL
  AFTER recurrence_series_id;

UPDATE tasks
   SET recurrence_anchor_date = COALESCE(start_date, DATE(created_at))
 WHERE recurrence IN ('weekly', 'biweekly', 'monthly')
   AND recurrence_anchor_date IS NULL
   AND COALESCE(start_date, DATE(created_at)) IS NOT NULL;
