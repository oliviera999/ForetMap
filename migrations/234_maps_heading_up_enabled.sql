-- Autorise, carte par carte, le mode « orientation boussole » (heading-up).
-- À l'écriture API, le drapeau n'est actif que si gps_enabled est aussi vrai
-- (calage + suivi GPS) — cf. routes/settings.js et docs/API.md. Sans calage le
-- bouton reste inutilisable côté client.
-- Idempotence : errno 1060 (colonne déjà présente) ignoré par database.js.
ALTER TABLE maps
  ADD COLUMN heading_up_enabled TINYINT(1) NOT NULL DEFAULT 0;
