import { lazy } from 'react';
import { GLButton } from '../components/ui/GLButton.jsx';
import { isDeviceOffline } from '../../shared/networkStatus.js';

/** Nouvelles tentatives après un premier échec de chargement. */
export const REPRISES_DU_MORCEAU = 2;
/** Pause avant chaque nouvelle tentative (ms). */
const PAUSES_MS = [700, 1800];
/** Un chargement qui ne répond pas au bout de ce délai compte comme un échec (ms). */
const DELAI_MAX_MS = 20_000;

function pause(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Le chargement, borné dans le temps : un morceau qui pend ne bloque pas l'écran sans fin. */
function chargerBorne(charger, delaiMaxMs) {
  if (!(delaiMaxMs > 0)) return charger();
  let minuteur = null;
  const echeance = new Promise((_, reject) => {
    minuteur = setTimeout(() => reject(new Error('Chargement trop long')), delaiMaxMs);
  });
  return Promise.race([charger(), echeance]).finally(() => clearTimeout(minuteur));
}

/**
 * Charge un morceau de l'application, avec de nouvelles tentatives. Lève la dernière erreur si
 * toutes échouent.
 * @param {() => Promise<any>} charger `() => import('…')`
 * @param {{ reprises?: number, pauses?: number[], delaiMaxMs?: number, attendre?: (ms: number) => Promise<void> }} [options]
 */
export async function importerAvecReprise(
  charger,
  {
    reprises = REPRISES_DU_MORCEAU,
    pauses = PAUSES_MS,
    delaiMaxMs = DELAI_MAX_MS,
    attendre = pause,
  } = {},
) {
  let derniere = null;
  for (let essai = 0; essai <= reprises; essai += 1) {
    try {
      return await chargerBorne(charger, delaiMaxMs);
    } catch (err) {
      derniere = err;
      if (essai < reprises) await attendre(pauses[Math.min(essai, pauses.length - 1)] || 0);
    }
  }
  throw derniere || new Error('Chargement impossible');
}

function rechargerLaPage() {
  window.location.reload();
}

/**
 * Ce qui s'affiche à la place d'une section dont le morceau n'a pas pu être chargé : le plus
 * souvent, l'application vient d'être mise à jour et la page ouverte demande des fichiers qui
 * n'existent plus. Recharger la page suffit. Appareil hors ligne, la phrase le dit plutôt que
 * d'annoncer une mise à jour.
 */
export function GLMorceauIndisponible({
  onRecharger = rechargerLaPage,
  horsLigne = isDeviceOffline(),
}) {
  return (
    <div className="gl-morceau-indisponible" role="alert" data-testid="gl-morceau-indisponible">
      {horsLigne ? (
        <p>
          <strong>Pas de réseau pour l’instant.</strong> Cette section n’a pas pu se charger :
          rechargez la page quand le réseau sera revenu.
        </p>
      ) : (
        <p>
          <strong>L’application vient d’être mise à jour.</strong> Rechargez la page pour afficher
          cette section.
        </p>
      )}
      <GLButton type="button" onClick={() => onRecharger()}>
        Recharger
      </GLButton>
    </div>
  );
}

/**
 * `React.lazy` qui ne reste jamais sur « Chargement… » (écrans de séance, K8) : deux nouvelles
 * tentatives, puis `GLMorceauIndisponible` et son bouton « Recharger » à la place de la section.
 * @param {() => Promise<{ default: import('react').ComponentType<any> }>} charger
 * @param {Parameters<typeof importerAvecReprise>[1]} [options]
 */
export function lazyAvecReprise(charger, options) {
  return lazy(() =>
    importerAvecReprise(charger, options).catch(() => ({ default: GLMorceauIndisponible })),
  );
}
