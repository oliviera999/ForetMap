'use strict';

/**
 * Estimations pédagogiques de biomasse / carbone / CO₂ pour un individu arbre.
 *
 * Formules (Chave et al., 2014 — arbres tropicaux ; ordre de grandeur seulement) :
 * - D = C / π  (D en cm, C circonférence en cm)
 * - biomasse aérienne (kg) = 0,0673 × (ρ × D² × H)^0,976
 * - carbone = 0,47 × biomasse
 * - CO₂ = carbone × 44/12
 * ρ défaut = 0,6 g/cm³
 */

const DEFAULT_WOOD_DENSITY = 0.6;
const BIOMASS_COEFF = 0.0673;
const BIOMASS_EXP = 0.976;
const CARBON_FRACTION = 0.47;
const CO2_FACTOR = 44 / 12;

const DISCLAIMER =
  'Ordre de grandeur seulement : équation établie pour des arbres tropicaux (Chave et al., 2014).';

/**
 * @param {number|null|undefined} circumferenceCm
 * @returns {number|null} diamètre en cm
 */
function diameterFromCircumference(circumferenceCm) {
  const c = Number(circumferenceCm);
  if (!Number.isFinite(c) || c <= 0) return null;
  return c / Math.PI;
}

/**
 * @param {{ circumferenceCm?: number|null, heightM?: number|null, woodDensity?: number|null }} input
 * @returns {{
 *   diameter_cm: number|null,
 *   biomass_kg: number|null,
 *   carbon_kg: number|null,
 *   co2_kg: number|null,
 *   wood_density: number,
 *   disclaimer: string,
 *   computable: boolean
 * }}
 */
function estimateBiomassCarbon(input = {}) {
  const woodDensity =
    input.woodDensity != null &&
    Number.isFinite(Number(input.woodDensity)) &&
    Number(input.woodDensity) > 0
      ? Number(input.woodDensity)
      : DEFAULT_WOOD_DENSITY;
  const diameterCm = diameterFromCircumference(input.circumferenceCm);
  const heightM = Number(input.heightM);
  const base = {
    diameter_cm: diameterCm,
    biomass_kg: null,
    carbon_kg: null,
    co2_kg: null,
    wood_density: woodDensity,
    disclaimer: DISCLAIMER,
    computable: false,
  };
  if (diameterCm == null || !Number.isFinite(heightM) || heightM <= 0) return base;

  const inside = woodDensity * diameterCm * diameterCm * heightM;
  if (!(inside > 0)) return base;
  const biomass = BIOMASS_COEFF * Math.pow(inside, BIOMASS_EXP);
  const carbon = CARBON_FRACTION * biomass;
  const co2 = carbon * CO2_FACTOR;
  return {
    ...base,
    biomass_kg: round3(biomass),
    carbon_kg: round3(carbon),
    co2_kg: round3(co2),
    computable: true,
  };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

module.exports = {
  DEFAULT_WOOD_DENSITY,
  BIOMASS_COEFF,
  BIOMASS_EXP,
  CARBON_FRACTION,
  CO2_FACTOR,
  DISCLAIMER,
  diameterFromCircumference,
  estimateBiomassCarbon,
};
