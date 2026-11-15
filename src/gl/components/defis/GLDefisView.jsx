import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLDefiPlayer } from './GLDefiPlayer.jsx';

const STATUTS = Object.freeze({
  reussi: { picto: '✓', label: 'réussi' },
  en_cours: { picto: '…', label: 'en cours' },
});

function libelleUnite(d) {
  if (d.type === 'retisser') return `${d.biomeNom} · ${d.niveau} cartes`;
  if (d.type === 'alteree') return `${d.biomeNom} · sans « ${d.retireeNom} »`;
  return `Plateau ${d.plateau}`;
}

/**
 * Entrée « Défis » (« Tenir à deux », lot 3) : les défis de la Trame ouverts à l'élève ou à
 * l'équipe — ceux de son peuple, sur les deux biomes du plateau —, puis le défi choisi.
 * Aucun classement, aucun total à atteindre : seulement ce qui est réussi, en cours, à ouvrir.
 *
 * @param {object} p
 * @param {number} p.gameId
 * @param {number|null} [p.teamId] équipe pour laquelle le prof lance un défi
 */
export function GLDefisView({ gameId, teamId = null }) {
  const [liste, setListe] = useState(null);
  const [error, setError] = useState('');
  const [cible, setCible] = useState(null);

  const charger = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/defis${teamId ? `?teamId=${teamId}` : ''}`);
      setListe(data);
      setError('');
    } catch (err) {
      // Partie hors de la mouture « Tenir à deux » : pas de défis, et rien d'inquiétant à dire.
      if (err?.body?.code === 'TENIR_DISABLED') setListe({ actifs: false });
      else setError(err.message || 'Défis indisponibles');
    }
  }, [gameId, teamId]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (cible) {
    return (
      <GLDefiPlayer
        gameId={gameId}
        cible={cible}
        onReussi={charger}
        onRetour={() => {
          setCible(null);
          charger();
        }}
      />
    );
  }
  if (error) return <p className="gl-error-banner">{error}</p>;
  if (!liste) {
    return (
      <p className="gl-hint" role="status">
        Chargement des défis…
      </p>
    );
  }
  if (!liste.actifs) {
    return (
      <p className="gl-hint" role="status" data-testid="gl-defis-fermes">
        Les défis de la Trame ne sont pas ouverts pour cette partie.
      </p>
    );
  }
  const enEquipe = liste.mode === 'equipe';
  const attendre = enEquipe && liste.tourOuvert && !teamId;
  return (
    <section className="gl-defis gl-gameplay-block" data-testid="gl-defis">
      <h4>Défis de la Trame</h4>
      <p className="gl-hint">
        {enEquipe
          ? 'Un défi réussi compte pour chaque membre présent de l’équipe.'
          : 'À ton rythme : les indices sont gratuits, et rien n’est retiré si tu n’y arrives pas tout de suite.'}
      </p>
      {attendre ? (
        <p role="status" data-testid="gl-defis-attendre">
          Le tour est ouvert : les défis attendent la fin du tour.
        </p>
      ) : null}
      {liste.pages.utilisees != null ? (
        <p className="gl-hint" data-testid="gl-defis-pages">
          Pages de veillée gagnées cette semaine par un défi : {liste.pages.utilisees} sur{' '}
          {liste.pages.plafond}.
        </p>
      ) : null}
      {liste.types.map((t) => (
        <section key={t.type} className="gl-defis__famille" data-type={t.type}>
          <h5>{t.libelle}</h5>
          <ul className="gl-defis__liste">
            {liste.defis
              .filter((d) => d.type === t.type)
              .map((d) => {
                const statut = STATUTS[d.statut] || null;
                return (
                  <li key={d.unite}>
                    <GLButton
                      type="button"
                      variant={d.statut === 'reussi' ? 'ghost' : 'secondary'}
                      disabled={!d.disponible || attendre}
                      onClick={() => setCible({ type: d.type, unite: d.unite, teamId })}
                      data-testid={`gl-defi-ouvrir-${d.type}-${d.unite}`}
                    >
                      {statut ? <span aria-hidden="true">{statut.picto} </span> : null}
                      {libelleUnite(d)}
                      {statut ? (
                        <span className="gl-visually-hidden"> ({statut.label})</span>
                      ) : null}
                    </GLButton>
                    {!d.disponible ? (
                      <span className="gl-hint"> s’ouvre quand le niveau précédent est tissé</span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {liste.aReparer?.length ? (
        <p className="gl-hint" data-testid="gl-defis-a-reparer">
          À réparer, signalé par une Licorne : {liste.aReparer.map((e) => e.nom).join(', ')}.
        </p>
      ) : null}
    </section>
  );
}
